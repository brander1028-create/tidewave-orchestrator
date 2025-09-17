/**
 * vFinal 정규화 시스템 - 모든 키워드 비교에 단일 기준 적용
 */

/**
 * 단일 정규화 함수 - DB/조회/업서트/머지 모두 동일하게 사용
 */
export function nrm(s: string): string {
  if (!s || typeof s !== 'string') return '';
  
  return s
    .normalize('NFKC')           // Unicode 정규화
    .toLowerCase()               // 소문자 변환
    .replace(/[\s\-\.]/g, '')    // 공백, 하이픈, 점 제거
    .trim();                     // 양끝 공백 제거
}

/**
 * 키워드 variants 생성 (SearchAds API용)
 * surface, nospace, hyphen(길이>10일 때만)
 */
export function toVariants(keyword: string): { surface: string; variants: string[] } {
  const surface = keyword.trim();
  const nospace = surface.replace(/\s+/g, '');
  const hyphen = surface.length > 10 ? surface.replace(/\s+/g, '-') : null;
  
  return {
    surface,
    variants: [surface, nospace, hyphen].filter(Boolean) as string[]
  };
}

/**
 * Zero-like 판정 함수 (vFinal 개선 - volume 중심)
 */
export function isZeroLike(entry: any): boolean {
  if (!entry) return true;
  
  const volume = entry.volume ?? entry.total ?? 0;
  
  // vFinal: volume이 0이거나 매우 작은 값(< 10)이면 zero-like로 판정
  return volume < 10;
}

/**
 * Fresh 판정 함수 (vFinal - 30일 TTL, zero-like는 Fresh 아님)
 */
export function isFresh(entry: any, ttlMs: number = 30 * 24 * 60 * 60 * 1000): boolean {
  if (!entry || isZeroLike(entry)) return false;
  
  const age = Date.now() - (entry.updated_at ? new Date(entry.updated_at).getTime() : 0);
  return age < ttlMs;
}

/**
 * 빅그램 생성기 (2어 조합)
 */
export function expandBigrams(base: string, tokens: string[]): { surface: string; variants: string[] }[] {
  const out: { surface: string; variants: string[] }[] = [];
  
  for (const token of tokens) {
    if (token !== base) {
      const surface = `${base} ${token}`;
      const nospace = surface.replace(/\s+/g, '');
      const hyphen = surface.length > 10 ? surface.replace(/\s+/g, '-') : null;
      
      const variants = [surface, nospace, hyphen].filter(Boolean) as string[];
      
      out.push({ surface, variants });
    }
  }
  
  // 중복 제거
  const seen = new Set();
  return out.filter(item => {
    const key = item.surface.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}