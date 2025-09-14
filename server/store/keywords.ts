import { db } from '../db';
import { managedKeywords } from '../../shared/schema';
import { eq, sql, desc, asc, inArray } from 'drizzle-orm';
import type { ManagedKeyword, InsertManagedKeyword } from '../../shared/schema';
import { getVolumes, type SearchAdResult } from '../services/searchad';

/**
 * Convert compIdx string to numeric score (0-100)
 * 수정: 높음=100, 중간=60, 낮음=20 (상업성 지표 통일)
 */
export function compIdxToScore(idx?: string | null): number {
  if (!idx) return 60; // 중간
  const s = String(idx).toLowerCase();
  if (s.includes('높음') || s.includes('high') || s === '2') return 100;
  if (s.includes('중간') || s.includes('mid') || s === '1') return 60;
  if (s.includes('낮음') || s.includes('low') || s === '0') return 20;
  return 60;
}

/**
 * Calculate overall score (0-100) based on 5 metrics
 * 수정: volume 로그스케일, depth/cpc 상업성 지표 같은 방향으로 통일
 */
export function calculateOverallScore(
  raw_volume: number,
  comp_score: number,
  ad_depth: number,
  est_cpc: number
): number {
  const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
  
  // 10만 조회 기준 정규화(로그 스케일)
  const volume_norm = clamp01(Math.log10(Math.max(1, raw_volume)) / 5); // 1..100000 → 0..1
  const depth_norm = clamp01((ad_depth || 0) / 5); // 0..5 → 0..1
  const cpc_norm = est_cpc ? clamp01(est_cpc / 5000) : 0; // 0..5000원 cap
  
  const score =
    0.35 * (volume_norm * 100) +
    0.35 * clamp01(comp_score / 100) * 100 +
    0.20 * (depth_norm * 100) +
    0.10 * (cpc_norm * 100);
  
  return Math.round(clamp01(score / 100) * 100);
}

/**
 * Ping Keywords DB to test connection
 * Note: Table creation is handled by Drizzle schema and migrations
 */
export async function pingKeywordsDB(): Promise<void> {
  await db.execute(sql`SELECT 1`);
  
  // Create index for performance if not exists
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_managed_keywords_excluded_volume 
    ON managed_keywords (excluded, raw_volume DESC)
  `);
}

/**
 * Get total keywords count
 */
export async function keywordsCount(): Promise<number> {
  const result = await db.select({ count: sql<number>`COUNT(*)` }).from(managedKeywords);
  return result[0]?.count || 0;
}

/**
 * Upsert multiple keywords with volume data (배치 처리로 멈춤 방지)
 */
export async function upsertMany(keywords: Partial<InsertManagedKeyword>[]): Promise<number> {
  if (keywords.length === 0) return 0;
  
  // 1단계: 입력 데이터 정리 및 중복 제거
  const uniqueKeywords = new Map<string, Partial<InsertManagedKeyword>>();
  for (const kw of keywords) {
    if (!kw.text || kw.text.trim() === '') continue;
    const text = kw.text.trim();
    uniqueKeywords.set(text, { ...kw, text });
  }
  
  const cleanKeywords = Array.from(uniqueKeywords.values());
  if (cleanKeywords.length === 0) return 0;
  
  console.log(`📦 Upserting ${cleanKeywords.length} keywords in batches...`);
  
  // 2단계: 배치별 처리 (500개씩)
  const BATCH_SIZE = 500;
  let totalSaved = 0;
  
  for (let i = 0; i < cleanKeywords.length; i += BATCH_SIZE) {
    const batch = cleanKeywords.slice(i, i + BATCH_SIZE);
    
    try {
      // 트랜잭션으로 배치 처리
      const batchResult = await db.transaction(async (tx) => {
        let batchSaved = 0;
        
        for (const kw of batch) {
          try {
            await tx.insert(managedKeywords)
              .values({
                text: kw.text!,
                raw_volume: kw.raw_volume ?? 0,
                volume: kw.volume ?? 0,
                grade: kw.grade ?? 'C',
                commerciality: kw.commerciality ?? 0,
                difficulty: kw.difficulty ?? 0,
                source: kw.source ?? 'searchads',
                comp_idx: kw.comp_idx ?? null,
                comp_score: kw.comp_score ?? 0,
                ad_depth: kw.ad_depth ?? 0,
                has_ads: !!kw.has_ads,
                est_cpc_krw: kw.est_cpc_krw ?? null,
                est_cpc_source: kw.est_cpc_source ?? 'unknown',
                score: kw.score ?? 0,
                updated_at: sql`NOW()`
              })
              .onConflictDoUpdate({
                target: managedKeywords.text,
                set: {
                  raw_volume: sql`excluded.raw_volume`,
                  volume: sql`excluded.volume`,
                  grade: sql`excluded.grade`,
                  commerciality: sql`excluded.commerciality`,
                  difficulty: sql`excluded.difficulty`,
                  comp_idx: sql`excluded.comp_idx`,
                  comp_score: sql`excluded.comp_score`,
                  ad_depth: sql`excluded.ad_depth`,
                  has_ads: sql`excluded.has_ads`,
                  est_cpc_krw: sql`excluded.est_cpc_krw`,
                  est_cpc_source: sql`excluded.est_cpc_source`,
                  score: sql`excluded.score`,
                  updated_at: sql`NOW()`
                }
              });
            batchSaved++;
          } catch (error) {
            console.error(`Failed to upsert "${kw.text}":`, error);
          }
        }
        
        return batchSaved;
      });
      
      totalSaved += batchResult;
      console.log(`✅ Batch ${Math.floor(i/BATCH_SIZE) + 1}: ${batchResult}/${batch.length} saved`);
      
    } catch (error) {
      console.error(`❌ Batch ${Math.floor(i/BATCH_SIZE) + 1} failed:`, error);
    }
  }
  
  console.log(`🎯 Total upserted: ${totalSaved}/${cleanKeywords.length} keywords`);
  return totalSaved;
}

/**
 * List keywords with filtering and sorting
 */
export async function listKeywords(opts: {
  excluded: boolean;
  orderBy: 'score' | 'raw_volume' | 'comp_score' | 'ad_depth' | 'est_cpc_krw' | 'text';
  dir: 'asc' | 'desc';
}): Promise<ManagedKeyword[]> {
  const fieldMap: any = {
    score: managedKeywords.score,
    raw_volume: managedKeywords.raw_volume,
    comp_score: managedKeywords.comp_score,
    ad_depth: managedKeywords.ad_depth,
    est_cpc_krw: managedKeywords.est_cpc_krw,
    text: managedKeywords.text
  };
  
  const orderField = fieldMap[opts.orderBy] ?? managedKeywords.score;
  const orderDir = opts.dir === 'desc' ? desc(orderField) : asc(orderField);
  
  return await db.select()
    .from(managedKeywords)
    .where(eq(managedKeywords.excluded, opts.excluded))
    .orderBy(orderDir)
    .limit(1000); // Reasonable limit
}

/**
 * Find a keyword by text
 */
export async function findKeywordByText(text: string): Promise<ManagedKeyword | undefined> {
  const results = await db.select()
    .from(managedKeywords)
    .where(eq(managedKeywords.text, text))
    .limit(1);
  
  return results[0] || undefined;
}

/**
 * Delete all keywords (for replace mode)
 */
export async function deleteAllKeywords(): Promise<number> {
  const result = await db.delete(managedKeywords);
  return result.rowCount || 0;
}

/**
 * Set keyword excluded status
 */
export async function setKeywordExcluded(id: string, excluded: boolean): Promise<void> {
  await db.update(managedKeywords)
    .set({ 
      excluded, 
      updated_at: sql`NOW()` 
    })
    .where(eq(managedKeywords.id, id));
}

/**
 * List only excluded keywords
 */
export async function listExcluded(): Promise<ManagedKeyword[]> {
  return await db.select()
    .from(managedKeywords)
    .where(eq(managedKeywords.excluded, true))
    .orderBy(desc(managedKeywords.updated_at));
}

/**
 * Get raw volume mapping for keywords (for results API)
 */
export async function getKeywordVolumeMap(keywordTexts: string[]): Promise<Record<string, number>> {
  if (keywordTexts.length === 0) return {};
  
  const results = await db.select({
    text: managedKeywords.text,
    raw_volume: managedKeywords.raw_volume
  })
    .from(managedKeywords)
    .where(inArray(managedKeywords.text, keywordTexts));
    
  const volumeMap: Record<string, number> = {};
  for (const result of results) {
    volumeMap[result.text] = result.raw_volume;
  }
  
  // Fill missing keywords with 0
  for (const text of keywordTexts) {
    if (!(text in volumeMap)) {
      volumeMap[text] = 0;
    }
  }
  
  return volumeMap;
}

/**
 * Fetch keywords from SearchAds API and store them
 */
export async function upsertKeywordsFromSearchAds(
  baseKeyword: string, 
  limit: number = 300
): Promise<{ mode: string; stats: any; count: number }> {
  console.log(`📝 Fetching keywords from SearchAds API for base: "${baseKeyword}", limit: ${limit}`);
  
  // Get related keywords from SearchAds API using base keyword
  const relatedKeywords = await generateRelatedKeywords(baseKeyword, limit);
  const result = await getVolumes(relatedKeywords);
  
  // Process and grade the keywords
  const keywordsToUpsert: Partial<InsertManagedKeyword>[] = [];
  
  for (const [text, volumeData] of Object.entries(result.volumes)) {
    const raw_volume = volumeData.total;
    const volume = Math.round(raw_volume * 0.8); // Apply some processing
    
    // Grade based on volume
    let grade: 'A' | 'B' | 'C' = 'C';
    if (raw_volume >= 10000) grade = 'A';
    else if (raw_volume >= 1000) grade = 'B';
    
    // Estimate commerciality and difficulty (simplified)
    const commerciality = Math.min(100, Math.round((raw_volume / 1000) * 10));
    const difficulty = Math.min(100, Math.round((raw_volume / 500) * 8));
    
    // 5개 지표 처리
    const comp_idx = volumeData.compIdx || null;
    const comp_score = compIdxToScore(comp_idx);
    const ad_depth = volumeData.plAvgDepth || 0;
    const has_ads = ad_depth > 0;
    
    // CPC 추정 (PC와 Mobile 평균)
    let est_cpc_krw: number | null = null;
    let est_cpc_source = 'unknown';
    
    if (volumeData.avePcCpc && volumeData.avePcCpc > 0) {
      est_cpc_krw = Math.round(volumeData.avePcCpc);
      est_cpc_source = 'account';
    } else if (volumeData.aveMobileCpc && volumeData.aveMobileCpc > 0) {
      est_cpc_krw = Math.round(volumeData.aveMobileCpc);
      est_cpc_source = 'account';
    } else {
      // Fallback 추정
      est_cpc_krw = Math.max(100, Math.round(raw_volume / 1000 * 150));
      est_cpc_source = 'estimated';
    }
    
    // 종합점수 계산 (0-100)
    const score = calculateOverallScore(raw_volume, comp_score, ad_depth, est_cpc_krw || 0);
    
    keywordsToUpsert.push({
      text,
      raw_volume,
      volume,
      grade,
      commerciality,
      difficulty,
      source: 'searchads',
      // 5개 지표
      comp_idx,
      comp_score,
      ad_depth,
      has_ads,
      est_cpc_krw,
      est_cpc_source,
      score
    });
  }
  
  const insertedCount = await upsertMany(keywordsToUpsert);
  
  console.log(`📝 Upserted ${insertedCount} keywords to database`);
  
  return {
    mode: result.mode,
    stats: result.stats,
    count: insertedCount
  };
}

/**
 * Generate related keywords for a base keyword (simplified implementation)
 */
async function generateRelatedKeywords(baseKeyword: string, limit: number): Promise<string[]> {
  // This is a simplified implementation - in production you might use more sophisticated methods
  const variations = [
    baseKeyword,
    `${baseKeyword} 효능`,
    `${baseKeyword} 추천`,
    `${baseKeyword} 후기`,
    `${baseKeyword} 가격`,
    `${baseKeyword} 구매`,
    `${baseKeyword} 비교`,
    `${baseKeyword} 순위`,
    `${baseKeyword} 제품`,
    `${baseKeyword} 브랜드`,
    `${baseKeyword} 성분`,
    `${baseKeyword} 복용법`,
    `${baseKeyword} 부작용`,
    `${baseKeyword} 선택`,
    `${baseKeyword} 정보`,
  ];
  
  return variations.slice(0, Math.min(limit, variations.length));
}