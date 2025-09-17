/**
 * 자동 키워드 enrichment 시스템
 * 사용자 요구사항:
 * 1. 키워드 DB에 확보 안된 키워드 찾기
 * 2. 제목에서 키워드 DB에 확보 안된 키워드가 있으면 API 호출해서 업데이트
 * 3. 제일 조회량 높은 키워드 1개 선정하고 다른 키워드들과 조합해서 API 호출
 * 4. 7:3 가중치 (조회량 70% + 광고점수 30%) 기반 4티어 시스템
 * 5. 광고 불가 키워드 (클릭율/경쟁률 0) 필터링
 */

import { db } from '../db';
import { managedKeywords } from '../../shared/schema';
import { eq, inArray, sql, desc } from 'drizzle-orm';
import { getVolumesWithHealth } from './externals-health';
import { upsertMany } from '../store/keywords';
import { titleKeywordExtractor } from './title-keyword-extractor';

export interface EnrichmentResult {
  foundInDB: string[];
  missingFromDB: string[];
  newlyEnriched: string[];
  topKeyword: string | null;
  generatedCombinations: string[];
  filteredIneligible: string[];
  finalTiers: Array<{
    tier: number;
    keyword: string;
    volume: number;
    adScore: number;
    combinedScore: number;
    eligible: boolean;
  }>;
  stats: {
    processed: number;
    apiCalls: number;
    dbInserts: number;
    combinations: number;
  };
}

export interface KeywordMetrics {
  text: string;
  volume: number;
  compIdx: string;
  compScore: number;
  adDepth: number;
  cpc: number;
  clickRate: number;
  eligible: boolean;
  skipReason?: string;
}

/**
 * 제목에서 키워드 추출하고 DB와 비교하여 자동 enrichment 수행
 */
export async function autoEnrichFromTitle(
  title: string,
  inputKeyword: string,
  jobId: string,
  blogId: string
): Promise<EnrichmentResult> {
  console.log(`🔍 [Auto-Enrich] Starting for title: "${title.substring(0, 50)}..."`);
  
  const stats = {
    processed: 0,
    apiCalls: 0,
    dbInserts: 0,
    combinations: 0
  };

  // Step 1: 제목에서 키워드 추출
  const extractionResult = await titleKeywordExtractor.extractTopNByCombined([title], 20);
  const extractedKeywords = extractionResult.topN.map(item => item.text);
  
  console.log(`📝 [Auto-Enrich] Extracted ${extractedKeywords.length} keywords from title`);
  
  // Step 2: DB에서 기존 키워드 확인
  const existingKeywords = await db
    .select()
    .from(managedKeywords)
    .where(inArray(managedKeywords.text, extractedKeywords));
  
  const existingTexts = new Set(existingKeywords.map(kw => kw.text));
  const foundInDB = extractedKeywords.filter(kw => existingTexts.has(kw));
  const missingFromDB = extractedKeywords.filter(kw => !existingTexts.has(kw));
  
  console.log(`📊 [Auto-Enrich] Found ${foundInDB.length} in DB, ${missingFromDB.length} missing`);
  
  // Step 3: 누락된 키워드들 API 호출하여 enrichment
  let newlyEnriched: string[] = [];
  if (missingFromDB.length > 0) {
    console.log(`🚀 [Auto-Enrich] Fetching volume data for ${missingFromDB.length} missing keywords`);
    
    try {
      const volumeData = await getVolumesWithHealth(db, missingFromDB);
      stats.apiCalls++;
      
      // API 결과를 DB에 저장
      const keywordsToInsert = missingFromDB.map(kw => {
        const volumeInfo = volumeData.volumes[kw.toLowerCase()];
        return {
          text: kw,
          raw_volume: volumeInfo?.total || 0,
          volume: volumeInfo?.total || 0,
          comp_idx: volumeInfo?.compIdx || "낮음",
          comp_score: getCompetitionScore(volumeInfo?.compIdx || "낮음"),
          ad_depth: volumeInfo?.plAvgDepth || 0,
          has_ads: (volumeInfo?.plAvgDepth || 0) > 0,
          est_cpc_krw: volumeInfo?.avePcCpc || 0,
          score: calculateKeywordScore(volumeInfo?.total || 0, volumeInfo?.plAvgDepth || 0),
          source: "auto-enrich"
        };
      });
      
      await upsertMany(keywordsToInsert);
      stats.dbInserts += keywordsToInsert.length;
      newlyEnriched = missingFromDB;
      
      console.log(`✅ [Auto-Enrich] Successfully enriched ${newlyEnriched.length} keywords`);
    } catch (error) {
      console.error(`❌ [Auto-Enrich] Failed to enrich missing keywords:`, error);
    }
  }
  
  // Step 4: 최고 조회량 키워드 1개 선정
  const allCurrentKeywords = await db
    .select()
    .from(managedKeywords)
    .where(inArray(managedKeywords.text, extractedKeywords))
    .orderBy(desc(managedKeywords.raw_volume));
  
  const topKeyword = allCurrentKeywords.length > 0 ? allCurrentKeywords[0].text : null;
  console.log(`🏆 [Auto-Enrich] Top volume keyword: "${topKeyword}" (${allCurrentKeywords[0]?.raw_volume || 0})`);
  
  // Step 5: 키워드 조합 생성 및 API 호출
  let generatedCombinations: string[] = [];
  if (topKeyword && extractedKeywords.length > 1) {
    generatedCombinations = generateKeywordCombinations(topKeyword, extractedKeywords);
    console.log(`🔗 [Auto-Enrich] Generated ${generatedCombinations.length} combinations`);
    stats.combinations = generatedCombinations.length;
    
    // 조합 키워드들도 DB에 없으면 API 호출
    const existingCombinations = await db
      .select({ text: managedKeywords.text })
      .from(managedKeywords)
      .where(inArray(managedKeywords.text, generatedCombinations));
    
    const existingCombinationTexts = new Set(existingCombinations.map(c => c.text));
    const newCombinations = generatedCombinations.filter(c => !existingCombinationTexts.has(c));
    
    if (newCombinations.length > 0) {
      console.log(`🚀 [Auto-Enrich] Fetching data for ${newCombinations.length} new combinations`);
      
      try {
        const combinationVolumeData = await getVolumesWithHealth(db, newCombinations);
        stats.apiCalls++;
        
        const combinationsToInsert = newCombinations.map(kw => {
          const volumeInfo = combinationVolumeData.volumes[kw.toLowerCase()];
          return {
            text: kw,
            raw_volume: volumeInfo?.total || 0,
            volume: volumeInfo?.total || 0,
            comp_idx: volumeInfo?.compIdx || "낮음",
            comp_score: getCompetitionScore(volumeInfo?.compIdx || "낮음"),
            ad_depth: volumeInfo?.plAvgDepth || 0,
            has_ads: (volumeInfo?.plAvgDepth || 0) > 0,
            est_cpc_krw: volumeInfo?.avePcCpc || 0,
            score: calculateKeywordScore(volumeInfo?.total || 0, volumeInfo?.plAvgDepth || 0),
            source: "auto-combination"
          };
        });
        
        await upsertMany(combinationsToInsert);
        stats.dbInserts += combinationsToInsert.length;
        
        console.log(`✅ [Auto-Enrich] Successfully enriched ${newCombinations.length} combinations`);
      } catch (error) {
        console.error(`❌ [Auto-Enrich] Failed to enrich combinations:`, error);
      }
    }
  }
  
  // Step 6: 모든 키워드 메트릭스 수집 및 필터링
  const allRelevantKeywords = await db
    .select()
    .from(managedKeywords)
    .where(inArray(managedKeywords.text, [...extractedKeywords, ...generatedCombinations]));
  
  // Step 7: 광고 불가 키워드 필터링 (클릭율/경쟁률 0 제외)
  const eligibleKeywords = allRelevantKeywords.filter(kw => isKeywordEligible(kw));
  const filteredIneligible = allRelevantKeywords
    .filter(kw => !isKeywordEligible(kw))
    .map(kw => kw.text);
  
  console.log(`🚫 [Auto-Enrich] Filtered ${filteredIneligible.length} ineligible keywords`);
  
  // Step 8: 7:3 가중치 기반 4티어 시스템 적용
  const finalTiers = assignToTiers(eligibleKeywords);
  
  stats.processed = allRelevantKeywords.length;
  
  console.log(`✅ [Auto-Enrich] Completed - ${finalTiers.length} keywords assigned to tiers`);
  
  return {
    foundInDB,
    missingFromDB,
    newlyEnriched,
    topKeyword,
    generatedCombinations,
    filteredIneligible,
    finalTiers,
    stats
  };
}

/**
 * 키워드 조합 생성 (최고 조회량 키워드 + 다른 키워드들)
 */
function generateKeywordCombinations(topKeyword: string, allKeywords: string[]): string[] {
  const combinations: string[] = [];
  const otherKeywords = allKeywords.filter(kw => kw !== topKeyword);
  
  // 앞에 붙이기: "topKeyword + other"
  otherKeywords.forEach(other => {
    combinations.push(`${topKeyword} ${other}`);
    combinations.push(`${topKeyword}${other}`); // 공백 없는 버전
  });
  
  // 뒤에 붙이기: "other + topKeyword"  
  otherKeywords.forEach(other => {
    combinations.push(`${other} ${topKeyword}`);
    combinations.push(`${other}${topKeyword}`); // 공백 없는 버전
  });
  
  // 중복 제거 및 길이 제한 (2~20자)
  return Array.from(new Set(combinations))
    .filter(combo => combo.length >= 2 && combo.length <= 20)
    .slice(0, 50); // 최대 50개 조합
}

/**
 * 경쟁도 텍스트를 점수로 변환
 */
function getCompetitionScore(compIdx: string): number {
  switch (compIdx) {
    case "낮음": return 20;
    case "중간": return 60;
    case "높음": return 100;
    default: return 20;
  }
}

/**
 * 키워드 점수 계산 (조회량 + 광고 깊이)
 */
function calculateKeywordScore(volume: number, adDepth: number): number {
  const volumeScore = Math.min(100, Math.log10(Math.max(1, volume)) * 25);
  const adScore = Math.min(100, adDepth * 20);
  
  // 기본적인 combined score (나중에 7:3 가중치는 tier 할당에서 적용)
  return Math.round((volumeScore + adScore) / 2);
}

/**
 * 키워드 광고 적격성 검사
 */
function isKeywordEligible(keyword: any): boolean {
  // 네이버 검색광고에서 광고할 수 없는 키워드 필터링
  
  // 1. 클릭율, 경쟁률이 0인 키워드 제외
  if (keyword.comp_score === 0 || keyword.ad_depth === 0) {
    return false;
  }
  
  // 2. 조회량이 너무 낮은 키워드 제외
  if (keyword.raw_volume < 100) {
    return false;
  }
  
  // 3. 제외된 키워드
  if (keyword.excluded) {
    return false;
  }
  
  // 4. 금지 키워드 패턴 (예시)
  const bannedPatterns = [
    /병원|의료|치료|수술|약품|의약/,
    /도박|카지노|로또|복권/,
    /성인|야동|포르노/,
    /불법|해킹|크랙/
  ];
  
  const text = keyword.text.toLowerCase();
  for (const pattern of bannedPatterns) {
    if (pattern.test(text)) {
      return false;
    }
  }
  
  return true;
}

/**
 * 7:3 가중치 기반 4티어 시스템
 * 조회량 70% + 광고점수 30%
 */
function assignToTiers(keywords: any[]): Array<{
  tier: number;
  keyword: string;
  volume: number;
  adScore: number;
  combinedScore: number;
  eligible: boolean;
}> {
  // 점수 계산
  const scoredKeywords = keywords.map(kw => {
    const volumeScore = Math.min(100, Math.log10(Math.max(1, kw.raw_volume)) * 25);
    const adScore = Math.min(100, kw.ad_depth * 20);
    
    // 7:3 가중치 적용
    const combinedScore = (volumeScore * 0.7) + (adScore * 0.3);
    
    return {
      tier: 0, // 아직 할당 안됨
      keyword: kw.text,
      volume: kw.raw_volume,
      adScore,
      combinedScore,
      eligible: true
    };
  });
  
  // Combined score 기준으로 정렬
  scoredKeywords.sort((a, b) => b.combinedScore - a.combinedScore);
  
  // 4티어로 분배
  const total = scoredKeywords.length;
  const tier1Count = Math.ceil(total * 0.1); // 상위 10%
  const tier2Count = Math.ceil(total * 0.2); // 상위 20%  
  const tier3Count = Math.ceil(total * 0.3); // 상위 30%
  
  scoredKeywords.forEach((kw, index) => {
    if (index < tier1Count) {
      kw.tier = 1;
    } else if (index < tier1Count + tier2Count) {
      kw.tier = 2;
    } else if (index < tier1Count + tier2Count + tier3Count) {
      kw.tier = 3;
    } else {
      kw.tier = 4;
    }
  });
  
  console.log(`📊 [Tier Assignment] T1:${tier1Count}, T2:${tier2Count}, T3:${tier3Count}, T4:${total - tier1Count - tier2Count - tier3Count}`);
  
  return scoredKeywords;
}