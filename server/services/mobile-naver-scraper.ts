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
  nickname?: string;
  postTitle?: string;
}

export class MobileNaverScraperService {
  private userAgent = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
  
  /**
   * M.NAVER.COM에서 실제 모바일 검색 결과를 스크래핑
   */
  async searchBlogs(keyword: string, maxResults = 10): Promise<MobileNaverBlogResult[]> {
    try {
      console.log(`🔍 [Mobile Scraper] 모바일 네이버 검색 시작: "${keyword}"`);
      
      // 통합 검색에서 인기글 섹션 URL 구성 (블로그 탭 아님)
      const searchUrl = `https://m.search.naver.com/search.naver`;
      const params = new URLSearchParams({
        where: 'm',
        query: keyword,
        sm: 'mtp_hty.top',
        ackey: 'q6fujsfr'
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
   * HTML에서 인기글 섹션의 블로그 결과 추출
   */
  private parseBlogs(html: string, keyword: string): MobileNaverBlogResult[] {
    const results: MobileNaverBlogResult[] = [];
    
    try {
      console.log(`🎯 [Mobile Scraper] 인기글 섹션에서 data-url 추출 시작`);
      
      // data-url 속성에서 블로그/인플루언서 URL 추출
      const dataUrlPattern = /data-url="([^"]+)"/g;
      let match;
      let rank = 1;
      
      while ((match = dataUrlPattern.exec(html)) !== null && results.length < 9) {
        const url = match[1];
        
        // 네이버 블로그 또는 인플루언서 URL만 처리
        if (url.includes('blog.naver.com') || url.includes('in.naver.com')) {
          let blogId = '';
          let postId = '';
          let actualUrl = url;
          let isInfluencer = false;
          
          if (url.includes('in.naver.com')) {
            // 인플루언서 계정 처리: in.naver.com/rabbitmom_/contents/internal/xxxxx
            const influencerMatch = url.match(/in\.naver\.com\/([^\/]+)/);
            if (influencerMatch) {
              blogId = influencerMatch[1];
              isInfluencer = true;
              actualUrl = `https://in.naver.com/${blogId}`;
            }
          } else if (url.includes('blog.naver.com')) {
            // 일반 블로그 처리: blog.naver.com/blogId/postId
            const blogMatch = url.match(/blog\.naver\.com\/([^\/]+)(?:\/(\d+))?/);
            if (blogMatch) {
              blogId = blogMatch[1];
              postId = blogMatch[2] || '';
              actualUrl = postId ? `https://blog.naver.com/${blogId}/${postId}` : `https://blog.naver.com/${blogId}`;
            }
          }
          
          if (blogId && !results.find(r => r.blogId === blogId)) {
            // 닉네임과 포스트 제목 추출
            const { nickname, postTitle } = this.extractNicknameAndTitle(html, url, blogId);
            
            const blogResult: MobileNaverBlogResult = {
              title: postTitle || `${nickname || blogId}의 ${isInfluencer ? '인플루언서' : '포스트'}`,
              url: actualUrl,
              blogName: nickname || blogId,
              blogId: blogId,
              postId: postId || undefined,
              rank: rank++,
              description: isInfluencer ? '네이버 인플루언서' : '',
              nickname: nickname,
              postTitle: postTitle
            };
            
            results.push(blogResult);
            console.log(`📝 [Mobile Scraper] ${isInfluencer ? '인플루언서' : '포스트'} 발견: ${blogResult.rank}위 - ${nickname || blogId}${postTitle ? ` | ${postTitle}` : ''}${postId ? ' /' + postId : ''}`);
          }
        }
      }
      
      // 인기글 섹션에서 9개 미만이면 기존 방식으로 보완
      if (results.length < 9) {
        console.log(`⚠️ [Mobile Scraper] 인기글 ${results.length}개만 발견, 기존 방식으로 보완 시도`);
        const postUrlPattern = /(?:blog\.naver\.com|m\.blog\.naver\.com)\/([^\/\s"']+)\/(\d+)/g;
        let fallbackMatch;
        
        while ((fallbackMatch = postUrlPattern.exec(html)) !== null && results.length < 9) {
          const blogId = fallbackMatch[1];
          const postId = fallbackMatch[2];
          const fullUrl = `https://blog.naver.com/${blogId}/${postId}`;
          
          if (!results.find(r => r.blogId === blogId)) {
            const blogResult: MobileNaverBlogResult = {
              title: `${blogId}의 포스트`,
              url: fullUrl,
              blogName: blogId,
              blogId: blogId,
              postId: postId,
              rank: results.length + 1,
              description: ''
            };
            
            results.push(blogResult);
            console.log(`📝 [Mobile Scraper] 보완 포스트 발견: ${blogResult.rank}위 - ${blogResult.blogName}/${blogResult.postId}`);
          }
        }
      }
      
      console.log(`✅ [Mobile Scraper] 인기글 파싱 완료: ${results.length}개 발견 (최대 9개 제한)`);
      return results;
        
    } catch (error) {
      console.error(`❌ [Mobile Scraper] HTML 파싱 실패:`, error);
      return [];
    }
  }
  
  /**
   * HTML에서 닉네임과 포스트 제목 추출
   */
  private extractNicknameAndTitle(html: string, url: string, blogId: string): { nickname?: string; postTitle?: string } {
    try {
      // data-url 주변 컨텍스트에서 제목과 닉네임 추출 시도
      const urlEscaped = url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      
      // data-url 앞뒤 500자 범위에서 텍스트 추출
      const dataUrlRegex = new RegExp(`data-url="${urlEscaped}"`, 'i');
      const match = html.match(dataUrlRegex);
      
      if (match) {
        const matchIndex = match.index!;
        const contextStart = Math.max(0, matchIndex - 500);
        const contextEnd = Math.min(html.length, matchIndex + 500);
        const context = html.slice(contextStart, contextEnd);
        
        // 닉네임 추출 시도 (다양한 패턴)
        let nickname = this.extractNickname(context, blogId);
        
        // 포스트 제목 추출 시도
        let postTitle = this.extractPostTitle(context);
        
        console.log(`🔍 [Mobile Scraper] ${blogId} 컨텍스트 분석: nickname="${nickname || 'N/A'}"`);
        
        return { nickname, postTitle };
      }
      
      return {};
    } catch (error) {
      console.warn(`⚠️ [Mobile Scraper] 닉네임/제목 추출 실패 (${blogId}):`, error);
      return {};
    }
  }
  
  /**
   * 컨텍스트에서 닉네임 추출
   */
  private extractNickname(context: string, blogId: string): string | undefined {
    // 한글 닉네임 패턴 (가장 일반적)
    const koreanNicknamePatterns = [
      /[\uAC00-\uD7AF\s,]{2,20}/g, // 한글 + 공백 + 쉼표
      /[\uAC00-\uD7AF]{2,10}/g,    // 순수 한글만
    ];
    
    for (const pattern of koreanNicknamePatterns) {
      const matches = context.match(pattern);
      if (matches) {
        for (const match of matches) {
          const cleaned = match.trim();
          // 유효한 닉네임인지 검증 (너무 짧거나 숫자만 있으면 제외)
          if (cleaned.length >= 2 && cleaned.length <= 20 && 
              !/^\d+$/.test(cleaned) && 
              !cleaned.includes(blogId)) {
            return cleaned;
          }
        }
      }
    }
    
    return undefined;
  }
  
  /**
   * 컨텍스트에서 포스트 제목 추출
   */
  private extractPostTitle(context: string): string | undefined {
    try {
      // 강력한 HTML 태그 및 인코딩 제거
      let cleanContext = context
        // URL 디코딩
        .replace(/%[0-9A-Fa-f]{2}/g, ' ')
        // HTML 엔티티 디코딩
        .replace(/&gt;/g, '>')
        .replace(/&lt;/g, '<')
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, '&')
        .replace(/&[^;]+;/g, ' ')
        // HTML 태그 제거 (인코딩된 것도 포함)
        .replace(/<[^>]*>/g, ' ')
        .replace(/&lt;[^&]*&gt;/g, ' ')
        // 특수 문자 및 ID 제거
        .replace(/['"]{1,}/g, ' ')
        .replace(/[<>]{1,}/g, ' ')
        .replace(/[{}[\]\\|`~]/g, ' ')
        .replace(/\b[A-Za-z0-9]{8,}\b/g, ' ') // 긴 영숫자 ID 제거
        // 연속 공백 제거
        .replace(/\s+/g, ' ')
        .trim();
      
      // 실제 의미있는 한글 텍스트 추출
      const meaningfulTexts = this.extractMeaningfulKoreanText(cleanContext);
      
      for (const text of meaningfulTexts) {
        if (this.isValidTitle(text)) {
          return text;
        }
      }
      
      return undefined;
    } catch (error) {
      console.warn('⚠️ [Mobile Scraper] 제목 추출 중 오류:', error);
      return undefined;
    }
  }
  
  /**
   * 의미있는 한글 텍스트 추출
   */
  private extractMeaningfulKoreanText(text: string): string[] {
    const results: string[] = [];
    
    // 다양한 패턴으로 한글 텍스트 추출
    const patterns = [
      // 홍삼스틱과 같은 제품명 + 설명
      /홍삼[가-힣\s]{2,20}/g,
      // 일반적인 한글 문장 (동사/형용사 포함)
      /[가-힣]{2,}(?:\s+[가-힣]{1,}){1,8}/g,
      // 간단한 한글 구문
      /[가-힣]{3,15}/g,
    ];
    
    for (const pattern of patterns) {
      const matches = text.match(pattern);
      if (matches) {
        for (const match of matches) {
          const cleaned = match.trim();
          if (cleaned.length >= 3 && cleaned.length <= 50) {
            results.push(cleaned);
          }
        }
      }
    }
    
    // 중복 제거 및 길이순 정렬 (더 긴 것이 더 구체적일 가능성)
    return Array.from(new Set(results)).sort((a, b) => b.length - a.length);
  }
  
  /**
   * 유효한 제목인지 검증
   */
  private isValidTitle(title: string): boolean {
    if (!title || title.length < 3 || title.length > 80) return false;
    
    // 한글이 포함되어야 함
    if (!/[가-힣]/.test(title)) return false;
    
    // 숫자만 있으면 제외
    if (/^[\d\s]+$/.test(title)) return false;
    
    // 의미없는 문자열 제외 (강화된 버전)
    const meaninglessPatterns = [
      /^[^\w가-힣]+$/, // 특수문자만
      /^(.)\1{3,}$/, // 같은 문자 반복
      /^[a-zA-Z]{1,2}$/, // 짧은 영문
      /[A-Za-z0-9]{6,}/, // 긴 영숫자 조합 (ID 같은 것)
      /[<>"\s&;]+/, // HTML 관련 문자
      /^\s*[가-힣]{1,3}\s*$/, // 너무 짧은 한글 (닉네임일 가능성)
    ];
    
    for (const pattern of meaninglessPatterns) {
      if (pattern.test(title)) return false;
    }
    
    // 너무 엄격한 키워드 검증은 제거하고, 기본적인 한글 의미 검증만 유지
    // 실제 포스트 제목도 다양할 수 있으므로 키워드 필터링 완화
    
    return true;
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