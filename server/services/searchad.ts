/**
 * vFinal SearchAds API Client with 413/400 Defense System
 * Features: 8→4→2→1 batch shrinking, variant reduction, AbortController timeout
 */
import crypto from 'crypto';
import fetch, { AbortError } from 'node-fetch';
import { nrm, isZeroLike, toVariants } from '../utils/normalization';

const BASE = 'https://api.naver.com';
const PATH = '/keywordstool';

export type Vol = { 
  pc: number; 
  mobile: number; 
  total: number; 
  compIdx?: string;
  plAvgDepth?: number;
  plClickRate?: number;
  avePcCpc?: number;
  aveMobileCpc?: number;
};

export type SearchAdStats = {
  requested: number;
  ok: number;
  fail: number;
  http: Record<number, number>;
};

export type SearchAdResult = {
  volumes: Record<string, Vol>;
  mode: 'fallback' | 'partial' | 'searchads';
  stats: SearchAdStats;
  reason?: string;
};

function sign(ts: string, method: 'GET'|'POST', path: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(`${ts}.${method}.${path}`).digest('base64');
}

function buildHeaders(apiKey: string, secret: string, customer: string) {
  const ts = Date.now().toString();
  return {
    'X-Timestamp': ts,
    'X-API-KEY': apiKey,
    'X-Customer': customer,
    'X-Signature': sign(ts, 'GET', PATH, secret),
  };
}

function normalizeKeywords(rawKeywords: string[]): string[] {
  return Array.from(new Set(
    rawKeywords
      .map(k => k.trim())
      .filter(k => k.length >= 2)
  ));
}

function reduceVariants(keyword: string, minimalMode = false): string[] {
  if (minimalMode) {
    // vFinal: 400 error에서 variants 축소 - surface만 사용
    return [keyword.trim()];
  }
  
  const { variants } = toVariants(keyword);
  return variants;
}

interface FetchBatchResult {
  rows: any[];
  status: number;
  retryAfter?: number;
}

async function fetchBatch(
  batch: string[], 
  headers: Record<string, string>,
  timeoutMs = 10000,
  minimalVariants = false
): Promise<FetchBatchResult> {
  // vFinal: 필요시 variants 축소
  const keywords = minimalVariants 
    ? batch.map(k => reduceVariants(k, true)).flat()
    : batch;
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    const qs = new URLSearchParams({ 
      hintKeywords: keywords.join(','), 
      showDetail: '1' 
    });
    
    const res = await fetch(`${BASE}${PATH}?${qs.toString()}`, { 
      method: 'GET', 
      headers,
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    if (res.status === 200) {
      const json = await res.json() as any;
      return {
        rows: json.keywordList || [],
        status: res.status
      };
    } else if (res.status === 429) {
      // Extract retry-after from header or response body
      const retryAfter = parseInt(
        res.headers.get('Retry-After') || '1'
      );
      
      return {
        rows: [],
        status: res.status,
        retryAfter
      };
    } else {
      return {
        rows: [],
        status: res.status
      };
    }
    
  } catch (error: any) {
    clearTimeout(timeoutId);
    
    if (error instanceof AbortError || error.name === 'AbortError') {
      throw new Error('Request timeout');
    }
    
    // Network errors
    throw error;
  }
}

export async function getVolumes(rawKeywords: string[]): Promise<SearchAdResult> {
  let API_KEY = process.env.SEARCHAD_API_KEY!;
  const SECRET = process.env.SEARCHAD_SECRET_KEY!;
  const CUSTOMER = process.env.SEARCHAD_CUSTOMER_ID!;

  // Clean up API key if it has Korean text prefix
  if (API_KEY && API_KEY.includes('엑세스라이선스')) {
    API_KEY = API_KEY.replace(/^.*엑세스라이선스/, '').trim();
    console.log(`🧹 [vFinal] Cleaned API key, length: ${API_KEY.length}`);
  }

  // Fallback mode for missing credentials
  if (!API_KEY || !SECRET || !CUSTOMER) {
    console.log(`🔑 [vFinal] Missing credentials, using fallback mode`);
    
    // vFinal: 초기 fallback도 nrm 키 사용
    const fallbackVolumes: Record<string, Vol> = {};
    rawKeywords.forEach(k => {
      const normKey = nrm(k.trim());
      if (normKey) {
        fallbackVolumes[normKey] = { pc: 0, mobile: 0, total: 0 };
      }
    });
    
    return { 
      volumes: fallbackVolumes, 
      mode: 'fallback',
      stats: { requested: 0, ok: 0, fail: 0, http: {} },
      reason: 'Missing API credentials'
    };
  }

  // vFinal: Create normalized → surface mapping for variants generation
  const surfaceByNorm = new Map<string, string>();
  rawKeywords.forEach(s => {
    const t = s.trim();
    if (t.length >= 2) {
      const nk = nrm(t);
      if (nk && !surfaceByNorm.has(nk)) {
        surfaceByNorm.set(nk, t);
      }
    }
  });
  const ks = Array.from(surfaceByNorm.keys());
  
  if (!ks.length) {
    return { 
      volumes: {}, 
      mode: 'searchads', 
      stats: { requested: 0, ok: 0, fail: 0, http: {} },
      reason: 'No valid keywords provided'
    };
  }

  console.log(`🔍 [vFinal] Processing ${ks.length} keywords: ${ks.slice(0, 3).join(', ')}...`);

  // 1) 키 정규화 (표면형 하나로 묶기)
  const baseKey = (s:string)=> s.normalize('NFKC')
    .toLowerCase().replace(/[\s\-\.]/g,'').trim();

  // vFinal: Adaptive batch processing with defense system
  const out: Record<string, Vol> = {};
  const stats: SearchAdStats = {
    requested: ks.length,
    ok: 0,
    fail: 0,
    http: {}
  };
  
  let i = 0;
  let batchSize = Math.min(8, ks.length);
  let minimal = false;
  const maxRetries = 3;
  const retryCounts = new Map<number, number>(); // Track retries per batch index
  
  // 2) per-key 시도 카운터(반드시 while 루프 바깥에!)
  const tries: Record<string, number> = {};
  const MAX_ATTEMPTS_PER_KEY = 5;
  
  function markPartialFail(key: string) {
    console.warn(`[vFinal] SKIP "${key}" after ${MAX_ATTEMPTS_PER_KEY} attempts`);
  }
  
  while (i < ks.length) {
    const batch = ks.slice(i, i + batchSize);
    console.log(`📦 [vFinal] Batch: ${batch.length} keywords (batchSize=${batchSize})`);
    
    try {
      const headers = buildHeaders(API_KEY, SECRET, CUSTOMER);
      // vFinal: variants from surface forms (not normalized)
      const apiBatch = batch.map(nk => surfaceByNorm.get(nk) ?? nk);
      // minimal=false면 variants, true면 base surface만
      const enhancedBatch = minimal ? apiBatch : apiBatch.flatMap(s => toVariants(s).variants);
      const result = await fetchBatch(enhancedBatch, headers, 10000);
      
      stats.http[result.status] = (stats.http[result.status] || 0) + 1;
      
      if (result.status === 200) {
        // Success: process data and advance
        console.log(`✅ [vFinal] Success: ${result.rows.length} rows`);
        
        for (const row of result.rows) {
          const normKey = nrm(String(row.relKeyword ?? row.keyword ?? ''));
          if (!normKey) continue;
          
          const safeNumber = (val: any, defaultVal = 0) => {
            const num = Number(val);
            return isNaN(num) ? defaultVal : num;
          };
          
          const pc = safeNumber(row.monthlyPcQcCnt);
          const mobile = safeNumber(row.monthlyMobileQcCnt);
          
          out[normKey] = { 
            pc, 
            mobile, 
            total: pc + mobile, 
            compIdx: row.compIdx,
            plAvgDepth: safeNumber(row.plAvgDepth),
            plClickRate: safeNumber(row.plClickRate),
            avePcCpc: safeNumber(row.avePcCpc),
            aveMobileCpc: safeNumber(row.aveMobileCpc)
          };
        }
        
        stats.ok += batch.length;
        i += batch.length; minimal = false;                // 성공 → 다음 묶음
        
        // Success: incrementally grow batch size (cap 8)  
        if (batchSize < 8) {
          batchSize++;                     // 완만한 상향
          console.log(`📈 [vFinal] Batch size increased to ${batchSize}`);
        }
        
      } else if (result.status === 429) {
        // Rate limit: wait and retry with bounded retries
        const currentRetryCount = (retryCounts.get(i) || 0) + 1;
        
        if (currentRetryCount <= maxRetries) {
          retryCounts.set(i, currentRetryCount);
          const waitTime = (result.retryAfter || 1) * 1000 + Math.random() * 500;
          console.log(`⏳ [vFinal] Rate limit ${currentRetryCount}/${maxRetries} - waiting ${waitTime}ms`);
          
          await new Promise(resolve => setTimeout(resolve, waitTime));
          continue; // Retry same batch without advancing i
        } else {
          console.log(`❌ [vFinal] Rate limit max retries exceeded, skipping batch`);
          retryCounts.delete(i); // Clean up retry count
          stats.fail += batch.length;
          i += batch.length;
        }
        
      } else if (result.status === 413 || result.status === 400) {
        console.log(`🔄 [vFinal] ${result.status} error - reducing batch ${batchSize}→${Math.max(1, Math.floor(batchSize/2))}`);
        
        // 배치 줄이기
        if (batchSize > 1) { 
          batchSize = Math.max(1, Math.floor(batchSize / 2)); 
          continue; 
        }

        // 배치=1인데도 400/413 → 이 키워드 묶음의 대표키로 시도 횟수 누적
        const surfaces = batch.map(nk => surfaceByNorm.get(nk) ?? nk);
        const key = baseKey(surfaces[0]);
        tries[key] = (tries[key] || 0) + 1;

        if (tries[key] >= MAX_ATTEMPTS_PER_KEY) { // ★ 같은 키 5회 넘으면 스킵
          markPartialFail(key); 
          i += batchSize; 
          minimal = false; 
          continue;
        }

        // 아직 5회 미만 → minimal 변형으로 한 번 더만 시도
        if (!minimal) {
          console.log(`⚠️ [vFinal] Trying minimal variants for 400 error`);
          minimal = true; 
          continue;
        } else {
          // minimal도 실패했으면 이 키워드는 넘어감
          console.log(`❌ [vFinal] Minimal variants also failed, skipping`);
          stats.fail += batch.length;
          i += batchSize;
          minimal = false;
        }
        
      } else {
        // Other errors: fail and advance
        console.log(`❌ [vFinal] Error ${result.status}, skipping batch`);
        stats.fail += batch.length;
        i += batch.length;
      }
      
    } catch (error: any) {
      console.error(`❌ [vFinal] Exception:`, error);
      stats.http[500] = (stats.http[500] || 0) + 1;
      stats.fail += batch.length;
      i += batch.length;
    }
  }
  
  // vFinal: Mode determination
  const only2xx = Object.keys(stats.http).every(code => {
    const statusCode = parseInt(code);
    return statusCode >= 200 && statusCode < 300;
  });
  
  let mode: 'fallback' | 'partial' | 'searchads';
  let reason: string | undefined;
  
  if (stats.ok === 0) {
    mode = 'fallback';
    reason = 'No successful API calls';
    console.log(`🔄 [vFinal] Complete failure, fallback mode`);
    
    // vFinal: fallback도 nrm 키 사용
    const fallbackVolumes: Record<string, Vol> = {};
    ks.forEach(nk => {
      fallbackVolumes[nk] = { pc: 0, mobile: 0, total: 0 };
    });
    return { volumes: fallbackVolumes, mode, stats, reason };
    
  } else if (stats.ok === stats.requested && only2xx) {
    mode = 'searchads';
    reason = 'Full success with all 2xx responses';
    console.log(`✅ [vFinal] Full success - ${stats.ok}/${stats.requested} (100%)`);
    
  } else {
    mode = 'partial';
    const successRate = (stats.ok / stats.requested * 100).toFixed(1);
    reason = `Partial success: ${stats.ok}/${stats.requested} (${successRate}%)`;
    console.log(`⚠️ [vFinal] Partial success - ${stats.ok}/${stats.requested} (${successRate}%)`);
  }
  
  console.log(`📊 [vFinal] Final: ${Object.keys(out).length} volumes, mode=${mode}`);
  console.log(`📈 [vFinal] Sample: ${Object.entries(out).slice(0, 3).map(([k, v]) => `${k}:${v.total}`).join(', ')}`);
  
  return { volumes: out, mode, stats, reason };
}