import * as cheerio from 'cheerio';
import { CookieJar } from 'tough-cookie';
import got from 'got';
import iconv from 'iconv-lite';

/**
 * 제목 추출 결과 인터페이스
 */
export interface TitleExtractionResult {
  title: string | null;
  finalUrl: string;
  status: number;
  isInfluencer: boolean;
}

/**
 * 서버사이드 제목 추출 서비스
 * 네이버 블로그/인플루언서 제목을 제대로 추출
 */
export class TitleExtractorService {
  private jar = new CookieJar();
  private userAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

  /**
   * URL에서 Buffer로 페이지 가져오기
   */
  private async fetchBuffer(url: string) {
    const res = await got(url, {
      http2: true,
      followRedirect: true,
      throwHttpErrors: false,
      cookieJar: this.jar,
      headers: {
        "User-Agent": this.userAgent,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
        Referer: "https://www.naver.com/",
      },
      timeout: { request: 15000 },
      retry: { limit: 1 },
      responseType: "buffer",
    });
    return res;
  }

  /**
   * HTML 문자 인코딩 처리
   */
  private decodeBody(res: any): string {
    let buf = res.rawBody || res.body;
    let text = iconv.decode(buf, "utf-8");
    try {
      const m = text.match(/<meta[^>]+charset=["']?([\w-]+)["']?[^>]*>/i);
      if (m && m[1] && !/utf-?8/i.test(m[1])) {
        text = iconv.decode(buf, m[1]);
      }
    } catch {}
    return text;
  }

  /**
   * 리다이렉트/프레임/메타리프레시 URL 추출
   */
  private extractNextHop(html: string): string | null {
    // 1) <meta http-equiv="refresh" content="0;url=...">
    const meta = html.match(
      /<meta[^>]+http-equiv=["']?refresh["'][^>]+content=["'][^"']*url=([^"'>]+)["']/i
    );
    if (meta && meta[1]) return meta[1];

    // 2) location.replace("...") or location.href='...'
    const loc = html.match(/location\.(?:replace|href)\(['"]([^'"]+)['"]\)/i);
    if (loc && loc[1]) return loc[1];

    // 3) <frame src="...">
    const frame = html.match(/<frame[^>]+src=["']([^"']+)["']/i);
    if (frame && frame[1]) return frame[1];

    return null;
  }

  /**
   * HTML에서 제목 추출 (우선순위 적용)
   */
  private extractTitleFromHtml(html: string, finalUrl: string): string | null {
    const $ = cheerio.load(html);

    // 우선순위: og:title → twitter:title → meta[name=title] → JSON-LD headline → <title>
    const og = $('meta[property="og:title"]').attr("content");
    if (og) return og.trim();

    const tw = $('meta[name="twitter:title"]').attr("content");
    if (tw) return tw.trim();

    const mt = $('meta[name="title"]').attr("content");
    if (mt) return mt.trim();

    // JSON-LD에서 headline
    const jsonLdNodes = $('script[type="application/ld+json"]');
    for (let i = 0; i < jsonLdNodes.length; i++) {
      try {
        const data = JSON.parse($(jsonLdNodes[i]).text());
        const obj = Array.isArray(data) ? data[0] : data;
        if (obj && (obj.headline || obj.name)) {
          return (obj.headline || obj.name).trim();
        }
      } catch {}
    }

    const t = $("title").first().text();
    if (t) return t.trim();

    // 일부 인플루언서 페이지: meta[name=apple-mobile-web-app-title] 등
    const alt = $('meta[name="apple-mobile-web-app-title"]').attr("content");
    if (alt) return alt.trim();

    return null;
  }

  /**
   * 인플루언서 URL인지 판단
   */
  private isInfluencerUrl(url: string): boolean {
    try {
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

  /**
   * 메인 제목 추출 함수 - 리다이렉트 추적 포함
   */
  public async extractTitle(startUrl: string, maxHops = 5): Promise<TitleExtractionResult> {
    let url = startUrl;
    let lastHtml = "";
    let lastRes = null;
    const isInfluencer = this.isInfluencerUrl(startUrl);

    console.log(`🔍 [Title Extractor] 제목 추출 시작: ${startUrl} ${isInfluencer ? '(인플루언서)' : '(일반 블로그)'}`);

    for (let hop = 0; hop < maxHops; hop++) {
      try {
        const res = await this.fetchBuffer(url);
        lastRes = res;
        const html = this.decodeBody(res);
        lastHtml = html;

        console.log(`📄 [Title Extractor] Hop ${hop + 1}: ${res.statusCode} ${url}`);

        // 200이면 제목 시도
        if (res.statusCode >= 200 && res.statusCode < 300) {
          // blog.naver.com 의 프레임/리다이렉트 처리
          const next = this.extractNextHop(html);
          if (next) {
            url = new URL(next, url).toString();
            console.log(`🔄 [Title Extractor] 리다이렉트 발견: ${url}`);
            continue;
          }

          // 바로 제목 추출
          const title = this.extractTitleFromHtml(html, res.url || url);
          if (title) {
            console.log(`✅ [Title Extractor] 제목 추출 성공: "${title}"`);
            return { 
              title, 
              finalUrl: res.url || url, 
              status: res.statusCode,
              isInfluencer
            };
          }
        }

        // 3xx는 got가 따라가므로 여기 올 일 적음. 403/404도 한 번 더 시도 X
        break;
      } catch (error) {
        console.error(`❌ [Title Extractor] Hop ${hop + 1} 실패:`, error);
        break;
      }
    }

    // 실패 시 null
    const fallbackTitle = this.extractTitleFromHtml(lastHtml, lastRes?.url || startUrl);
    console.log(`⚠️ [Title Extractor] 제목 추출 실패, fallback: ${fallbackTitle || 'null'}`);
    
    return {
      title: fallbackTitle,
      finalUrl: lastRes?.url || startUrl,
      status: lastRes?.statusCode || 0,
      isInfluencer
    };
  }
}

// 싱글톤 인스턴스 내보내기
export const titleExtractor = new TitleExtractorService();