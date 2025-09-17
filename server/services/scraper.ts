import fetch from 'node-fetch';
import { XMLParser } from 'fast-xml-parser';

export interface ScrapedPost {
  title: string;
  url: string;
  publishedAt?: Date;
}

interface RSSItem {
  title: string;
  link: string;
  pubDate?: string;
  description?: string;
}

interface RSSFeed {
  rss?: {
    channel?: {
      item?: RSSItem | RSSItem[];
    };
  };
}

export class BlogScraper {
  private userAgent = 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_7_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.2 Mobile/15E148 Safari/604.1';
  private xmlParser = new XMLParser({
    ignoreAttributes: false,
    parseAttributeValue: true,
    trimValues: true
  });

  // REMOVED: No more seed blogs - only real search results

  /**
   * Extract blog ID from blog URL - handles PostView.nhn URLs correctly
   */
  private extractBlogId(blogUrl: string): string | null {
    try {
      const url = new URL(blogUrl);
      
      // Handle PostView.nhn or PostView.naver URLs with blogId parameter
      if (url.pathname.includes('PostView.nhn') || url.pathname.includes('PostView.naver') ||
          url.pathname.includes('PostList.nhn') || url.pathname.includes('PostList.naver')) {
        const blogId = url.searchParams.get('blogId');
        if (blogId) {
          console.log(`🔍 Extracted blogId from URL params: ${blogId}`);
          return blogId;
        }
      }
      
      // Handle regular blog URLs: blog.naver.com/blogId or blog.naver.com/blogId/postId
      const pathMatch = url.pathname.match(/^\/([^/]+)/);
      if (pathMatch && pathMatch[1] !== 'PostView.nhn' && pathMatch[1] !== 'PostView.naver' &&
          pathMatch[1] !== 'PostList.nhn' && pathMatch[1] !== 'PostList.naver') {
        const blogId = pathMatch[1];
        console.log(`🔍 Extracted blogId from path: ${blogId}`);
        return blogId;
      }
      
      console.log(`❌ Could not extract blogId from URL: ${blogUrl}`);
      return null;
    } catch (error) {
      console.error(`❌ Error parsing blog URL ${blogUrl}:`, error);
      return null;
    }
  }

  /**
   * Convert to mobile blog URL
   */
  private convertToMobileBlogUrl(url: string): string {
    return url.replace('https://blog.naver.com', 'https://m.blog.naver.com');
  }

  /**
   * Try RSS feed first, then fall back to HTTP scraping
   */
  async scrapeBlogPosts(blogUrl: string, limit = 10): Promise<ScrapedPost[]> {
    console.log(`🔍 [SCRAPER] Starting blog post collection from: ${blogUrl}`);
    
    const blogId = this.extractBlogId(blogUrl);
    if (!blogId) {
      console.log(`❌ [SCRAPER] Could not extract blog ID from ${blogUrl}`);
      return []; // Return empty instead of fake posts
    }

    console.log(`🆔 [SCRAPER] Successfully extracted blogId: ${blogId} from ${blogUrl}`);

    // Step 1: Try RSS feed first (PRIORITY)
    console.log(`📡 [SCRAPER] Attempting RSS feed for blog: ${blogId}`);
    const rssPosts = await this.tryRssFeed(blogId, limit);
    
    if (rssPosts.length >= 3) {
      console.log(`✅ [SCRAPER] RSS successful: ${rssPosts.length} posts collected from ${blogUrl}`);
      console.log(`📋 [SCRAPER] RSS post titles: ${rssPosts.map(p => p.title).join(' | ')}`);
      return rssPosts;
    }

    // Step 2: Fallback to HTTP scraping of mobile blog
    console.log(`🔄 [SCRAPER] RSS failed (${rssPosts.length} posts), falling back to HTTP scraping`);
    const httpPosts = await this.tryHttpScraping(blogUrl, limit);
    
    // Combine results, RSS first
    const combinedPosts = [...rssPosts, ...httpPosts];
    const uniquePosts = this.deduplicatePosts(combinedPosts);
    let finalPosts = uniquePosts.slice(0, limit);
    
    // Return whatever we found - no fake posts
    if (finalPosts.length < 3) {
      console.log(`⚠️ [SCRAPER] Only ${finalPosts.length} posts found from ${blogUrl}, insufficient for analysis`);
    }
    
    console.log(`📊 [SCRAPER] Final result for ${blogUrl}: ${finalPosts.length} posts (RSS: ${rssPosts.length}, HTTP: ${httpPosts.length})`);
    
    if (finalPosts.length > 0) {
      console.log(`📋 [SCRAPER] Final post titles: ${finalPosts.slice(0, 3).map(p => p.title).join(' | ')}${finalPosts.length > 3 ? ` + ${finalPosts.length - 3} more` : ''}`);
    }
    
    return finalPosts;
  }

  /**
   * Try to get posts from RSS feed
   */
  private async tryRssFeed(blogId: string, limit: number): Promise<ScrapedPost[]> {
    try {
      const rssUrl = `https://rss.blog.naver.com/${blogId}.xml`;
      console.log(`📡 Fetching RSS: ${rssUrl}`);
      
      const response = await fetch(rssUrl, {
        headers: {
          'User-Agent': this.userAgent,
          'Accept': 'application/rss+xml, application/xml, text/xml',
          'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
          'Referer': `https://blog.naver.com/${blogId}`,
        }
      });

      if (!response.ok) {
        console.log(`⚠️ RSS response not ok: ${response.status} ${response.statusText} for ${rssUrl}`);
        console.log(`📝 Response headers:`, Object.fromEntries(response.headers.entries()));
        return [];
      }

      const xmlText = await response.text();
      console.log(`📄 RSS XML received: ${xmlText.length} characters`);
      
      const feedData = this.xmlParser.parse(xmlText) as RSSFeed;
      const channel = feedData.rss?.channel;
      
      if (!channel || !channel.item) {
        console.log(`⚠️ No RSS items found in feed for ${blogId}`);
        return [];
      }

      const items = Array.isArray(channel.item) ? channel.item : [channel.item];
      const posts: ScrapedPost[] = [];
      
      for (const item of items.slice(0, limit)) {
        if (item.title && item.link) {
          const post: ScrapedPost = {
            title: this.cleanTitle(item.title),
            url: item.link,
            publishedAt: item.pubDate ? new Date(item.pubDate) : undefined
          };
          
          if (this.isValidPost(post)) {
            posts.push(post);
          }
        }
      }
      
      console.log(`✅ RSS parsing successful: ${posts.length} valid posts extracted`);
      return posts;
      
    } catch (error) {
      console.log(`❌ RSS failed for ${blogId}:`, error instanceof Error ? error.message : 'Unknown error');
      return [];
    }
  }

  /**
   * Try HTTP scraping of mobile blog page
   */
  private async tryHttpScraping(blogUrl: string, limit: number): Promise<ScrapedPost[]> {
    try {
      const mobileUrl = this.convertToMobileBlogUrl(blogUrl);
      console.log(`🌐 Fetching mobile blog: ${mobileUrl}`);
      
      const response = await fetch(mobileUrl, {
        headers: {
          'User-Agent': this.userAgent,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
          'Accept-Encoding': 'gzip, deflate, br',
          'Referer': 'https://m.blog.naver.com/',
        }
      });

      if (!response.ok) {
        console.log(`⚠️ HTTP response not ok: ${response.status} for ${mobileUrl}`);
        return [];
      }

      const html = await response.text();
      console.log(`📄 HTTP HTML received: ${html.length} characters`);
      
      const posts = this.parsePostsFromMobileHTML(html, mobileUrl);
      console.log(`✅ HTTP parsing result: ${posts.length} posts extracted`);
      
      return posts.slice(0, limit);
      
    } catch (error) {
      console.log(`❌ HTTP scraping failed for ${blogUrl}:`, error instanceof Error ? error.message : 'Unknown error');
      return [];
    }
  }

  /**
   * Parse posts from mobile HTML page
   */
  private parsePostsFromMobileHTML(html: string, baseUrl: string): ScrapedPost[] {
    const posts: ScrapedPost[] = [];
    const foundUrls = new Set<string>();
    
    // Multiple parsing strategies for mobile blog layouts
    const strategies = [
      this.parseStrategy1.bind(this),
      this.parseStrategy2.bind(this),
      this.parseStrategy3.bind(this)
    ];
    
    for (const strategy of strategies) {
      const strategyPosts = strategy(html, baseUrl, foundUrls);
      posts.push(...strategyPosts);
      
      if (posts.length >= 10) break;
    }
    
    return posts
      .filter(post => this.isValidPost(post))
      .slice(0, 15);
  }

  /**
   * Strategy 1: Look for PostView links
   */
  private parseStrategy1(html: string, baseUrl: string, foundUrls: Set<string>): ScrapedPost[] {
    const posts: ScrapedPost[] = [];
    const postLinkRegex = /href="([^"]*(?:PostView|postView)[^"]*)"/g;
    
    let match;
    while ((match = postLinkRegex.exec(html)) !== null && posts.length < 10) {
      let postUrl = match[1];
      
      if (postUrl.startsWith('/')) {
        postUrl = 'https://m.blog.naver.com' + postUrl;
      } else if (postUrl.startsWith('?')) {
        postUrl = baseUrl + postUrl;
      }
      
      if (foundUrls.has(postUrl)) continue;
      foundUrls.add(postUrl);
      
      const title = this.extractTitleFromContext(html, match.index!);
      posts.push({
        url: postUrl,
        title: title,
        publishedAt: undefined
      });
    }
    
    return posts;
  }

  /**
   * Strategy 2: Look for title elements and nearby links
   */
  private parseStrategy2(html: string, baseUrl: string, foundUrls: Set<string>): ScrapedPost[] {
    const posts: ScrapedPost[] = [];
    const titlePatterns = [
      /<a[^>]*>([^<]{10,80})<\/a>/g,
      /<h[1-6][^>]*>([^<]+)<\/h[1-6]>/g,
    ];
    
    for (const pattern of titlePatterns) {
      let match;
      while ((match = pattern.exec(html)) !== null && posts.length < 5) {
        const title = this.cleanTitle(match[1]);
        
        if (this.isValidTitle(title)) {
          const context = html.slice(Math.max(0, match.index! - 150), Math.min(html.length, match.index! + 150));
          const urlMatch = context.match(/href="([^"]*blog\.naver\.com[^"]*(?:PostView|postView)[^"]*)"/);
          
          if (urlMatch && !foundUrls.has(urlMatch[1])) {
            foundUrls.add(urlMatch[1]);
            posts.push({
              url: urlMatch[1],
              title: title,
              publishedAt: undefined
            });
          }
        }
      }
    }
    
    return posts;
  }

  /**
   * Strategy 3: Fallback - extract any blog URLs
   */
  private parseStrategy3(html: string, baseUrl: string, foundUrls: Set<string>): ScrapedPost[] {
    const posts: ScrapedPost[] = [];
    const fallbackRegex = /https:\/\/(?:m\.)?blog\.naver\.com\/[^\s"'<>]+(?:PostView|postView)[^\s"'<>]*/g;
    
    let match;
    while ((match = fallbackRegex.exec(html)) !== null && posts.length < 3) {
      const url = match[0];
      if (!foundUrls.has(url)) {
        foundUrls.add(url);
        
        const blogIdMatch = url.match(/blog\.naver\.com\/([^\/]+)/);
        const blogId = blogIdMatch ? blogIdMatch[1] : 'blog';
        
        posts.push({
          url: url,
          title: `${blogId} 블로그 포스트`,
          publishedAt: undefined
        });
      }
    }
    
    return posts;
  }

  /**
   * Extract title from HTML context around a match
   */
  private extractTitleFromContext(html: string, index: number): string {
    const context = html.slice(Math.max(0, index - 200), Math.min(html.length, index + 200));
    
    const titlePatterns = [
      />([^<>{|}]{15,100})</g,
      /title="([^"]{10,80})"/g,
      /alt="([^"]{10,80})"/g,
    ];
    
    for (const pattern of titlePatterns) {
      const matches = Array.from(context.matchAll(pattern));
      for (const match of matches) {
        const candidate = this.cleanTitle(match[1]);
        if (this.isValidTitle(candidate)) {
          return candidate;
        }
      }
    }
    
    return '블로그 포스트';
  }

  /**
   * Clean and normalize title text
   */
  private cleanTitle(title: string): string {
    return title
      .replace(/<[^>]*>/g, '') // Remove HTML tags
      .replace(/&[a-zA-Z]+;/g, ' ') // Remove HTML entities
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Check if title is valid
   */
  private isValidTitle(title: string): boolean {
    if (!title || title.length < 5 || title.length > 200) return false;
    
    const blacklist = [
      'naver', 'blog', 'post', 'view', '더보기', '이전', '다음',
      'http', 'www', '.com', '댓글', '좋아요', '공유'
    ];
    
    const lowerTitle = title.toLowerCase();
    for (const banned of blacklist) {
      if (lowerTitle.includes(banned)) return false;
    }
    
    return /[가-힣]/.test(title) || (/\d/.test(title) && /[a-zA-Z]/.test(title));
  }

  /**
   * Check if post is valid
   */
  private isValidPost(post: ScrapedPost): boolean {
    return this.isValidTitle(post.title) && post.url.length > 10;
  }

  /**
   * Remove duplicate posts based on URL
   */
  private deduplicatePosts(posts: ScrapedPost[]): ScrapedPost[] {
    const seen = new Set<string>();
    return posts.filter(post => {
      if (seen.has(post.url)) return false;
      seen.add(post.url);
      return true;
    });
  }

  // REMOVED: createFallbackPosts() - NO MORE FAKE POSTS
}

export const scraper = new BlogScraper();