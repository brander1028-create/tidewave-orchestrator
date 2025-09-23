import fetch from 'node-fetch';

const NAVER_CLIENT_ID = process.env.NAVER_CLIENT_ID || process.env.NAVER_OPENAPI_ID;
const NAVER_CLIENT_SECRET = process.env.NAVER_CLIENT_SECRET || process.env.NAVER_OPENAPI_SECRET;

export interface NaverBlogSearchResult {
  title: string;
  link: string;
  description: string;
  bloggername: string;
  bloggerlink: string;
  postdate: string;
  isInfluencer?: boolean; // 인플루언서 여부 추가
}

export class NaverApiService {
  private headers: Record<string, string> | null = null;

  constructor() {
    if (NAVER_CLIENT_ID && NAVER_CLIENT_SECRET) {
      this.headers = {
        'X-Naver-Client-Id': NAVER_CLIENT_ID,
        'X-Naver-Client-Secret': NAVER_CLIENT_SECRET,
      };
    } else {
      console.warn('Naver API credentials not found. API features will be disabled.');
    }
  }

  async searchBlogs(query: string, display = 10, sort = 'sim'): Promise<NaverBlogSearchResult[]> {
    if (!this.headers) {
      console.warn('Naver API not configured. Returning empty results.');
      return [];
    }

    const url = `https://openapi.naver.com/v1/search/blog.json`;
    const params = new URLSearchParams({
      query,
      display: display.toString(),
      sort,
    });

    try {
      const response = await fetch(`${url}?${params}`, {
        headers: this.headers,
      });

      if (!response.ok) {
        throw new Error(`Naver API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json() as any;
      const items: NaverBlogSearchResult[] = data.items || [];
      
      // 각 결과에 인플루언서 여부 추가
      return items.map(item => ({
        ...item,
        isInfluencer: this.isInfluencerUrl(item.link || item.bloggerlink)
      }));
    } catch (error) {
      console.error('Error searching blogs:', error);
      throw error;
    }
  }

  async checkKeywordRanking(keyword: string, blogUrl: string): Promise<number | null> {
    if (!this.headers) {
      console.warn('Naver API not configured. Cannot check ranking.');
      return null;
    }

    try {
      const results = await this.searchBlogs(keyword, 100);
      
      // Extract blog ID from the target URL for more accurate matching
      const targetBlogId = this.extractBlogId(blogUrl);
      if (!targetBlogId) {
        console.warn(`Could not extract blog ID from URL: ${blogUrl}`);
        return null;
      }
      
      for (let i = 0; i < results.length; i++) {
        const result = results[i];
        const resultBlogId = this.extractBlogId(result.link);
        
        // More precise matching: compare blog IDs and verify content similarity
        if (resultBlogId === targetBlogId) {
          // Enhanced verification logic
          const targetPostId = this.extractPostId(blogUrl);
          const resultPostId = this.extractPostId(result.link);
          
          // Strong match: same blog ID + same post ID
          if (targetPostId && resultPostId && targetPostId === resultPostId) {
            console.log(`🎯 Perfect match found: Blog "${targetBlogId}" post "${targetPostId}" at rank ${i + 1} for keyword "${keyword}"`);
            return i + 1;
          }
          
          // Fallback: same blog ID + content similarity check
          const contentSimilarity = this.checkContentSimilarity(blogUrl, result);
          if (contentSimilarity > 0.3) { // Lowered threshold for blog ID matches
            console.log(`🎯 Blog match found: Blog "${targetBlogId}" at rank ${i + 1} for keyword "${keyword}" (similarity: ${contentSimilarity.toFixed(2)})`);
            return i + 1;
          } else {
            console.log(`⚠️ Blog ID match but low content similarity: ${contentSimilarity.toFixed(2)} for "${targetBlogId}" - posts may differ`);
          }
        }
      }
      
      return null; // Not found in top 100
    } catch (error) {
      console.error('Error checking keyword ranking:', error);
      return null;
    }
  }

  // Blog ID extraction logging rate limiter
  private static blogIdLogCount = 0;
  
  private logBlogIdOnce(id: string, url: string) {
    NaverApiService.blogIdLogCount++;
    if (NaverApiService.blogIdLogCount <= 10 || NaverApiService.blogIdLogCount % 20 === 0) {
      console.log(`📝 Extracted blogId: ${id} from ${url}`);
    }
  }

  // Extract blog ID from Naver blog URL (supports multiple formats)
  private extractBlogId(url: string): string | null {
    try {
      const urlObj = new URL(url);
      let hostname = urlObj.hostname;
      
      // Normalize hostname (strip leading "m." for mobile)
      if (hostname.startsWith('m.')) {
        hostname = hostname.substring(2);
      }
      
      if (!hostname.endsWith('blog.naver.com')) {
        return null;
      }
      
      // Case 1: PostView.naver?blogId=xxx&logNo=123 or PostList.naver
      if (urlObj.pathname.includes('PostView.naver') || urlObj.pathname.includes('PostList.naver')) {
        const blogId = urlObj.searchParams.get('blogId');
        if (blogId) {
          this.logBlogIdOnce(blogId, url);
          return blogId;
        }
      }
      
      // Case 2: Path-based URLs blog.naver.com/{blogId}/...
      const pathParts = urlObj.pathname.split('/').filter(Boolean);
      if (pathParts.length > 0 && pathParts[0] !== 'PostView.naver' && pathParts[0] !== 'PostList.naver') {
        const blogId = pathParts[0];
        this.logBlogIdOnce(blogId, url);
        return blogId;
      }
      
      console.warn(`❌ Failed to extract blogId from URL: ${url}`);
      return null;
    } catch (error) {
      console.warn(`❌ Error parsing URL for blogId: ${url}`, error);
      return null;
    }
  }

  // Check content similarity for more accurate ranking verification
  private checkContentSimilarity(targetUrl: string, searchResult: any): number {
    try {
      // Basic similarity checks
      let similarity = 0;
      
      // Check if the URLs are exactly the same
      if (targetUrl === searchResult.link) {
        return 1.0; // Perfect match
      }
      
      // Check if it's the same post ID
      const targetPostId = this.extractPostId(targetUrl);
      const resultPostId = this.extractPostId(searchResult.link);
      if (targetPostId && resultPostId && targetPostId === resultPostId) {
        similarity += 0.8; // High similarity for same post
      }
      
      // Check title similarity (basic keyword overlap)
      if (searchResult.title) {
        const targetPath = new URL(targetUrl).pathname;
        const titleWords = searchResult.title.toLowerCase().split(/\s+/);
        const pathWords = targetPath.toLowerCase().split(/[\/\-_]/);
        const commonWords = titleWords.filter((word: string) => 
          pathWords.some((pathWord: string) => pathWord.includes(word) || word.includes(pathWord))
        );
        similarity += (commonWords.length / Math.max(titleWords.length, 1)) * 0.3;
      }
      
      return Math.min(similarity, 1.0);
    } catch {
      return 0.1; // Low similarity if comparison fails
    }
  }

  // Extract post ID from blog URL (supports multiple formats)
  private extractPostId(url: string): string | null {
    try {
      const urlObj = new URL(url);
      
      // Case 1: PostView.naver?blogId=xxx&logNo=123
      if (urlObj.pathname.includes('PostView.naver')) {
        const logNo = urlObj.searchParams.get('logNo');
        if (logNo) return logNo;
        
        // Alternative parameter names
        const postId = urlObj.searchParams.get('postId') || urlObj.searchParams.get('logId');
        if (postId) return postId;
      }
      
      // Case 2: Path-based URLs blog.naver.com/{blogId}/{postId}
      const pathParts = urlObj.pathname.split('/').filter(Boolean);
      if (pathParts.length > 1) {
        return pathParts[1] || null;
      }
      
      return null;
    } catch {
      return null;
    }
  }

  /**
   * 인플루언서 URL인지 판단
   */
  private isInfluencerUrl(url: string): boolean {
    try {
      if (!url) return false;
      
      const urlObj = new URL(url);
      // in.naver.com 도메인이면 인플루언서
      if (urlObj.hostname === 'in.naver.com' || urlObj.hostname === 'm.in.naver.com') {
        return true;
      }
      // /influencer/ 경로 포함
      if (urlObj.pathname.includes('/influencer/')) {
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }
}

export const naverApi = new NaverApiService();
