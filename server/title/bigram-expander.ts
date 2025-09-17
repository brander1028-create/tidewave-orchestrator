// server/title/bigram-expander.ts
// 2-1) 제목 토큰 클린업
const BAN_SINGLES = new Set(["정리","방법","추천","후기","테스트","여자","바르","및","과","와","의","이제","중인데","때인가"]);

export function extractTokens(title: string, banSingles: string[] = []) {
  return title
    .replace(/[^가-힣a-zA-Z0-9\s]/g, ' ')  // 허용 문자만(한글/영문/숫자/공백)
    .split(/\s+/)
    .map(t => t.replace(/(은|는|이|가|을|를|에|에서|으로|로|과|와|의|및|도|만|까지|부터)$/, ''))
    .filter(t => t.length >= 2 && !BAN_SINGLES.has(t) && !/^\d+$/.test(t) && !banSingles.includes(t));
}

export function expandBigrams(base: string, tokens: string[]) {
  const seen = new Set<string>(), out: { surface: string }[] = [];
  for (const t of tokens) {
    if (t === base) continue;
    const s = `${base} ${t}`;
    if (!seen.has(s)) { out.push({ surface: s }); seen.add(s); }
  }
  return out;
}