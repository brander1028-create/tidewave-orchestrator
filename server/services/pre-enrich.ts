/**
 * Pre-enrich System - DB→API Fallback→Upsert
 * 
 * Phase2 계산 전에 키워드DB를 먼저 채우고,
 * 그 값으로 AdScore를 계산해 Gate에 사용
 */

import { db } from '../db';
import { managedKeywords } from '../../shared/schema';
import { eq, inArray } from 'drizzle-orm';
import { getVolumesWithHealth } from './externals-health';

export interface PreEnrichResult {
  keyword: string;
  volume: number;
  competition: number;
  adDepth: number;
  cpc: number;
  source: 'db' | 'api' | 'fallback';
  cached: boolean;
}

export interface PreEnrichBatchResult {
  results: PreEnrichResult[];
  stats: {
    total: number;
    fromDB: number;
    fromAPI: number;
    fallback: number;
    upserted: number;
  };
}

/**
 * TTL 체크 (30일)
 */
function isExpired(updatedAt: Date): boolean {
  const TTL_DAYS = 30;
  const now = new Date();
  const diffDays = (now.getTime() - updatedAt.getTime()) / (1000 * 60 * 60 * 24);
  return diffDays > TTL_DAYS;
}

/**
 * 키워드 정규화 (변형 처리)
 */
function normalizeKeyword(keyword: string): string {
  return keyword.toLowerCase().trim().replace(/\s+/g, ' ');
}

/**
 * 키워드 변형 생성
 */
function generateVariants(keyword: string): string[] {
  const base = normalizeKeyword(keyword);
  const variants = [base];
  
  // surface (원본)
  if (keyword !== base) {
    variants.push(keyword);
  }
  
  // nospace (공백 제거)
  const nospace = base.replace(/\s/g, '');
  if (nospace !== base && nospace.length > 0) {
    variants.push(nospace);
  }
  
  // hyphen (하이픈 변형)
  const hyphen = base.replace(/\s/g, '-');
  if (hyphen !== base) {
    variants.push(hyphen);
  }
  
  return Array.from(new Set(variants)); // 중복 제거
}

/**
 * 단일 키워드 Pre-enrich
 */
export async function preEnrichKeyword(keyword: string): Promise<PreEnrichResult> {
  const normalized = normalizeKeyword(keyword);
  
  try {
    // 1. DB 조회 (TTL 체크)
    const existing = await db.select()
      .from(managedKeywords)
      .where(eq(managedKeywords.text, normalized))
      .limit(1);
    
    if (existing.length > 0 && existing[0].updated_at && !isExpired(existing[0].updated_at)) {
      // DB에서 fresh 데이터 발견
      const record = existing[0];
      return {
        keyword: normalized,
        volume: record.volume,
        competition: (record.comp_score || 0) / 100, // 0-100 → 0-1
        adDepth: record.ad_depth || 0,
        cpc: record.est_cpc_krw || 0,
        source: 'db',
        cached: true
      };
    }

    // 2. API 호출 (변형 포함)
    console.log(`🔄 [Pre-enrich] API call for keyword: ${keyword}`);
    const variants = generateVariants(keyword);
    const apiResult = await getVolumesWithHealth(db, [keyword]);

    if (apiResult.volumes && Object.keys(apiResult.volumes).length > 0) {
      const volumeKey = Object.keys(apiResult.volumes)[0];
      const volumeData = apiResult.volumes[volumeKey];
      const result = {
        keyword: volumeKey,
        volume: volumeData.total || 0,
        comp_idx: 'unknown',
        comp_score: 50, // Default competition score
        ad_depth: volumeData.plAvgDepth || 0,
        est_cpc_krw: volumeData.avePcCpc || volumeData.aveMobileCpc || 0,
        est_cpc_source: 'estimated'
      };
      const enrichResult: PreEnrichResult = {
        keyword: normalized,
        volume: result.volume || 0,
        competition: (result.comp_score || 0) / 100,
        adDepth: result.ad_depth || 0,
        cpc: result.est_cpc_krw || 0,
        source: 'api',
        cached: false
      };

      // 3. DB Upsert
      await db.insert(managedKeywords).values({
        text: normalized,
        raw_volume: result.volume || 0,
        volume: result.volume || 0,
        comp_idx: result.comp_idx || 'unknown',
        comp_score: result.comp_score || 0,
        ad_depth: result.ad_depth || 0,
        has_ads: (result.ad_depth || 0) > 0,
        est_cpc_krw: result.est_cpc_krw || 0,
        est_cpc_source: 'estimated',
        updated_at: new Date()
      }).onConflictDoUpdate({
        target: managedKeywords.text,
        set: {
          raw_volume: result.volume || 0,
          volume: result.volume || 0,
          comp_idx: result.comp_idx || 'unknown',
          comp_score: result.comp_score || 0,
          ad_depth: result.ad_depth || 0,
          has_ads: (result.ad_depth || 0) > 0,
          est_cpc_krw: result.est_cpc_krw,
          est_cpc_source: result.est_cpc_source || 'estimated',
          updated_at: new Date()
        }
      });

      console.log(`✅ [Pre-enrich] Upserted keyword: ${normalized}`);
      return enrichResult;
    }

    // 4. Fallback (API 실패 시)
    console.log(`⚠️ [Pre-enrich] API failed, using fallback for: ${keyword}`);
    return {
      keyword: normalized,
      volume: 0,
      competition: 0.5, // 중간값
      adDepth: 0,
      cpc: 0,
      source: 'fallback',
      cached: false
    };

  } catch (error) {
    console.error(`❌ [Pre-enrich] Error processing keyword ${keyword}:`, error);
    return {
      keyword: normalized,
      volume: 0,
      competition: 0.5,
      adDepth: 0,
      cpc: 0,
      source: 'fallback',
      cached: false
    };
  }
}

/**
 * 배치 Pre-enrich (효율적인 처리)
 */
export async function preEnrichBatch(keywords: string[]): Promise<PreEnrichBatchResult> {
  console.log(`🔄 [Pre-enrich] Processing ${keywords.length} keywords...`);
  
  const normalizedKeywords = keywords.map(normalizeKeyword);
  const uniqueKeywords = Array.from(new Set(normalizedKeywords));
  
  const stats = {
    total: uniqueKeywords.length,
    fromDB: 0,
    fromAPI: 0,
    fallback: 0,
    upserted: 0
  };

  // 1. DB 배치 조회
  const existingRecords = await db.select()
    .from(managedKeywords)
    .where(inArray(managedKeywords.text, uniqueKeywords));

  const dbMap = new Map(
    existingRecords
      .filter(record => record.updated_at && !isExpired(record.updated_at))
      .map(record => [record.text, record])
  );

  // 2. API 호출 대상 식별
  const needsAPI = uniqueKeywords.filter(keyword => !dbMap.has(keyword));
  
  const results: PreEnrichResult[] = [];

  // 3. DB에서 가져올 수 있는 것들 처리
  for (const keyword of uniqueKeywords) {
    if (dbMap.has(keyword)) {
      const record = dbMap.get(keyword)!;
      results.push({
        keyword,
        volume: record.volume,
        competition: (record.comp_score || 0) / 100,
        adDepth: record.ad_depth || 0,
        cpc: record.est_cpc_krw || 0,
        source: 'db',
        cached: true
      });
      stats.fromDB++;
    }
  }

  // 4. API 배치 호출 (필요한 것들만)
  if (needsAPI.length > 0) {
    try {
      console.log(`🔄 [Pre-enrich] API batch call for ${needsAPI.length} keywords`);
      const apiResult = await getVolumesWithHealth(db, needsAPI);

      if (apiResult.volumes) {
        // API 결과 처리 및 upsert
        for (const [volumeKey, volumeData] of Object.entries(apiResult.volumes)) {
          const keyword = normalizeKeyword(volumeKey);
          
          results.push({
            keyword,
            volume: volumeData.total || 0,
            competition: 0.5, // Default competition (will be updated from DB)
            adDepth: volumeData.plAvgDepth || 0,
            cpc: volumeData.avePcCpc || volumeData.aveMobileCpc || 0,
            source: 'api',
            cached: false
          });

          // Upsert to DB
          // Note: getVolumesWithHealth already upserts to DB, so we don't need to do it again

          stats.fromAPI++;
          stats.upserted++;
        }
      }

      // 5. API에서 누락된 키워드들 fallback 처리
      const processedKeywords = new Set(results.map(r => r.keyword));
      for (const keyword of needsAPI) {
        if (!processedKeywords.has(keyword)) {
          results.push({
            keyword,
            volume: 0,
            competition: 0.5,
            adDepth: 0,
            cpc: 0,
            source: 'fallback',
            cached: false
          });
          stats.fallback++;
        }
      }

    } catch (error) {
      console.error(`❌ [Pre-enrich] Batch API call failed:`, error);
      
      // 전체 API 실패시 fallback
      for (const keyword of needsAPI) {
        results.push({
          keyword,
          volume: 0,
          competition: 0.5,
          adDepth: 0,
          cpc: 0,
          source: 'fallback',
          cached: false
        });
        stats.fallback++;
      }
    }
  }

  console.log(`✅ [Pre-enrich] Completed: ${stats.fromDB} DB, ${stats.fromAPI} API, ${stats.fallback} fallback`);
  
  return { results, stats };
}

/**
 * Pre-enrich 결과를 키워드 맵으로 변환
 */
export function createKeywordMetricsMap(results: PreEnrichResult[]): Map<string, PreEnrichResult> {
  return new Map(results.map(result => [result.keyword, result]));
}