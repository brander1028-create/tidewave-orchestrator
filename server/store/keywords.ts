import { db } from '../db';
import { managedKeywords } from '../../shared/schema';
import { eq, sql, desc, asc } from 'drizzle-orm';
import type { ManagedKeyword, InsertManagedKeyword } from '../../shared/schema';
import { getVolumes, type SearchAdResult } from '../services/searchad';

/**
 * Convert compIdx string to numeric score (0-100)
 */
export function compIdxToScore(idx?: string | null): number {
  if (!idx) return 60; // default medium
  const normalized = idx.toLowerCase();
  if (normalized.includes('낮음') || normalized.includes('low') || normalized === '0') return 100;
  if (normalized.includes('높음') || normalized.includes('high') || normalized === '2') return 20;
  return 60; // medium/중간/1
}

/**
 * Calculate overall score (0-100) based on 5 metrics
 * Formula: volume_norm(35%) + comp_score(35%) + depth_norm(20%) + cpc_norm(10%)
 */
export function calculateOverallScore(raw_volume: number, comp_score: number, ad_depth: number, est_cpc: number): number {
  const volumeNorm = Math.min(100, Math.round(raw_volume / 1000));
  const depthNorm = ad_depth <= 0 ? 100 : Math.max(0, 100 - Math.round(ad_depth * 10));
  const cpcNorm = est_cpc <= 0 ? 50 : Math.max(0, 100 - Math.round(est_cpc / 20));
  
  return Math.round(volumeNorm * 0.35 + comp_score * 0.35 + depthNorm * 0.20 + cpcNorm * 0.10);
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
 * Upsert multiple keywords with volume data
 */
export async function upsertMany(keywords: Partial<InsertManagedKeyword>[]): Promise<number> {
  if (keywords.length === 0) return 0;
  
  let insertedCount = 0;
  
  for (const keyword of keywords) {
    try {
      await db.insert(managedKeywords)
        .values({
          text: keyword.text!,
          raw_volume: keyword.raw_volume || 0,
          volume: keyword.volume || 0,
          grade: keyword.grade || 'C',
          commerciality: keyword.commerciality || 0,
          difficulty: keyword.difficulty || 0,
          source: keyword.source || 'searchads',
          // 5개 지표 필드 추가
          comp_idx: keyword.comp_idx || null,
          comp_score: keyword.comp_score || 0,
          ad_depth: keyword.ad_depth || 0,
          has_ads: keyword.has_ads || false,
          est_cpc_krw: keyword.est_cpc_krw || null,
          est_cpc_source: keyword.est_cpc_source || 'unknown',
          score: keyword.score || 0,
        })
        .onConflictDoUpdate({
          target: managedKeywords.text,
          set: {
            raw_volume: keyword.raw_volume || 0,
            volume: keyword.volume || 0,
            grade: keyword.grade || 'C',
            commerciality: keyword.commerciality || 0,
            difficulty: keyword.difficulty || 0,
            // 5개 지표 필드 업데이트
            comp_idx: keyword.comp_idx || null,
            comp_score: keyword.comp_score || 0,
            ad_depth: keyword.ad_depth || 0,
            has_ads: keyword.has_ads || false,
            est_cpc_krw: keyword.est_cpc_krw || null,
            est_cpc_source: keyword.est_cpc_source || 'unknown',
            score: keyword.score || 0,
            updated_at: sql`NOW()`,
          }
        });
      insertedCount++;
    } catch (error) {
      console.error(`Failed to upsert keyword "${keyword.text}":`, error);
    }
  }
  
  return insertedCount;
}

/**
 * List keywords with filtering and sorting
 */
export async function listKeywords(opts: {
  excluded: boolean;
  orderBy: 'raw_volume' | 'text';
  dir: 'asc' | 'desc';
}): Promise<ManagedKeyword[]> {
  const orderField = opts.orderBy === 'raw_volume' ? managedKeywords.raw_volume : managedKeywords.text;
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
    .where(sql`${managedKeywords.text} = ANY(${keywordTexts})`);
    
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