import { checkOpenAPI, checkSearchAds, checkKeywordsDB } from './health';
import { metaGet, metaSet } from '../store/meta';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

// 🚫 SearchAds 헬스체크 차단 플래그
const ENABLE_SEARCHADS_PROBE = (process.env.HEALTH_PROBE_SEARCHADS || 'false') === 'true';

type HealthData = {
  openapi: Awaited<ReturnType<typeof checkOpenAPI>>;
  searchads: Awaited<ReturnType<typeof checkSearchAds>>;
  keywordsdb: Awaited<ReturnType<typeof checkKeywordsDB>>;
  ts: number;
  degraded?: boolean;       // 오류로 강제 재검 필요 상태
  last_ok_ts?: number;      // 마지막 정상 시각
};

const KEY = 'health_lkg';
const MODE = (process.env.HEALTH_MODE || 'optimistic') as 'optimistic'|'preflight';

export async function getHealthLKG(db: NodePgDatabase<any>): Promise<HealthData|null> {
  return (await metaGet<HealthData>(db, KEY)) || null;
}

export async function setHealthLKG(db: NodePgDatabase<any>, h: HealthData) {
  await metaSet(db, KEY, h);
}

export async function markHealthGood(db: NodePgDatabase<any>, h: HealthData) {
  h.degraded = false;
  h.last_ok_ts = Date.now();
  await setHealthLKG(db, h);
}

export async function markHealthFail(db: NodePgDatabase<any>, reason?: string) {
  const cur = (await getHealthLKG(db)) || { ts: 0 } as HealthData;
  cur.degraded = true;
  cur.ts = Date.now();
  await setHealthLKG(db, cur);
  console.log(`🔴 Health marked as degraded: ${reason || 'unknown reason'}`);
}

/** 강제 실측 */
export async function probeHealth(db: NodePgDatabase<any>): Promise<HealthData> {
  console.log('🏥 Running forced health probe...');
  const [openapi, searchads, keywordsdb] = await Promise.all([
    checkOpenAPI(), checkSearchAds(ENABLE_SEARCHADS_PROBE), checkKeywordsDB()
  ]);
  const h: HealthData = { 
    openapi, 
    searchads, 
    keywordsdb, 
    ts: Date.now(), 
    degraded: false, 
    last_ok_ts: Date.now() 
  };
  await setHealthLKG(db, h);
  console.log(`🟢 Health probe complete - Overall: ${openapi.ok && searchads.mode !== 'fallback' && keywordsdb.ok ? 'HEALTHY' : 'DEGRADED'}`);
  return h;
}

/** 실행 전에 프리플라이트가 필요한가? */
export async function shouldPreflight(db: NodePgDatabase<any>, strict?: boolean): Promise<boolean> {
  const lkg = await getHealthLKG(db);
  if (strict) return true;             // 강제 안전 모드
  if (MODE === 'preflight') return true;
  // optimistic 모드: degraded만 아니면 프리플라이트 생략
  return !!(lkg && lkg.degraded);
}

/** 낙관적 헬스 체크 - LKG 반환하거나 첫 실행시만 probe */
export async function getOptimisticHealth(db: NodePgDatabase<any>, force: boolean = false): Promise<HealthData> {
  if (force) {
    return await probeHealth(db);
  }
  
  const lkg = await getHealthLKG(db);
  if (!lkg) {
    // 첫 실행 - 한 번은 체크해야 함
    return await probeHealth(db);
  }
  
  // 만약 degraded 상태이고 마지막 체크에서 60초 이상 지났다면 재검사
  const timeSinceLastCheck = Date.now() - lkg.ts;
  if (lkg.degraded && timeSinceLastCheck > 60000) { // 60초 backoff
    console.log(`🔴 System degraded for ${Math.round(timeSinceLastCheck / 1000)}s, attempting recovery probe...`);
    return await probeHealth(db);
  }
  
  console.log(`🟡 Using cached health status (age: ${Math.round(timeSinceLastCheck / 1000)}s, degraded: ${!!lkg.degraded})`);
  return lkg;
}

/** 간단한 성공 힌트 - degraded 해제 및 타임스탬프 갱신 */
export async function markHealthyHint(db: NodePgDatabase<any>, reason?: string) {
  const cur = (await getHealthLKG(db)) || {
    openapi: { ok: true },
    searchads: { mode: 'searchads' as const, stats: { requested: 0, ok: 0, fail: 0, http: {} } },
    keywordsdb: { ok: true },
    ts: Date.now()
  } as HealthData;
  
  cur.degraded = false;
  cur.last_ok_ts = Date.now();
  cur.ts = Date.now();
  await setHealthLKG(db, cur);
  console.log(`🟢 Health marked as healthy: ${reason || 'api success'}`);
}