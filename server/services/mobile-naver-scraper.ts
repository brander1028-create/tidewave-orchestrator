// Node.js 18+ provides global fetch - no import needed

export interface MobileNaverBlogResult {
  title: string;
  url: string;
  blogName: string;
  blogId: string;
  postId?: string;
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
        
        // 디버깅: HTML 샘플 출력 (DEBUG_MOBILE_SCRAPER=true일 때만)
        if (process.env.DEBUG_MOBILE_SCRAPER === 'true') {
          console.log(`🔍 [DEBUG] HTML 시작 1000자:`, html.substring(0, 1000));
          console.log(`🔍 [DEBUG] HTML 끝 1000자:`, html.substring(html.length - 1000));
          
          // 디버깅: 블로그 관련 키워드 검색
          const blogKeywords = ['blog.naver.com', 'm.blog.naver.com', 'class=', 'href='];
          blogKeywords.forEach(keyword => {
            const count = (html.match(new RegExp(keyword, 'gi')) || []).length;
            console.log(`🔍 [DEBUG] "${keyword}" 발견 횟수: ${count}`);
          });
        }
        
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
      // 직접 포스트 URL 추출 (가장 정확한 방법)
      const postUrlPattern = /(?:blog\.naver\.com|m\.blog\.naver\.com)\/([^\/\s"']+)\/(\d+)/g;
      let match;
      let rank = 1;
      
      while ((match = postUrlPattern.exec(html)) !== null && results.length < 10) {
        const blogId = match[1];
        const postId = match[2];
        const fullUrl = `https://blog.naver.com/${blogId}/${postId}`;
        
        // 중복 체크
        if (!results.find(r => r.url === fullUrl)) {
          const blogResult: MobileNaverBlogResult = {
            title: `${blogId}의 포스트`,
            url: fullUrl,
            blogName: blogId,
            blogId: blogId,
            postId: postId,
            rank: rank++,
            description: ''
          };
          
          results.push(blogResult);
          console.log(`📝 [Mobile Scraper] 포스트 발견: ${blogResult.rank}위 - ${blogResult.blogName}/${blogResult.postId}`);
        }
      }
      
      // 포스트 URL이 없으면 블로그 홈 URL 시도
      if (results.length === 0) {
        const blogUrlPattern = /(?:blog\.naver\.com|m\.blog\.naver\.com)\/([^\/\s"']+)(?!\/\d)/g;
        let blogMatch;
        let blogRank = 1;
        
        while ((blogMatch = blogUrlPattern.exec(html)) !== null && results.length < 5) {
          const blogId = blogMatch[1];
          const fullUrl = `https://blog.naver.com/${blogId}`;
          
          // 중복 체크
          if (!results.find(r => r.blogId === blogId)) {
            const blogResult: MobileNaverBlogResult = {
              title: `${blogId}의 블로그`,
              url: fullUrl,
              blogName: blogId,
              blogId: blogId,
              postId: undefined,
              rank: blogRank++,
              description: ''
            };
            
            results.push(blogResult);
            console.log(`📝 [Mobile Scraper] 블로그 발견: ${blogResult.rank}위 - ${blogResult.blogName} (블로그 홈)`);
          }
        }
      }
      
      return results;
        
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
      
      // 블로그 ID와 포스트 ID 추출
      const { blogId, postId } = this.extractBlogAndPostId(url);
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
        postId: postId || undefined,
        rank,
        description: this.extractDescription(htmlBlock)
      };
      
    } catch (error) {
      console.warn(`⚠️ [Mobile Scraper] 블로그 정보 추출 실패:`, error);
      return null;
    }
  }
  
  /**
   * URL에서 블로그 ID와 포스트 ID 추출
   */
  private extractBlogAndPostId(url: string): { blogId: string | null; postId: string | null } {
    try {
      const urlObj = new URL(url);
      
      // blog.naver.com/{blogId}/{postId} 패턴
      const pathParts = urlObj.pathname.split('/').filter(Boolean);
      if (pathParts.length >= 1) {
        const blogId = pathParts[0];
        const postId = pathParts.length >= 2 ? pathParts[1] : null;
        return { blogId, postId };
      }
      
      // 쿼리 파라미터에서 blogId와 logNo 추출
      const blogId = urlObj.searchParams.get('blogId');
      const postId = urlObj.searchParams.get('logNo');
      if (blogId) return { blogId, postId };
      
      return { blogId: null, postId: null };
    } catch {
      return { blogId: null, postId: null };
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