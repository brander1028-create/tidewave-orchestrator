import fetch from 'node-fetch';

export interface InfluencerPost {
  title: string;
  url: string;
}

export class InfluencerScraper {
  private userAgent = 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_7_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.2 Mobile/15E148 Safari/604.1';

  /**
   * 인플루언서 포스트 수집 - 2가지 방법 활용
   */
  async collectPosts(homeId: string, limit = 5): Promise<InfluencerPost[]> {
    console.log(`🔍 [InfluencerScraper] ${homeId} 포스트 수집 시작`);
    
    try {
      // 방법 1: 프로필 페이지 JSON 추출 시도
      const profilePosts = await this.extractFromProfile(homeId, limit);
      if (profilePosts.length >= 3) {
        console.log(`✅ [InfluencerScraper] 프로필 방식 성공: ${profilePosts.length}개 포스트`);
        return profilePosts;
      }

      // 방법 2: 컨텐츠 페이지 파싱 시도
      console.log(`🔄 [InfluencerScraper] 프로필 방식 실패 (${profilePosts.length}개), 컨텐츠 파싱 시도`);
      const contentPosts = await this.extractFromContentPages(homeId, limit);
      
      // 결과 합치기
      const allPosts = [...profilePosts, ...contentPosts];
      const uniquePosts = this.deduplicatePosts(allPosts);
      const finalPosts = uniquePosts.slice(0, limit);
      
      console.log(`📊 [InfluencerScraper] ${homeId} 최종 결과: ${finalPosts.length}개 포스트`);
      return finalPosts;
      
    } catch (error) {
      console.log(`❌ [InfluencerScraper] ${homeId} 수집 실패:`, error);
      return [];
    }
  }

  /**
   * 방법 1: 프로필 페이지에서 JSON 데이터 추출
   */
  private async extractFromProfile(homeId: string, limit: number): Promise<InfluencerPost[]> {
    try {
      const profileUrl = `https://in.naver.com/${homeId}`;
      console.log(`📱 [InfluencerScraper] 프로필 페이지 접근: ${profileUrl}`);
      
      const response = await fetch(profileUrl, {
        headers: {
          'User-Agent': this.userAgent,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
          'Referer': 'https://m.search.naver.com/',
        }
      });

      if (!response.ok) {
        console.log(`⚠️ [InfluencerScraper] 프로필 페이지 접근 실패: ${response.status}`);
        return [];
      }

      const html = await response.text();
      console.log(`📄 [InfluencerScraper] 프로필 HTML 수신: ${html.length} characters`);

      // JSON 데이터 추출 시도
      const posts = this.parseBootstrapJson(html, homeId, limit);
      return posts;
      
    } catch (error) {
      console.log(`❌ [InfluencerScraper] 프로필 파싱 오류:`, error);
      return [];
    }
  }

  /**
   * 방법 2: 컨텐츠 내부 페이지들에서 메타데이터 추출
   */
  private async extractFromContentPages(homeId: string, limit: number): Promise<InfluencerPost[]> {
    try {
      // 우선 홈페이지에서 컨텐츠 링크들 찾기
      const profileUrl = `https://in.naver.com/${homeId}`;
      const response = await fetch(profileUrl, {
        headers: {
          'User-Agent': this.userAgent,
          'Accept': 'text/html',
          'Referer': 'https://m.search.naver.com/',
        }
      });

      if (!response.ok) return [];

      const html = await response.text();
      
      // contents/internal 링크들 추출
      const contentUrls = this.extractContentUrls(html, homeId);
      console.log(`🔗 [InfluencerScraper] 발견된 컨텐츠 URL: ${contentUrls.length}개`);
      
      if (contentUrls.length === 0) return [];

      // 각 컨텐츠 페이지에서 메타데이터 추출
      const posts: InfluencerPost[] = [];
      const urlsToCheck = contentUrls.slice(0, Math.min(limit * 2, 10)); // 최대 10개까지만 체크
      
      for (const url of urlsToCheck) {
        if (posts.length >= limit) break;
        
        try {
          await new Promise(resolve => setTimeout(resolve, 500)); // 0.5초 딜레이
          const post = await this.extractPostMetadata(url);
          if (post) posts.push(post);
        } catch (error) {
          console.log(`⚠️ [InfluencerScraper] 컨텐츠 페이지 파싱 실패: ${url}`);
        }
      }

      return posts;
      
    } catch (error) {
      console.log(`❌ [InfluencerScraper] 컨텐츠 페이지 추출 오류:`, error);
      return [];
    }
  }

  /**
   * Bootstrap JSON에서 포스트 데이터 파싱
   */
  private parseBootstrapJson(html: string, homeId: string, limit: number): InfluencerPost[] {
    const posts: InfluencerPost[] = [];
    
    try {
      // __NUXT__ 데이터 찾기
      const nuxtMatch = html.match(/window\.__NUXT__\s*=\s*({[\s\S]+?});/);
      if (nuxtMatch) {
        try {
          const nuxtData = JSON.parse(nuxtMatch[1]);
          console.log(`📦 [InfluencerScraper] NUXT 데이터 파싱 성공`);
          
          // NUXT 데이터에서 포스트 추출 시도
          const extractedPosts = this.extractPostsFromNuxtData(nuxtData, homeId, limit);
          posts.push(...extractedPosts);
        } catch (e) {
          console.log(`⚠️ [InfluencerScraper] NUXT 데이터 파싱 실패`);
        }
      }

      // application/ld+json 스크립트 찾기
      const ldJsonMatches = html.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/g);
      if (ldJsonMatches) {
        for (const match of ldJsonMatches) {
          try {
            const jsonContent = match.replace(/<script[^>]*>/, '').replace(/<\/script>/, '');
            const ldData = JSON.parse(jsonContent);
            console.log(`📋 [InfluencerScraper] LD+JSON 데이터 파싱 성공`);
            
            const extractedPosts = this.extractPostsFromLdJson(ldData, homeId, limit);
            posts.push(...extractedPosts);
          } catch (e) {
            console.log(`⚠️ [InfluencerScraper] LD+JSON 파싱 실패`);
          }
        }
      }

      return posts.slice(0, limit);
      
    } catch (error) {
      console.log(`❌ [InfluencerScraper] JSON 파싱 전체 실패:`, error);
      return [];
    }
  }

  /**
   * NUXT 데이터에서 포스트 추출
   */
  private extractPostsFromNuxtData(data: any, homeId: string, limit: number): InfluencerPost[] {
    const posts: InfluencerPost[] = [];
    
    try {
      // 재귀적으로 데이터 탐색
      const findPosts = (obj: any, depth = 0): void => {
        if (depth > 10 || posts.length >= limit) return;
        
        if (typeof obj === 'object' && obj !== null) {
          // 배열인 경우 각 항목 확인
          if (Array.isArray(obj)) {
            for (const item of obj) {
              if (posts.length >= limit) break;
              if (this.looksLikePost(item)) {
                const post = this.extractPostFromObject(item, homeId);
                if (post) posts.push(post);
              } else {
                findPosts(item, depth + 1);
              }
            }
          } else {
            // 객체인 경우 각 속성 확인
            for (const [key, value] of Object.entries(obj)) {
              if (posts.length >= limit) break;
              if (this.looksLikePost(value)) {
                const post = this.extractPostFromObject(value, homeId);
                if (post) posts.push(post);
              } else {
                findPosts(value, depth + 1);
              }
            }
          }
        }
      };
      
      findPosts(data);
      
    } catch (error) {
      console.log(`❌ [InfluencerScraper] NUXT 데이터 탐색 실패:`, error);
    }
    
    return posts;
  }

  /**
   * LD+JSON 데이터에서 포스트 추출
   */
  private extractPostsFromLdJson(data: any, homeId: string, limit: number): InfluencerPost[] {
    const posts: InfluencerPost[] = [];
    
    try {
      if (data['@type'] === 'Blog' || data['@type'] === 'WebSite') {
        // Blog나 WebSite 타입인 경우
        if (data.blogPost && Array.isArray(data.blogPost)) {
          for (const post of data.blogPost.slice(0, limit)) {
            const extracted = this.extractPostFromLdJsonItem(post, homeId);
            if (extracted) posts.push(extracted);
          }
        }
      }
      
      // 배열인 경우 각 항목 확인
      if (Array.isArray(data)) {
        for (const item of data) {
          if (posts.length >= limit) break;
          const extracted = this.extractPostFromLdJsonItem(item, homeId);
          if (extracted) posts.push(extracted);
        }
      }
      
    } catch (error) {
      console.log(`❌ [InfluencerScraper] LD+JSON 추출 실패:`, error);
    }
    
    return posts;
  }

  /**
   * 객체가 포스트 같은지 확인
   */
  private looksLikePost(obj: any): boolean {
    if (typeof obj !== 'object' || !obj) return false;
    
    return (obj.title && typeof obj.title === 'string') ||
           (obj.headline && typeof obj.headline === 'string') ||
           (obj.name && typeof obj.name === 'string' && obj.url);
  }

  /**
   * 객체에서 포스트 정보 추출
   */
  private extractPostFromObject(obj: any, homeId: string): InfluencerPost | null {
    try {
      const title = obj.title || obj.headline || obj.name || obj.subject;
      const url = obj.url || obj.link || obj.href;
      
      if (title && typeof title === 'string' && title.length > 5) {
        return {
          title: this.cleanTitle(title),
          url: url || `https://in.naver.com/${homeId}`
        };
      }
    } catch (error) {
      // 무시
    }
    
    return null;
  }

  /**
   * LD+JSON 아이템에서 포스트 추출
   */
  private extractPostFromLdJsonItem(item: any, homeId: string): InfluencerPost | null {
    try {
      if (item['@type'] === 'BlogPosting' || item['@type'] === 'Article') {
        const title = item.headline || item.name || item.title;
        const url = item.url || item.mainEntityOfPage?.['@id'];
        
        if (title && typeof title === 'string') {
          return {
            title: this.cleanTitle(title),
            url: url || `https://in.naver.com/${homeId}`
          };
        }
      }
    } catch (error) {
      // 무시
    }
    
    return null;
  }

  /**
   * HTML에서 컨텐츠 URL들 추출
   */
  private extractContentUrls(html: string, homeId: string): string[] {
    const urls: string[] = [];
    
    // contents/internal 링크 패턴들
    const patterns = [
      new RegExp(`https://in\\.naver\\.com/${homeId}/contents/internal/\\d+`, 'g'),
      new RegExp(`/contents/internal/\\d+`, 'g')
    ];
    
    for (const pattern of patterns) {
      const matches = html.match(pattern);
      if (matches) {
        for (const match of matches) {
          let url = match;
          if (url.startsWith('/')) {
            url = `https://in.naver.com/${homeId}${url}`;
          }
          if (!urls.includes(url)) {
            urls.push(url);
          }
        }
      }
    }
    
    return urls.slice(0, 10); // 최대 10개
  }

  /**
   * 개별 컨텐츠 페이지에서 메타데이터 추출
   */
  private async extractPostMetadata(url: string): Promise<InfluencerPost | null> {
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': this.userAgent,
          'Accept': 'text/html',
          'Referer': 'https://in.naver.com/',
        }
      });

      if (!response.ok) return null;

      const html = await response.text();
      
      // OG 태그에서 제목 추출
      const ogTitleMatch = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/);
      const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/);
      
      const title = ogTitleMatch?.[1] || titleMatch?.[1];
      
      if (title && title.length > 5) {
        return {
          title: this.cleanTitle(title),
          url: url
        };
      }
      
    } catch (error) {
      console.log(`⚠️ [InfluencerScraper] 메타데이터 추출 실패: ${url}`);
    }
    
    return null;
  }

  /**
   * 제목 정리
   */
  private cleanTitle(title: string): string {
    return title
      .replace(/\s*:\s*네이버\s*(블로그|인플루언서)?\s*$/, '')
      .replace(/\s*-\s*네이버\s*(블로그|인플루언서)?\s*$/, '')
      .replace(/^\s*네이버\s*인플루언서\s*:\s*/, '')
      .trim();
  }

  /**
   * 포스트 중복 제거
   */
  private deduplicatePosts(posts: InfluencerPost[]): InfluencerPost[] {
    const seen = new Set<string>();
    const unique: InfluencerPost[] = [];
    
    for (const post of posts) {
      const key = post.title.toLowerCase().replace(/\s+/g, ' ').trim();
      if (!seen.has(key) && key.length > 5) {
        seen.add(key);
        unique.push(post);
      }
    }
    
    return unique;
  }
}