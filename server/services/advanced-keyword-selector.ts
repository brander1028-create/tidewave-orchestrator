import { db } from '../db';
import { managedKeywords } from '../../shared/schema';
import { eq, and } from 'drizzle-orm';
import { KeywordSelectionSettings, defaultKeywordSelectionSettings } from '../../shared/keyword-selection-settings';
import { extractTitleTokens } from './title-keyword-extractor';

interface KeywordCandidate {
  keyword: string;
  volume: number;
  score: number;
  cpc: number;
  combinedScore: number;
  isValid: boolean;
  isBanWord?: boolean;
}

interface SelectedKeyword {
  keyword: string;
  volume: number;
  score: number;
  cpc: number;
  combinedScore: number;
  position: number; // 1, 2, 3, 4
  isCombo?: boolean;
}

export class AdvancedKeywordSelector {
  
  /**
   * 제목에서 새로운 알고리즘으로 키워드 4개 선정
   */
  async selectTop4Keywords(titles: string[], settings: KeywordSelectionSettings = defaultKeywordSelectionSettings): Promise<SelectedKeyword[]> {
    console.log(`🎯 [Advanced Selector] 키워드 선정 시작: ${titles.length}개 제목, 설정: ${JSON.stringify(settings)}`);
    
    // 1단계: 제목에서 모든 키워드 후보 추출
    const allCandidates = await this.extractKeywordCandidates(titles);
    console.log(`📊 [Advanced Selector] 추출된 키워드 후보: ${allCandidates.length}개`);
    
    // 2단계: 각 후보에 대해 DB에서 정보 조회 및 검증
    const enrichedCandidates = await this.enrichCandidatesWithDB(allCandidates, settings);
    
    // 3단계: 유효한 후보들만 필터링
    const validCandidates = enrichedCandidates.filter(c => c.isValid);
    console.log(`✅ [Advanced Selector] 유효한 키워드: ${validCandidates.length}개`);
    
    if (validCandidates.length === 0) {
      console.log(`⚠️ [Advanced Selector] 유효한 키워드가 없음`);
      return [];
    }
    
    // 4단계: combinedScore 순으로 정렬
    const sorted = validCandidates.sort((a, b) => b.combinedScore - a.combinedScore);
    
    // 5단계: 새로운 알고리즘 적용
    const selected = await this.applyNewSelectionAlgorithm(sorted, settings);
    
    console.log(`🏆 [Advanced Selector] 최종 선정: ${selected.length}개`);
    selected.forEach((k, i) => console.log(`   ${i+1}. ${k.keyword} (${k.combinedScore}점)`));
    
    return selected;
  }

  /**
   * 제목들에서 키워드 후보들 추출
   */
  private async extractKeywordCandidates(titles: string[]): Promise<string[]> {
    const candidateSet = new Set<string>();
    
    for (const title of titles) {
      const tokens = extractTitleTokens(title);
      
      // 단일 토큰 추가
      tokens.forEach(token => candidateSet.add(token));
      
      // 빅그램 생성 (모든 조합)
      for (let i = 0; i < tokens.length - 1; i++) {
        for (let j = i + 1; j < tokens.length; j++) {
          const bigram1 = `${tokens[i]}${tokens[j]}`; // 붙여쓰기
          const bigram2 = `${tokens[i]} ${tokens[j]}`; // 띄어쓰기
          candidateSet.add(bigram1);
          candidateSet.add(bigram2);
        }
      }
      
      // 트라이그램 생성 (설정에 따라)
      // TODO: enableTrigrams 설정에 따라 구현
    }
    
    return Array.from(candidateSet);
  }

  /**
   * DB에서 키워드 정보 조회하여 후보들 보강
   */
  private async enrichCandidatesWithDB(candidates: string[], settings: KeywordSelectionSettings): Promise<KeywordCandidate[]> {
    const enriched: KeywordCandidate[] = [];
    
    for (const candidate of candidates) {
      // DB에서 키워드 정보 조회 (정규화된 키워드로)
      const normalizedKeyword = candidate.replace(/\s+/g, '');
      
      try {
        const keywordData = await db.select({
          volume: managedKeywords.volume,
          score: managedKeywords.score, 
          cpc: managedKeywords.est_cpc_krw
        }).from(managedKeywords)
          .where(eq(managedKeywords.text, normalizedKeyword))
          .limit(1);

        let volume = 0;
        let score = 0;
        let cpc = 0;

        if (keywordData.length > 0) {
          volume = keywordData[0].volume || 0;
          score = keywordData[0].score || 0;
          cpc = keywordData[0].cpc || 0;
        }

        // combinedScore 계산
        const combinedScore = (volume * settings.volumeWeight) + (score * settings.scoreWeight);
        
        // 유효성 검증
        const isValid = cpc >= settings.minCPC && score >= settings.minScore;
        
        enriched.push({
          keyword: candidate,
          volume,
          score,
          cpc,
          combinedScore,
          isValid
        });

        if (!isValid) {
          console.log(`❌ [Validation] "${candidate}" 제외: CPC=${cpc}(min ${settings.minCPC}), 점수=${score}(min ${settings.minScore})`);
        }

      } catch (error) {
        console.error(`❌ [DB Query] "${candidate}" 조회 실패:`, error);
        // DB 조회 실패 시에도 후보에 추가 (기본값으로)
        enriched.push({
          keyword: candidate,
          volume: 0,
          score: 0,
          cpc: 0,
          combinedScore: 0,
          isValid: false
        });
      }
    }
    
    return enriched;
  }

  /**
   * 새로운 키워드 선정 알고리즘
   * 1번: 가장 높은 combinedScore 단일 키워드
   * 2~4번: 1번과 조합하여 검증 후 선정
   */
  private async applyNewSelectionAlgorithm(validCandidates: KeywordCandidate[], settings: KeywordSelectionSettings): Promise<SelectedKeyword[]> {
    const result: SelectedKeyword[] = [];
    
    // 1번 키워드: 가장 높은 점수의 단일 키워드 선정
    const topKeyword = validCandidates[0];
    result.push({
      keyword: topKeyword.keyword,
      volume: topKeyword.volume,
      score: topKeyword.score,
      cpc: topKeyword.cpc,
      combinedScore: topKeyword.combinedScore,
      position: 1
    });
    
    console.log(`🥇 [1번 키워드] "${topKeyword.keyword}" (${topKeyword.combinedScore}점)`);

    // 2~4번 키워드: 1번과 조합하여 검증, 조합이 없으면 개별 키워드로 채움
    const usedKeywords = new Set([topKeyword.keyword]);
    
    for (let i = 1; i < validCandidates.length && result.length < settings.maxKeywords; i++) {
      const candidate = validCandidates[i];
      
      // 이미 사용된 키워드는 스킵
      if (usedKeywords.has(candidate.keyword)) {
        continue;
      }
      
      let foundValidCombo = false;
      
      // 1번 키워드와 조합 생성 시도
      const combos = this.generateCombinations(topKeyword.keyword, candidate.keyword, settings);
      
      for (const combo of combos) {
        // 조합 키워드 DB에서 검증
        const comboData = await this.validateCombination(combo, settings);
        
        if (comboData && comboData.isValid) {
          result.push({
            keyword: combo,
            volume: comboData.volume,
            score: comboData.score,
            cpc: comboData.cpc,
            combinedScore: comboData.combinedScore,
            position: result.length + 1,
            isCombo: true
          });
          
          console.log(`🏅 [${result.length}번 키워드] "${combo}" (${comboData.combinedScore}점) - 조합`);
          usedKeywords.add(candidate.keyword);
          foundValidCombo = true;
          break;
        }
      }
      
      // 조합이 없으면 개별 키워드로 추가
      if (!foundValidCombo) {
        result.push({
          keyword: candidate.keyword,
          volume: candidate.volume,
          score: candidate.score,
          cpc: candidate.cpc,
          combinedScore: candidate.combinedScore,
          position: result.length + 1,
          isCombo: false
        });
        
        console.log(`🏅 [${result.length}번 키워드] "${candidate.keyword}" (${candidate.combinedScore}점) - 개별`);
        usedKeywords.add(candidate.keyword);
      }
    }
    
    return result;
  }

  /**
   * 두 키워드를 조합하는 모든 경우의 수 생성
   */
  private generateCombinations(keyword1: string, keyword2: string, settings: KeywordSelectionSettings): string[] {
    const combinations = [];
    
    if (settings.combineWithSpace) {
      // 띄어쓰기 조합
      combinations.push(`${keyword1} ${keyword2}`);
      combinations.push(`${keyword2} ${keyword1}`);
    } else {
      // 붙여쓰기 조합
      combinations.push(`${keyword1}${keyword2}`);
      combinations.push(`${keyword2}${keyword1}`);
    }
    
    return combinations;
  }

  /**
   * 조합 키워드 DB 검증
   */
  private async validateCombination(combo: string, settings: KeywordSelectionSettings): Promise<KeywordCandidate | null> {
    const normalizedCombo = combo.replace(/\s+/g, '');
    
    try {
      const keywordData = await db.select({
        volume: managedKeywords.volume,
        score: managedKeywords.score,
        cpc: managedKeywords.est_cpc_krw
      }).from(managedKeywords)
        .where(eq(managedKeywords.text, normalizedCombo))
        .limit(1);

      if (keywordData.length === 0) {
        return null; // DB에 없음
      }

      const data = keywordData[0];
      const volume = data.volume || 0;
      const score = data.score || 0; 
      const cpc = data.cpc || 0;
      
      const combinedScore = (volume * settings.volumeWeight) + (score * settings.scoreWeight);
      const isValid = cpc >= settings.minCPC && score >= settings.minScore;
      
      if (!isValid) {
        console.log(`❌ [Combo Validation] "${combo}" 제외: CPC=${cpc}, 점수=${score}`);
        return null;
      }
      
      return {
        keyword: combo,
        volume,
        score,
        cpc,
        combinedScore,
        isValid: true
      };

    } catch (error) {
      console.error(`❌ [Combo Query] "${combo}" 조회 실패:`, error);
      return null;
    }
  }
}

export const advancedKeywordSelector = new AdvancedKeywordSelector();