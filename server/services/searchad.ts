import crypto from 'crypto';
import fetch from 'node-fetch';

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

function sign(ts: string, method: 'GET'|'POST', path: string, secret: string) {
  // Naver SearchAd: signature = HMAC-SHA256( `${ts}.${method}.${path}` )
  return crypto.createHmac('sha256', secret).update(`${ts}.${method}.${path}`).digest('base64');
}

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

export async function getVolumes(rawKeywords: string[]): Promise<SearchAdResult> {
  let API_KEY = process.env.SEARCHAD_API_KEY!;
  const SECRET = process.env.SEARCHAD_SECRET_KEY!;
  const CUSTOMER = process.env.SEARCHAD_CUSTOMER_ID!;

  // Clean up API key if it has Korean text prefix
  if (API_KEY && API_KEY.includes('엑세스라이선스')) {
    API_KEY = API_KEY.replace(/^.*엑세스라이선스/, '').trim();
    console.log(`🧹 Cleaned API key from Korean prefix, length: ${API_KEY.length}`);
  }

  if (!API_KEY || !SECRET || !CUSTOMER) {
    console.log(`🔑 SearchAd API credentials not found, using fallback mode`);
    console.log(`   - API_KEY: ${API_KEY ? 'present' : 'missing'} (length: ${API_KEY?.length || 0})`);
    console.log(`   - SECRET: ${SECRET ? 'present' : 'missing'} (length: ${SECRET?.length || 0})`);
    console.log(`   - CUSTOMER: ${CUSTOMER ? 'present' : 'missing'} (length: ${CUSTOMER?.length || 0})`);
    
    // Return fallback volumes (all 0)
    const fallbackVolumes: Record<string, Vol> = {};
    rawKeywords.forEach(k => {
      fallbackVolumes[k.toLowerCase()] = { pc: 0, mobile: 0, total: 0 };
    });
    
    return { 
      volumes: fallbackVolumes, 
      mode: 'fallback',
      stats: { requested: 0, ok: 0, fail: 0, http: {} },
      reason: 'Missing API credentials'
    };
  }

  // 중복/공백 정리, 너무 짧은 토큰 제거
  const ks = Array.from(new Set(rawKeywords.map(k => k.trim()).filter(k => k.length >= 2)));
  if (!ks.length) return { 
    volumes: {}, 
    mode: 'searchads', 
    stats: { requested: 0, ok: 0, fail: 0, http: {} },
    reason: 'No valid keywords provided'
  };

  console.log(`🔍 Fetching search volumes for ${ks.length} keywords: ${ks.slice(0, 3).join(', ')}...`);

  // Phase 2: 적응형 청크 처리 (8→3 자동조절)
  const out: Record<string, Vol> = {};
  const stats: SearchAdStats = {
    requested: ks.length,
    ok: 0,
    fail: 0,
    http: {}
  };
  
  let i = 0;
  let chunkSize = 8; // 시작 청크 크기
  const maxRetries = 2;
  
  while (i < ks.length) {
    const batch = ks.slice(i, i + chunkSize);
    console.log(`📦 Processing batch ${Math.floor(i/chunkSize) + 1}: ${batch.length} keywords (chunk=${chunkSize})`);
    
    let retryCount = 0;
    let success = false;
    
    while (retryCount <= maxRetries && !success) {
      try {
        const ts = Date.now().toString();
        const sig = sign(ts, 'GET', PATH, SECRET);

        const headers = {
          'X-Timestamp': ts,
          'X-API-KEY': API_KEY,
          'X-Customer': CUSTOMER,
          'X-Signature': sig,
        };
        
        // ✅ 수정: URLSearchParams가 자동 인코딩하므로 이중 인코딩 방지
        const qs = new URLSearchParams({ hintKeywords: batch.join(','), showDetail: '1' });
        const res = await fetch(`${BASE}${PATH}?${qs.toString()}`, { method: 'GET', headers });
        
        const status = res.status;
        stats.http[status] = (stats.http[status] || 0) + 1;
        
        if (status === 200) {
          // ✅ 성공: 데이터 처리 후 전진
          const json = await res.json() as any;
          console.log(`✅ SearchAd API success for batch: ${json.keywordList?.length || 0} keywords`);
          
          for (const row of (json.keywordList ?? [])) {
            const key = String(row.relKeyword ?? row.keyword ?? '').trim().toLowerCase();
            const pc = Number(row.monthlyPcQcCnt ?? 0);
            const mobile = Number(row.monthlyMobileQcCnt ?? 0);
            if (!key) continue;
            out[key] = { 
              pc, 
              mobile, 
              total: pc + mobile, 
              compIdx: row.compIdx,
              plAvgDepth: Number(row.plAvgDepth ?? 0),
              plClickRate: Number(row.plClickRate ?? 0),
              avePcCpc: Number(row.avePcCpc ?? 0),
              aveMobileCpc: Number(row.aveMobileCpc ?? 0)
            };
          }
          
          stats.ok += batch.length;
          i += batch.length;
          success = true;
          
          // 성공 시 청크 크기 복원 (최대 10)
          if (chunkSize < 10) {
            chunkSize = Math.min(10, chunkSize + 1);
            console.log(`📈 Chunk size increased to ${chunkSize}`);
          }
          
        } else if (status === 429) {
          // ⏳ 429: Retry-After 백오프 대기 후 재시도
          const json = await res.json().catch(() => ({})) as any;
          const retryAfter = parseInt((json as any)?.retryAfter || res.headers.get('Retry-After') || '1');
          const waitTime = Math.floor(retryAfter * 1000 * 1.5 + Math.random() * 500);
          
          console.log(`⏳ 429 Rate limit - waiting ${waitTime}ms (retry ${retryCount + 1}/${maxRetries + 1})`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
          retryCount++;
          
          // ✅ 수정: maxRetries 초과 시 배치 건너뛰기 (무한 루프 방지)
          if (retryCount > maxRetries) {
            console.log(`❌ 429 Rate limit - max retries exceeded, skipping batch`);
            stats.fail += batch.length;
            i += batch.length;
            success = true;
          }
          
        } else if (status === 400) {
          // 🔄 400: 청크 크기 반으로 줄여 재시도
          const newChunkSize = Math.max(3, Math.floor(chunkSize / 2));
          if (newChunkSize < chunkSize) {
            chunkSize = newChunkSize;
            console.log(`🔄 400 Bad Request - reducing chunk size to ${chunkSize}`);
            retryCount = 0; // 청크 크기 변경 시 재시도 카운트 리셋
          } else {
            // 이미 최소 크기면 실패 처리
            console.log(`❌ 400 Bad Request - chunk size already minimal (${chunkSize}), skipping batch`);
            stats.fail += batch.length;
            i += batch.length;
            success = true; // 더 이상 재시도하지 않음
          }
          
        } else {
          // ❌ 기타 에러: 실패 처리 후 전진
          console.log(`❌ SearchAd API error: ${status} ${res.statusText}`);
          stats.fail += batch.length;
          i += batch.length;
          success = true;
        }
        
      } catch (error) {
        console.error(`❌ SearchAd API exception:`, error);
        stats.http[500] = (stats.http[500] || 0) + 1;
        retryCount++;
        
        if (retryCount > maxRetries) {
          stats.fail += batch.length;
          i += batch.length;
          success = true;
        }
      }
    }
  }
  
  // Phase 2: 개선된 모드 판정 (ok===0→fallback, ok===requested && only2xx→searchads, 그 외 partial)
  const only2xx = Object.keys(stats.http).every(code => {
    const statusCode = parseInt(code);
    return statusCode >= 200 && statusCode < 300;
  });
  
  let mode: 'fallback' | 'partial' | 'searchads';
  let reason: string | undefined;
  
  if (stats.ok === 0) {
    mode = 'fallback';
    reason = 'No successful API calls';
    console.log(`🔄 SearchAd API failed completely, using fallback mode`);
    console.log(`   📊 Stats: ${stats.ok}/${stats.requested} success rate: 0.0%`);
    
    // fallback 시 모든 키워드를 0 volume으로 반환
    const fallbackVolumes: Record<string, Vol> = {};
    ks.forEach(k => {
      fallbackVolumes[k.toLowerCase()] = { pc: 0, mobile: 0, total: 0 };
    });
    return { volumes: fallbackVolumes, mode, stats, reason };
    
  } else if (stats.ok === stats.requested && only2xx) {
    mode = 'searchads';
    reason = 'Full success with all 2xx responses';
    console.log(`✅ SearchAd API full success - ${stats.ok}/${stats.requested} keywords (100% success rate)`);
    
  } else {
    mode = 'partial';
    const successRate = (stats.ok / stats.requested * 100).toFixed(1);
    reason = `Partial success: ${stats.ok}/${stats.requested} keywords (${successRate}%)`;
    console.log(`⚠️ SearchAd API partial success - ${stats.ok}/${stats.requested} keywords (${successRate}% success rate)`);
  }
  
  console.log(`📊 Final volumes collected: ${Object.keys(out).length} keywords using SearchAd API (${mode} mode)`);
  console.log(`📈 Sample volumes: ${Object.entries(out).slice(0, 3).map(([k, v]) => `${k}:${v.total}`).join(', ')}`);
  console.log(`📊 Final stats: requested=${stats.requested}, ok=${stats.ok}, fail=${stats.fail}, http=${JSON.stringify(stats.http)}`);
  
  return { volumes: out, mode, stats, reason };
}