// 정규화
export const nrm = (s: string) => s.normalize('NFKC').toLowerCase().replace(/[\s\-\.]/g, '').trim();

// 2어 조합 여부(공백 기준)
export const isBigram = (s: string) => /\s/.test(s.trim());

// 로컬 토큰 휴리스틱 (시/군/구/동/읍/면/리 + 광역/특별 + 도)
const CITIES = /(서울|부산|인천|대구|대전|광주|울산|세종|경기|강원|충북|충남|전북|전남|경북|경남|제주)(특별시|광역시|도)?$/;
const LOCAL_TAIL = /[가-힣]{1,8}(시|군|구|동|읍|면|리)$/;
export const isLocal = (w: string) => CITIES.test(w) || LOCAL_TAIL.test(w);

// 단일 금지 목록(의미 없는 단어)
export const BAN_SINGLE = new Set(["맛집", "정리", "방법", "추천", "후기", "테스트", "여자", "바르", "및", "과", "와", "의", "이제", "중인데", "때인가"]);

// 단일 금지인지 판단
export const isBannedSingle = (w: string) => BAN_SINGLE.has(w) || isLocal(w) || /^\d+$/.test(w);

// "조합만 허용" 대상(= 로컬/맛집)
export const requireBigram = (w: string) => w === "맛집" || isLocal(w);

// 토큰 추출 함수 (조사/숫자 컷 + 금지 단일 컷)
export function extractTokens(title: string, banSingles: string[] = []): string[] {
  const tails = /(은|는|이|가|을|를|에|에서|으로|로|과|와|의|및|도|만|까지|부터)$/;
  return title.replace(/[^\w가-힣\s]/g, ' ')  // 한글, 영숫자, 공백만 유지
    .split(/\s+/)
    .map(w => w.replace(tails, '').trim())
    .filter(w =>
      w.length >= 2 &&
      !banSingles.includes(w) &&
      !/^\d+$/.test(w) &&
      !(w === "맛집") &&        // 단일 금지
      !isLocal(w)              // 단일 금지
    );
}