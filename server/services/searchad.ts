import crypto from 'crypto';
import fetch from 'node-fetch';

const BASE = 'https://api.naver.com';
const PATH = '/keywordstool';

type Vol = { pc: number; mobile: number; total: number; compIdx?: string };

function sign(ts: string, method: 'GET'|'POST', path: string, secret: string) {
  // Naver SearchAd: signature = HMAC-SHA256( `${ts}.${method}.${path}` )
  return crypto.createHmac('sha256', secret).update(`${ts}.${method}.${path}`).digest('base64');
}

export async function getVolumes(rawKeywords: string[]): Promise<{ volumes: Record<string, Vol>, mode: string }> {
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
    console.log(`   - CUSTOMER: ${CUSTOMER ? 'present' : 'missing'} (value: ${CUSTOMER})`);
    
    // Return fallback volumes (all 0)
    const fallbackVolumes: Record<string, Vol> = {};
    rawKeywords.forEach(k => {
      fallbackVolumes[k.toLowerCase()] = { pc: 0, mobile: 0, total: 0 };
    });
    
    return { volumes: fallbackVolumes, mode: 'fallback' };
  }

  // 중복/공백 정리, 너무 짧은 토큰 제거
  const ks = Array.from(new Set(rawKeywords.map(k => k.trim()).filter(k => k.length >= 2)));
  if (!ks.length) return { volumes: {}, mode: 'searchads' };

  console.log(`🔍 Fetching search volumes for ${ks.length} keywords: ${ks.slice(0, 3).join(', ')}...`);

  // 길이 제한 회피용 청크(너무 많이 붙이면 URL 길이 초과 위험) — 5개씩
  const chunks: string[][] = [];
  for (let i = 0; i < ks.length; i += 5) chunks.push(ks.slice(i, i+5));

  const out: Record<string, Vol> = {};
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
      
      if (!res.ok) {
        console.log(`⚠️ SearchAd API error for chunk ${chunk.join(',')}: ${res.status} ${res.statusText}`);
        continue;
      }
      
      const json = await res.json() as any;
      console.log(`📊 SearchAd API response for ${chunk.join(',')}: ${json.keywordList?.length || 0} keywords`);

      for (const row of (json.keywordList ?? [])) {
        const key = String(row.relKeyword ?? row.keyword ?? '').trim().toLowerCase();
        const pc = Number(row.monthlyPcQcCnt ?? 0);
        const mobile = Number(row.monthlyMobileQcCnt ?? 0);
        if (!key) continue;
        out[key] = { pc, mobile, total: pc + mobile, compIdx: row.compIdx };
      }
    } catch (error) {
      console.error(`❌ SearchAd API error for chunk ${chunk.join(',')}:`, error);
    }
  }
  
  console.log(`📊 Final volumes collected: ${Object.keys(out).length} keywords using SearchAd API`);
  console.log(`📈 Sample volumes: ${Object.entries(out).slice(0, 3).map(([k, v]) => `${k}:${v.total}`).join(', ')}`);
  
  return { volumes: out, mode: 'searchads' };
}