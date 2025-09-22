// Node.js 18+ provides global fetch - no import needed

export interface MobileNaverBlogResult {
  title: string;
  url: string;
  blogName: string;
  blogId: string;
  rank: number;
  description?: string;
  timestamp?: string;
}

export class MobileNaverScraperService {
  private userAgent = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
  
  /**
   * M.NAVER.COM에서 실제 모바일 검색 결과를 스크래핑
   */
  async searchBlogs(keyword: string, maxResults = 10): Promise<MobileNaverBlogResult[]> {
    try {
      console.log(`🔍 [Mobile Scraper] 모바일 네이버 검색 시작: "${keyword}"`);
      
      // 모바일 네이버 검색 URL 구성
      const searchUrl = `https://m.search.naver.com/search.naver`;
      const params = new URLSearchParams({
        where: 'post',
        query: keyword,
        sm: 'mtb_jum',
        ie: 'utf8',
        start: '1'
      });
      
      const fullUrl = `${searchUrl}?${params}`;
      console.log(`📱 [Mobile Scraper] 요청 URL: ${fullUrl}`);
      
      // HTTP 요청 with 모바일 User-Agent and timeout via AbortController
      const abortController = new AbortController();
      const timeoutId = setTimeout(() => abortController.abort(), 10000);
      
      try {
        const response = await fetch(fullUrl, {
          headers: {
            'User-Agent': this.userAgent,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache'
          },
          signal: abortController.signal
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const html = await response.text();
        console.log(`📄 [Mobile Scraper] HTML 응답 크기: ${html.length} bytes`);
        
        // 디버깅: HTML 샘플 출력 (첫 1000자와 마지막 1000자)
        console.log(`🔍 [DEBUG] HTML 시작 1000자:`, html.substring(0, 1000));
        console.log(`🔍 [DEBUG] HTML 끝 1000자:`, html.substring(html.length - 1000));
        
        // 디버깅: 블로그 관련 키워드 검색
        const blogKeywords = ['blog.naver.com', 'm.blog.naver.com', 'class=', 'href='];
        blogKeywords.forEach(keyword => {
          const count = (html.match(new RegExp(keyword, 'gi')) || []).length;
          console.log(`🔍 [DEBUG] "${keyword}" 발견 횟수: ${count}`);
        });
        
        // HTML에서 블로그 결과 파싱
        const results = this.parseBlogs(html, keyword);
        console.log(`✅ [Mobile Scraper] 파싱 완료: ${results.length}개 블로그 발견`);
        
        return results.slice(0, maxResults);
        
      } catch (fetchError) {
        clearTimeout(timeoutId);
        throw fetchError;
      }
      
    } catch (error) {
      console.error(`❌ [Mobile Scraper] 스크래핑 실패:`, error);
      throw new Error(`모바일 네이버 스크래핑 실패: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  /**
   * HTML에서 블로그 결과 추출
   */
  private parseBlogs(html: string, keyword: string): MobileNaverBlogResult[] {
    const results: MobileNaverBlogResult[] = [];
    
    try {
      // 블로그 포스트 패턴들 정의 (더 포괄적인 패턴들)
      const patterns = [
        // 패턴 1: 일반적인 블로그 결과
        /<div[^>]*class="[^"]*total_wrap[^"]*"[^>]*>[\s\S]*?<\/div>/gi,
        // 패턴 2: 모바일 전용 블로그 결과
        /<article[^>]*class="[^"]*bx[^"]*"[^>]*>[\s\S]*?<\/article>/gi,
        // 패턴 3: 리스트 형태 블로그 결과  
        /<li[^>]*class="[^"]*item[^"]*"[^>]*>[\s\S]*?<\/li>/gi,
        // 패턴 4: 포괄적인 div 패턴 (블로그 URL 포함)
        /<div[^>]*>[\s\S]*?blog\.naver\.com[\s\S]*?<\/div>/gi,
        // 패턴 5: 포괄적인 모바일 블로그 패턴
        /<div[^>]*>[\s\S]*?m\.blog\.naver\.com[\s\S]*?<\/div>/gi,
        // 패턴 6: 링크 태그 기반 패턴
        /<a[^>]*href="[^"]*blog\.naver\.com[^"]*"[^>]*>[\s\S]*?<\/a>/gi,
        // 패턴 7: 모바일 링크 태그 패턴
        /<a[^>]*href="[^"]*m\.blog\.naver\.com[^"]*"[^>]*>[\s\S]*?<\/a>/gi
      ];
      
      for (const pattern of patterns) {
        const matches = html.match(pattern) || [];
        
        for (let i = 0; i < matches.length && results.length < 20; i++) {
          const match = matches[i];
          const blogResult = this.extractBlogInfo(match, results.length + 1);
          
          if (blogResult && this.isValidBlogResult(blogResult)) {
            results.push(blogResult);
            console.log(`📝 [Mobile Scraper] 블로그 발견: ${blogResult.rank}위 - ${blogResult.blogName} (${blogResult.blogId})`);
          }
        }
      }
      
      // 중복 제거 (같은 blogId)
      const uniqueResults = results.filter((result, index, self) => 
        index === self.findIndex(r => r.blogId === result.blogId)
      );
      
      // 순위 재정렬
      return uniqueResults
        .sort((a, b) => a.rank - b.rank)
        .map((result, index) => ({ ...result, rank: index + 1 }));
        
    } catch (error) {
      console.error(`❌ [Mobile Scraper] HTML 파싱 실패:`, error);
      return [];
    }
  }
  
  /**
   * 개별 블로그 정보 추출
   */
  private extractBlogInfo(htmlBlock: string, rank: number): MobileNaverBlogResult | null {
    try {
      // URL 추출 (여러 패턴 시도)
      const urlPatterns = [
        /href="([^"]*blog\.naver\.com[^"]*?)"/i,
        /href="([^"]*m\.blog\.naver\.com[^"]*?)"/i,
        /data-url="([^"]*blog\.naver\.com[^"]*?)"/i,
        /"url"\s*:\s*"([^"]*blog\.naver\.com[^"]*?)"/i
      ];
      
      let url = '';
      for (const pattern of urlPatterns) {
        const match = htmlBlock.match(pattern);
        if (match && match[1]) {
          url = match[1];
          break;
        }
      }
      
      if (!url) return null;
      
      // URL 정리 (리다이렉트 제거)
      url = this.cleanUrl(url);
      
      // 블로그 ID 추출
      const blogId = this.extractBlogId(url);
      if (!blogId) return null;
      
      // 제목 추출
      const titlePatterns = [
        /<[^>]*class="[^"]*tit[^"]*"[^>]*>([^<]+)</i,
        /<a[^>]*>([^<]+)</i,
        /title="([^"]+)"/i
      ];
      
      let title = '';
      for (const pattern of titlePatterns) {
        const match = htmlBlock.match(pattern);
        if (match && match[1]) {
          title = this.cleanText(match[1]);
          break;
        }
      }
      
      // 블로그명 추출
      const blogNamePatterns = [
        /<[^>]*class="[^"]*name[^"]*"[^>]*>([^<]+)</i,
        /<[^>]*class="[^"]*writer[^"]*"[^>]*>([^<]+)</i,
        /by\s+([^<\s]+)/i
      ];
      
      let blogName = '';
      for (const pattern of blogNamePatterns) {
        const match = htmlBlock.match(pattern);
        if (match && match[1]) {
          blogName = this.cleanText(match[1]);
          break;
        }
      }
      
      // 기본값 설정
      if (!title) title = `${blogId}의 포스트`;
      if (!blogName) blogName = blogId;
      
      return {
        title,
        url,
        blogName,
        blogId,
        rank,
        description: this.extractDescription(htmlBlock)
      };
      
    } catch (error) {
      console.warn(`⚠️ [Mobile Scraper] 블로그 정보 추출 실패:`, error);
      return null;
    }
  }
  
  /**
   * URL에서 블로그 ID 추출
   */
  private extractBlogId(url: string): string | null {
    try {
      const urlObj = new URL(url);
      
      // blog.naver.com/{blogId} 패턴
      const pathParts = urlObj.pathname.split('/').filter(Boolean);
      if (pathParts.length > 0) {
        return pathParts[0];
      }
      
      // 쿼리 파라미터에서 blogId 추출
      const blogId = urlObj.searchParams.get('blogId');
      if (blogId) return blogId;
      
      return null;
    } catch {
      return null;
    }
  }
  
  /**
   * URL 정리 (리다이렉트, 파라미터 제거)
   */
  private cleanUrl(url: string): string {
    try {
      // 네이버 리다이렉트 제거
      if (url.includes('blog.naver.com') && url.includes('?')) {
        const urlObj = new URL(url);
        // 핵심 파라미터만 유지
        const cleanParams = new URLSearchParams();
        const blogId = urlObj.searchParams.get('blogId');
        const logNo = urlObj.searchParams.get('logNo');
        
        if (blogId) cleanParams.set('blogId', blogId);
        if (logNo) cleanParams.set('logNo', logNo);
        
        return `${urlObj.protocol}//${urlObj.host}${urlObj.pathname}?${cleanParams}`;
      }
      
      return url;
    } catch {
      return url;
    }
  }
  
  /**
   * 텍스트 정리 (HTML 태그, 공백 제거)
   */
  private cleanText(text: string): string {
    return text
      .replace(/<[^>]*>/g, '') // HTML 태그 제거
      .replace(/&[^;]+;/g, ' ') // HTML 엔티티 제거
      .replace(/\s+/g, ' ') // 연속 공백 정리
      .trim();
  }
  
  /**
   * 설명 텍스트 추출
   */
  private extractDescription(htmlBlock: string): string {
    const descPatterns = [
      /<[^>]*class="[^"]*desc[^"]*"[^>]*>([^<]+)</i,
      /<[^>]*class="[^"]*txt[^"]*"[^>]*>([^<]+)</i
    ];
    
    for (const pattern of descPatterns) {
      const match = htmlBlock.match(pattern);
      if (match && match[1]) {
        return this.cleanText(match[1]).substring(0, 100);
      }
    }
    
    return '';
  }
  
  /**
   * 유효한 블로그 결과인지 검증
   */
  private isValidBlogResult(result: MobileNaverBlogResult): boolean {
    return !!(
      result.blogId &&
      result.url &&
      (result.url.includes('blog.naver.com') || result.url.includes('m.blog.naver.com')) &&
      result.blogId.length > 0 &&
      result.blogId.length < 50
    );
  }
}

export const mobileNaverScraper = new MobileNaverScraperService();