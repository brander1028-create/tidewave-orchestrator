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
}

export class NaverApiService {
  private headers: Record<string, string>;

  constructor() {
    if (!NAVER_CLIENT_ID || !NAVER_CLIENT_SECRET) {
      throw new Error('Naver API credentials not found in environment variables');
    }

    this.headers = {
      'X-Naver-Client-Id': NAVER_CLIENT_ID,
      'X-Naver-Client-Secret': NAVER_CLIENT_SECRET,
    };
  }

  async searchBlogs(query: string, display = 10, sort = 'sim'): Promise<NaverBlogSearchResult[]> {
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
      return data.items || [];
    } catch (error) {
      console.error('Error searching blogs:', error);
      throw error;
    }
  }

  async checkKeywordRanking(keyword: string, blogUrl: string): Promise<number | null> {
    try {
      const results = await this.searchBlogs(keyword, 100);
      const blogDomain = new URL(blogUrl).hostname;
      
      for (let i = 0; i < results.length; i++) {
        const resultDomain = new URL(results[i].link).hostname;
        if (resultDomain === blogDomain) {
          return i + 1; // 1-based ranking
        }
      }
      
      return null; // Not found in top 100
    } catch (error) {
      console.error('Error checking keyword ranking:', error);
      return null;
    }
  }
}

export const naverApi = new NaverApiService();
