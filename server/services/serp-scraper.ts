import { chromium, type Browser } from "playwright";

export interface SerpResult {
  url: string;
  title: string;
  snippet: string;
  rank: number;
}

class SerpScraper {
  private browser: Browser | null = null;
  
  async init() {
    if (!this.browser) {
      this.browser = await chromium.launch({ 
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
    }
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  /**
   * Search for blogs ranking in specific positions for a keyword on mobile Naver
   */
  async searchKeywordOnMobileNaver(keyword: string, minRank: number, maxRank: number): Promise<SerpResult[]> {
    await this.init();
    const page = await this.browser!.newPage();
    
    try {
      // Set mobile user agent
      await page.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 14_7_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.2 Mobile/15E148 Safari/604.1');
      await page.setViewportSize({ width: 375, height: 812 });

      // Navigate to mobile Naver search
      const searchUrl = `https://m.search.naver.com/search.naver?query=${encodeURIComponent(keyword)}`;
      await page.goto(searchUrl, { waitUntil: 'networkidle' });

      // Wait for search results to load
      await page.waitForSelector('div[data-module="blog"]', { timeout: 10000 });

      // Extract blog results
      const results: SerpResult[] = [];
      const blogResults = await page.$$('div[data-module="blog"] .lst_total .bx');

      for (let i = 0; i < Math.min(blogResults.length, 20); i++) {
        const rank = i + 1;
        
        // Only include results within specified rank range
        if (rank < minRank || rank > maxRank) {
          continue;
        }

        const element = blogResults[i];
        
        try {
          const titleElement = await element.$('.tit');
          const linkElement = await element.$('a');
          const snippetElement = await element.$('.dsc');

          if (titleElement && linkElement) {
            const title = await titleElement.textContent() || '';
            const href = await linkElement.getAttribute('href') || '';
            const snippet = (await snippetElement?.textContent()) || '';

            // Clean up the URL if it's a Naver redirect URL
            let cleanUrl = href;
            if (href.includes('blog.naver.com') && href.includes('blogId=')) {
              const urlParams = new URLSearchParams(href.split('?')[1]);
              const blogId = urlParams.get('blogId');
              const logNo = urlParams.get('logNo');
              if (blogId && logNo) {
                cleanUrl = `https://blog.naver.com/${blogId}/${logNo}`;
              }
            }

            // Only include blog.naver.com URLs
            if (cleanUrl.includes('blog.naver.com')) {
              results.push({
                url: cleanUrl,
                title: title.trim(),
                snippet: snippet.trim(),
                rank
              });
            }
          }
        } catch (error) {
          console.warn(`Error extracting result at rank ${rank}:`, error);
        }
      }

      console.log(`Found ${results.length} blog results for "${keyword}" in ranks ${minRank}-${maxRank}`);
      return results;
      
    } catch (error) {
      console.error(`Error searching for keyword "${keyword}":`, error);
      return [];
    } finally {
      await page.close();
    }
  }

  /**
   * Check if a blog URL ranks for a specific keyword in mobile Naver search
   */
  async checkKeywordRankingInMobileNaver(keyword: string, blogUrl: string): Promise<number | null> {
    await this.init();
    const page = await this.browser!.newPage();
    
    try {
      // Set mobile user agent
      await page.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 14_7_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.2 Mobile/15E148 Safari/604.1');
      await page.setViewportSize({ width: 375, height: 812 });

      // Navigate to mobile Naver search
      const searchUrl = `https://m.search.naver.com/search.naver?query=${encodeURIComponent(keyword)}`;
      await page.goto(searchUrl, { waitUntil: 'networkidle' });

      // Wait for search results to load
      await page.waitForSelector('div[data-module="blog"]', { timeout: 10000 });

      // Extract blog results and check for matching URL
      const blogResults = await page.$$('div[data-module="blog"] .lst_total .bx');

      for (let i = 0; i < Math.min(blogResults.length, 20); i++) {
        const rank = i + 1;
        const element = blogResults[i];
        
        try {
          const linkElement = await element.$('a');
          if (linkElement) {
            const href = await linkElement.getAttribute('href') || '';
            
            // Clean up the URL if it's a Naver redirect URL
            let cleanUrl = href;
            if (href.includes('blog.naver.com') && href.includes('blogId=')) {
              const urlParams = new URLSearchParams(href.split('?')[1]);
              const blogId = urlParams.get('blogId');
              const logNo = urlParams.get('logNo');
              if (blogId && logNo) {
                cleanUrl = `https://blog.naver.com/${blogId}/${logNo}`;
              }
            }

            // Check if this matches our target blog URL
            if (cleanUrl === blogUrl || href === blogUrl) {
              console.log(`Found blog "${blogUrl}" at rank ${rank} for keyword "${keyword}"`);
              return rank;
            }
          }
        } catch (error) {
          console.warn(`Error checking result at rank ${rank}:`, error);
        }
      }

      console.log(`Blog "${blogUrl}" not found in top 20 results for keyword "${keyword}"`);
      return null;
      
    } catch (error) {
      console.error(`Error checking ranking for keyword "${keyword}" and blog "${blogUrl}":`, error);
      return null;
    } finally {
      await page.close();
    }
  }

  /**
   * Add delay between requests to avoid being blocked
   */
  async sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export const serpScraper = new SerpScraper();

// Cleanup on process exit
process.on('exit', () => {
  serpScraper.close();
});

process.on('SIGINT', () => {
  serpScraper.close();
  process.exit();
});

process.on('SIGTERM', () => {
  serpScraper.close();
  process.exit();
});