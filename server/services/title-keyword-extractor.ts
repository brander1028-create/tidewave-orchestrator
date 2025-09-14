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
   * 텍스트 정규화 및 정제
   */
  private normalizeText(text: string): string {
    return text
      .replace(/[^가-힣a-zA-Z0-9\s]/g, ' ') // 한글, 영문, 숫자, 공백만 유지
      .toLowerCase()
      .replace(/\s+/g, ' ')
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
   * 제목에서 토큰 추출 및 n-gram 생성 (원래 키워드 관련성 체크)
   */
  private extractCandidates(titles: string[], originalKeywords: string[] = []): Map<string, number> {
    const candidateFreq = new Map<string, number>();
    
    // ✅ 원래 키워드가 포함된 제목만 사용 (관련성 체크)
    const relevantTitles = this.filterRelevantTitles(titles, originalKeywords);
    console.log(`🎯 Filtering titles: ${titles.length} → ${relevantTitles.length} relevant titles`);
    
    for (const title of relevantTitles) {
      const normalized = this.normalizeText(title);
      const words = normalized.split(' ').filter(word => 
        word.length >= 2 && 
        !this.stopWords.has(word) &&
        !/^\d+$/.test(word)
      );
      
      // 1-gram, 2-gram, 3-gram 추출
      for (let n = 1; n <= 3; n++) {
        for (let i = 0; i <= words.length - n; i++) {
          const ngram = words.slice(i, i + n).join(' ');
          if (ngram.length >= 2) {
            const canonical = this.canonicalize(ngram);
            if (canonical.length >= 2) {
              const weight = n; // n-gram 길이에 따른 가중치
              candidateFreq.set(canonical, (candidateFreq.get(canonical) || 0) + weight);
            }
          }
        }
      }
    }
    
    // 빈도 상위 50개로 제한 (API 비용 보호)
    const sortedCandidates = Array.from(candidateFreq.entries())
      .sort(([,a], [,b]) => b - a)
      .slice(0, this.MAX_CANDIDATES);
    
    return new Map(sortedCandidates);
  }

  /**
   * ✅ 원래 키워드와 관련된 제목만 필터링
   */
  private filterRelevantTitles(titles: string[], originalKeywords: string[] = []): string[] {
    if (originalKeywords.length === 0) return titles; // 원래 키워드가 없으면 모든 제목 사용
    
    const relevantTitles: string[] = [];
    
    for (const title of titles) {
      const normalizedTitle = this.normalizeText(title).toLowerCase();
      
      // 🔍 디버깅: 각 제목별 키워드 매칭 로그
      console.log(`🔍 Title: "${title.substring(0, 30)}..."`);
      
      // 원래 키워드 중 하나라도 포함되면 관련 제목으로 판단
      const isRelevant = originalKeywords.some(keyword => {
        const normalizedKeyword = this.normalizeText(keyword).toLowerCase();
        const contains = normalizedTitle.includes(normalizedKeyword);
        console.log(`   • "${keyword}" in title? ${contains ? '✅' : '❌'}`);
        return contains;
      });
      
      if (isRelevant) {
        relevantTitles.push(title);
        console.log(`   → RELEVANT ✅`);
      } else {
        console.log(`   → SKIPPED ❌`);
      }
    }
    
    // 관련 제목이 없으면 모든 제목 사용 (폴백)
    return relevantTitles.length > 0 ? relevantTitles : titles;
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
   * DB에서 키워드 메트릭 로드
   */
  private async loadFromDB(candidates: string[]): Promise<Map<string, any>> {
    const dbKeywords = await listKeywords({ excluded: false, orderBy: 'raw_volume', dir: 'desc' });
    const keywordMap = new Map();
    
    for (const keyword of dbKeywords) {
      const canonical = this.canonicalize(keyword.text);
      if (candidates.includes(canonical)) {
        keywordMap.set(canonical, {
          text: canonical,
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
   * DB 기준 필터링 및 선별
   */
  private filterEligibleFromDB(fromDB: Map<string, any>, candidateFreq: Map<string, number>): TitleKeywordItem[] {
    const eligible: TitleKeywordItem[] = [];
    
    for (const [text, data] of Array.from(fromDB.entries())) {
      if (!data.excluded && data.raw_volume >= this.MIN_VOLUME) {
        const frequency = candidateFreq.get(text) || 0;
        const { volume_score, combined_score } = this.calculateScores(data.raw_volume, data.score);
        
        eligible.push({
          text,
          raw_volume: data.raw_volume,
          score: data.score,
          volume_score,
          combined_score,
          frequency,
          source: 'db'
        });
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
   * 빈도 기반 폴백 생성
   */
  private createFrequencyFallback(candidateFreq: Map<string, number>, N: number): TitleKeywordItem[] {
    const fallbackItems: TitleKeywordItem[] = [];
    
    for (const [text, frequency] of Array.from(candidateFreq.entries()).slice(0, N)) {
      fallbackItems.push({
        text,
        raw_volume: 0,
        score: 0,
        volume_score: 0,
        combined_score: 0,
        frequency,
        source: 'freq-fallback'
      });
    }
    
    return fallbackItems;
  }

  /**
   * 메인 추출 함수 - DB 우선 → API 갱신 → 재선별 파이프라인
   */
  async extractTopNByCombined(titles: string[], N: number = 4, originalKeywords: string[] = []): Promise<TitleExtractionResult> {
    console.log(`🎯 Starting title keyword extraction from ${titles.length} titles (Top ${N})`);
    console.log(`📌 Original keywords for relevance: [${originalKeywords.join(', ')}]`);
    
    // A. 토크나이징 & 정규화 (원래 키워드 기반 필터링)
    const candidateFreq = this.extractCandidates(titles, originalKeywords);
    const candidates = Array.from(candidateFreq.keys());
    
    const stats = {
      candidates: candidates.length,
      db_hits: 0,
      api_refreshed: 0,
      ttl_skipped: 0
    };
    
    console.log(`📊 Extracted ${candidates.length} candidates: ${candidates.slice(0, 5).join(', ')}...`);
    
    // B. DB 우선 선별
    const fromDB = await this.loadFromDB(candidates);
    const eligible = this.filterEligibleFromDB(fromDB, candidateFreq);
    stats.db_hits = eligible.length;
    
    console.log(`🗄️  DB hits (≥${this.MIN_VOLUME}): ${stats.db_hits}/${candidates.length}`);
    
    if (eligible.length > 0) {
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
    
    // C. DB 실패 시 한 번만 API 갱신
    const shouldRefresh = await this.shouldRefreshAPI(candidates, fromDB);
    
    if (shouldRefresh) {
      console.log(`🔄 API refresh mode: Updating ${candidates.length} candidates`);
      
      try {
        // API 호출로 볼륨 갱신
        const volumeResults = await getVolumes(candidates);
        
        // 저장 조건: raw_volume ≥ 1000 & has_ads=true만 저장
        const toSave = [];
        for (const [text, data] of Object.entries<any>(volumeResults.volumes)) {
          const rawVolume = data.total || data.volumeMonthly || 0;
          const hasAds = (data.plAvgDepth || data.adWordsCnt || 0) > 0;
          
          if (rawVolume >= this.MIN_VOLUME && hasAds) {
            toSave.push({
              text: this.canonicalize(text),
              raw_volume: rawVolume,
              volume: rawVolume,
              commerciality: data.compIdx === '높음' ? 80 : data.compIdx === '중간' ? 50 : 20,
              comp_idx: data.compIdx || '중간',
              ad_depth: data.plAvgDepth || 0,
              has_ads: hasAds,
              source: 'title-analysis'
            });
          }
        }
        
        if (toSave.length > 0) {
          await upsertMany(toSave);
          console.log(`💾 Saved ${toSave.length} keywords to DB (raw≥${this.MIN_VOLUME} & has_ads)`);
        }
        
        stats.api_refreshed = Object.keys(volumeResults.volumes).length;
        
        // D. 갱신 후 재선별
        const reloadedFromDB = await this.loadFromDB(candidates);
        const eligible2 = this.filterEligibleFromDB(reloadedFromDB, candidateFreq);
        
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
    
    // 폴백: 빈도 기반 Top N
    console.log(`📊 Fallback mode: Using frequency-based selection`);
    const fallbackTopN = this.createFrequencyFallback(candidateFreq, N);
    
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