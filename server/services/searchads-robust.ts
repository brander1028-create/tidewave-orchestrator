// server/services/searchads-robust.ts
import { getVolumes } from "./searchad";       // 실제 SearchAds 함수 import
import { nrm } from "../utils/normalization";  // 정규화 함수

// 🔒 비상 차단: 모든 SearchAds 호출 차단  
const DET_ONLY = process.env.DETERMINISTIC_ONLY === 'true';

// 1-1) 키워드 클린업 (허용 문자만)
function cleanKeyword(k: string) {
  // 허용 문자만(한글/영문/숫자/공백). 나머지는 제거.
  return k.replace(/[^가-힣a-zA-Z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

export function variantsFor(surface: string) {
  const s = cleanKeyword(surface);
  const ns = s.replace(/\s+/g, '');
  const arr = [s, ns];
  if (s.length >= 12) arr.push(s.replace(/\s+/g, '-'));
  return arr;
}

function is413(e: any) { return (e?.message || "").includes("413"); }
function is400(e: any) { return (e?.message || "").includes("400"); }

// 1) 키 정규화 (표면형 하나로 묶기)
const baseKey = (s:string)=> s.normalize('NFKC')
  .toLowerCase().replace(/[\s\-\.]/g,'').trim();

const MAX_ATTEMPTS_PER_KEY = 5;

/** 413/400 에서 배치 1까지 줄이고, 변형도 최소화해 끝까지 밀어붙이는 bulk */
export async function robustBulkVolumes(
  keywords: string[],
  opts?: { logPrefix?: string; minimalVariant?: boolean }
) {
  if (DET_ONLY) return { rows:[], http:{}, stats:{blocked:'deterministic'} }; // 🔒 모든 SearchAds 호출 차단
  let i = 0, batch = Math.min(8, Math.max(1, keywords.length));
  const volumes: Record<string, any> = {};
  let minimal = !!opts?.minimalVariant;
  
  // 2) per-key 시도 카운터(반드시 while 루프 바깥에!)
  const tries: Record<string, number> = {};
  
  function markPartialFail(key: string) {
    console.warn(`[robustBulk] ${opts?.logPrefix || ""} SKIP "${key}" after ${MAX_ATTEMPTS_PER_KEY} attempts`);
  }

  while (i < keywords.length) {
    // slice = [surface1, surface2, ...]
    const slice = keywords.slice(i, i + batch);
    const surfaces = slice.map(s => cleanKeyword(s));

    // minimal=false면 variants, true면 base surface만
    const payload = minimal ? surfaces : surfaces.flatMap(variantsFor);

    try {
      const result = await getVolumes(payload);   // 실제 SearchAds API 호출
      Object.assign(volumes, result.volumes);
      
      i += batch; minimal = false;                // 성공 → 다음 묶음
      if (batch < 8) batch++;                     // 완만한 상향
    } catch (e: any) {
      if (is413(e) || is400(e)) {
        // 배치 줄이기
        if (batch > 1) { batch = Math.max(1, Math.floor(batch/2)); continue; }

        // 배치=1인데도 400/413 → 이 키워드 묶음의 대표키로 시도 횟수 누적
        const key = baseKey(surfaces[0]);
        tries[key] = (tries[key] || 0) + 1;

        if (tries[key] >= MAX_ATTEMPTS_PER_KEY) { // ★ 같은 키 5회 넘으면 스킵
          markPartialFail(key); i += 1; minimal = false; continue;
        }

        // 아직 5회 미만 → minimal 변형으로 한 번 더만 시도
        minimal = true; continue;
      }
      throw e;
    }
  }
  
  return {
    volumes,
    mode: 'robust' as const,
    stats: { requested: keywords.length, ok: Object.keys(volumes).length, fail: 0, http: {} }
  };
}