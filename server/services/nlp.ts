import { listKeywords } from '../store/keywords';

export interface KeywordCandidate {
  keyword: string;
  frequency: number;
  score: number;
  volume?: number;
  grade?: string;
  isFromDB?: boolean;
}

export class NLPService {
  private stopWords = new Set([
    // Korean stopwords - basic particles
    '이', '그', '저', '것', '들', '의', '가', '을', '를', '에', '와', '과', '도', '만', '도', '에서', '으로', '로', '이다', '있다', '하다',
    '그리고', '그런데', '하지만', '그러나', '또한', '또', '그래서', '따라서', '즉', '예를 들어', '때문에', '위해', '통해', '대해',
    '정말', '매우', '너무', '아주', '정말로', '항상', '늘', '자주', '가끔', '때로는', '이번', '다음', '지난', '오늘', '어제', '내일',
    '여기', '거기', '저기', '이곳', '그곳', '저곳', '위', '아래', '앞', '뒤', '옆', '사이',
    // Enhanced stopwords - common terms
    '제품', '상품', '브랜드', '회사', '업체', '사이트', '홈페이지', '서비스', '어플', '앱',
    '가격', '비용', '금액', '요금', '할인', '세일', '특가', '무료', '유료',
    '구매', '주문', '결제', '배송', '택배', '포장', '반품', '교환', '환불',
    '이용', '사용', '활용', '적용', '설치', '다운로드', '업데이트', '버전',
    // Blog/review specific stopwords  
    '블로그', '포스팅', '리뷰', '후기', '추천', '소개', '정보', '공유', '이야기', '경험', '방법', '생각', '느낌',
    '사진', '이미지', '영상', '동영상', '링크', '댓글', '좋아요', '구독', '팔로우', '게시물', '글', '내용',
    '장점', '단점', '특징', '효과', '기능', '성능', '품질', '디자인', '스타일', '컬러', '사이즈',
    // Generic qualifiers that add no value
    '진짜', '정말', '완전', '너무', '정말로', '매우', '아주', '많이', '조금', '약간', '좀', '더', '덜',
    '최고', '최상', '최신', '최적', '최대', '최소', '최저', '첫번째', '두번째', '마지막',
    // Time/frequency terms
    '항상', '늘', '자주', '가끔', '때로는', '이번', '다음', '지난', '오늘', '어제', '내일', '요즘', '최근',
    // Numbers and pure punctuation
    ...Array.from({length: 100}, (_, i) => i.toString()),
  ]);

  // Enhanced quality filters for better token refinement
  private isQualityKeyword(keyword: string): boolean {
    // Reject single characters only
    if (keyword.length <= 1) return false;
    
    // Reject pure numbers or numbers with simple Korean particles
    if (/^\d+[가나다라마바사아자차카타파하]?$/.test(keyword)) return false;
    
    // Reject patterns with too many special characters (but allow Korean)
    const alnumKo = keyword.match(/[A-Za-z0-9가-힣]/g) || [];
    if (alnumKo.length < Math.ceil(keyword.length * 0.6)) return false;
    
    // Reject very generic patterns
    const genericPatterns = [
      /^.$/, // Single character only (allow 2+ chars)
      /^[ㄱ-ㅎㅏ-ㅣ]+$/, // Only Korean consonants/vowels
      /^\d+월$/, /^\d+일$/, /^\d+년$/, // Pure date components
      /^[!@#$%^&*()]+$/, // Pure punctuation
    ];
    
    return !genericPatterns.some(pattern => pattern.test(keyword));
  }

  // Unified normalization for consistent matching
  private normalizeForMatch(text: string): string {
    return this.cleanText(text).toLowerCase().replace(/\s+/g, '');
  }

  /**
   * Clean and normalize text for processing
   */
  private cleanText(text: string): string {
    return text
      .replace(/<[^>]*>/g, '') // Remove HTML tags
      .replace(/[^\w\s가-힣]/g, ' ') // Keep only Korean, alphanumeric and spaces
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim()
      .toLowerCase();
  }

  /**
   * Extract n-grams from tokenized text
   * Supports 1-gram, 2-gram, and 3-gram extraction as specified
   */
  private extractNgrams(text: string, n: number): Array<{surface: string, normalized: string}> {
    const words = text.split(' ').filter(word => 
      word.length >= 2 && 
      !this.stopWords.has(word) &&
      !/^\d+$/.test(word) // Skip pure numbers
    );
    
    const ngrams: Array<{surface: string, normalized: string}> = [];
    
    for (let i = 0; i <= words.length - n; i++) {
      const surface = words.slice(i, i + n).join(' ');
      const normalized = this.normalizeForMatch(surface); // Unified normalization
      
      if (surface.length >= 2 && this.isQualityKeyword(surface)) {
        ngrams.push({ surface, normalized });
      }
    }
    
    return ngrams;
  }

  /**
   * Extract keywords using n-gram (1-3) approach from titles with keyword DB integration
   * This implements n-gram keyword extraction enhanced with existing keyword database
   */
  async extractKeywords(titles: string[]): Promise<KeywordCandidate[]> {
    console.log(`🔤 Starting n-gram keyword extraction from ${titles.length} titles`);
    
    // Get keyword volume map from database
    console.log(`🔍 Fetching keywords from database...`);
    const dbKeywords = await listKeywords({ excluded: false, orderBy: 'raw_volume', dir: 'desc' });
    const keywordVolumeMap: Record<string, { volume: number; grade: string }> = {};
    
    dbKeywords.forEach(keyword => {
      // Normalize DB keyword text using unified normalization
      const normalizedText = this.normalizeForMatch(keyword.text);
      keywordVolumeMap[normalizedText] = {
        volume: keyword.raw_volume || keyword.volume || 0,
        grade: keyword.grade || 'C'
      };
    });
    
    const dbKeywordCount = dbKeywords.length;
    console.log(`📊 Loaded ${dbKeywordCount} keywords from database`);
    
    const keywordFreq = new Map<string, number>();
    
    // Clean titles and extract text
    const cleanedTitles = titles.map(title => this.cleanText(title));
    console.log(`📝 Cleaned titles: ${cleanedTitles.slice(0, 3).join(', ')}...`);
    
    // Extract 1-grams, 2-grams, and 3-grams with surface/normalized separation
    const ngramData = new Map<string, {surface: string, frequency: number}>();
    
    for (const title of cleanedTitles) {
      // 1-grams (single words)
      const unigrams = this.extractNgrams(title, 1);
      // 2-grams (word pairs)
      const bigrams = this.extractNgrams(title, 2);
      // 3-grams (word triplets)
      const trigrams = this.extractNgrams(title, 3);
      
      // Count frequency with surface/normalized separation and quality filtering
      [...unigrams, ...bigrams, ...trigrams].forEach(({surface, normalized}) => {
        const weight = surface.split(' ').length; // 1, 2, or 3
        
        // Use normalized for deduplication, but keep surface for display
        if (ngramData.has(normalized)) {
          const existing = ngramData.get(normalized)!;
          existing.frequency += weight;
        } else {
          ngramData.set(normalized, {
            surface, // Keep original surface form
            frequency: weight
          });
        }
      });
    }
    
    // Calculate relevance scores with DB integration
    const candidates: KeywordCandidate[] = [];
    const totalTitles = titles.length;
    
    for (const [normalized, {surface, frequency}] of Array.from(ngramData.entries())) {
      if (frequency >= 2 && this.isQualityKeyword(surface)) { // Enhanced quality filtering
        // Document frequency: how many titles contain this keyword (using normalized form for consistency)
        const normalizedTitles = cleanedTitles.map(title => this.normalizeForMatch(title));
        const documentFreq = normalizedTitles.filter(title => 
          title.includes(normalized)
        ).length;
        
        // Check if keyword exists in database (using unified normalized lookup)
        const dbKeywordInfo = keywordVolumeMap[normalized];
        const isFromDB = !!dbKeywordInfo;
        
        // Base score calculation (using surface form for length)
        let score = Math.round(
          (frequency * 10) + // Base frequency score
          (surface.split(' ').length * 5) + // Length bonus
          (documentFreq / totalTitles * 20) // Document frequency bonus
        );
        
        // Boost score for keywords found in database
        if (isFromDB) {
          const volumeBoost = Math.min(dbKeywordInfo.volume / 1000, 50); // Volume-based bonus (max 50)
          const gradeBoost = dbKeywordInfo.grade === 'A' ? 30 : dbKeywordInfo.grade === 'B' ? 20 : 10;
          score += Math.round(volumeBoost + gradeBoost);
          
          console.log(`🎯 DB keyword found: "${surface}" (volume: ${dbKeywordInfo.volume}, grade: ${dbKeywordInfo.grade}, boost: +${Math.round(volumeBoost + gradeBoost)})`);
        }
        
        candidates.push({
          keyword: surface, // Use surface form for display
          frequency,
          score,
          volume: dbKeywordInfo?.volume,
          grade: dbKeywordInfo?.grade,
          isFromDB,
        });
      }
    }
    
    // Sort by score and return top candidates
    const sortedCandidates = candidates
      .sort((a, b) => b.score - a.score)
      .slice(0, 50); // Return top 50 keywords
    
    console.log(`✅ N-gram extraction complete: ${sortedCandidates.length} keyword candidates found`);
    console.log(`🏆 Top 5 keywords: ${sortedCandidates.slice(0, 5).map(k => `${k.keyword}(${k.score})`).join(', ')}`);
    
    return sortedCandidates;
  }

  /**
   * Get top N keywords from candidates
   */
  getTopKeywords(candidates: KeywordCandidate[], limit = 20): KeywordCandidate[] {
    const topKeywords = candidates.slice(0, limit);
    console.log(`📊 Selected top ${topKeywords.length} keywords for analysis`);
    return topKeywords;
  }
}

export const nlpService = new NLPService();