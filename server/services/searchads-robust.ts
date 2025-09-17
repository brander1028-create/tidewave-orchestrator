// server/services/searchads-robust.ts
import { getVolumes } from "./searchad";       // 실제 SearchAds 함수 import
import { nrm } from "../utils/normalization";  // 정규화 함수

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

// 1-1) 하드 스킵 조건 + 키 정규화
const MIN_BATCH = 1, MAX_ATTEMPTS_PER_KEY = 5;

// 키 정규화 (변형 상관없이 동일 키로 묶음)
const baseKey = (s: string) => s.normalize('NFKC').toLowerCase().replace(/[\s\-\.]/g, '');

/** 413/400 에서 배치 1까지 줄이고, 변형도 최소화해 끝까지 밀어붙이는 bulk */
export async function robustBulkVolumes(
  keywords: string[],
  opts?: { logPrefix?: string; minimalVariant?: boolean }
) {
  let i = 0, batch = Math.min(8, Math.max(1, keywords.length));
  const volumes: Record<string, any> = {};
  let minimal = !!opts?.minimalVariant;
  const tries: Record<string, number> = {}; // baseKey 기준 시도 횟수 추적
  
  function markPartialFail(key: string) {
    console.warn(`[robustBulk] ${opts?.logPrefix || ""} SKIP "${key}" after ${MAX_ATTEMPTS_PER_KEY} attempts`);
  }

  while (i < keywords.length) {
    const slice = keywords.slice(i, i + batch);
    // 키(시도 횟수)는 'base surface' 기준으로 묶음 (variant별로 따로 카운트 금지)
    const baseSurfaces = slice.map(s => s); // slice 요소가 surface일 것
    let payload;
    if (minimal) {
      // 최소 변형: base만
      payload = baseSurfaces;
    } else {
      payload = baseSurfaces.flatMap(variantsFor);
    }

    try {
      const result = await getVolumes(payload);   // 실제 SearchAds API 호출
      
      // 결과 병합
      Object.assign(volumes, result.volumes);
      
      i += batch;
      // 성공하면 배치 상향(너무 높지 않게)
      if (batch < 8) batch = Math.min(8, batch + 1);
      minimal = false;                              // 다음 시도는 정상 변형
      
      // 성공한 키워드들의 시도 횟수 리셋
      baseSurfaces.forEach(key => { tries[baseKey(key)] = 0; });
    } catch (e: any) {
      console.warn(`[robustBulk] ${opts?.logPrefix || ""} ${e?.message || e}`);
      if (is413(e) || is400(e)) {
        // 배치=1인데도 400/413이면, 키 단위로 스킵
        if (batch === MIN_BATCH) {
          const key = baseKey(baseSurfaces[0]);            // 현재 키워드 묶음의 대표 키
          tries[key] = (tries[key] || 0) + 1;
          if (tries[key] >= MAX_ATTEMPTS_PER_KEY) {        // ★ 같은 키 최대 5회
            markPartialFail(key); 
            i += 1; 
            minimal = false; 
            continue;
          }
          // 아직 5회 미만이면: minimal 토글 후 다시 시도
          minimal = true; 
          continue;
        }
        
        if (batch > MIN_BATCH) { 
          batch = Math.max(MIN_BATCH, Math.floor(batch / 2)); 
          continue; 
        }
        
        // 배치가 이미 1인데도 400 → 변형 최소화로 재시도
        if (!minimal) { minimal = true; continue; }
        
        // 그래도 실패 시 이 키워드는 partial 실패로 넘어감
        i += 1; minimal = false;
      } else {
        throw e;
      }
    }
  }
  
  return {
    volumes,
    mode: 'robust' as const,
    stats: { requested: keywords.length, ok: Object.keys(volumes).length, fail: 0, http: {} }
  };
}