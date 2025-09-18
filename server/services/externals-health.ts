import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { getVolumes, type SearchAdResult } from './searchad';
import { naverApi, type NaverBlogSearchResult } from './naver-api';
import { markHealthFail, markHealthyHint } from './health-cache';
import { managedKeywords, type InsertManagedKeyword } from '@shared/schema';
import { upsertMany } from '../store/keywords';
import { compIdxToScore, calculateOverallScore } from './scoring-config.js';
import { sql, inArray, gt, gte } from 'drizzle-orm';

// 🔒 비상 차단: 모든 외부 API 호출 차단
const DET_ONLY = process.env.DETERMINISTIC_ONLY === 'true';

/**
 * v10 A번: DB→API→업서트→동일 응답 재스코어 파이프라인 구현
 * 1) KEYWORD_DB 조회(TTL 30d) → hit면 사용
 * 2) 미스/만료면 SearchAds 호출 → upsert
 * 3) upsert 결과를 이번 요청의 메모리에도 반영하고 즉시 재스코어
 */
export async function getVolumesWithHealth(
  db: NodePgDatabase<any>, 
  keywords: string[]
): Promise<SearchAdResult> {
  if (DET_ONLY) {                      // 🔒 강제 DB-only
    console.log(`🎯 [DETERMINISTIC MODE] DB-only mode forced for ${keywords.length} keywords`);
    const rows = await db.select().from(managedKeywords).where(inArray(managedKeywords.text, keywords));
    const volumes: Record<string, any> = {};
    rows.forEach(row => {
      volumes[row.text] = {
        total: row.raw_volume || 0,
        compIdx: row.comp_idx || '낮음',
        plAvgDepth: row.ad_depth || 0,
        avePcCpc: row.est_cpc_krw || 0
      };
    });
    return { volumes, mode: 'fallback' as const, stats: { requested: 0, ok: 0, fail: 0, http: {} } };
  }
  try {
    console.log(`🔍 [v10 A번] DB→API→업서트 파이프라인 시작: ${keywords.length}개 키워드`);
    
    // Step 1: DB에서 기존 키워드 조회 (TTL 30일 체크)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const existingKeywords = await db.select({
      text: managedKeywords.text,
      raw_volume: managedKeywords.raw_volume,
      volume: managedKeywords.volume,
      updated_at: managedKeywords.updated_at,
      comp_idx: managedKeywords.comp_idx,
      comp_score: managedKeywords.comp_score,
      ad_depth: managedKeywords.ad_depth,
      est_cpc_krw: managedKeywords.est_cpc_krw,
      source: managedKeywords.source  // ★ 규칙4: source 필드 추가
    })
      .from(managedKeywords)
      .where(inArray(managedKeywords.text, keywords));
    
    // Step 2: Fresh(30일 이내) vs Stale/Missing 키워드 분류
    const dbVolumes: Record<string, any> = {};
    const staleOrMissingKeywords: string[] = [];
    
    const existingMap = new Map(existingKeywords.map(kw => [kw.text, kw]));
    
    for (const keyword of keywords) {
      const existing = existingMap.get(keyword);
      
      // ★ 규칙4: TTL Fresh 판정 - 순서 수정 (architect 권장)
      let isFresh = false;
      
      // 1) 키워드 없음 체크
      if (!existing) {
        console.log(`❌ [DB Miss] ${keyword}: 없음`);
        staleOrMissingKeywords.push(keyword);
        continue;
      }
      
      // 2) Source 정규화 및 fallback 체크 (TTL보다 우선)
      const src = (existing?.source ?? '').toString().trim();
      if (src !== 'api_ok') {
        console.log(`🔄 [TTL] Force refresh: ${keyword} (fallback: ${src})`);
        staleOrMissingKeywords.push(keyword);
        continue;
      }
      
      // 3) 0-벡터 체크 (TTL보다 우선)
      const isZeroVector = (existing.raw_volume === 0 || existing.raw_volume === null) && 
                         (existing.ad_depth === 0 || existing.ad_depth === null) && 
                         (existing.est_cpc_krw === 0 || existing.est_cpc_krw === null || existing.est_cpc_krw === undefined);
      
      if (isZeroVector) {
        console.log(`🔄 [TTL] Force refresh: ${keyword} (zero-vector)`);
        staleOrMissingKeywords.push(keyword);
        continue;
      }
      
      // 4) 일반 TTL 체크 (30일)
      if (existing.updated_at && new Date(existing.updated_at) > thirtyDaysAgo) {
        // Fresh: 사용 가능
        isFresh = true;
      } else {
        // Stale: 오래됨
        console.log(`⏰ [DB Stale] ${keyword}: 마지막 업데이트 ${existing.updated_at}`);
        staleOrMissingKeywords.push(keyword);
        continue;
      }
      
      if (isFresh) {
        // Fresh: DB에서 사용
        dbVolumes[keyword.toLowerCase()] = {
          pc: Math.round(existing.raw_volume * 0.3), // 임시 분배
          mobile: Math.round(existing.raw_volume * 0.7),
          total: existing.raw_volume,
          compIdx: existing.comp_idx,
          plAvgDepth: existing.ad_depth,
          avePcCpc: existing.est_cpc_krw || 0,
          aveMobileCpc: existing.est_cpc_krw || 0
        };
        console.log(`✅ [DB Hit] ${keyword}: ${existing.raw_volume} (Fresh)`);
      }
    }
    
    console.log(`📊 [TTL 체크] DB Hit: ${Object.keys(dbVolumes).length}, API 필요: ${staleOrMissingKeywords.length}`);
    
    // Step 3: Stale/Missing 키워드만 SearchAds API 호출
    let apiResult: SearchAdResult | null = null;
    if (staleOrMissingKeywords.length > 0) {
      console.log(`📞 [API 호출] ${staleOrMissingKeywords.length}개 키워드로 SearchAds API 호출`);
      apiResult = await getVolumes(staleOrMissingKeywords);
      
      // Step 4: API 결과를 DB에 upsert
      if (apiResult.volumes && Object.keys(apiResult.volumes).length > 0) {
        const keywordsToUpsert: Partial<InsertManagedKeyword>[] = [];
        
        for (const [text, volumeData] of Object.entries(apiResult.volumes)) {
          const raw_volume = volumeData.total;
          const volume = Math.round(raw_volume * 0.8);
          
          // Grade based on volume
          let grade: 'A' | 'B' | 'C' = 'C';
          if (raw_volume >= 10000) grade = 'A';
          else if (raw_volume >= 1000) grade = 'B';
          
          // 5개 지표 처리
          const comp_idx = volumeData.compIdx || null;
          const comp_score = await compIdxToScore(comp_idx);
          const ad_depth = volumeData.plAvgDepth || 0;
          const has_ads = ad_depth > 0;
          const ctr = volumeData.plClickRate || 0; // ★ CTR 추가
          
          // CPC 추정
          let est_cpc_krw: number | null = null;
          let est_cpc_source = 'unknown';
          
          if (volumeData.avePcCpc && volumeData.avePcCpc > 0) {
            est_cpc_krw = Math.round(volumeData.avePcCpc);
            est_cpc_source = 'account';
          } else if (volumeData.aveMobileCpc && volumeData.aveMobileCpc > 0) {
            est_cpc_krw = Math.round(volumeData.aveMobileCpc);
            est_cpc_source = 'account';
          } else {
            est_cpc_krw = Math.max(100, Math.round(raw_volume / 1000 * 150));
            est_cpc_source = 'estimated';
          }
          
          // 종합점수 계산 (AdScore Engine)
          console.log(`↗️ calling calculateOverallScore for "${text}": vol=${raw_volume}, comp=${comp_score}, ad=${ad_depth}, cpc=${est_cpc_krw || 0}`);
          const score = await calculateOverallScore(raw_volume, comp_score, ad_depth, est_cpc_krw || 0);
          
          // ★ 규칙1: source 식별 (API 성공 vs 대체치)
          const fromApi = raw_volume > 0 || ctr > 0 || comp_idx || ad_depth > 0;
          const source = fromApi ? 'api_ok' : 'fallback';
          
          // ★ 규칙1: 상업성 하드 필터 (adDepth>0, CTR 완화)
          const ad_eligible = ad_depth > 0; // CTR 조건 일시 완화
          
          keywordsToUpsert.push({
            text,
            raw_volume,
            volume,
            grade,
            commerciality: Math.min(100, Math.round((raw_volume / 1000) * 10)),
            difficulty: Math.min(100, Math.round((raw_volume / 500) * 8)),
            source,           // ★ api_ok vs fallback
            comp_idx,
            comp_score,
            ad_depth,
            has_ads,
            ctr,             // ★ CTR 추가
            ad_eligible,     // ★ 상업성 하드 필터
            est_cpc_krw,
            est_cpc_source,
            score
          });
        }
        
        if (keywordsToUpsert.length > 0) {
          const upsertedCount = await upsertMany(keywordsToUpsert);
          console.log(`💾 [DB 업서트] ${upsertedCount}개 키워드 저장 완료`);
        }
      }
    }
    
    // Step 5: DB 결과와 API 결과를 합쳐서 완전한 응답 생성
    const combinedVolumes = { ...dbVolumes };
    const combinedStats = {
      requested: keywords.length,
      ok: Object.keys(dbVolumes).length,
      fail: 0,
      http: {} as Record<string, number>
    };
    
    if (apiResult) {
      // API 결과를 메모리에 즉시 반영
      Object.assign(combinedVolumes, apiResult.volumes);
      combinedStats.ok += apiResult.stats.ok;
      combinedStats.fail += apiResult.stats.fail;
      Object.assign(combinedStats.http, apiResult.stats.http);
    }
    
    // Step 6: 모드 결정 및 헬스 마킹
    let mode: 'fallback' | 'partial' | 'searchads' = 'searchads';
    let reason: string | undefined;
    
    const totalFound = Object.keys(combinedVolumes).length;
    if (totalFound === 0) {
      mode = 'fallback';
      reason = 'No volumes found in DB or API';
      await markHealthFail(db, `v10 파이프라인 ${mode} mode - ${reason}`);
    } else if (totalFound === keywords.length) {
      mode = 'searchads';
      reason = `Full success: ${Object.keys(dbVolumes).length} from DB, ${apiResult?.stats.ok || 0} from API`;
      await markHealthyHint(db, `v10 파이프라인 ${mode} mode - ${reason}`);
    } else {
      mode = 'partial';
      reason = `Partial success: ${totalFound}/${keywords.length} keywords (DB: ${Object.keys(dbVolumes).length}, API: ${apiResult?.stats.ok || 0})`;
      await markHealthyHint(db, `v10 파이프라인 ${mode} mode - ${reason}`);
    }
    
    console.log(`✅ [v10 파이프라인] 완료: ${mode} mode, ${totalFound}/${keywords.length} 키워드 (DB: ${Object.keys(dbVolumes).length}, API: ${apiResult?.stats.ok || 0})`);
    
    return { 
      volumes: combinedVolumes, 
      mode, 
      stats: combinedStats, 
      reason 
    };
    
  } catch (error: any) {
    await markHealthFail(db, `v10 파이프라인 exception: ${error?.message || 'unknown error'}`);
    throw error;
  }
}

/**
 * Health-aware wrapper for Naver OpenAPI blog search
 * Marks health as degraded on API errors, healthy on successful responses
 */
export async function searchBlogsWithHealth(
  db: NodePgDatabase<any>,
  query: string,
  display: number = 10,
  sort: string = 'sim'
): Promise<NaverBlogSearchResult[]> {
  try {
    const results = await naverApi.searchBlogs(query, display, sort);
    
    // Mark healthy on any successful response (even empty list)
    await markHealthyHint(db, `OpenAPI success - ${results.length} blog results`);
    
    return results;
  } catch (error: any) {
    // Mark degraded on API errors or exceptions
    await markHealthFail(db, `OpenAPI failure: ${error?.message || 'unknown error'}`);
    
    // Return empty array to match existing caller expectations
    return [];
  }
}

/**
 * Health-aware wrapper for keyword ranking check
 * Provides health marking for this OpenAPI usage as well
 */
export async function checkKeywordRankingWithHealth(
  db: NodePgDatabase<any>,
  keyword: string,
  blogUrl: string
): Promise<number | null> {
  try {
    const ranking = await naverApi.checkKeywordRanking(keyword, blogUrl);
    
    // Mark healthy if we got a response (even if ranking is null)
    await markHealthyHint(db, `OpenAPI ranking check success for keyword: ${keyword}`);
    
    return ranking;
  } catch (error: any) {
    await markHealthFail(db, `OpenAPI ranking check failure: ${error?.message || 'unknown error'}`);
    return null;
  }
}