import { listKeywords, upsertMany } from '../store/keywords';
import { getVolumes } from './searchad';
import { checkSearchAds } from './health';
import { getCallBudgetStatus } from './bfs-crawler';

// 제목 키워드 추출 결과 타입
export interface TitleKeywordItem {
  text: string;
  raw_volume: number;
  score: number;
  volume_score: number;
  combined_score: number;
  frequency?: number;
  source: 'db' | 'api-refresh' | 'freq-fallback';
}

export interface TitleExtractionResult {
  topN: TitleKeywordItem[];
  mode: 'db-only' | 'api-refresh' | 'freq-fallback';
  stats: {
    candidates: number;
    db_hits: number;
    api_refreshed: number;
    ttl_skipped: number;
  };
  budget: {
    dailyRemaining: number;
    perMinuteRemaining: number;
  };
}

export class TitleKeywordExtractor {
  private readonly MIN_VOLUME = 1000;
  private readonly MAX_CANDIDATES = 50;
  private readonly BATCH_SIZE = 10;
  private readonly TTL_DAYS = 30;
  
  // 불용어 확장 (제목 분석용)
  private readonly stopWords = new Set([
    // 기존 불용어
    '이', '그', '저', '것', '들', '의', '가', '을', '를', '에', '와', '과', '도', '만', '에서', '으로', '로',
    '이다', '있다', '하다', '그리고', '그런데', '하지만', '그러나', '또한', '또', '그래서', '따라서',
    // 제목 분석용 추가 불용어
    '추천', '후기', '정보', '제품', '선택', '비교', '리뷰', '가격', '쿠폰', '할인', '특가', '세일', '무료',
    '베스트', '인기', '핫딜', '이벤트', '혜택', '구매', '판매', '쇼핑', '상품', '브랜드',
    '사용법', '방법', '팁', '노하우', '가이드', '설명', '소개', '이야기', '경험', '느낌',
    // ✅ 일반적 단어 추가 (업체, 시공 등)
    '업체', '회사', '서비스', '시공', '설치', '선택했어요', '가능해요', '만족스러운', '공간',
    '최고를', '즉시출고', '애프터', '쉐이브', '수딩', '클라랑스맨', '오뚜기와사비'
  ]);

  /**
   * ✅ 정규화 동치 규칙 (NFKC + 공백/하이픈/언더스코어/점 제거)
   */
  private normalizeText(text: string): string {
    return text
      .normalize('NFKC')
      .toLowerCase()
      .replace(/[\s\-_.]/g, '') // 공백/하이픈/언더스코어/점 제거
      .trim();
  }

  /**
   * Canonicalize 함수 - 키워드 정규화 및 그룹화
   */
  private canonicalize(keyword: string): string {
    let normalized = this.normalizeText(keyword);
    
    // 특정 패턴 정규화
    normalized = normalized
      .replace(/홍삼\s*(추천|정|키즈)/g, '홍삼')
      .replace(/vitamin\s*d|비타민\s*d/gi, '비타민d')
      .replace(/비타민d\s*\d+iu/gi, '비타민d') // 용량 제거
      .replace(/\b\d+iu\b/gi, '') // IU 단위 제거
      .trim();
    
    return normalized;
  }

  /**
   * ✅ 모든 제목에서 n-gram 후보 생성 (필터링 금지)
   */
  private extractCandidates(titles: string[]): Map<string, { originalText: string; frequency: number }> {
    // ✅ 동치키(normalized) → { 원문, 빈도 } 매핑
    const candidateMap = new Map<string, { originalText: string; frequency: number }>();
    
    // ✅ 모든 제목 사용 (필터링 금지)
    for (const title of titles) {
      // ✅ 원문 단어 분리 (정규화 전) 
      const originalWords = title.replace(/[^\uac00-\ud7a3a-zA-Z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter(word => word.length >= 2 && !this.stopWords.has(word) && !/^\d+$/.test(word));
      
      // 1-gram, 2-gram, 3-gram 추출
      for (let n = 1; n <= 3; n++) {
        for (let i = 0; i <= originalWords.length - n; i++) {
          const originalNgram = originalWords.slice(i, i + n).join(' ');
          if (originalNgram.length >= 2) {
            // ✅ 동치키로 중복 제거, 원문은 가장 많이 등장한 것 우선
            const normalizedKey = this.normalizeText(originalNgram);
            if (normalizedKey.length >= 2) {
              const existing = candidateMap.get(normalizedKey);
              if (!existing || existing.frequency < n) {
                candidateMap.set(normalizedKey, {
                  originalText: originalNgram,
                  frequency: (existing?.frequency || 0) + n
                });
              } else {
                candidateMap.set(normalizedKey, {
                  ...existing,
                  frequency: existing.frequency + n
                });
              }
            }
          }
        }
      }
    }
    
    // ✅ 빈도 상위 50개로 제한 (API 비용 보호)
    const sortedCandidates = Array.from(candidateMap.entries())
      .sort(([,a], [,b]) => b.frequency - a.frequency)
      .slice(0, this.MAX_CANDIDATES);
    
    return new Map(sortedCandidates);
  }

  /**
   * ✅ 관련성 체크 (저장하지 않고 라벨링만)
   */
  private isRelatedToOriginal(keyword: string, sourceTitle: string, originalKeywords: string[]): boolean {
    if (originalKeywords.length === 0) return false;
    
    const normalizedKeyword = this.normalizeText(keyword);
    const normalizedTitle = this.normalizeText(sourceTitle);
    
    return originalKeywords.some(original => {
      const normalizedOriginal = this.normalizeText(original);
      return normalizedKeyword.includes(normalizedOriginal) || 
             normalizedTitle.includes(normalizedOriginal);
    });
  }

  /**
   * 스코어 계산 함수
   */
  private calculateScores(rawVolume: number, baseScore: number): { volume_score: number; combined_score: number } {
    // volume_score(0~100) = clamp01(log10(max(1, raw_volume)) / 5) * 100
    const volume_score = Math.min(100, Math.max(0, (Math.log10(Math.max(1, rawVolume)) / 5) * 100));
    
    // combined_score = round(0.7 * volume_score + 0.3 * score)
    const combined_score = Math.round(0.7 * volume_score + 0.3 * baseScore);
    
    return { volume_score: Math.round(volume_score), combined_score };
  }

  /**
   * ✅ DB에서 동치키 기준 메트릭 로드
   */
  private async loadFromDB(normalizedKeys: string[]): Promise<Map<string, any>> {
    const dbKeywords = await listKeywords({ excluded: false, orderBy: 'raw_volume', dir: 'desc' });
    const keywordMap = new Map();
    
    for (const keyword of dbKeywords) {
      const normalizedDbKey = this.normalizeText(keyword.text);
      if (normalizedKeys.includes(normalizedDbKey)) {
        keywordMap.set(normalizedDbKey, {
          original_text: keyword.text,
          raw_volume: keyword.raw_volume || 0,
          score: keyword.commerciality || 0,
          excluded: keyword.excluded || false,
          updated_at: keyword.updated_at
        });
      }
    }
    
    return keywordMap;
  }

  /**
   * ✅ DB 기준 후보 선별 (최소 볼륨 조건 제거, Top4만 선별)
   */
  private selectFromDB(fromDB: Map<string, any>, candidateData: Map<string, { originalText: string; frequency: number }>): TitleKeywordItem[] {
    const eligible: TitleKeywordItem[] = [];
    
    for (const [normalizedKey, dbData] of Array.from(fromDB.entries())) {
      if (!dbData.excluded && dbData.raw_volume > 0) {
        const candidateInfo = candidateData.get(normalizedKey);
        if (candidateInfo) {
          const { volume_score, combined_score } = this.calculateScores(dbData.raw_volume, dbData.score);
          
          eligible.push({
            text: candidateInfo.originalText, // ✅ 원문 표시
            raw_volume: dbData.raw_volume,
            score: dbData.score,
            volume_score,
            combined_score,
            frequency: candidateInfo.frequency,
            source: 'db'
          });
        }
      }
    }
    
    return eligible;
  }

  /**
   * Top N 선별 (combined DESC → raw DESC → freq DESC)
   */
  private pickTopN(items: TitleKeywordItem[], N: number): TitleKeywordItem[] {
    return items
      .sort((a, b) => 
        b.combined_score - a.combined_score || 
        b.raw_volume - a.raw_volume || 
        (b.frequency || 0) - (a.frequency || 0)
      )
      .slice(0, N);
  }

  /**
   * API 갱신 조건 체크
   */
  private async shouldRefreshAPI(candidates: string[], fromDB: Map<string, any>): Promise<boolean> {
    // 조건 1: 후보 수 ≤ 50
    if (candidates.length > this.MAX_CANDIDATES) return false;
    
    // 조건 2: 예산 체크
    const budget = await getCallBudgetStatus();
    if (!budget || budget.dailyRemaining <= 0 || budget.perMinuteRemaining <= 0) {
      return false;
    }
    
    // 조건 3: TTL 체크 (30일 지난 키워드만 갱신 대상)
    const now = new Date();
    const ttlThreshold = new Date(now.getTime() - this.TTL_DAYS * 24 * 60 * 60 * 1000);
    
    const needsRefresh = candidates.some(candidate => {
      const dbData = fromDB.get(candidate);
      if (!dbData) return true; // DB에 없으면 갱신 필요
      if (!dbData.updated_at) return true; // 업데이트 시간 없으면 갱신 필요
      return new Date(dbData.updated_at) < ttlThreshold; // TTL 지났으면 갱신 필요
    });
    
    return needsRefresh;
  }

  /**
   * ✅ 빈도 기반 폴백 생성 (원문 표시)
   */
  private createFrequencyFallback(candidateData: Map<string, { originalText: string; frequency: number }>, N: number): TitleKeywordItem[] {
    const fallbackItems: TitleKeywordItem[] = [];
    
    const sortedEntries = Array.from(candidateData.entries())
      .sort(([,a], [,b]) => b.frequency - a.frequency)
      .slice(0, N);
    
    for (const [normalizedKey, data] of sortedEntries) {
      fallbackItems.push({
        text: data.originalText, // ✅ 원문 표시
        raw_volume: 0,
        score: 0,
        volume_score: 0,
        combined_score: 0,
        frequency: data.frequency,
        source: 'freq-fallback'
      });
    }
    
    return fallbackItems;
  }

  /**
   * ✅ 메인 추출 함수 - 조회량 기준 Top4 (필터링 금지)
   */
  async extractTopNByCombined(titles: string[], N: number = 4): Promise<TitleExtractionResult> {
    console.log(`🎯 Starting title keyword extraction from ${titles.length} titles (Top ${N})`);
    
    // ✅ A. 모든 제목에서 n-gram 후보 생성
    const candidateData = this.extractCandidates(titles);
    const normalizedKeys = Array.from(candidateData.keys());
    
    const stats = {
      candidates: normalizedKeys.length,
      db_hits: 0,
      api_refreshed: 0,
      ttl_skipped: 0
    };
    
    console.log(`📊 Extracted ${normalizedKeys.length} candidates: ${Array.from(candidateData.values()).slice(0, 5).map(c => c.originalText).join(', ')}...`);
    
    // ✅ B. DB 우선 선별 (조회량 기준)
    const fromDB = await this.loadFromDB(normalizedKeys);
    const eligible = this.selectFromDB(fromDB, candidateData);
    stats.db_hits = eligible.length;
    
    console.log(`🗄️  DB hits: ${stats.db_hits}/${normalizedKeys.length}`);
    
    if (eligible.length >= N) {
      const topN = this.pickTopN(eligible, N);
      console.log(`✅ DB-only mode: Selected ${topN.length} keywords`);
      
      const budget = await getCallBudgetStatus();
      return {
        topN,
        mode: 'db-only',
        stats,
        budget
      };
    }
    
    // ✅ C. API 갱신 (TTL 체크)
    const shouldRefresh = await this.shouldRefreshAPI(normalizedKeys, fromDB);
    
    if (shouldRefresh) {
      console.log(`🔄 API refresh mode: Updating ${normalizedKeys.length} candidates`);
      
      try {
        // 원문 리스트로 API 호출
        const originalTexts = normalizedKeys.map(key => candidateData.get(key)?.originalText).filter((text): text is string => Boolean(text));
        const volumeResults = await getVolumes(originalTexts);
        
        // ✅ 조건 제거: 모든 키워드 저장
        const toSave = [];
        for (const [text, data] of Object.entries<any>(volumeResults.volumes)) {
          const rawVolume = data.total || data.volumeMonthly || 0;
          toSave.push({
            text: this.normalizeText(text),
            raw_volume: rawVolume,
            volume: rawVolume,
            commerciality: data.compIdx === '높음' ? 80 : data.compIdx === '중간' ? 50 : 20,
            comp_idx: data.compIdx || '중간',
            ad_depth: data.plAvgDepth || 0,
            has_ads: (data.plAvgDepth || data.adWordsCnt || 0) > 0,
            source: 'title-analysis'
          });
        }
        
        if (toSave.length > 0) {
          await upsertMany(toSave);
          console.log(`💾 Saved ${toSave.length} keywords to DB`);
        }
        
        stats.api_refreshed = Object.keys(volumeResults.volumes).length;
        
        // ✅ D. 갱신 후 재선별
        const reloadedFromDB = await this.loadFromDB(normalizedKeys);
        const eligible2 = this.selectFromDB(reloadedFromDB, candidateData);
        
        if (eligible2.length > 0) {
          const topN = this.pickTopN(eligible2, N);
          topN.forEach(item => item.source = 'api-refresh');
          
          console.log(`✅ API-refresh mode: Selected ${topN.length} keywords after refresh`);
          
          const budget = await getCallBudgetStatus();
          return {
            topN,
            mode: 'api-refresh',
            stats,
            budget
          };
        }
        
      } catch (error) {
        console.error(`❌ API refresh failed:`, error);
      }
    }
    
    // ✅ 폴백: 빈도 기반 Top N
    console.log(`📊 Fallback mode: Using frequency-based selection`);
    const fallbackTopN = this.createFrequencyFallback(candidateData, N);
    
    const budget = await getCallBudgetStatus();
    return {
      topN: fallbackTopN,
      mode: 'freq-fallback',
      stats,
      budget
    };
  }
}

export const titleKeywordExtractor = new TitleKeywordExtractor();