export interface KeywordCandidate {
  keyword: string;
  frequency: number;
  score: number;
}

export class NLPService {
  private stopWords = new Set([
    // Korean stopwords
    '이', '그', '저', '것', '들', '의', '가', '을', '를', '에', '와', '과', '도', '만', '도', '에서', '으로', '로', '이다', '있다', '하다',
    '그리고', '그런데', '하지만', '그러나', '또한', '또', '그래서', '따라서', '즉', '예를 들어', '때문에', '위해', '통해', '대해',
    '정말', '매우', '너무', '아주', '정말로', '항상', '늘', '자주', '가끔', '때로는', '이번', '다음', '지난', '오늘', '어제', '내일',
    '여기', '거기', '저기', '이곳', '그곳', '저곳', '위', '아래', '앞', '뒤', '옆', '사이',
    // Common blog words
    '블로그', '포스팅', '리뷰', '후기', '추천', '소개', '정보', '공유', '이야기', '경험', '방법', '생각', '느낌',
    '사진', '이미지', '영상', '동영상', '링크', '댓글', '좋아요', '구독', '팔로우',
    // Numbers and punctuation patterns
    ...Array.from({length: 100}, (_, i) => i.toString()),
  ]);

  private cleanText(text: string): string {
    // Remove HTML tags, special characters, and normalize
    return text
      .replace(/<[^>]*>/g, '')
      .replace(/[^\w\s가-힣]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  private extractNgrams(text: string, n: number): string[] {
    const words = text.split(' ').filter(word => 
      word.length >= 2 && 
      !this.stopWords.has(word) &&
      !/^\d+$/.test(word) // Skip pure numbers
    );
    
    const ngrams: string[] = [];
    
    for (let i = 0; i <= words.length - n; i++) {
      const ngram = words.slice(i, i + n).join(' ');
      if (ngram.length >= 2) {
        ngrams.push(ngram);
      }
    }
    
    return ngrams;
  }

  extractKeywords(titles: string[]): KeywordCandidate[] {
    const keywordFreq = new Map<string, number>();
    
    // Clean titles and extract text
    const cleanedTitles = titles.map(title => this.cleanText(title));
    
    // Extract 1-grams, 2-grams, and 3-grams
    for (const title of cleanedTitles) {
      // 1-grams (single words)
      const unigrams = this.extractNgrams(title, 1);
      // 2-grams (word pairs)
      const bigrams = this.extractNgrams(title, 2);
      // 3-grams (word triplets)
      const trigrams = this.extractNgrams(title, 3);
      
      // Count frequency with different weights
      [...unigrams, ...bigrams, ...trigrams].forEach(ngram => {
        const weight = ngram.split(' ').length; // Higher weight for longer phrases
        keywordFreq.set(ngram, (keywordFreq.get(ngram) || 0) + weight);
      });
    }
    
    // Calculate relevance scores
    const candidates: KeywordCandidate[] = [];
    const totalTitles = titles.length;
    
    for (const [keyword, frequency] of Array.from(keywordFreq.entries())) {
      if (frequency >= 2) { // Filter out keywords that appear only once
        // Score based on frequency, length, and document frequency
        const documentFreq = cleanedTitles.filter(title => 
          title.includes(keyword)
        ).length;
        
        const score = Math.round(
          (frequency * 10) + 
          (keyword.split(' ').length * 5) + 
          (documentFreq / totalTitles * 20)
        );
        
        candidates.push({
          keyword,
          frequency,
          score,
        });
      }
    }
    
    // Sort by score and return top candidates
    return candidates
      .sort((a, b) => b.score - a.score)
      .slice(0, 50); // Return top 50 keywords
  }

  getTopKeywords(candidates: KeywordCandidate[], limit = 20): KeywordCandidate[] {
    return candidates.slice(0, limit);
  }
}

export const nlpService = new NLPService();
