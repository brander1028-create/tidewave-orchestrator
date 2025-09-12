import { getVolumes } from './searchad';

export function canonicalize(s: string) {
  return s.replace(/[^0-9A-Za-z가-힣\s]/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
          .toLowerCase()
          .replace(/\b홍삼\s*스틱\b/g, '홍삼스틱'); // 예: 표기 통합
}

function ngrams(tokens: string[], n: 1|2|3) {
  const out: string[] = [];
  for (let i=0;i<=tokens.length-n;i++) out.push(tokens.slice(i,i+n).join(' '));
  return out;
}

export async function extractTop3ByVolume(titles: string[]) {
  console.log(`🔤 Starting volume-based keyword extraction from ${titles.length} titles`);
  
  // 1) 후보 생성
  const cands = new Set<string>();
  for (const t of titles) {
    const toks = canonicalize(t).split(' ').filter(Boolean);
    for (const n of [1,2,3] as const) {
      for (const g of ngrams(toks, n)) {
        if (g.length >= 2) cands.add(g);
      }
    }
  }
  const candList = Array.from(cands);
  console.log(`📝 Generated ${candList.length} candidate keywords: ${candList.slice(0, 5).join(', ')}...`);

  // 2) 검색량 조회 (없으면 빈 객체)
  const volMap = await getVolumes(candList);
  const volumeKeywords = Object.keys(volMap);
  console.log(`📊 Got volumes for ${volumeKeywords.length} keywords`);

  // 3) 랭킹 — 검색량 기반, 없으면 빈도 기반으로 fallback
  let sorted: { k: string; v: number; hasVolume: boolean }[];
  
  if (volumeKeywords.length > 0) {
    // 검색량 기반 정렬
    sorted = candList
      .map(k => ({ k, v: volMap[k] ? volMap[k].total : 0, hasVolume: !!volMap[k] }))
      .sort((a,b) => {
        // 검색량 있는 것 우선, 그 다음 검색량 크기순
        if (a.hasVolume !== b.hasVolume) return Number(b.hasVolume) - Number(a.hasVolume);
        return b.v - a.v;
      });
    console.log(`🏆 Sorted by search volume - top 5: ${sorted.slice(0, 5).map(x => `${x.k}(${x.v})`).join(', ')}`);
  } else {
    // Fallback: 빈도 기반 정렬
    const freqMap = new Map<string, number>();
    for (const t of titles) {
      const toks = canonicalize(t).split(' ').filter(Boolean);
      for (const n of [1,2,3] as const) {
        for (const g of ngrams(toks, n)) {
          if (g.length >= 2) {
            freqMap.set(g, (freqMap.get(g) || 0) + n); // n-gram 길이에 따른 가중치
          }
        }
      }
    }
    
    sorted = candList
      .map(k => ({ k, v: freqMap.get(k) || 0, hasVolume: false }))
      .sort((a,b) => b.v - a.v);
    console.log(`🔄 Fallback to frequency-based sorting - top 5: ${sorted.slice(0, 5).map(x => `${x.k}(${x.v})`).join(', ')}`);
  }

  // 4) Tier 1/2/3
  const top3 = sorted.slice(0,3).map(x => x.k);
  const detail = top3.map((k, i) => ({
    keyword: k,
    tier: `tier${i+1}` as 'tier1'|'tier2'|'tier3',
    volume_total: volMap[k]?.total ?? 0,
    volume_pc: volMap[k]?.pc ?? 0,
    volume_mobile: volMap[k]?.mobile ?? 0,
    hasVolume: !!volMap[k]
  }));
  
  console.log(`✅ Top 3 keywords selected:`, detail.map(d => `${d.tier.toUpperCase()}: ${d.keyword} (${d.volume_total})`).join(', '));
  
  return { top3, detail, allVolumes: volMap };
}