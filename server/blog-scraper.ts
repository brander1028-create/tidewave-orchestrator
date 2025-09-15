import axios from 'axios';
import * as cheerio from 'cheerio';

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
  private userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

  /**
   * 네이버 블로그 검색 결과를 스크래핑합니다
   */
  async scrapeNaverBlog(config: BlogScrapingConfig): Promise<BlogScrapingResult> {
    try {
      const { query, targetUrl, device = 'pc', maxPages = 3 } = config;

      // 네이버 블로그 검색 URL 구성
      const searchUrl = this.buildSearchUrl(query, device);
      
      console.log(`[BlogScraper] 네이버 블로그 검색: ${query} (${device})`);
      
      // HTTP 요청으로 검색 결과 페이지 가져오기
      const response = await axios.get(searchUrl, {
        headers: {
          'User-Agent': this.userAgent,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
          'Accept-Encoding': 'gzip, deflate, br',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1',
        },
        timeout: 10000,
        maxRedirects: 5
      });

      if (response.status !== 200) {
        throw new Error(`HTTP ${response.status}: 네이버 검색 페이지 접근 실패`);
      }

      // HTML 파싱
      const $ = cheerio.load(response.data);
      const results = this.parseSearchResults($);

      if (results.length === 0) {
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
            metadata: { message: '검색 결과가 없습니다', query }
          },
          timestamp: new Date()
        };
      }

      // 특정 URL을 찾는 경우
      if (targetUrl) {
        const targetResult = results.find(r => 
          r.url.includes(targetUrl) || 
          targetUrl.includes(r.url.split('?')[0]) // 쿼리 파라미터 제외하고 비교
        );

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
            const nextPageResults = await this.scrapeNextPage(query, device, page);
            const targetInNextPage = nextPageResults.find(r => 
              r.url.includes(targetUrl) || 
              targetUrl.includes(r.url.split('?')[0])
            );

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
   * 네이버 블로그 검색 URL 구성
   */
  private buildSearchUrl(query: string, device: 'pc' | 'mobile', start = 1): string {
    const encodedQuery = encodeURIComponent(query);
    const baseUrl = device === 'mobile' 
      ? 'https://m.search.naver.com/search.naver'
      : 'https://search.naver.com/search.naver';
    
    return `${baseUrl}?where=post&query=${encodedQuery}&start=${start}`;
  }

  /**
   * 검색 결과 HTML을 파싱하여 블로그 정보 추출
   */
  private parseSearchResults($: cheerio.CheerioAPI) {
    const results: Array<{
      rank: number;
      page: number;
      position: number;
      title: string;
      url: string;
      snippet: string;
      date: string;
    }> = [];

    // PC 버전 셀렉터
    $('.lst_total .bx').each((index, element) => {
      try {
        const $el = $(element);
        
        // 광고 제외 (첫 번째는 보통 광고)
        if (index === 0 && $el.find('.ad').length > 0) {
          return; // continue
        }

        const titleEl = $el.find('.title_link, .api_txt_lines.total_tit');
        const title = titleEl.text().trim();
        const url = titleEl.attr('href') || '';
        
        if (!title || !url) return; // continue

        const snippet = $el.find('.dsc_txt_wrap, .api_txt_lines.dsc_txt_wrap').text().trim();
        const date = $el.find('.date, .sub_time.sub_txt').text().trim();

        results.push({
          rank: results.length + 1, // 실제 순위 (광고 제외)
          page: 1,
          position: results.length + 1,
          title,
          url: this.cleanUrl(url),
          snippet,
          date
        });
      } catch (e) {
        console.warn('[BlogScraper] 결과 파싱 오류:', e);
      }
    });

    // 모바일 버전 셀렉터 (PC 버전이 안 되는 경우)
    if (results.length === 0) {
      $('.lst_total .item, .content_wrap .item').each((index, element) => {
        try {
          const $el = $(element);
          
          const titleEl = $el.find('.title_link, .tit');
          const title = titleEl.text().trim();
          const url = titleEl.attr('href') || '';
          
          if (!title || !url) return;

          const snippet = $el.find('.dsc, .sub_txt').text().trim();
          const date = $el.find('.date, .time').text().trim();

          results.push({
            rank: results.length + 1,
            page: 1,
            position: results.length + 1,
            title,
            url: this.cleanUrl(url),
            snippet,
            date
          });
        } catch (e) {
          console.warn('[BlogScraper] 모바일 결과 파싱 오류:', e);
        }
      });
    }

    console.log(`[BlogScraper] 파싱된 결과 수: ${results.length}`);
    return results;
  }

  /**
   * 다음 페이지 스크래핑
   */
  private async scrapeNextPage(query: string, device: 'pc' | 'mobile', page: number) {
    const start = (page - 1) * 10 + 1; // 네이버는 10개씩 페이징
    const searchUrl = this.buildSearchUrl(query, device, start);
    
    console.log(`[BlogScraper] 페이지 ${page} 스크래핑 중...`);
    
    const response = await axios.get(searchUrl, {
      headers: { 'User-Agent': this.userAgent },
      timeout: 10000
    });

    if (response.status !== 200) {
      throw new Error(`HTTP ${response.status}: 페이지 ${page} 접근 실패`);
    }

    const $ = cheerio.load(response.data);
    const results = this.parseSearchResults($);
    
    // 페이지 번호에 따라 순위 조정
    return results.map(r => ({
      ...r,
      rank: r.rank + (page - 1) * 10,
      page,
      position: r.position + (page - 1) * 10
    }));
  }

  /**
   * URL 정리 (네이버 리다이렉트 URL 처리)
   */
  private cleanUrl(url: string): string {
    try {
      // 네이버 리다이렉트 URL 처리
      if (url.includes('blog.naver.com') && url.includes('Redirect=Log')) {
        const urlObj = new URL(url);
        const redirectUrl = urlObj.searchParams.get('url');
        return redirectUrl ? decodeURIComponent(redirectUrl) : url;
      }
      
      return url;
    } catch (e) {
      return url;
    }
  }
}

// 기본 인스턴스 export
export const naverBlogScraper = new NaverBlogScraper();