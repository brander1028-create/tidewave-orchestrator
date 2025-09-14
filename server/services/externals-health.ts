import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { getVolumes, type SearchAdResult } from './searchad';
import { naverApi, type NaverBlogSearchResult } from './naver-api';
import { markHealthFail, markHealthyHint } from './health-cache';

/**
 * Health-aware wrapper for SearchAds API volume fetching
 * Marks health as degraded on fallback/failure, healthy on success
 */
export async function getVolumesWithHealth(
  db: NodePgDatabase<any>, 
  keywords: string[]
): Promise<SearchAdResult> {
  try {
    const result = await getVolumes(keywords);
    
    // Mark degraded if fallback mode or zero successful requests
    if (result.mode === 'fallback' || result.stats.ok === 0) {
      await markHealthFail(db, `SearchAds ${result.mode} mode - ${result.reason || 'API failure'}`);
    } else {
      // Mark healthy on partial or full success
      await markHealthyHint(db, `SearchAds ${result.mode} mode - ${result.stats.ok}/${result.stats.requested} success`);
    }
    
    return result;
  } catch (error: any) {
    await markHealthFail(db, `SearchAds exception: ${error?.message || 'unknown error'}`);
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