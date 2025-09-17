import { chromium, Browser, Page } from 'playwright';
import { EventEmitter } from 'events';

// Rate limiting and cache interfaces
interface RateLimiter {
  checkRateLimit(key: string): Promise<boolean>;
  recordRequest(key: string): void;
}

interface CacheService {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
}

// Simple in-memory implementations
class MemoryRateLimiter implements RateLimiter {
  private requests: Map<string, number[]> = new Map();
  private maxRequestsPerMinute = 30;

  async checkRateLimit(key: string): Promise<boolean> {
    const now = Date.now();
    const requests = this.requests.get(key) || [];
    
    // Remove requests older than 1 minute
    const recentRequests = requests.filter(time => now - time < 60000);
    this.requests.set(key, recentRequests);
    
    return recentRequests.length < this.maxRequestsPerMinute;
  }

  recordRequest(key: string): void {
    const requests = this.requests.get(key) || [];
    requests.push(Date.now());
    this.requests.set(key, requests);
  }
}

class MemoryCache implements CacheService {
  private cache: Map<string, { value: string, expires: number }> = new Map();

  async get(key: string): Promise<string | null> {
    const entry = this.cache.get(key);
    if (!entry) return null;
    
    if (Date.now() > entry.expires) {
      this.cache.delete(key);
      return null;
    }
    
    return entry.value;
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    const expires = Date.now() + (ttlSeconds * 1000);
    this.cache.set(key, { value, expires });
  }
}

// Scraping configuration
interface ScrapingConfig {
  target: string;
  query: string;
  device: 'mobile' | 'pc';
  kind: 'blog' | 'shop';
  sort?: string;
  maxRetries: number;
  backoffMs: number;
}

interface ScrapingResult {
  success: boolean;
  data?: {
    rank?: number;
    page?: number;
    position?: number;
    url?: string;
    title?: string;
    metadata?: any;
  };
  error?: string;
  timestamp: Date;
}

export class WebScrapingService extends EventEmitter {
  private browser: Browser | null = null;
  private rateLimiter: RateLimiter;
  private cache: CacheService;
  private isInitialized = false;

  constructor() {
    super();
    this.rateLimiter = new MemoryRateLimiter();
    this.cache = new MemoryCache();
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      this.browser = await chromium.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu'
        ]
      });
      this.isInitialized = true;
      this.emit('initialized');
    } catch (error) {
      this.emit('error', `Failed to initialize browser: ${error}`);
      throw error;
    }
  }

  async scrapeRanking(config: ScrapingConfig): Promise<ScrapingResult> {
    const cacheKey = `ranking:${config.kind}:${config.query}:${config.device}:${config.sort || 'default'}`;
    
    // Check cache first
    const cached = await this.cache.get(cacheKey);
    if (cached) {
      try {
        return JSON.parse(cached);
      } catch (e) {
        // Invalid cache, continue to scrape
      }
    }

    // Check rate limit
    const rateLimitKey = `${config.kind}:${config.device}`;
    const canProceed = await this.rateLimiter.checkRateLimit(rateLimitKey);
    if (!canProceed) {
      return {
        success: false,
        error: 'Rate limit exceeded',
        timestamp: new Date()
      };
    }

    if (!this.browser) {
      await this.initialize();
    }

    let attempt = 0;
    while (attempt < config.maxRetries) {
      try {
        this.rateLimiter.recordRequest(rateLimitKey);
        
        const result = await this.performScraping(config);
        
        // Cache successful results for 10 minutes
        if (result.success) {
          await this.cache.set(cacheKey, JSON.stringify(result), 600);
        }
        
        return result;
      } catch (error) {
        attempt++;
        if (attempt >= config.maxRetries) {
          return {
            success: false,
            error: `Failed after ${config.maxRetries} attempts: ${error}`,
            timestamp: new Date()
          };
        }
        
        // Exponential backoff
        const delay = config.backoffMs * Math.pow(2, attempt - 1);
        await this.sleep(delay);
      }
    }

    return {
      success: false,
      error: 'Max retries exceeded',
      timestamp: new Date()
    };
  }

  private async performScraping(config: ScrapingConfig): Promise<ScrapingResult> {
    if (!this.browser) throw new Error('Browser not initialized');

    const context = await this.browser.newContext({
      userAgent: config.device === 'mobile' 
        ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_7_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.2 Mobile/15E148 Safari/604.1'
        : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      viewport: config.device === 'mobile' ? { width: 375, height: 667 } : { width: 1920, height: 1080 }
    });

    const page = await context.newPage();

    try {
      let searchUrl: string;
      
      if (config.kind === 'blog') {
        // 네이버 블로그 검색
        searchUrl = `https://search.naver.com/search.naver?where=blog&query=${encodeURIComponent(config.query)}`;
      } else {
        // 네이버 쇼핑 검색
        const sortParam = this.getSortParam(config.sort);
        searchUrl = `https://search.shopping.naver.com/search/all?query=${encodeURIComponent(config.query)}${sortParam}`;
      }

      await page.goto(searchUrl, { waitUntil: 'networkidle' });
      
      // Wait for search results to load
      await page.waitForTimeout(2000);

      let result: ScrapingResult;
      
      if (config.kind === 'blog') {
        result = await this.scrapeBlogRanking(page, config);
      } else {
        result = await this.scrapeShoppingRanking(page, config);
      }

      await context.close();
      return result;

    } catch (error) {
      await context.close();
      throw error;
    }
  }

  private async scrapeBlogRanking(page: Page, config: ScrapingConfig): Promise<ScrapingResult> {
    try {
      // 네이버 블로그 검색 결과에서 특정 URL 찾기
      const results = await page.$$eval('.lst_total .bx', (elements, query) => {
        return elements.map((el, index) => {
          const titleElement = el.querySelector('.title_link');
          const title = titleElement?.textContent?.trim() || '';
          const url = titleElement?.getAttribute('href') || '';
          
          return {
            rank: index + 1,
            page: 1,
            position: index + 1,
            title,
            url,
            metadata: {
              snippet: el.querySelector('.dsc_txt_wrap')?.textContent?.trim() || '',
              date: el.querySelector('.date')?.textContent?.trim() || ''
            }
          };
        });
      }, config.query);

      // If we have a target URL, find its ranking
      if (config.target && results.length > 0) {
        const targetResult = results.find(r => r.url.includes(config.target));
        if (targetResult) {
          return {
            success: true,
            data: targetResult,
            timestamp: new Date()
          };
        }
      }

      // Return first result if no specific target
      return {
        success: true,
        data: results[0] || {
          rank: null,
          page: 1,
          position: null,
          metadata: { message: 'No results found' }
        },
        timestamp: new Date()
      };

    } catch (error) {
      return {
        success: false,
        error: `Blog scraping failed: ${error}`,
        timestamp: new Date()
      };
    }
  }

  private async scrapeShoppingRanking(page: Page, config: ScrapingConfig): Promise<ScrapingResult> {
    try {
      // 네이버 쇼핑 검색 결과에서 상품 순위 찾기
      const results = await page.$$eval('.basicList_info_area__17Xyo', (elements) => {
        return elements.map((el, index) => {
          const titleElement = el.querySelector('.basicList_title__3P9Q7 a');
          const priceElement = el.querySelector('.price_num__2WUXn');
          const title = titleElement?.textContent?.trim() || '';
          const url = titleElement?.getAttribute('href') || '';
          const price = priceElement?.textContent?.trim() || '';
          
          return {
            rank: index + 1,
            page: 1,
            position: index + 1,
            title,
            url: url.startsWith('http') ? url : `https://shopping.naver.com${url}`,
            metadata: {
              price,
              seller: el.querySelector('.basicList_mall__sbVax')?.textContent?.trim() || '',
              rating: el.querySelector('.basicList_star__3nkBp')?.textContent?.trim() || ''
            }
          };
        });
      });

      // If we have a target, find its ranking
      if (config.target && results.length > 0) {
        const targetResult = results.find(r => 
          r.title.includes(config.target) || r.url.includes(config.target)
        );
        if (targetResult) {
          return {
            success: true,
            data: targetResult,
            timestamp: new Date()
          };
        }
      }

      // Return first result if no specific target
      return {
        success: true,
        data: results[0] || {
          rank: null,
          page: 1,
          position: null,
          metadata: { message: 'No results found' }
        },
        timestamp: new Date()
      };

    } catch (error) {
      return {
        success: false,
        error: `Shopping scraping failed: ${error}`,
        timestamp: new Date()
      };
    }
  }

  private getSortParam(sort?: string): string {
    const sortMap: Record<string, string> = {
      'popularity': '&sort=pop',
      'review': '&sort=review',
      'rating': '&sort=satisfaction',
      'price_asc': '&sort=price_asc',
      'price_desc': '&sort=price_desc',
      'recent': '&sort=recent'
    };
    return sort ? (sortMap[sort] || '') : '';
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.isInitialized = false;
    }
  }

  // Health check method
  async healthCheck(): Promise<{ 
    status: string; 
    browser: boolean; 
    initialized: boolean;
    cacheStats: { size: number };
    rateLimitStats: { activeKeys: number };
    timestamp: Date 
  }> {
    return {
      status: this.isInitialized ? 'healthy' : 'not_initialized',
      browser: this.browser !== null,
      initialized: this.isInitialized,
      cacheStats: {
        size: (this.cache as any).cache?.size || 0
      },
      rateLimitStats: {
        activeKeys: (this.rateLimiter as any).requests?.size || 0
      },
      timestamp: new Date()
    };
  }

  // Batch scraping with Promise.allSettled to prevent single failures from breaking entire batch
  async batchScrapeRanking(configs: ScrapingConfig[]): Promise<{
    results: (ScrapingResult & { targetId?: string })[];
    successCount: number;
    totalCount: number;
  }> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    console.log(`[ScrapingService] Starting batch scraping for ${configs.length} targets`);
    
    // Use Promise.allSettled to prevent single failures from breaking the batch
    const promises = configs.map(async (config, index) => {
      try {
        console.log(`[ScrapingService] Processing target ${index + 1}/${configs.length}: ${config.query} (${config.kind})`);
        const result = await this.scrapeRanking(config);
        
        return {
          ...result,
          targetId: (config as any).targetId, // Pass through targetId if provided
        };
      } catch (error) {
        console.error(`[ScrapingService] Target ${index + 1} failed:`, error);
        return {
          success: false,
          error: `Scraping failed: ${error instanceof Error ? error.message : String(error)}`,
          timestamp: new Date(),
          targetId: (config as any).targetId,
        };
      }
    });

    const results = await Promise.allSettled(promises);
    
    // Extract results from Promise.allSettled
    const scrapingResults = results.map((result, index) => {
      if (result.status === 'fulfilled') {
        return result.value;
      } else {
        console.error(`[ScrapingService] Promise rejected for target ${index + 1}:`, result.reason);
        return {
          success: false,
          error: `Promise failed: ${result.reason instanceof Error ? result.reason.message : String(result.reason)}`,
          timestamp: new Date(),
          targetId: (configs[index] as any).targetId,
        };
      }
    });

    const successCount = scrapingResults.filter(r => r.success).length;
    console.log(`[ScrapingService] Batch completed: ${successCount}/${configs.length} successful`);

    return {
      results: scrapingResults,
      successCount,
      totalCount: configs.length,
    };
  }
}

// Singleton instance
export const scrapingService = new WebScrapingService();

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('Shutting down scraping service...');
  await scrapingService.close();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('Shutting down scraping service...');
  await scrapingService.close();
  process.exit(0);
});