import fetch from 'node-fetch';

export interface SerpResult {
  url: string;
  title: string;
  snippet: string;
  rank: number;
}

class SerpScraper {
  private userAgent = 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_7_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.2 Mobile/15E148 Safari/604.1';

  /**
   * Search for blogs ranking in specific positions for a keyword on mobile Naver
   */
  async searchKeywordOnMobileNaver(keyword: string, minRank: number, maxRank: number): Promise<SerpResult[]> {
    try {
      const searchUrl = `https://m.search.naver.com/search.naver?query=${encodeURIComponent(keyword)}`;
      
      console.log(`Fetching search results for "${keyword}" from ${searchUrl}`);
      
      const response = await fetch(searchUrl, {
        headers: {
          'User-Agent': this.userAgent,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
          'Accept-Encoding': 'gzip, deflate, br',
          'DNT': '1',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1',
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const html = await response.text();
      console.log(`Retrieved HTML content (${html.length} chars) for keyword "${keyword}"`);
      
      // Parse HTML to extract blog results
      const results = this.parseNaverSearchResults(html, keyword, minRank, maxRank);
      
      console.log(`Found ${results.length} blog results for "${keyword}" in ranks ${minRank}-${maxRank}`);
      return results;
      
    } catch (error) {
      console.error(`Error searching for keyword "${keyword}":`, error);
      return [];
    }
  }

  /**
   * Check if a blog URL ranks for a specific keyword in mobile Naver search
   */
  async checkKeywordRankingInMobileNaver(keyword: string, blogUrl: string): Promise<number | null> {
    try {
      const searchUrl = `https://m.search.naver.com/search.naver?query=${encodeURIComponent(keyword)}`;
      
      const response = await fetch(searchUrl, {
        headers: {
          'User-Agent': this.userAgent,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const html = await response.text();
      
      // Parse HTML to find the blog URL
      const rank = this.findBlogRankInResults(html, blogUrl);
      
      if (rank) {
        console.log(`Found blog "${blogUrl}" at rank ${rank} for keyword "${keyword}"`);
        return rank;
      }

      console.log(`Blog "${blogUrl}" not found in top 20 results for keyword "${keyword}"`);
      return null;
      
    } catch (error) {
      console.error(`Error checking ranking for keyword "${keyword}" and blog "${blogUrl}":`, error);
      return null;
    }
  }

  /**
   * Parse Naver search results HTML to extract blog information
   */
  private parseNaverSearchResults(html: string, keyword: string, minRank: number, maxRank: number): SerpResult[] {
    const results: SerpResult[] = [];
    
    // Look for blog.naver.com URLs in the HTML
    // Use regex to find patterns like: href="https://blog.naver.com/userid/postid"
    const blogUrlRegex = /href="(https:\/\/blog\.naver\.com\/[^"]+)"/g;
    const titleRegex = /<a[^>]*href="https:\/\/blog\.naver\.com\/[^"]+[^>]*>([^<]+)<\/a>/g;
    
    let match;
    let rank = 0;
    const foundUrls = new Set<string>(); // Prevent duplicates
    
    // Extract blog URLs
    while ((match = blogUrlRegex.exec(html)) !== null && rank < 20) {
      const url = match[1];
      
      // Skip duplicates
      if (foundUrls.has(url)) continue;
      foundUrls.add(url);
      
      rank++;
      
      // Only include results within specified rank range
      if (rank < minRank || rank > maxRank) {
        continue;
      }
      
      // Try to extract title (this is a simplified approach)
      let title = `${keyword} 관련 블로그 포스트`;
      const titleMatch = html.match(new RegExp(`<a[^>]*href="${url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^>]*>([^<]+)<\/a>`));
      if (titleMatch) {
        title = titleMatch[1].trim();
      }
      
      results.push({
        url,
        title,
        snippet: `${keyword}에 대한 유용한 정보를 담고 있는 블로그 포스트입니다.`,
        rank
      });
    }
    
    // If no results found through regex (due to HTML structure changes), 
    // fall back to simpler pattern matching
    if (results.length === 0) {
      const simpleUrlRegex = /blog\.naver\.com\/[a-zA-Z0-9_-]+\/\d+/g;
      let urlMatch;
      let fallbackRank = 0;
      
      while ((urlMatch = simpleUrlRegex.exec(html)) !== null && fallbackRank < 5) {
        fallbackRank++;
        
        if (fallbackRank >= minRank && fallbackRank <= maxRank) {
          results.push({
            url: `https://${urlMatch[0]}`,
            title: `${keyword} 관련 정보`,
            snippet: `${keyword}에 대한 블로그 포스트입니다.`,
            rank: fallbackRank + 1 // Start from rank 2
          });
        }
      }
    }
    
    return results;
  }

  /**
   * Find the rank of a specific blog URL in search results
   */
  private findBlogRankInResults(html: string, targetUrl: string): number | null {
    const blogUrlRegex = /href="(https:\/\/blog\.naver\.com\/[^"]+)"/g;
    let match;
    let rank = 0;
    const foundUrls = new Set<string>();
    
    while ((match = blogUrlRegex.exec(html)) !== null && rank < 20) {
      const url = match[1];
      
      if (foundUrls.has(url)) continue;
      foundUrls.add(url);
      
      rank++;
      
      if (url === targetUrl || url.includes(targetUrl.split('/').pop() || '')) {
        return rank;
      }
    }
    
    return null;
  }

  /**
   * Add delay between requests to avoid being blocked
   */
  async sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export const serpScraper = new SerpScraper();