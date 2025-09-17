// server/services/searchads-robust.ts
import { getVolumes } from "./searchad";       // 실제 SearchAds 함수 import
import { nrm } from "../utils/normalization";  // 정규화 함수

export function variantsFor(surface: string) {
  const ns = surface.replace(/\s+/g, "");
  const arr = [surface, ns];
  if (surface.length >= 12) arr.push(surface.replace(/\s+/g, "-"));
  return arr;
}

function is413(e: any) { return (e?.message || "").includes("413"); }
function is400(e: any) { return (e?.message || "").includes("400"); }

/** 413/400 에서 배치 1까지 줄이고, 변형도 최소화해 끝까지 밀어붙이는 bulk */
export async function robustBulkVolumes(
  keywords: string[],
  opts?: { logPrefix?: string; minimalVariant?: boolean }
) {
  let i = 0, batch = Math.min(8, Math.max(1, keywords.length));
  const MIN = 1;
  const volumes: Record<string, any> = {};
  let minimal = !!opts?.minimalVariant;

  while (i < keywords.length) {
    const slice = keywords.slice(i, i + batch);
    const payload = minimal ? slice : slice.flatMap(variantsFor);

    try {
      const result = await getVolumes(payload);   // 실제 SearchAds API 호출
      
      // 결과 병합
      Object.assign(volumes, result.volumes);
      
      i += batch;
      // 성공하면 배치 상향(너무 높지 않게)
      if (batch < 8) batch = Math.min(8, batch + 1);
      minimal = false;                              // 다음 시도는 정상 변형
    } catch (e: any) {
      console.warn(`[robustBulk] ${opts?.logPrefix || ""} ${e?.message || e}`);
      if (is413(e) || is400(e)) {
        if (batch > MIN) { batch = Math.max(MIN, Math.floor(batch / 2)); continue; }
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