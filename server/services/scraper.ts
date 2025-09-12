import { chromium, Browser, Page } from 'playwright';

export interface ScrapedPost {
  title: string;
  url: string;
  publishedAt?: Date;
}

export class BlogScraper {
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

  private async createPage(): Promise<Page> {
    if (!this.browser) {
      await this.init();
    }
    
    const page = await this.browser!.newPage({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      extraHTTPHeaders: {
        'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
        'Referer': 'https://blog.naver.com/',
      }
    });

    return page;
  }

  private convertToMobileBlogUrl(url: string): string {
    // Convert desktop blog URL to mobile version for better scraping
    return url.replace('https://blog.naver.com', 'https://m.blog.naver.com');
  }

  async scrapeBlogPosts(blogUrl: string, limit = 15): Promise<ScrapedPost[]> {
    const page = await this.createPage();
    const mobileUrl = this.convertToMobileBlogUrl(blogUrl);
    
    try {
      console.log(`Scraping blog posts from: ${mobileUrl}`);
      
      await page.goto(mobileUrl, { 
        waitUntil: 'networkidle',
        timeout: 30000 
      });

      // Wait for posts to load
      await page.waitForSelector('a[href*="PostView"], a[href*="/PostView"]', { 
        timeout: 10000 
      }).catch(() => {
        console.log('No posts selector found, continuing...');
      });

      const posts: ScrapedPost[] = [];
      
      // Scroll to load more posts
      for (let i = 0; i < 5 && posts.length < limit; i++) {
        await page.evaluate(() => {
          window.scrollBy(0, document.body.scrollHeight);
        });
        
        await page.waitForTimeout(1000 + Math.random() * 1000); // Random delay 1-2s
        
        // Extract post links and titles
        const newPosts = await page.evaluate((currentCount, maxPosts) => {
          const links = document.querySelectorAll('a[href*="PostView"], a[href*="/PostView"]');
          const posts: { title: string; url: string }[] = [];
          
          for (let i = currentCount; i < Math.min(links.length, maxPosts); i++) {
            const link = links[i] as HTMLAnchorElement;
            const title = link.textContent?.trim() || link.querySelector('h3, [class*="title"]')?.textContent?.trim();
            
            if (title && title.length > 5) { // Filter out very short titles
              posts.push({
                title: title.replace(/\n/g, ' ').trim(),
                url: link.href,
              });
            }
          }
          
          return posts;
        }, posts.length, limit);

        posts.push(...newPosts);
        
        if (newPosts.length === 0) {
          break; // No new posts found
        }
      }

      // Remove duplicates
      const uniquePosts = posts.filter((post, index, self) => 
        self.findIndex(p => p.url === post.url) === index
      );

      console.log(`Scraped ${uniquePosts.length} posts from ${blogUrl}`);
      return uniquePosts.slice(0, limit);
      
    } catch (error) {
      console.error('Error scraping blog posts:', error);
      throw error;
    } finally {
      await page.close();
    }
  }
}

export const scraper = new BlogScraper();

// Cleanup on process exit
process.on('exit', () => {
  scraper.close();
});

process.on('SIGINT', async () => {
  await scraper.close();
  process.exit(0);
});
