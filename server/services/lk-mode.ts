import { readFileSync } from 'fs';
import { join } from 'path';

// LK 모드 (Location+Keyword Combo) 구현
// v10 Phase1/2 통합 업그레이드: 지역 휴리스틱 + 카테고리 사전 + 복합어 우선선택

interface LocationData {
  cities: string[];
  districts: string[];
  stations: string[];
  landmarks: string[];
}

interface CategoryData {
  [key: string]: {
    name: string;
    keywords: string[];
    locationTerms: string[];
  };
}

// 데이터 캐싱을 위한 변수들
let cachedLocationData: LocationData | null = null;
let cachedCategoryData: CategoryData | null = null;

// 데이터 로딩 함수들 (캐싱 지원)
function loadLocationData(): LocationData {
  if (cachedLocationData) {
    return cachedLocationData;
  }

  try {
    const locationPath = join(process.cwd(), 'server/data/locations.json');
    const locationContent = readFileSync(locationPath, 'utf-8');
    const parsed = JSON.parse(locationContent) as LocationData;
    cachedLocationData = parsed;
    console.log(`📍 [LK Mode] Location data cached: ${Object.values(parsed).flat().length} locations`);
    return parsed;
  } catch (error) {
    console.error('❌ Failed to load location data:', error);
    cachedLocationData = {
      cities: ['서울', '부산', '대구', '인천', '광주', '대전'],
      districts: ['강남구', '서초구', '송파구', '마포구'],
      stations: ['강남역', '홍대입구역', '신촌역', '명동역'],
      landmarks: ['홍대', '강남', '명동', '이태원']
    };
    return cachedLocationData;
  }
}

function loadCategoryData(): CategoryData {
  if (cachedCategoryData) {
    return cachedCategoryData;
  }

  try {
    const categoryPath = join(process.cwd(), 'server/data/categories.json');
    const categoryContent = readFileSync(categoryPath, 'utf-8');
    const parsed = JSON.parse(categoryContent) as CategoryData;
    cachedCategoryData = parsed;
    console.log(`🏷️ [LK Mode] Category data cached: ${Object.keys(parsed).length} categories`);
    return parsed;
  } catch (error) {
    console.error('❌ Failed to load category data:', error);
    cachedCategoryData = {};
    return cachedCategoryData;
  }
}

// 키워드 길이 기반 복합어 점수 계산 (2~3어 복합어 우선)
function getCompoundScore(keyword: string): number {
  const words = keyword.trim().split(/\s+/);
  const totalLength = keyword.replace(/\s+/g, '').length;
  
  // 2~3어 복합어에 보너스 점수
  let score = 0;
  if (words.length >= 2 && words.length <= 3) {
    score += 20; // 복합어 보너스
  }
  if (words.length === 3) {
    score += 10; // 3어 추가 보너스
  }
  
  // 길이 기반 점수 (4~8자 최적)
  if (totalLength >= 4 && totalLength <= 8) {
    score += 15;
  } else if (totalLength >= 3 && totalLength <= 10) {
    score += 10;
  }
  
  // 너무 짧거나 긴 키워드는 감점
  if (totalLength < 2) {
    score -= 30;
  } else if (totalLength > 15) {
    score -= 10;
  }
  
  return score;
}

// LK 모드 키워드 확장: Location + Keyword 조합 생성
export function expandLK(seed: string, options: {
  preferCompound?: boolean;
  targetCategory?: string;
  maxVariants?: number;
} = {}): string[] {
  const {
    preferCompound = true,
    targetCategory,
    maxVariants = 100
  } = options;

  const locationData = loadLocationData();
  const categoryData = loadCategoryData();
  const variants: Array<{ keyword: string; score: number }> = [];

  // 모든 지역 데이터 통합
  const allLocations = [
    ...locationData.cities,
    ...locationData.districts,
    ...locationData.stations,
    ...locationData.landmarks
  ];

  // 1. 지역 + 키워드 조합 생성
  allLocations.forEach(location => {
    if (!seed.includes(location)) {
      // 기본 조합
      const combo1 = `${location} ${seed}`;
      const combo2 = `${seed} ${location}`;
      
      variants.push({
        keyword: combo1,
        score: getCompoundScore(combo1) + (preferCompound ? 10 : 0)
      });
      
      variants.push({
        keyword: combo2,
        score: getCompoundScore(combo2) + (preferCompound ? 10 : 0)
      });
    }
  });

  // 2. 카테고리별 특화 지역 조합
  if (targetCategory && categoryData[targetCategory]) {
    const category = categoryData[targetCategory];
    
    // 카테고리 특화 지역 용어 사용
    category.locationTerms.forEach(locationTerm => {
      allLocations.forEach(location => {
        if (!seed.includes(location) && !seed.includes(locationTerm)) {
          const specialCombo = `${location} ${locationTerm} ${seed}`;
          variants.push({
            keyword: specialCombo,
            score: getCompoundScore(specialCombo) + 25 // 카테고리 특화 보너스
          });
        }
      });
    });

    // 카테고리 키워드와 지역 조합
    category.keywords.forEach(categoryKeyword => {
      if (!seed.includes(categoryKeyword)) {
        allLocations.slice(0, 10).forEach(location => { // 상위 10개 지역만
          const categoryCombo = `${location} ${categoryKeyword}`;
          variants.push({
            keyword: categoryCombo,
            score: getCompoundScore(categoryCombo) + 15 // 카테고리 키워드 보너스
          });
        });
      }
    });
  }

  // 3. 일반 카테고리 자동 감지 및 조합
  if (!targetCategory) {
    Object.entries(categoryData).forEach(([categoryKey, category]) => {
      // 시드 키워드가 카테고리와 매치되는지 확인
      const isRelevant = category.keywords.some(keyword => 
        seed.includes(keyword) || keyword.includes(seed)
      );
      
      if (isRelevant) {
        // 관련 카테고리 발견시 특화 조합 생성
        category.locationTerms.slice(0, 5).forEach(locationTerm => {
          allLocations.slice(0, 8).forEach(location => {
            if (!seed.includes(location) && !seed.includes(locationTerm)) {
              const autoCombo = `${location} ${locationTerm}`;
              variants.push({
                keyword: autoCombo,
                score: getCompoundScore(autoCombo) + 20 // 자동 감지 보너스
              });
            }
          });
        });
      }
    });
  }

  // 4. 복합어 우선순위 정렬 및 필터링
  const sortedVariants = variants
    .filter(v => v.keyword.length > 2) // 너무 짧은 키워드 제외
    .sort((a, b) => {
      if (preferCompound) {
        return b.score - a.score; // 점수 높은 순
      } else {
        return a.keyword.length - b.keyword.length; // 짧은 순
      }
    })
    .slice(0, maxVariants);

  console.log(`🏷️ [LK Mode] Generated ${sortedVariants.length} location+keyword combinations for "${seed}"`);
  console.log(`🎯 [LK Mode] Top variants: ${sortedVariants.slice(0, 5).map(v => `${v.keyword}(${v.score})`).join(', ')}`);

  return sortedVariants.map(v => v.keyword);
}

// 배치 LK 확장: 여러 키워드에 대해 일괄 처리
export function expandLKBatch(seeds: string[], options: {
  preferCompound?: boolean;
  categoryMapping?: { [keyword: string]: string };
  maxVariantsPerSeed?: number;
  totalLimit?: number;
} = {}): string[] {
  const {
    preferCompound = true,
    categoryMapping = {},
    maxVariantsPerSeed = 50,
    totalLimit = 2000
  } = options;

  const allVariants = new Set<string>();
  
  // 원본 시드 추가
  seeds.forEach(seed => allVariants.add(seed));
  
  console.log(`🚀 [LK Mode Batch] Processing ${seeds.length} seeds with LK expansion...`);
  
  seeds.forEach(seed => {
    const targetCategory = categoryMapping[seed];
    const variants = expandLK(seed, {
      preferCompound,
      targetCategory,
      maxVariants: maxVariantsPerSeed
    });
    
    variants.forEach(variant => {
      if (allVariants.size < totalLimit) {
        allVariants.add(variant);
      }
    });
  });
  
  const result = Array.from(allVariants);
  console.log(`✅ [LK Mode Batch] Generated ${result.length} total keywords (limit: ${totalLimit})`);
  
  return result;
}

// 카테고리 자동 감지
export function detectCategory(keyword: string): string | null {
  const categoryData = loadCategoryData();
  
  for (const [categoryKey, category] of Object.entries(categoryData)) {
    const isMatch = category.keywords.some(categoryKeyword => 
      keyword.includes(categoryKeyword) || 
      categoryKeyword.includes(keyword) ||
      keyword.toLowerCase().includes(categoryKeyword.toLowerCase())
    );
    
    if (isMatch) {
      console.log(`🔍 [Category Detection] "${keyword}" → ${category.name} (${categoryKey})`);
      return categoryKey;
    }
  }
  
  return null;
}

// LK 모드 통계 정보
export function getLKModeStats() {
  const locationData = loadLocationData();
  const categoryData = loadCategoryData();
  
  const totalLocations = Object.values(locationData).flat().length;
  const totalCategories = Object.keys(categoryData).length;
  const totalCategoryKeywords = Object.values(categoryData)
    .reduce((sum, cat) => sum + cat.keywords.length, 0);
  
  return {
    totalLocations,
    totalCategories,
    totalCategoryKeywords,
    locationBreakdown: {
      cities: locationData.cities.length,
      districts: locationData.districts.length,
      stations: locationData.stations.length,
      landmarks: locationData.landmarks.length
    },
    categories: Object.entries(categoryData).map(([key, cat]) => ({
      key,
      name: cat.name,
      keywords: cat.keywords.length,
      locationTerms: cat.locationTerms.length
    }))
  };
}