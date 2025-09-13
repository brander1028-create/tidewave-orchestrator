import { getVolumes } from './searchad';
import { naverApi } from './naver-api';
import { metaGet, metaSet } from '../store/meta';
import { secretsFingerprint } from '../utils/secrets';
import type { HealthOpen, HealthSearchAds, HealthKeywordsDB, SearchAdResponse, VolumeMode } from '../types';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

const NAG_ON_FAILURE = (process.env.NAG_ON_FAILURE || 'false') === 'true';

/**
 * Check OpenAPI health by making a real test call
 */
export async function checkOpenAPI(): Promise<HealthOpen> {
  const http: Record<number, number> = {};
  
  try {
    console.log('🏥 Health check: Testing OpenAPI with "헬스체크" keyword...');
    const res = await naverApi.searchBlogs('헬스체크', 1); // Real API call
    
    http[200] = 1;
    const isHealthy = Array.isArray(res) && res.length > 0;
    
    console.log(`🏥 OpenAPI health: ${isHealthy ? 'OK' : 'Fail'} - Found ${res?.length || 0} items`);
    return { ok: isHealthy, http };
    
  } catch (e: any) {
    const code = Number(e?.status || 500);
    http[code] = (http[code] || 0) + 1;
    
    console.log(`🏥 OpenAPI health: Fail - ${code} ${e?.message || e}`);
    return { ok: false, http, reason: String(e?.message || e) };
  }
}

/**
 * Check SearchAds API health with small sample
 */
export async function checkSearchAds(): Promise<HealthSearchAds> {
  console.log('🏥 Health check: Testing SearchAds API with sample keywords...');
  
  // Small sample keywords for health check
  const sample = ['홍삼', '홍삼스틱', '면역'];
  const result = await getVolumes(sample) as SearchAdResponse;
  
  // Determine mode based on success rate and HTTP responses
  const only2xx = Object.keys(result.stats.http || {}).every(c => +c >= 200 && +c < 300);
  const successRate = result.stats.requested > 0 ? result.stats.ok / result.stats.requested : 0;
  
  let mode: Exclude<VolumeMode, 'pending'>;
  
  if (result.stats.ok === 0) {
    mode = 'fallback';
  } else if (result.stats.ok === result.stats.requested && only2xx) {
    mode = 'searchads';
  } else {
    mode = 'partial';
  }
  
  console.log(`🏥 SearchAds health: ${mode} - ${result.stats.ok}/${result.stats.requested} success rate: ${(successRate * 100).toFixed(1)}%`);
  
  return { 
    mode, 
    stats: result.stats, 
    reason: result.reason 
  };
}

/**
 * Check Keywords DB health
 */
export async function checkKeywordsDB(): Promise<HealthKeywordsDB> {
  try {
    console.log('🏥 Health check: Testing Keywords DB...');
    
    // Import keywords store functions dynamically to avoid circular dependencies
    const { pingKeywordsDB, keywordsCount } = await import('../store/keywords');
    
    await pingKeywordsDB(); // Test connection with SELECT 1
    const count = await keywordsCount(); // Get total keyword count
    
    console.log(`🏥 Keywords DB health: OK - ${count} keywords available`);
    return { ok: true, count };
    
  } catch (e: any) {
    console.log(`🏥 Keywords DB health: Fail - ${e?.message || e}`);
    return { ok: false, reason: String(e?.message || e) };
  }
}

/**
 * Comprehensive health check for all services
 */
export async function checkAllServices() {
  console.log('🏥 Running comprehensive health check...');
  
  const [openapi, searchads, keywordsdb] = await Promise.all([
    checkOpenAPI(),
    checkSearchAds(),
    checkKeywordsDB()
  ]);
  
  const overall = openapi.ok && searchads.mode !== 'fallback' && keywordsdb.ok;
  console.log(`🏥 Health check complete - Overall: ${overall ? 'HEALTHY' : 'DEGRADED'}`);
  
  return { openapi, searchads, keywordsdb, overall };
}

/**
 * Enhanced health check with prompt/banner logic
 */
export async function getHealthWithPrompt(db: NodePgDatabase<any>) {
  const fp = secretsFingerprint();
  const cache = (await metaGet<any>(db, 'secrets_state')) || {};
  const now = Date.now();

  // Get health status for all services
  const openapi = await checkOpenAPI();
  const searchads = await checkSearchAds();
  const keywordsdb = await checkKeywordsDB();

  // Check if all required keys are present
  const keysPresent =
    (process.env.NAVER_CLIENT_ID||'').trim().length > 0 &&
    (process.env.NAVER_CLIENT_SECRET||'').trim().length > 0 &&
    (process.env.SEARCHAD_API_KEY||'').trim().length > 0 &&
    (process.env.SEARCHAD_CUSTOMER_ID||'').trim().length > 0 &&
    (process.env.SEARCHAD_SECRET_KEY||'').trim().length > 0;

  // Mark setup complete if everything is working
  const allHealthy = openapi.ok && searchads.mode !== 'fallback' && keywordsdb.ok;
  if (allHealthy) {
    await metaSet(db, 'secrets_state', {
      ...cache,
      fingerprint: fp,
      setup_complete: true,
      verified_at: now
    });
  }

  // Banner display conditions:
  // 1) Keys missing (MISSING) or 2) Fingerprint changed (CHANGED)
  // 3) User hasn't suppressed prompts (suppress_until)
  const changed = cache.fingerprint && cache.fingerprint !== fp;
  const suppressed = (cache.suppress_until || 0) > now;
  const missing = !keysPresent;

  // Optional: nag on failures (default false)
  const failureNag = NAG_ON_FAILURE && (!openapi.ok || searchads.mode === 'fallback' || !keywordsdb.ok);

  const should_prompt = !suppressed && (missing || changed || failureNag);

  return {
    openapi,
    searchads,
    keywordsdb,
    ui: {
      setup_complete: !!cache.setup_complete || allHealthy,
      should_prompt,
      suppress_until: cache.suppress_until || 0
    }
  };
}