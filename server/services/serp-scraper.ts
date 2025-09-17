import fetch from 'node-fetch';
import { naverApi } from './naver-api';
import { searchBlogsWithHealth, checkKeywordRankingWithHealth } from './externals-health';
import { db } from '../db';

export interface SerpResult {
  url: string;
  title: string;
  snippet: string;
  rank: number;
}

class SerpScraper {
  private userAgent = 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_7_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.2 Mobile/15E148 Safari/604.1';

  /**
   * Search for blogs ranking in specific positions for a keyword
   * Uses REAL Naver mobile search
   */
  async searchKeywordOnMobileNaver(keyword: string, minRank: number, maxRank: number): Promise<SerpResult[]> {
    try {
      console.log(`🔍 Real Naver search for keyword "${keyword}" in ranks ${minRank}-${maxRank}`);
      
      // Step 1: Try Naver API first if available
      const apiResults = await this.tryNaverApi(keyword, minRank, maxRank);
      if (apiResults.length > 0) {
        console.log(`✅ Naver API successful: ${apiResults.length} results for "${keyword}"`);
        return apiResults;
      }
      
      // Step 2: Real mobile Naver search scraping (NO FALLBACK TO FAKE SEEDS)
      console.log(`🔄 Naver API not available, using REAL mobile Naver search for "${keyword}"`);
      const mobileResults = await this.scrapeRealNaverMobileSearch(keyword, minRank, maxRank);
      console.log(`📊 Real search results for "${keyword}": ${mobileResults.length} blogs found`);
      return mobileResults; // Return empty array if no results, DO NOT use fake seeds
      
    } catch (error) {
      console.error(`❌ Error searching for keyword "${keyword}":`, error);
      console.log(`🚫 No fake seeds used - returning empty results for "${keyword}"`);
      return []; // Return empty array instead of fake seeds
    }
  }

  /**
   * Check if a blog URL ranks for a specific keyword
   * Returns rank number or null (converted to "NA" in routes)
   */
  async checkKeywordRankingInMobileNaver(keyword: string, blogUrl: string): Promise<number | null> {
    try {
      console.log(`📊 Checking ranking for "${keyword}" from blog: ${blogUrl}`);
      
      // Try Naver API first if available (health-aware)
      const rank = await checkKeywordRankingWithHealth(db, keyword, blogUrl);
      if (rank !== null) {
        console.log(`✅ Found blog "${blogUrl}" at rank ${rank} for keyword "${keyword}"`);
        return rank;
      }
      
      // If API not available or blog not found, return null (will be converted to "NA")
      console.log(`⚠️ Blog "${blogUrl}" not found in rankings for keyword "${keyword}" - setting to NA`);
      return null;
      
    } catch (error) {
      console.error(`❌ Error checking ranking for keyword "${keyword}" and blog "${blogUrl}":`, error);
      // Return null to indicate NA ranking instead of failing the whole pipeline
      return null;
    }
  }

  /**
   * Try using Naver API to get search results
   */
  private async tryNaverApi(keyword: string, minRank: number, maxRank: number): Promise<SerpResult[]> {
    try {
      const searchResults = await searchBlogsWithHealth(db, keyword, 100); // Get more results to filter by rank (health-aware)
      const results: SerpResult[] = [];
      
      for (let i = 0; i < searchResults.length; i++) {
        const rank = i + 1;
        if (rank >= minRank && rank <= maxRank) {
          results.push({
            url: searchResults[i].link,
            title: searchResults[i].title.replace(/<[^>]*>/g, ''), // Remove HTML tags
            snippet: searchResults[i].description.replace(/<[^>]*>/g, ''),
            rank: rank
          });
        }
      }
      
      return results;
    } catch (error) {
      console.log(`⚠️ Naver API failed for keyword "${keyword}":`, error instanceof Error ? error.message : 'Unknown error');
      return [];
    }
  }

  // REMOVED: createSeedResults() - NO MORE FAKE SEEDS

  /**
   * Scrape real Naver mobile search for blog results
   */
  private async scrapeRealNaverMobileSearch(keyword: string, minRank: number, maxRank: number): Promise<SerpResult[]> {
    try {
      const encodedKeyword = encodeURIComponent(keyword);
      const searchUrl = `https://m.search.naver.com/search.naver?query=${encodedKeyword}&sm=mtb_hty.top&where=m_blog&oquery=${encodedKeyword}&tqi=ixVrRspzLjGssOKsyqssssssslV-345653`;
      
      console.log(`🌐 Fetching search results for "${keyword}" from ${searchUrl}`);
      
      const response = await fetch(searchUrl, {
        headers: {
          'User-Agent': this.userAgent,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
          'Accept-Encoding': 'gzip, deflate, br',
          'Referer': 'https://m.naver.com/',
          'Cache-Control': 'no-cache',
        }
      });
      
      if (!response.ok) {
        console.log(`⚠️ Search response not ok: ${response.status}`);
        return [];
      }
      
      const html = await response.text();
      console.log(`📄 Retrieved HTML content (${html.length} chars) for keyword "${keyword}"`);
      
      return this.parseNaverMobileSearchResults(html, keyword, minRank, maxRank);
      
    } catch (error) {
      console.log(`❌ Real mobile search failed for "${keyword}":`, error instanceof Error ? error.message : 'Unknown error');
      return [];
    }
  }
  
  /**
   * Parse Naver mobile search results HTML
   */
  private parseNaverMobileSearchResults(html: string, keyword: string, minRank: number, maxRank: number): SerpResult[] {
    const results: SerpResult[] = [];
    const foundUrls = new Set<string>();
    
    // STOP_TEXTS sentinel: 서치피드 진입 전에서 종료
    const STOP_TEXTS = [
      "검색결과 더보기",                                 // 더보기 버튼
      "서치피드에서 더 다양한 콘텐츠를 탐색해보세요",     // 서치피드 안내
    ];
    
    // HTML에서 가장 먼저 나타나는 sentinel 찾기 (earliest-stop)
    const stopIndices = STOP_TEXTS.map(stopText => ({
      text: stopText,
      index: html.indexOf(stopText)
    })).filter(item => item.index !== -1);
    
    let scanableHtml = html;
    if (stopIndices.length > 0) {
      // 가장 먼저 나타나는 sentinel 선택
      const earliestStop = stopIndices.reduce((earliest, current) => 
        current.index < earliest.index ? current : earliest
      );
      scanableHtml = html.substring(0, earliestStop.index);
      console.log(`🛑 [Mobile Sentinel] Found "${earliestStop.text}" at position ${earliestStop.index}, limiting scan to ${scanableHtml.length} chars`);
    }
    
    // Multiple parsing strategies for Naver mobile search
    const blogUrlRegex = /https:\/\/blog\.naver\.com\/[^\s"'<>\)\]]+/g;
    const blogMatches = Array.from(scanableHtml.matchAll(blogUrlRegex));
    
    let currentRank = 1;
    
    for (const match of blogMatches) {
      const blogUrl = match[0];
      
      // Skip duplicates
      if (foundUrls.has(blogUrl)) continue;
      foundUrls.add(blogUrl);
      
      // Check if this rank is in our target range
      if (currentRank >= minRank && currentRank <= maxRank) {
        // Extract blog ID and title from context
        const blogIdMatch = blogUrl.match(/blog\.naver\.com\/([^\/\?]+)/);
        const blogId = blogIdMatch ? blogIdMatch[1] : 'blog';
        
        // Try to extract title from surrounding HTML context (within scanable area)
        const urlIndex = scanableHtml.indexOf(blogUrl);
        const contextStart = Math.max(0, urlIndex - 500);
        const contextEnd = Math.min(scanableHtml.length, urlIndex + 500);
        const context = scanableHtml.slice(contextStart, contextEnd);
        
        let title = this.extractTitleFromSearchContext(context, blogId, keyword);
        let snippet = this.extractSnippetFromSearchContext(context, keyword);
        
        results.push({
          url: blogUrl,
          title: title,
          snippet: snippet,
          rank: currentRank
        });
        
        console.log(`📍 Found blog at rank ${currentRank}: ${blogUrl} - ${title}`);
      }
      
      currentRank++;
      
      // Stop after collecting enough results
      if (currentRank > maxRank) break;
    }
    
    console.log(`🎯 Found ${results.length} blog results for "${keyword}" in ranks ${minRank}-${maxRank}`);
    return results;
  }
  
  /**
   * Extract title from search result context
   */
  private extractTitleFromSearchContext(context: string, blogId: string, keyword: string): string {
    // Try multiple title extraction patterns
    const titlePatterns = [
      /<[^>]*title[^>]*['"]([^'"]{10,80})['"][^>]*>/gi,
      /<[^>]*>([^<]{10,80}[가-힣][^<]{0,40})<\/[^>]*>/g,
      />([^<]{15,80}[가-힣][^<]{0,20})</g,
    ];
    
    for (const pattern of titlePatterns) {
      const matches = Array.from(context.matchAll(pattern));
      for (const match of matches) {
        const candidate = match[1].trim();
        if (this.isValidSearchTitle(candidate, keyword)) {
          return candidate;
        }
      }
    }
    
    // Fallback title
    return `${blogId}의 ${keyword} 관련 블로그`;
  }
  
  /**
   * Extract snippet from search result context
   */
  private extractSnippetFromSearchContext(context: string, keyword: string): string {
    // Look for text content that might be description
    const textPattern = />([^<]{20,150}[가-힣][^<]{0,50})</g;
    const textMatches = Array.from(context.matchAll(textPattern));
    
    if (textMatches.length > 0) {
      for (const match of textMatches) {
        const text = match[1].trim();
        if (text.includes(keyword) || text.length > 30) {
          return text.slice(0, 100) + (text.length > 100 ? '...' : '');
        }
      }
    }
    
    return `${keyword}에 대한 유용한 정보와 경험을 공유하는 블로그입니다.`;
  }
  
  /**
   * Validate extracted search title
   */
  private isValidSearchTitle(title: string, keyword: string): boolean {
    if (!title || title.length < 5 || title.length > 150) return false;
    
    // Skip generic/spam titles
    const blacklist = ['naver', 'blog', 'post', 'view', 'http', 'www', '.com'];
    const lowerTitle = title.toLowerCase();
    
    for (const banned of blacklist) {
      if (lowerTitle.includes(banned)) return false;
    }
    
    // Must contain Korean characters or be related to keyword
    return /[가-힣]/.test(title) || title.includes(keyword);
  }
  
  /**
   * Add delay between requests to avoid being blocked
   */
  async sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export const serpScraper = new SerpScraper();