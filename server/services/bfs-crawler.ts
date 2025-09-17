import { readFileSync } from 'fs';
import { join } from 'path';
import { getVolumesWithHealth } from './externals-health.js';
import { listKeywords, upsertMany } from '../store/keywords.js';
import { compIdxToScore, calculateOverallScore } from './scoring-config.js';
import { nanoid } from 'nanoid';
import { db } from '../db.js';
import { storage } from '../storage.js';

// CSV에서 시드 키워드 로드 (기본 버전)
export function loadSeedsFromCSV(path?: string): string[] {
  try {
    const csvPath = path || join(process.cwd(), 'server/data/seed_keywords_v2_ko.csv');
    const csvContent = readFileSync(csvPath, 'utf-8');
    
    const lines = csvContent.split('\n').slice(1); // Skip header
    const seeds = lines
      .map(line => {
        const parts = line.split(',');
        return parts[1]?.trim(); // seed column (index 1)
      })
      .filter(Boolean) // Remove empty entries
      .filter(seed => seed.length > 0);
      
    console.log(`📂 Loaded ${seeds.length} seed keywords from CSV`);
    console.log(`🌱 Sample seeds: ${seeds.slice(0, 5).join(', ')}...`);
    
    return seeds;
  } catch (error) {
    console.error('❌ Failed to load seeds from CSV:', error);
    return [];
  }
}

// 최적화된 시드 키워드 로드 (Phase 3: 효율성 개선)
export async function loadOptimizedSeeds(maxSeeds: number = 200): Promise<string[]> {
  try {
    const csvPath = join(process.cwd(), 'server/data/seed_keywords_v2_ko.csv');
    const csvContent = readFileSync(csvPath, 'utf-8');
    
    const lines = csvContent.split('\n').slice(1); // Skip header
    
    // CSV 파싱: 카테고리별로 그룹화
    const seedsByCategory: { [category: string]: string[] } = {};
    
    for (const line of lines) {
      if (!line.trim()) continue;
      
      const parts = line.split(',');
      const category = parts[0]?.trim();
      const seed = parts[1]?.trim();
      
      if (category && seed && seed.length > 0) {
        if (!seedsByCategory[category]) {
          seedsByCategory[category] = [];
        }
        seedsByCategory[category].push(seed);
      }
    }
    
    const categories = Object.keys(seedsByCategory);
    console.log(`📁 Found ${categories.length} categories: ${categories.join(', ')}`);
    
    // 카테고리별로 균등하게 시드 선택 (다양성 확보)
    const seedsPerCategory = Math.max(1, Math.floor(maxSeeds / categories.length));
    const selectedSeeds: string[] = [];
    
    for (const category of categories) {
      const categorySeeds = seedsByCategory[category];
      
      // 🎯 기본/일반적인 키워드 우선 선택 (검색량이 있을 가능성 높음)
      const prioritizedSeeds = categorySeeds.sort((a, b) => {
        // 짧고 일반적인 키워드 우선 (길이 기준)
        const aScore = a.length + (a.includes(' ') ? 10 : 0) + (a.includes('할인') || a.includes('쿠폰') || a.includes('설치') || a.includes('렌탈') ? 50 : 0);
        const bScore = b.length + (b.includes(' ') ? 10 : 0) + (b.includes('할인') || b.includes('쿠폰') || b.includes('설치') || b.includes('렌탈') ? 50 : 0);
        return aScore - bScore;
      });
      
      // 상위 기본 키워드들 선택
      const selected = prioritizedSeeds.slice(0, seedsPerCategory);
      selectedSeeds.push(...selected);
    }
    
    // 남은 슬롯이 있으면 전체에서 랜덤 추가
    if (selectedSeeds.length < maxSeeds) {
      const allSeeds = Object.values(seedsByCategory).flat();
      const remaining = allSeeds
        .filter(seed => !selectedSeeds.includes(seed))
        .sort(() => Math.random() - 0.5)
        .slice(0, maxSeeds - selectedSeeds.length);
      
      selectedSeeds.push(...remaining);
    }
    
    // 이미 DB에 있는 키워드 제외
    const existingKeywords = await listKeywords({ excluded: false, orderBy: 'raw_volume', dir: 'desc' });
    const existingTexts = new Set(existingKeywords.map(k => normalizeKeyword(k.text)));
    
    const newSeeds = selectedSeeds.filter(seed => {
      const normalized = normalizeKeyword(seed);
      return !existingTexts.has(normalized);
    });
    
    // 최근 30일 내 크롤링된 키워드 제외 
    const uncrawledSeeds = await storage.filterUncrawledKeywords(newSeeds, 30);
    
    console.log(`🎯 Optimized seed selection:`);
    console.log(`   📊 Total available: ${Object.values(seedsByCategory).flat().length}`);
    console.log(`   🎲 Randomly selected: ${selectedSeeds.length}`);
    console.log(`   🚫 Excluded (in DB): ${selectedSeeds.length - newSeeds.length}`);
    console.log(`   ⏭️  Excluded (recently crawled): ${newSeeds.length - uncrawledSeeds.length}`);
    console.log(`   ✅ Final seeds: ${uncrawledSeeds.length}`);
    console.log(`   🌱 Sample: ${uncrawledSeeds.slice(0, 5).join(', ')}...`);
    
    return uncrawledSeeds;
  } catch (error) {
    console.error('❌ Failed to load optimized seeds:', error);
    // 에러 시 기본 방식으로 fallback
    return loadSeedsFromCSV();
  }
}

// 키워드 정규화 (중복 제거용)
export function normalizeKeyword(keyword: string): string {
  return keyword.trim().toLowerCase().replace(/\s+/g, ' ');
}

// 🔄 v10 B번: 중복된 함수 정의 제거됨 
// 이제 설정 기반 async 함수들을 ./scoring-config에서 import하여 사용

// ===== 시드 확장 Providers (명세서 3-1 ~ 3-5) =====

// 3-1) Variants Provider: 형태/연령/의도/IU/붙임띄움 (확장 강화)
function expandVariants(seed: string): string[] {
  const variants: string[] = [];
  
  // 형태 변형 - 모든 조합 생성
  const forms = ['정', '스틱', '캡슐', '젤리', '분말', '환', '액기스', '오일', '즙', '차'];
  forms.forEach(form => {
    variants.push(`${seed} ${form}`);
    variants.push(`${form} ${seed}`);
  });
  
  // 연령 변형 - 모든 조합 생성
  const ages = ['어린이', '키즈', '성인', '임산부', '시니어', '유아', '청소년', '중년', '노인'];
  ages.forEach(age => {
    variants.push(`${age} ${seed}`);
    variants.push(`${seed} ${age}`);
  });
  
  // 상업적 의도 변형 - 확장된 리스트
  const intents = ['추천', '가격', '최저가', '할인', '쿠폰', '구매', '비교', '효과', '복용법', '부작용', '후기', '리뷰', '순위'];
  intents.forEach(intent => {
    variants.push(`${seed} ${intent}`);
    variants.push(`${intent} ${seed}`);
  });
  
  // 건강/영양 관련 일반 확장
  const healthTerms = ['건강', '영양제', '보충제', '영양', '건강식품', '유기농', '천연'];
  healthTerms.forEach(term => {
    variants.push(`${term} ${seed}`);
    variants.push(`${seed} ${term}`);
  });
  
  // 비타민D/홍삼 특화 확장
  if (seed.includes('비타민d') || seed.includes('비타민D') || seed.includes('vitamin')) {
    const vitaminVariants = ['1000IU', '2000IU', '3000IU', '4000IU', '5000IU', '비타민D3', '비타민d3', 'vitamin d3'];
    vitaminVariants.forEach(variant => {
      variants.push(`${seed} ${variant}`);
      variants.push(`${variant} ${seed}`);
    });
  }
  
  if (seed.includes('홍삼')) {
    const ginseVariants = ['홍삼정', '홍삼스틱', '홍삼캡슐', '홍삼차', '홍삼즙', '6년근 홍삼', '프리미엄 홍삼'];
    ginseVariants.forEach(variant => {
      variants.push(variant);
      variants.push(`${variant} 추천`);
    });
  }
  
  // 띄어쓰기/동의어 변형 확장
  const spacingVariants: string[] = [];
  spacingVariants.push(seed.replace(/\s+/g, ''));  // 공백 제거
  spacingVariants.push(seed.replace(/([가-힣])([a-zA-Z])/g, '$1 $2')); // 한글-영문 사이 공백
  
  return [...variants, ...spacingVariants];
}

// 3-2) Temporal/Seasonal Provider: 연도 x 명절/행사
function expandTemporal(seed: string): string[] {
  const variants: string[] = [];
  const currentYear = new Date().getFullYear();
  
  // 연도별 명절/행사 조합
  const events = ['추석', '명절선물', '선물세트', '기획전', '할인', '세일', '설날', '크리스마스'];
  
  events.forEach(event => {
    if (!seed.includes(event)) {
      variants.push(`${currentYear} ${event} ${seed}`);
      variants.push(`${seed} ${currentYear} ${event}`);
      variants.push(`${currentYear} ${seed} ${event}`);
    }
  });
  
  return variants;
}

// 3-3) Local Eateries Provider: 도시/역 + 맛집
function expandLocal(seed: string): string[] {
  const variants: string[] = [];
  
  // 주요 지역/역
  const locations = [
    '잠실역', '강남역', '홍대', '신촌', '명동', '이태원', '건대',
    '서울', '부산', '대구', '인천', '광주', '대전', '울산'
  ];
  
  // 맛집 관련 키워드
  const eateryTerms = ['맛집', '맛집 추천', '핫플', '맛있는 집', '유명한 집'];
  
  // 모든 키워드에 대해 지역 조합 생성 (커버리지 향상)
  locations.forEach(location => {
    eateryTerms.forEach(term => {
      if (!seed.includes(location) && !seed.includes(term)) {
        variants.push(`${location} ${term}`);
        variants.push(`${location} ${seed}`);
      }
    });
  });
  
  return variants;
}

// 3-4) Travel Provider: 국내외 도시 + 여행
function expandTravel(seed: string): string[] {
  const variants: string[] = [];
  
  // 국내외 주요 도시
  const cities = [
    '제주', '부산', '경주', '전주', '여수', '강릉', // 국내
    '파리', '런던', '도쿄', '오사카', '방콕', '싱가포르', '뉴욕', '로마' // 해외
  ];
  
  // 여행 관련 키워드
  const travelTerms = ['여행', '맛집', '여행 코스', '일정', '호텔', '숙소', '관광', '투어'];
  
  cities.forEach(city => {
    travelTerms.forEach(term => {
      variants.push(`${city} ${term}`);
      if (!seed.includes(city) && !seed.includes(term)) {
        variants.push(`${city} ${seed} ${term}`);
      }
    });
  });
  
  return variants;
}

// 🎯 높은 가치 키워드 판별 (단일 키워드용)
function isHighValueKeyword(keyword: string): boolean {
  const highValueTerms = [
    // 화장품/스킨케어
    '아토베리어', '메디큐브', '시카플라스트', '레드블레미쉬', 
    '크림', '세럼', '앰플', '에센스', '토너', '클렌저',
    '에스트라', '에이피알', '더마로지카', '라로슈포제',
    
    // 건강식품/영양제
    '비타민D3', '오메가3', '프로바이오틱스', '종합비타민', 
    '마그네슘', '칼슘', '홍삼정', '루테인',
    '나우푸드', '솔가', '종근당',
    
    // 전자제품
    '17 프로', 's25 울트라', '로봇청소기', '스마트워치',
    '이어폰 노캔', '플립7', '아이폰', '갤럭시'
  ];
  
  const keywordLower = keyword.toLowerCase();
  return highValueTerms.some(term => keywordLower.includes(term.toLowerCase()));
}

// 🎯 상업적 가치가 높은 브랜드+제품 조합 판별
function isHighValueCombo(brand: string, model: string): boolean {
  // 화장품/스킨케어 - 특정 제품명이 포함된 조합 우선순위
  const highValueProducts = [
    '아토베리어', '메디큐브', '시카플라스트', '레드블레미쉬', 
    '크림', '세럼', '앰플', '에센스', '토너', '클렌저'
  ];
  
  // 건강식품 - 특정 영양소 조합 우선순위
  const highValueSupplements = [
    '비타민D3', '오메가3', '프로바이오틱스', '종합비타민', 
    '마그네슘', '칼슘', '홍삼정', '루테인'
  ];
  
  // 전자제품 - 인기 모델 우선순위
  const highValueElectronics = [
    '17 프로', 's25 울트라', '로봇청소기', '스마트워치',
    '이어폰 노캔', '플립7'
  ];
  
  const productLower = model.toLowerCase();
  
  return highValueProducts.some(product => productLower.includes(product.toLowerCase())) ||
         highValueSupplements.some(supplement => productLower.includes(supplement.toLowerCase())) ||
         highValueElectronics.some(electronics => productLower.includes(electronics.toLowerCase()));
}

// 3-5) Models/Series Provider: 브랜드+시리즈+모델
function expandModels(seed: string): string[] {
  const variants: string[] = [];
  
  // 🆕 브랜드별 모델 변형 - 대폭 확장 (화장품, 건강식품, 전자제품)
  const brandModels: { [key: string]: string[] } = {
    // 🎯 화장품/스킨케어 브랜드 (에스트라 아토베리어 타겟)
    '에스트라': ['아토베리어', '아토베리어 크림', '아토베리어 로션', '센시티브 크림', '수딩젤'],
    '에이피알': ['메디큐브', '메디큐브 크림', '메디큐브 세럼', 'A+크림', '레드블레미쉬'],
    '더마로지카': ['데일리 마이크로폴리언트', '스킨 스무딩 크림', '에이지 스마트', '프리클리어'],
    '라로슈포제': ['시카플라스트', '안테리오스', '에파클라', '토레인', '프리비오스'],
    '아벤느': ['아벤느 크림', '썰말워터', '아토덤', '쿠르베네', '시칼파테'],
    '닥터지': ['레드블레미쉬', '그린티 세럼', 'V7토닝라이트', '필링젤'],
    
    // 💊 건강식품/영양제 브랜드  
    '나우푸드': ['비타민D3', '오메가3', '마그네슘', '아연', '비타민C', '프로바이오틱스'],
    '솔가': ['비타민D3', '오메가3', '칼슘마그네슘', '철분', '종합비타민'],
    '종근당': ['홍삼정', '비타민D', '칼슘', '아이클리어', '프로바이오틱스'],
    '뉴트리디데이': ['종합비타민', '오메가3', '루테인', '비타민D', '프로바이오틱스'],
    '일양약품': ['곰표 비타민D', '칼슘 마그네슘', '종합비타민', '오메가3'],
    '노바렉스': ['프리미엄 종합비타민', '루테인', '오메가3', '비타민D3'],
    
    // 📱 전자제품 브랜드 (기존 유지 + 확장)
    '샤오미': ['로봇청소기 m40', '로봇청소기 m30', '로봇청소기 s10', '로봇청소기 e10', '밴드8', '스마트워치'],
    '아이폰': ['17', '17 프로', '17pro', '16', '16 프로', '15', '14', '13'],
    '갤럭시': ['s25', 's25 울트라', '플립7', '폴드7', 's24', 's24 울트라', 'z플립6'],
    '블루투스': ['이어폰 노캔', '이어폰 방수', '이어폰 게이밍', '헤드폰', '스피커']
  };
  
  // 🆕 역방향 매핑 구축 (제품명→브랜드들)
  const productToBrands: { [product: string]: string[] } = {};
  Object.entries(brandModels).forEach(([brand, models]) => {
    models.forEach(model => {
      const normalizedModel = normalizeKeyword(model);
      if (!productToBrands[normalizedModel]) {
        productToBrands[normalizedModel] = [];
      }
      productToBrands[normalizedModel].push(brand);
    });
  });
  
  // 🆕 브랜드+제품 조합 생성 및 우선순위 부여
  const priorityVariants: string[] = []; // 우선순위 높은 조합
  const standardVariants: string[] = []; // 일반 조합
  const normalizedSeed = normalizeKeyword(seed);
  
  // 1) 정방향 매칭: 시드에 브랜드가 포함된 경우
  Object.entries(brandModels).forEach(([brand, models]) => {
    if (seed.includes(brand.toLowerCase()) || seed.includes(brand)) {
      models.forEach(model => {
        if (!seed.includes(model)) {
          const brandModelCombo = `${brand} ${model}`;
          
          // 🎯 상업적 가치가 높은 조합을 우선순위로 분류
          if (isHighValueCombo(brand, model)) {
            priorityVariants.push(brandModelCombo);
            priorityVariants.push(`${brandModelCombo} 추천`);
            priorityVariants.push(`${brandModelCombo} 가격`);
            priorityVariants.push(`${brandModelCombo} 효과`);
          } else {
            standardVariants.push(brandModelCombo);
            standardVariants.push(model);
          }
        }
      });
    }
  });
  
  // 🆕 2) 역방향 매칭: 시드에 제품명이 포함된 경우 (Gap 1 해결)
  Object.entries(productToBrands).forEach(([product, brands]) => {
    if (normalizedSeed.includes(product) || product.includes(normalizedSeed)) {
      brands.forEach(brand => {
        // 이미 정방향에서 처리되지 않은 경우만 추가
        if (!normalizedSeed.includes(normalizeKeyword(brand))) {
          const brandModelCombo = `${brand} ${seed}`;
          
          if (isHighValueCombo(brand, seed)) {
            priorityVariants.push(brandModelCombo);
            priorityVariants.push(`${brandModelCombo} 추천`);
            priorityVariants.push(`${brandModelCombo} 가격`);
            priorityVariants.push(`${brandModelCombo} 효과`);
          } else {
            standardVariants.push(brandModelCombo);
          }
        }
      });
    }
  });
  
  // ✨ 우선순위 조합을 앞에 배치 (더 빨리 발견되고 처리됨)
  return [...priorityVariants, ...standardVariants];
}

// 통합 확장 함수: 모든 Provider 적용 + LK 모드 지원
export function expandAllKeywords(seeds: string[], options: {
  enableLKMode?: boolean;
  preferCompound?: boolean;
  categoryMapping?: { [keyword: string]: string };
} = {}): string[] {
  const { enableLKMode = false, preferCompound = true, categoryMapping = {} } = options;
  
  console.log(`🌱 EXP seeds: in=${seeds.length} - starting expansion...`);
  console.log(`🏷️ LK Mode: ${enableLKMode ? 'ENABLED' : 'DISABLED'}, Prefer compound: ${preferCompound}`);
  
  const allExpanded = new Set<string>();
  
  // 원본 시드 추가
  seeds.forEach(seed => allExpanded.add(normalizeKeyword(seed)));
  
  // LK 모드가 활성화된 경우 우선 적용
  if (enableLKMode) {
    console.log(`🚀 [LK Mode] Applying Location+Keyword expansion...`);
    
    // LK 모드 확장 import 및 적용
    try {
      const { expandLKBatch } = require('./lk-mode.js');
      const lkVariants = expandLKBatch(seeds, {
        preferCompound,
        categoryMapping,
        maxVariantsPerSeed: 30,
        totalLimit: 15000 // LK 모드는 더 많은 조합 생성
      });
      
      lkVariants.forEach((variant: string) => {
        const normalized = normalizeKeyword(variant);
        if (normalized.length > 1) {
          allExpanded.add(normalized);
        }
      });
      
      console.log(`✅ [LK Mode] Added ${lkVariants.length} location+keyword combinations`);
    } catch (error) {
      console.error(`❌ [LK Mode] Failed to apply LK expansion:`, error);
    }
  }
  
  // 🆕 우선순위 기반 확장 처리 (Gap 2 해결)
  const priorityKeywords: string[] = []; // 브랜드+제품 조합 우선순위
  const standardKeywords: string[] = []; // 일반 키워드
  
  seeds.forEach(seed => {
    const variants = expandVariants(seed);
    const temporal = expandTemporal(seed);
    const local = expandLocal(seed);
    const travel = expandTravel(seed);
    const models = expandModels(seed);
    
    // 브랜드+제품 조합은 우선순위 그룹에 추가
    models.forEach(model => {
      const normalized = normalizeKeyword(model);
      if (normalized.length > 1 && isHighValueKeyword(normalized)) {
        priorityKeywords.push(normalized);
      } else if (normalized.length > 1) {
        standardKeywords.push(normalized);
      }
    });
    
    // 기타 확장 결과는 일반 그룹에 추가
    [...variants, ...temporal, ...local, ...travel].forEach(expanded => {
      const normalized = normalizeKeyword(expanded);
      if (normalized.length > 1) {
        standardKeywords.push(normalized);
      }
    });
  });
  
  // 🎯 우선순위 키워드를 먼저 Set에 추가 (삽입 순서 보장)
  priorityKeywords.forEach(keyword => allExpanded.add(keyword));
  standardKeywords.forEach(keyword => allExpanded.add(keyword));
  
  const expandedArray = Array.from(allExpanded);
  console.log(`🌱 EXP seeds: in=${seeds.length} expanded=${expandedArray.length} frontier=${Math.min(expandedArray.length, 50000)}`);
  
  // 🆕 50,000개 상한 적용 - 우선순위 보존 (Gap 2 해결)
  if (expandedArray.length > 50000) {
    let sampled;
    
    if (enableLKMode && preferCompound) {
      // LK 모드: 복합어 우선순위로 정렬
      sampled = expandedArray
        .sort((a, b) => {
          const aWords = a.split(/\s+/).length;
          const bWords = b.split(/\s+/).length;
          // 2~3어 복합어 우선, 그 다음 총 길이
          if (aWords >= 2 && aWords <= 3 && (bWords < 2 || bWords > 3)) return -1;
          if (bWords >= 2 && bWords <= 3 && (aWords < 2 || aWords > 3)) return 1;
          return b.length - a.length; // 긴 키워드 우선
        })
        .slice(0, 50000);
      console.log(`🔄 [LK Mode] Frontier capped at 50,000 with compound priority (from ${expandedArray.length})`);
    } else {
      // 🎯 브랜드+제품 우선순위 보존 (Set의 삽입 순서 활용)
      // 이미 priorityKeywords가 먼저 Set에 추가되었으므로 첫 50,000개만 선택
      sampled = expandedArray.slice(0, 50000);
      console.log(`🔄 [Priority Mode] Frontier capped at 50,000 with brand+product priority (from ${expandedArray.length})`);
    }
    return sampled;
  }
  
  return expandedArray;
}

// BFS 크롤러 클래스
export class BFSKeywordCrawler {
  private frontier: Set<string> = new Set();
  private visited: Set<string> = new Set();
  private collected: number = 0;
  private maxTarget: number;
  private maxHops: number;
  private currentHop: number = 0;
  private minVolume: number;
  private hasAdsOnly: boolean;
  private chunkSize: number;
  private concurrency: number;
  private minClickRate: number;
  private minCpc: number;
  
  // Phase 3: 단일 실행 가드용 타임스탬프
  public lastUpdated: Date = new Date();
  public jobId: string = nanoid();
  
  // 진행 상태
  public status: 'idle' | 'running' | 'completed' | 'error' = 'idle';
  public progress = {
    currentHop: 0,
    totalProcessed: 0,
    keywordsFound: 0,
    keywordsSaved: 0,
    frontierSize: 0,
    visitedSize: 0,
    estimatedTimeLeft: '계산 중...',
    
    // 실시간 카운터 (사용자 요청)
    collected: 0,      // 성공적으로 수집된 키워드
    skipped: 0,        // "No volume data" 스킵된 키워드
    failed: 0,         // API 호출 실패한 키워드
    attempted: 0,      // 시도한 총 키워드 수
    
    // 청크 진행률
    currentChunk: 0,
    totalChunks: 0,
    // 호출 예산 정보
    callBudget: {
      dailyRemaining: 2000,
      perMinuteRemaining: 40,
      dailyLimit: 2000,
      perMinuteLimit: 40
    }
  };

  constructor(config: {
    target: number;
    maxHops: number;
    minVolume: number;
    hasAdsOnly: boolean;
    chunkSize: number;
    concurrency: number;
    stopIfNoNewPct?: number;
    strict?: boolean;
    minClickRate?: number;
    minCpc?: number;
  }) {
    this.maxTarget = config.target;
    this.maxHops = config.maxHops;
    this.minVolume = config.minVolume;
    this.hasAdsOnly = config.hasAdsOnly;
    this.chunkSize = config.chunkSize;
    this.concurrency = config.concurrency;
    this.minClickRate = config.minClickRate ?? 0.0; // 기본값: 0.0% (필터링 없음)
    this.minCpc = config.minCpc ?? 0; // 기본값: 0원 (필터링 없음)
    // 새로운 매개변수들은 추후 구현에서 활용 예정
  }

  // 시드 키워드로 frontier 초기화 (명세서 2: 프론티어 = seeds ∪ expandAll(seeds))
  public async initializeWithSeeds(seeds: string[]) {
    console.log(`🌱 Initializing BFS crawler with ${seeds.length} seed keywords`);
    
    // 정규화된 시드 키워드 목록 생성
    const normalizedSeeds = seeds
      .map(seed => normalizeKeyword(seed))
      .filter(Boolean) as string[];
    
    console.log(`🔍 Normalized to ${normalizedSeeds.length} valid seeds`);
    
    // 명세서 핵심: "절대 DB 중복으로 프론티어에서 제거하지 말 것"
    // 시드 확장: 프론티어 = seeds ∪ expandAll(seeds)
    const expandedKeywords = expandAllKeywords(normalizedSeeds);
    
    // 모든 확장된 키워드를 frontier에 추가 (DB 중복 무시)
    expandedKeywords.forEach(keyword => {
      this.frontier.add(keyword);
    });
    
    this.progress.frontierSize = this.frontier.size;
    console.log(`✅ Frontier initialized with ${this.frontier.size} expanded keywords (Original: ${normalizedSeeds.length})`);
    
    // 빈 프론티어면 400 반환 준비 (명세서 요구사항)
    if (this.frontier.size === 0) {
      throw new Error('Empty frontier after expansion - no valid keywords to crawl');
    }
  }

  // 메인 크롤링 실행
  public async crawl(): Promise<void> {
    if (this.status === 'running') {
      throw new Error('Crawler is already running');
    }
    
    this.status = 'running';
    this.currentHop = 0;
    
    console.log(`🚀 Starting BFS keyword crawl - Target: ${this.maxTarget}, MaxHops: ${this.maxHops}`);
    console.log(`⚙️ Config: minVolume=${this.minVolume}, hasAdsOnly=${this.hasAdsOnly}, chunk=${this.chunkSize}, concurrency=${this.concurrency}`);
    
    try {
      while (
        this.currentHop < this.maxHops && 
        this.collected < this.maxTarget && 
        this.frontier.size > 0
      ) {
        this.currentHop++;
        this.progress.currentHop = this.currentHop;
        
        console.log(`\n🔄 === HOP ${this.currentHop}/${this.maxHops} === (Frontier: ${this.frontier.size}, Collected: ${this.collected}/${this.maxTarget})`);
        
        await this.processCurrentFrontier();
        
        if (this.collected >= this.maxTarget) {
          console.log(`🎯 Target reached: ${this.collected}/${this.maxTarget} keywords collected`);
          break;
        }
      }
      
      this.status = 'completed';
      console.log(`\n✅ BFS crawl completed!`);
      console.log(`📊 Final stats: ${this.collected} keywords collected in ${this.currentHop} hops`);
      
    } catch (error) {
      this.status = 'error';
      console.error('❌ BFS crawl failed:', error);
      throw error;
    }
  }

  // 현재 frontier의 키워드들 처리
  private async processCurrentFrontier(): Promise<void> {
    const currentFrontierArray = Array.from(this.frontier);
    const nextFrontier = new Set<string>();
    
    // 청크 총 개수 계산
    const totalChunks = Math.ceil(currentFrontierArray.length / this.chunkSize);
    this.progress.totalChunks = totalChunks;
    
    // 현재 frontier를 chunk 단위로 처리
    for (let i = 0; i < currentFrontierArray.length; i += this.chunkSize) {
      if (this.collected >= this.maxTarget) break;
      
      const chunk = currentFrontierArray.slice(i, i + this.chunkSize);
      const currentChunk = Math.floor(i/this.chunkSize) + 1;
      this.progress.currentChunk = currentChunk;
      
      console.log(`📦 Processing chunk ${currentChunk}/${totalChunks}: ${chunk.length} keywords`);
      
      // Phase 3: 호출 예산 체크
      const budgetCheck = checkAndConsumeCallBudget(1);
      if (!budgetCheck.allowed) {
        console.log(`💳 Call budget exhausted: ${budgetCheck.reason}`);
        await new Promise(resolve => setTimeout(resolve, 60000)); // 1분 대기
        continue;
      }
      
      // Phase 3: lastUpdated 갱신 및 호출 예산 정보 업데이트
      this.lastUpdated = new Date();
      const budgetStatus = getCallBudgetStatus();
      this.progress.callBudget = budgetStatus;
      
      // 검색량 조회 (health-aware)
      const volumeResult = await getVolumesWithHealth(db, chunk);
      const volumes = volumeResult.volumes;
      const mode = volumeResult.mode;
      
      console.log(`📊 Got volumes for ${Object.keys(volumes).length}/${chunk.length} keywords (mode: ${mode})`);
      
      // 각 키워드 처리
      for (const keyword of chunk) {
        if (this.collected >= this.maxTarget) break;
        
        // visited에 추가
        this.visited.add(keyword);
        this.progress.visitedSize = this.visited.size;
        
        const volumeData = volumes[keyword];
        if (!volumeData) {
          console.log(`⏭️  No volume data for "${keyword}" - skipping`);
          this.progress.skipped++;
          this.progress.attempted++;
          continue;
        }
        
        // NaN 안전 처리 (DB integer 삽입 에러 방지)
        const safeParseNumber = (value: any): number => {
          const parsed = Number(value);
          return isNaN(parsed) ? 0 : parsed;
        };
        
        const rawVolume = safeParseNumber(volumeData.total);
        const hasAds = safeParseNumber(volumeData.plAvgDepth) > 0;
        const clickRate = safeParseNumber(volumeData.plClickRate) / 100; // API는 0-100, 우리는 0-1
        const cpc = safeParseNumber(volumeData.avePcCpc ?? volumeData.aveMobileCpc ?? 0);
        
        // 🔥 강화된 필터 적용 - 모든 모드에서 기본 성능 체크
        if (rawVolume <= 0) {
          console.log(`⏭️  "${keyword}" volume 0 - zero volume, skipping`);
          this.progress.skipped++;
          this.progress.attempted++;
          continue;
        }
        
        // 필터 적용 - ONLY in searchads mode (Phase 1: 임시 저장 정책)
        if (mode === 'searchads') {
          if (rawVolume < this.minVolume) {
            console.log(`⏭️  "${keyword}" volume ${rawVolume} < ${this.minVolume} - skipping`);
            continue;
          }
          
          if (this.hasAdsOnly && !hasAds) {
            console.log(`⏭️  "${keyword}" has no ads - skipping`);
            continue;
          }
          
          // 🆕 클릭률 필터링 (0.0% = 무조건 제외)
          if (clickRate === 0.0) {
            console.log(`⏭️  "${keyword}" click rate 0.0% - zero performance, skipping`);
            this.progress.skipped++;
            this.progress.attempted++;
            continue;
          }
          
          if (clickRate < this.minClickRate) {
            console.log(`⏭️  "${keyword}" click rate ${(clickRate * 100).toFixed(1)}% < ${(this.minClickRate * 100).toFixed(1)}% - skipping`);
            this.progress.skipped++;
            this.progress.attempted++;
            continue;
          }
          
          // 🆕 CPC 필터링 (0원 = 의미 없는 키워드 제외)
          if (cpc === 0 && this.minCpc > 0) {
            console.log(`⏭️  "${keyword}" CPC 0원 - zero value, skipping`);
            this.progress.skipped++;
            this.progress.attempted++;
            continue;
          }
          
          if (cpc < this.minCpc) {
            console.log(`⏭️  "${keyword}" CPC ${cpc}원 < ${this.minCpc}원 - skipping`);
            this.progress.skipped++;
            this.progress.attempted++;
            continue;
          }
        } else {
          console.log(`📝 "${keyword}" saving with raw_volume=${rawVolume} (${mode} mode - no filters)`);
        }
        
        // 키워드 저장 (Phase 1: 임시 저장 정책) - NaN 안전 처리 적용
        const adDepth = safeParseNumber(volumeData.plAvgDepth);
        const estCpc = safeParseNumber(volumeData.avePcCpc);
        
        const overallScore = mode === 'searchads' 
          ? await calculateOverallScore(
              rawVolume,
              await compIdxToScore(volumeData.compIdx || '중간'),
              adDepth,
              estCpc
            )
          : 40; // 임시 보수적 점수 for fallback/partial mode
        
        const keywordData = {
          text: keyword,
          raw_volume: mode === 'searchads' ? rawVolume : 0, // fallback/partial에서는 0으로 저장
          comp_idx: volumeData.compIdx || '중간',
          ad_depth: adDepth,
          est_cpc_krw: estCpc,
          score: Math.round(safeParseNumber(overallScore)), // overallScore도 NaN 방지
          excluded: false
        };
        
        await upsertMany([keywordData]);
        this.collected++;
        this.progress.keywordsSaved = this.collected;
        this.progress.collected++;
        this.progress.attempted++;
        
        // Phase 3: 크롤링 기록 저장 (중복 방지용)
        await storage.recordKeywordCrawl(keyword, 'bfs');
        
        console.log(`✅ Saved "${keyword}" (Vol: ${rawVolume.toLocaleString()}, Score: ${overallScore}) [${this.collected}/${this.maxTarget}]`);
        
        // 연관 키워드를 다음 frontier에 추가 (구현 필요 시)
        // 현재는 시드 키워드만으로 진행
      }
      
      // 동시성 제어 - 잠시 대기
      if (this.concurrency === 1) {
        await new Promise(resolve => setTimeout(resolve, 1000)); // 1초 대기
      }
    }
    
    // frontier 업데이트
    this.frontier = nextFrontier;
    this.progress.frontierSize = this.frontier.size;
    this.progress.totalProcessed = this.visited.size;
  }

  // 진행 상태 반환
  public getProgress() {
    return {
      ...this.progress,
      status: this.status,
      collected: this.collected,
      maxTarget: this.maxTarget,
      currentHop: this.currentHop,
      maxHops: this.maxHops
    };
  }

  // 크롤링 중단
  public stop() {
    if (this.status === 'running') {
      this.status = 'idle';
      console.log('🛑 BFS crawl stopped by user');
    }
  }
}

// 글로벌 크롤러 인스턴스
let globalCrawler: BFSKeywordCrawler | null = null;

export function getGlobalCrawler(): BFSKeywordCrawler | null {
  return globalCrawler;
}

export function createGlobalCrawler(config: {
  target: number;
  maxHops: number;
  minVolume: number;
  hasAdsOnly: boolean;
  chunkSize: number;
  concurrency: number;
  stopIfNoNewPct?: number;
  strict?: boolean;
  minClickRate?: number;
  minCpc?: number;
}): BFSKeywordCrawler {
  globalCrawler = new BFSKeywordCrawler(config);
  return globalCrawler;
}

export function clearGlobalCrawler() {
  globalCrawler = null;
}

// Phase 3: Call budget management
interface CallBudgetStatus {
  dailyRemaining: number;
  perMinuteRemaining: number;
  dailyLimit: number;
  perMinuteLimit: number;
  resetAt: Date;
}

// Simple in-memory call tracking (resets on server restart)
let dailyCallCount = 0;
let minuteCallCount = 0;
let lastMinuteReset = Date.now();
let lastDayReset = Date.now();

const DAILY_CALL_LIMIT = 2000;
const PER_MINUTE_LIMIT = 40;

export function checkAndConsumeCallBudget(calls: number = 1): { allowed: boolean; reason?: string } {
  const now = Date.now();
  
  // Reset minute counter if needed
  if (now - lastMinuteReset >= 60000) {
    minuteCallCount = 0;
    lastMinuteReset = now;
  }
  
  // Reset daily counter if needed  
  if (now - lastDayReset >= 86400000) {
    dailyCallCount = 0;
    lastDayReset = now;
  }
  
  // Check if we can make the calls
  if (minuteCallCount + calls > PER_MINUTE_LIMIT) {
    return { allowed: false, reason: `Per-minute limit exceeded: ${minuteCallCount + calls}/${PER_MINUTE_LIMIT}` };
  }
  
  if (dailyCallCount + calls > DAILY_CALL_LIMIT) {
    return { allowed: false, reason: `Daily limit exceeded: ${dailyCallCount + calls}/${DAILY_CALL_LIMIT}` };
  }
  
  // Consume the calls
  minuteCallCount += calls;
  dailyCallCount += calls;
  
  return { allowed: true };
}

export function getCallBudgetStatus(): CallBudgetStatus {
  const now = Date.now();
  
  // Calculate next reset times
  const nextMinuteReset = new Date(lastMinuteReset + 60000);
  const nextDayReset = new Date(lastDayReset + 86400000);
  
  return {
    dailyRemaining: Math.max(0, DAILY_CALL_LIMIT - dailyCallCount),
    perMinuteRemaining: Math.max(0, PER_MINUTE_LIMIT - minuteCallCount),
    dailyLimit: DAILY_CALL_LIMIT,
    perMinuteLimit: PER_MINUTE_LIMIT,
    resetAt: nextMinuteReset < nextDayReset ? nextMinuteReset : nextDayReset
  };
}

// Phase 3: Stale crawler detection
export function isStale(crawler: BFSKeywordCrawler | null): boolean {
  if (!crawler || !crawler.lastUpdated) {
    return false;
  }
  
  const STALE_THRESHOLD = 5 * 60 * 1000; // 5 minutes
  return Date.now() - crawler.lastUpdated.getTime() > STALE_THRESHOLD;
}