// server/title/bigram-expander.ts
export function extractTokens(title: string, banSingles: string[] = []) {
  return title
    .replace(/[^\w\s가-힣]/g, " ")  // 한글, 영문, 숫자, 공백만 유지
    .split(/\s+/)
    .map(t => t.replace(/(은|는|이|가|을|를|에|에서|으로|로|와|과|도|만|까지|부터|의)$/, ""))
    .filter(t => t && t.length >= 2 && !banSingles.includes(t));
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