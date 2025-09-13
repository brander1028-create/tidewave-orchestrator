import crypto from 'crypto';
import fetch from 'node-fetch';

const BASE = 'https://api.naver.com';
const PATH = '/keywordstool';

type Vol = { pc: number; mobile: number; total: number; compIdx?: string };

function sign(ts: string, method: 'GET'|'POST', path: string, secret: string) {
  // Naver SearchAd: signature = HMAC-SHA256( `${ts}.${method}.${path}` )
  return crypto.createHmac('sha256', secret).update(`${ts}.${method}.${path}`).digest('base64');
}

type SearchAdStats = {
  requested: number;
  ok: number;
  fail: number;
  http: Record<number, number>;
};

type SearchAdResult = {
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

  // 길이 제한 회피용 청크(너무 많이 붙이면 URL 길이 초과 위험) — 5개씩
  const chunks: string[][] = [];
  for (let i = 0; i < ks.length; i += 5) chunks.push(ks.slice(i, i+5));

  const out: Record<string, Vol> = {};
  let hasSuccessfulApiCall = false;
  let hasApiErrors = false;
  
  // Initialize stats tracking
  const stats: SearchAdStats = {
    requested: chunks.length,
    ok: 0,
    fail: 0,
    http: {}
  };
  
  for (const chunk of chunks) {
    try {
      const ts = Date.now().toString();
      const sig = sign(ts, 'GET', PATH, SECRET);

      const headers = {
        'X-Timestamp': ts,
        'X-API-KEY': API_KEY,
        'X-Customer': CUSTOMER,
        'X-Signature': sig,
      };
      const qs = new URLSearchParams({ hintKeywords: chunk.join(','), showDetail: '1' });
      const res = await fetch(`${BASE}${PATH}?${qs.toString()}`, { method: 'GET', headers });
      
      // Track HTTP status codes
      const statusCode = res.status;
      stats.http[statusCode] = (stats.http[statusCode] || 0) + 1;
      
      if (!res.ok) {
        console.log(`⚠️ SearchAd API error for chunk ${chunk.join(',')}: ${res.status} ${res.statusText}`);
        hasApiErrors = true;
        stats.fail++;
        continue;
      }
      
      const json = await res.json() as any;
      console.log(`📊 SearchAd API response for ${chunk.join(',')}: ${json.keywordList?.length || 0} keywords`);
      hasSuccessfulApiCall = true;
      stats.ok++;

      for (const row of (json.keywordList ?? [])) {
        const key = String(row.relKeyword ?? row.keyword ?? '').trim().toLowerCase();
        const pc = Number(row.monthlyPcQcCnt ?? 0);
        const mobile = Number(row.monthlyMobileQcCnt ?? 0);
        if (!key) continue;
        out[key] = { pc, mobile, total: pc + mobile, compIdx: row.compIdx };
      }
    } catch (error) {
      console.error(`❌ SearchAd API error for chunk ${chunk.join(',')}:`, error);
      hasApiErrors = true;
      stats.fail++;
      // Track 500 for network/parse errors
      stats.http[500] = (stats.http[500] || 0) + 1;
    }
  }
  
  // Determine mode based on success/failure stats
  const successRate = stats.requested > 0 ? stats.ok / stats.requested : 0;
  let mode: 'fallback' | 'partial' | 'searchads';
  let reason: string | undefined;
  
  if (hasApiErrors || !hasSuccessfulApiCall || Object.keys(out).length === 0) {
    mode = 'fallback';
    reason = hasApiErrors ? 'API errors occurred' : 'No successful API calls';
    console.log(`🔄 SearchAd API failed (errors: ${hasApiErrors}, successful: ${hasSuccessfulApiCall}), falling back to frequency-based mode`);
    console.log(`   📊 Stats: ${stats.ok}/${stats.requested} success rate: ${(successRate * 100).toFixed(1)}%`);
    
    const fallbackVolumes: Record<string, Vol> = {};
    ks.forEach(k => {
      fallbackVolumes[k.toLowerCase()] = { pc: 0, mobile: 0, total: 0 };
    });
    return { volumes: fallbackVolumes, mode, stats, reason };
  } else if (stats.fail > 0) {
    mode = 'partial';
    reason = `Partial success: ${stats.ok}/${stats.requested} chunks succeeded`;
    console.log(`⚠️ SearchAd API partial success - ${stats.ok}/${stats.requested} chunks, using partial mode`);
  } else {
    mode = 'searchads';
    console.log(`✅ SearchAd API full success - ${stats.ok}/${stats.requested} chunks`);
  }
  
  console.log(`📊 Final volumes collected: ${Object.keys(out).length} keywords using SearchAd API (${mode} mode)`);
  console.log(`📈 Sample volumes: ${Object.entries(out).slice(0, 3).map(([k, v]) => `${k}:${v.total}`).join(', ')}`);
  console.log(`📊 Final stats: requested=${stats.requested}, ok=${stats.ok}, fail=${stats.fail}, http=${JSON.stringify(stats.http)}`);
  
  return { volumes: out, mode, stats, reason };
}