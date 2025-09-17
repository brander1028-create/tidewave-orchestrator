import axios from 'axios';
import * as cheerio from 'cheerio';
import pLimit from 'p-limit';

export interface BlogScrapingResult {
  success: boolean;
  data?: {
    rank: number | null;
    page: number;
    position: number | null;
    title: string;
    url: string;
    snippet: string;
    date: string;
    metadata?: Record<string, any>;
  };
  error?: string;
  timestamp: Date;
}

export interface BlogScrapingConfig {
  query: string; // 검색 키워드
  targetUrl?: string; // 찾을 대상 URL (옵션)
  device?: 'pc' | 'mobile';
  maxPages?: number;
}

export class NaverBlogScraper {
  // 동시성 제한 (최대 3개 동시 요청)
  private concurrencyLimit = pLimit(3);
  
  // User Agent 개선 (모바일과 PC 분리)
  private userAgents = {
    mobile: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    pc: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  };
  
  /**
   * UTF-8 정규화 (인코딩은 URLSearchParams가 처리)
   */
  private normalizeQuery(query: string): string {
    // Unicode 정규화 (NFC 형식으로 통일)
    return query.normalize('NFC');
  }

  /**
   * 네이버 블로그 URL 통합 정규화 (모든 형태를 canonical 형태로 통일)
   */
  private unifyNaverBlogUrl(url: string): string {
    try {
      if (!url || !url.includes('blog.naver.com')) {
        return url;
      }

      let cleanUrl = url;
      
      // m.blog.naver.com을 blog.naver.com으로 통일
      if (cleanUrl.includes('m.blog.naver.com')) {
        cleanUrl = cleanUrl.replace('m.blog.naver.com', 'blog.naver.com');
      }
      
      // HTTP를 HTTPS로 변경
      if (cleanUrl.startsWith('http://')) {
        cleanUrl = cleanUrl.replace('http://', 'https://');
      }
      
      const urlObj = new URL(cleanUrl);
      
      // PostView.naver 형태를 canonical 형태로 변환
      if (urlObj.pathname === '/PostView.naver') {
        const blogId = urlObj.searchParams.get('blogId');
        const logNo = urlObj.searchParams.get('logNo');
        if (blogId && logNo) {
          return `https://blog.naver.com/${blogId}/${logNo}`;
        }
      }
      
      // 이미 canonical 형태면 그대로 반환 (추가 파라미터 제거)
      if (urlObj.pathname.match(/^\/[^\/]+\/\d+/)) {
        const pathParts = urlObj.pathname.split('/');
        if (pathParts.length >= 3) {
          return `https://blog.naver.com/${pathParts[1]}/${pathParts[2]}`;
        }
      }
      
      // 기존 로직: 필수 파라미터만 유지
      const allowedParams = ['blogId', 'logNo', 'parentCategoryNo', 'categoryNo'];
      const searchParams = new URLSearchParams();
      
      allowedParams.forEach(param => {
        if (urlObj.searchParams.has(param)) {
          searchParams.set(param, urlObj.searchParams.get(param)!);
        }
      });
      
      const baseUrl = `https://blog.naver.com${urlObj.pathname}`;
      return searchParams.toString() ? `${baseUrl}?${searchParams}` : baseUrl;
    } catch (e) {
      console.warn('[BlogScraper] URL 통합 정규화 실패:', e);
      return url;
    }
  }

  /**
   * 지수 백오프 재시도 함수 (429/5xx 에러 대응)
   */
  private async withRetry<T>(
    fn: () => Promise<T>,
    maxRetries = 3,
    baseDelayMs = 1000
  ): Promise<T> {
    let lastError: Error | null = null;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error as Error;
        
        // 마지막 시도면 에러 던지기
        if (attempt === maxRetries) {
          throw lastError;
        }
        
        // 재시도 가능한 에러인지 확인
        const shouldRetry = this.shouldRetryError(error);
        if (!shouldRetry) {
          throw lastError;
        }
        
        // 지수 백오프 지연
        const delayMs = baseDelayMs * Math.pow(2, attempt) + Math.random() * 1000;
        console.log(`[BlogScraper] 재시도 ${attempt + 1}/${maxRetries} (${delayMs.toFixed(0)}ms 후)`);
        
        await this.sleep(delayMs);
      }
    }
    
    throw lastError;
  }

  /**
   * 재시도 가능한 에러 판단
   */
  private shouldRetryError(error: any): boolean {
    if (error.response) {
      const status = error.response.status;
      // 429 (Too Many Requests), 5xx 서버 에러
      return status === 429 || (status >= 500 && status < 600);
    }
    
    if (error.code) {
      // 네트워크 관련 에러
      return ['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN'].includes(error.code);
    }
    
    return false;
  }

  /**
   * 지연 함수
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 디바이스별 최적화된 헤더 반환
   */
  private getHeaders(device: 'pc' | 'mobile' = 'pc') {
    const baseHeaders = {
      'User-Agent': this.userAgents[device],
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
      'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.1', // 한국어 우선순위 높임
      'Accept-Encoding': 'gzip, deflate, br',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
      'Cache-Control': 'no-cache', // 캐시 무효화로 최신 결과 확보
      'Pragma': 'no-cache',
      'DNT': '1',
      'Referer': 'https://www.naver.com/',
    };

    // 디바이스별 추가 헤더
    if (device === 'mobile') {
      return {
        ...baseHeaders,
        'sec-ch-ua-mobile': '?1',
        'Viewport-Width': '390',
        'sec-ch-viewport-width': '390'
      };
    } else {
      return {
        ...baseHeaders,
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'sec-ch-ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"Windows"'
      };
    }
  }

  /**
   * 네이버 블로그 검색 결과를 스크래핑합니다 (동시성 제한 적용)
   */
  async scrapeNaverBlog(config: BlogScrapingConfig): Promise<BlogScrapingResult> {
    return this.concurrencyLimit(async () => {
      return this.scrapeNaverBlogInternal(config);
    });
  }

  /**
   * 내부 스크래핑 로직 (재시도 적용)
   */
  private async scrapeNaverBlogInternal(config: BlogScrapingConfig): Promise<BlogScrapingResult> {
    try {
      const { query, targetUrl, device = 'pc', maxPages = 3 } = config;

      // UTF-8 정규화된 검색 URL 구성
      const searchUrl = this.buildSearchUrl(query, device);
      
      console.log(`[BlogScraper] 네이버 블로그 검색: ${query} (${device})`);
      
      // 재시도 로직이 적용된 HTTP 요청
      const response = await this.withRetry(async () => {
        return axios.get(searchUrl, {
          headers: this.getHeaders(device),
          timeout: 15000,
          maxRedirects: 5,
          validateStatus: (status) => status >= 200 && status < 300 // 2xx만 성공으로 처리하여 429 에러가 재시도되도록 함
        });
      });

      if (response.status !== 200) {
        throw new Error(`HTTP ${response.status}: 네이버 검색 페이지 접근 실패`);
      }

      // HTML 파싱 (디바이스 타입 전달)
      const $ = cheerio.load(response.data);
      const results = this.parseSearchResults($, device);

      if (results.length === 0) {
        // 디버깅 로그 추가 (환경변수 확인 후)
        if (process.env.DEBUG_SCRAPER === 'true') {
          const mainPackHtml = $('#main_pack').html()?.substring(0, 500) || '';
          const captchaPresent = response.data.includes('captcha') || response.data.includes('검증');
          console.log(`[BlogScraper] 디버그 - 결과 0개: query="${query}", device="${device}"`);
          console.log(`[BlogScraper] 디버그 - HTML 스니펫: ${mainPackHtml}...`);
          console.log(`[BlogScraper] 디버그 - CAPTCHA 감지: ${captchaPresent}`);
        }

        // PC에서 결과가 없으면 모바일로 폴백 시도
        if (device === 'pc') {
          console.log(`[BlogScraper] PC에서 결과 없음, 모바일로 재시도: ${query}`);
          try {
            return await this.scrapeNaverBlogInternal({ query, targetUrl, device: 'mobile', maxPages });
          } catch (fallbackError) {
            console.warn('[BlogScraper] 모바일 폴백도 실패:', fallbackError);
          }
        }

        return {
          success: true,
          data: {
            rank: null,
            page: 1,
            position: null,
            title: '',
            url: '',
            snippet: '',
            date: '',
            metadata: { message: '검색 결과가 없습니다', query, device }
          },
          timestamp: new Date()
        };
      }

      // 특정 URL을 찾는 경우
      if (targetUrl) {
        const normalizedTargetUrl = this.unifyNaverBlogUrl(targetUrl);
        const targetResult = results.find(r => {
          const normalizedResultUrl = this.unifyNaverBlogUrl(r.url);
          return normalizedResultUrl === normalizedTargetUrl ||
                 normalizedResultUrl.startsWith(normalizedTargetUrl.split('?')[0]) ||
                 normalizedTargetUrl.startsWith(normalizedResultUrl.split('?')[0]);
        });

        if (targetResult) {
          console.log(`[BlogScraper] 타겟 URL 발견: ${targetUrl} -> 순위 ${targetResult.rank}`);
          return {
            success: true,
            data: targetResult,
            timestamp: new Date()
          };
        }

        // 다음 페이지들도 검색 (최대 maxPages까지)
        for (let page = 2; page <= maxPages; page++) {
          try {
            const nextPageResults = await this.concurrencyLimit(async () => {
              return this.scrapeNextPage(query, device, page);
            });
            const targetInNextPage = nextPageResults.find(r => {
              const normalizedResultUrl = this.unifyNaverBlogUrl(r.url);
              return normalizedResultUrl === normalizedTargetUrl ||
                     normalizedResultUrl.startsWith(normalizedTargetUrl.split('?')[0]) ||
                     normalizedTargetUrl.startsWith(normalizedResultUrl.split('?')[0]);
            });

            if (targetInNextPage) {
              console.log(`[BlogScraper] 타겟 URL 발견 (페이지 ${page}): ${targetUrl} -> 순위 ${targetInNextPage.rank}`);
              return {
                success: true,
                data: targetInNextPage,
                timestamp: new Date()
              };
            }
          } catch (error) {
            console.warn(`[BlogScraper] 페이지 ${page} 스크래핑 실패:`, error);
            break; // 다음 페이지 스크래핑 실패시 중단
          }
        }

        // 타겟 URL을 찾지 못한 경우
        return {
          success: true,
          data: {
            rank: null,
            page: maxPages,
            position: null,
            title: '타겟 URL 미발견',
            url: targetUrl,
            snippet: `검색어 "${query}"에서 ${maxPages}페이지까지 검색했지만 찾을 수 없습니다`,
            date: '',
            metadata: { message: '타겟 URL을 찾을 수 없습니다', query, targetUrl }
          },
          timestamp: new Date()
        };
      }

      // 첫 번째 결과 반환 (일반 검색)
      console.log(`[BlogScraper] 첫 번째 검색 결과: ${results[0].title} (순위 ${results[0].rank})`);
      return {
        success: true,
        data: results[0],
        timestamp: new Date()
      };

    } catch (error) {
      console.error('[BlogScraper] 스크래핑 실패:', error);
      return {
        success: false,
        error: `블로그 스크래핑 실패: ${error instanceof Error ? error.message : String(error)}`,
        timestamp: new Date()
      };
    }
  }

  /**
   * 네이버 블로그 검색 URL 구성 (UTF-8 정규화 적용)
   */
  private buildSearchUrl(query: string, device: 'pc' | 'mobile', start = 1): string {
    const normalizedQuery = this.normalizeQuery(query);
    const baseUrl = device === 'mobile' 
      ? 'https://m.search.naver.com/search.naver'
      : 'https://search.naver.com/search.naver';
    
    // 추가 파라미터로 블로그 결과 품질 개선
    const params = new URLSearchParams({
      where: device === 'mobile' ? 'm_blog' : 'blog',
      query: normalizedQuery, // UTF-8 정규화된 쿼리 사용 (URLSearchParams가 자동 인코딩)
      start: start.toString(),
      display: '10' // 명시적 결과 개수
    });
    
    return `${baseUrl}?${params.toString()}`;
  }

  /**
   * 검색 결과 HTML을 파싱하여 블로그 정보 추출 (개선된 셀렉터)
   */
  private parseSearchResults($: cheerio.CheerioAPI, device: 'pc' | 'mobile' = 'pc') {
    const results: Array<{
      rank: number;
      page: number;
      position: number;
      title: string;
      url: string;
      snippet: string;
      date: string;
    }> = [];

    // 디바이스별 개선된 셀렉터 사용
    const selectors = this.getImprovedSelectors(device);
    
    // 메인 결과 미어 시도
    selectors.containers.forEach(containerSelector => {
      $(containerSelector).each((index, element) => {
        try {
          const $el = $(element);
          
          // 광고 및 비로그 컨텐츠 제외
          if (this.shouldSkipElement($el)) {
            return;
          }

          const parsedResult = this.parseSearchItem($el, selectors);
          if (parsedResult) {
            results.push({
              ...parsedResult,
              rank: results.length + 1,
              page: 1,
              position: results.length + 1,
              url: this.cleanUrl(parsedResult.url)
            });
          }
        } catch (e) {
          console.warn(`[BlogScraper] 결과 파싱 오류 (${containerSelector}):`, e);
        }
      });
      
      // 결과가 있으면 다음 셀렉터를 시도하지 않음
      if (results.length > 0) {
        return false; // break out of forEach
      }
    });

    console.log(`[BlogScraper] 파싱된 결과 수: ${results.length}`);
    return results;
  }

  /**
   * 개선된 셀렉터 설정 반환
   */
  private getImprovedSelectors(device: 'pc' | 'mobile') {
    if (device === 'mobile') {
      return {
        containers: [
          '.lst_total .bx', // 최신 블로그 결과 컨테이너
          '.api_subject_bx', // API 결과
          '.list_total .item', // 모바일 결과
          '.content_wrap .item', // 백업 셀렉터
          '.blog_area .item' // 추가 백업
        ],
        title: ['a.title_link', '.title_link', '.api_txt_lines.total_tit', '.tit', '.total_tit'],
        snippet: ['.total_dsc .dsc_txt_wrap', '.dsc_txt_wrap', '.api_txt_lines.dsc_txt_wrap', '.dsc', '.sub_txt'],
        date: ['.sub_time', '.date', '.sub_time.sub_txt', '.time']
      };
    } else {
      return {
        containers: [
          '.lst_total .bx', // 최신 PC 블로그 결과 컨테이너  
          '.api_subject_bx', // API 결과
          '.blog_list .item', // 블로그 리스트
          '.total_wrap .total_group', // 백업 셀렉터
          '.blog_area .item' // 추가 백업
        ],
        title: ['a.title_link', '.title_link', '.api_txt_lines.total_tit', '.total_tit'],
        snippet: ['.total_dsc .dsc_txt_wrap', '.dsc_txt_wrap', '.api_txt_lines.dsc_txt_wrap', '.api_txt_lines'],
        date: ['.sub_time', '.date', '.sub_time.sub_txt']
      };
    }
  }

  /**
   * 요소를 건너뛰어야 할지 판단
   */
  private shouldSkipElement($el: cheerio.Cheerio<any>): boolean {
    // 광고 제외
    if ($el.find('.ad, .api_ad_area, .adv').length > 0) {
      return true;
    }
    
    // 비로그 컨텐츠 제외 (예: 카페, 뉴스 등)
    if ($el.find('.cafe, .news, .kin').length > 0) {
      return true;
    }
    
    return false;
  }

  /**
   * 개별 결과 아이템 파싱
   */
  private parseSearchItem($el: cheerio.Cheerio<any>, selectors: any) {
    let title = '';
    let url = '';
    let snippet = '';
    let date = '';
    
    // 제목과 URL 추출
    for (const titleSelector of selectors.title) {
      const titleEl = $el.find(titleSelector);
      if (titleEl.length > 0) {
        title = titleEl.text().trim();
        url = titleEl.attr('href') || '';
        if (title && url) break;
      }
    }
    
    // 기본 요구사항 채크
    if (!title || !url) return null;
    
    // 스니펙 추출
    for (const snippetSelector of selectors.snippet) {
      const snippetEl = $el.find(snippetSelector);
      if (snippetEl.length > 0) {
        snippet = snippetEl.text().trim();
        if (snippet) break;
      }
    }
    
    // 날짜 추출
    for (const dateSelector of selectors.date) {
      const dateEl = $el.find(dateSelector);
      if (dateEl.length > 0) {
        date = dateEl.text().trim();
        if (date) break;
      }
    }
    
    return { title, url, snippet, date };
  }

  /**
   * 다음 페이지 스크래핑 (개선된 재시도 로직 적용)
   */
  private async scrapeNextPage(query: string, device: 'pc' | 'mobile', page: number) {
    const start = (page - 1) * 10 + 1;
    const searchUrl = this.buildSearchUrl(query, device, start);
    
    console.log(`[BlogScraper] 페이지 ${page} 스크래핑 중...`);
    
    const response = await this.withRetry(async () => {
      return axios.get(searchUrl, {
        headers: this.getHeaders(device),
        timeout: 15000,
        validateStatus: (status) => status >= 200 && status < 300 // 2xx만 성공으로 처리하여 429 에러가 재시도되도록 함
      });
    });

    if (response.status !== 200) {
      throw new Error(`HTTP ${response.status}: 페이지 ${page} 접근 실패`);
    }

    const $ = cheerio.load(response.data);
    const results = this.parseSearchResults($, device);
    
    return results.map(r => ({
      ...r,
      rank: r.rank + (page - 1) * 10,
      page,
      position: r.position + (page - 1) * 10
    }));
  }

  /**
   * URL 정리 (리다이렉트 처리 및 통합 정규화)
   */
  private cleanUrl(url: string): string {
    try {
      if (!url || typeof url !== 'string') {
        return '';
      }

      let cleanedUrl = url;

      // 네이버 검색 리다이렉트 처리
      if (url.includes('search.naver.com/p/crd/rd')) {
        const urlObj = new URL(url);
        const redirectUrl = urlObj.searchParams.get('u') || urlObj.searchParams.get('url');
        if (redirectUrl) {
          cleanedUrl = decodeURIComponent(redirectUrl);
        }
      }
      
      // 네이버 블로그 리다이렉트 처리 (기존)
      if (cleanedUrl.includes('blog.naver.com') && cleanedUrl.includes('Redirect=Log')) {
        const urlObj = new URL(cleanedUrl);
        const redirectUrl = urlObj.searchParams.get('url');
        if (redirectUrl) {
          cleanedUrl = decodeURIComponent(redirectUrl);
        }
      }

      // 기타 네이버 리다이렉트 패턴 처리
      if (cleanedUrl.includes('search.naver.com') && cleanedUrl.includes('url=')) {
        try {
          const urlObj = new URL(cleanedUrl);
          const redirectUrl = urlObj.searchParams.get('url');
          if (redirectUrl && redirectUrl.includes('blog.naver.com')) {
            cleanedUrl = decodeURIComponent(redirectUrl);
          }
        } catch (e) {
          // URL 파싱 실패 시 원본 사용
        }
      }

      // 네이버 블로그 URL이면 통합 정규화
      if (cleanedUrl.includes('blog.naver.com')) {
        return this.unifyNaverBlogUrl(cleanedUrl);
      }

      return cleanedUrl;
    } catch (e) {
      console.warn('[BlogScraper] URL 정리 실패:', e);
      return url;
    }
  }
}

// 기본 인스턴스 export
export const naverBlogScraper = new NaverBlogScraper();