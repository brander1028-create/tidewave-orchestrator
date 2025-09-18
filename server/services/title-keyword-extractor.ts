/**
 * v17-deterministic 제목 토큰 추출기
 * 가이드 섹션 3: 제목→토큰 추출(Title tokens only)
 */

// 공통 상수
const MAX_TITLE_TOKENS = 6;

// 불용어/조사/접속사 BAN 리스트
const BAN_WORDS = new Set([
  // 기본 불용어
  '정리', '방법', '추천', '후기', '및', '과', '와', '의', '이', '오늘의', '테스트',
  // 조사
  '은', '는', '이', '가', '을', '를', '에', '에서', '으로', '로', '도', '만', '까지', '부터',
  // 접속사/기타 불용어
  '그리고', '또한', '하지만', '그런데', '그래서', '따라서', '아니면', '혹은',
  // 시간/날짜 관련
  '오늘', '어제', '내일', '지금', '당시', '요즘', '최근', '예전',
  // 수식어
  '매우', '정말', '진짜', '꽤', '상당히', '약간', '조금',
  // 기타
  '여자', '바르', '중인데', '때인가', '것', '곳', '점', '등'
]);

// 로컬/지명 사전 (단일 금지, 빅그램 허용)
const LOCAL_PLACES = new Set([
  // 특별시/광역시
  '서울', '부산', '인천', '대구', '대전', '광주', '울산', '세종',
  // 도
  '경기', '강원', '충북', '충남', '전북', '전남', '경북', '경남', '제주',
  // 주요 구/시
  '강남', '강북', '강서', '관악', '광진', '구로', '금천', '노원', '도봉', '동대문', '동작', '마포', '서대문', '서초', '성동', '성북', '송파', '양천', '영등포', '용산', '은평', '종로', '중구', '중랑',
  '수원', '용인', '성남', '안양', '부천', '광명', '평택', '안산', '고양', '과천', '구리', '남양주', '오산', '시흥', '군포', '의왕', '하남', '김포', '화성', '광주', '여주', '이천', '안성',
  // 해외 대도시
  '상하이', '도쿄', '베이징', '홍콩', '싱가포르', '방콕', '쿠알라룸푸르', '자카르타', '마닐라', '호치민',
  '뉴욕', '로스앤젤레스', '시카고', '워싱턴', '런던', '파리', '베를린', '로마', '마드리드', '암스테르담',
  // 동 단위 (주요)
  '잠실', '압구정', '청담', '역삼', '삼성', '논현', '신사', '홍대', '이태원', '명동', '종각', '을지로', '충무로', '동대문', '성수', '건대', '강남대로'
]);

// 특수 규칙: '맛집' (단일 금지, 빅그램 허용)
const SPECIAL_BANNED_SINGLES = new Set(['맛집']);

/**
 * 토큰 정규화 함수
 */
function normalize(token: string): string {
  return token
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s\-_.]+/g, '')
    .trim();
}

/**
 * 제목 토큰화 함수
 */
function tokenize(title: string): string[] {
  // 특수문자 제거, 한글/영문/숫자/공백만 유지
  const cleaned = title.replace(/[^가-힣a-zA-Z0-9\s]/g, ' ');
  
  // 공백으로 분할
  const tokens = cleaned.split(/\s+/).filter(t => t.length > 0);
  
  // 조사 제거 패턴
  const particlePattern = /(은|는|이|가|을|를|에|에서|으로|로|과|와|의|및|도|만|까지|부터)$/;
  
  return tokens.map(token => token.replace(particlePattern, ''));
}

/**
 * 토큰이 BAN 리스트에 해당하는지 확인
 */
function isBanned(token: string): boolean {
  const normalized = normalize(token);
  
  // BAN 워드 체크
  if (BAN_WORDS.has(token) || BAN_WORDS.has(normalized)) {
    return true;
  }
  
  // 로컬명 단일 금지
  if (LOCAL_PLACES.has(token) || LOCAL_PLACES.has(normalized)) {
    return true;
  }
  
  // 맛집 단일 금지
  if (SPECIAL_BANNED_SINGLES.has(token) || SPECIAL_BANNED_SINGLES.has(normalized)) {
    return true;
  }
  
  // 순수 숫자 제외
  if (/^\d+$/.test(token)) {
    return true;
  }
  
  return false;
}

/**
 * 제목에서 토큰 추출 (가이드 섹션 3B)
 */
export function extractTitleTokens(title: string): string[] {
  return tokenize(title)
    .map(normalize)                    // 정규화
    .filter(t => t.length >= 2)        // 최소 길이
    .filter(t => !isBanned(t))         // BAN 필터링
    .slice(0, MAX_TITLE_TOKENS);       // 상한 적용
}

/**
 * 빅그램이 허용되는지 확인 (로컬명, 맛집 빅그램 허용)
 */
export function isBigramAllowed(token1: string, token2: string): boolean {
  const bigram = `${token1} ${token2}`;
  
  // 로컬명 + 다른 토큰 빅그램 허용
  if (LOCAL_PLACES.has(token1) || LOCAL_PLACES.has(token2)) {
    return true;
  }
  
  // 맛집 빅그램 허용 (예: 평택 맛집, 잠실 맛집)
  if (token1 === '맛집' || token2 === '맛집') {
    return true;
  }
  
  return true; // 기본적으로 빅그램 허용
}

/**
 * 빅그램 생성 함수
 */
export function makeBigrams(tokens: string[]): string[] {
  const bigrams: string[] = [];
  
  for (let i = 0; i < tokens.length - 1; i++) {
    const token1 = tokens[i];
    const token2 = tokens[i + 1];
    
    if (isBigramAllowed(token1, token2)) {
      bigrams.push(`${token1} ${token2}`);
    }
  }
  
  return bigrams;
}

// 유틸리티 함수들
export function hasMatjip(tokens: string[]): boolean {
  return tokens.some(t => t.includes('맛집'));
}

export function hasLocal(tokens: string[]): boolean {
  const localPattern = /(서울|부산|인천|대구|대전|광주|울산|세종|경기|강원|충북|충남|전북|전남|경북|경남|제주|[가-힣]+(시|군|구|동|읍|면|리))/;
  return tokens.some(t => localPattern.test(t) || LOCAL_PLACES.has(t));
}

export { MAX_TITLE_TOKENS, BAN_WORDS, LOCAL_PLACES, SPECIAL_BANNED_SINGLES };

/**
 * 호환성 스텁: 기존 API와의 호환성 유지
 */
export const titleKeywordExtractor = {
  async extractTopNByCombined(titles: string[], N: number = 4, options: any = {}): Promise<any> {
    console.log(`🔄 [Compatibility Stub] extractTopNByCombined called with ${titles.length} titles, N=${N}`);
    
    // 모든 제목에서 토큰 추출
    const allTokens = new Set<string>();
    for (const title of titles) {
      const tokens = extractTitleTokens(title);
      tokens.forEach(token => allTokens.add(token));
    }
    
    // 토큰들을 결과 형식으로 변환
    const tokenArray = Array.from(allTokens).slice(0, N);
    const topN = tokenArray.map((text, index) => ({
      text,
      raw_volume: 0, // 스텁에서는 볼륨 데이터 없음
      frequency: 1,
      combined_score: 1.0 - (index * 0.1) // 간단한 스코어링
    }));
    
    return {
      mode: 'deterministic-stub',
      topN,
      stats: {
        titles_processed: titles.length,
        tokens_extracted: tokenArray.length,
        apiCalls: 0
      },
      budget: { remaining: 100 }
    };
  }
};