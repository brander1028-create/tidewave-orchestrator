import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import * as cron from "node-cron";
import { startDailyAggregation } from "./aggregation-service.js";

// v7.13 환경변수 설정
const V713_CONFIG = {
  USE_MOCK: process.env.USE_MOCK === 'true' || false,
  TZ: process.env.TZ || 'Asia/Seoul',
  GLOBAL_RANK_CRON: process.env.GLOBAL_RANK_CRON || '0 7,20 * * *', // 오전 7시, 저녁 8시
  ALERT_COOLDOWN_HOURS: parseInt(process.env.ALERT_COOLDOWN_HOURS || '6'),
  RANK_PER_MIN: parseInt(process.env.RANK_PER_MIN || '20'),
  RANK_PER_DAY: parseInt(process.env.RANK_PER_DAY || '500'),
  CACHE_TTL_SEC: parseInt(process.env.CACHE_TTL_SEC || '600'),
  KEYWORDS_API_BASE: process.env.KEYWORDS_API_BASE || 'https://42ccc512-7f90-450a-a0a0-0b29770596c8-00-1eg5ws086e4j3.kirk.replit.dev/keywords'
};

// 환경변수 로깅
log(`[v7.13] USE_MOCK: ${V713_CONFIG.USE_MOCK}`);
log(`[v7.13] TZ: ${V713_CONFIG.TZ}`);
log(`[v7.13] GLOBAL_RANK_CRON: ${V713_CONFIG.GLOBAL_RANK_CRON}`);
log(`[v7.13] KEYWORDS_API_BASE: ${V713_CONFIG.KEYWORDS_API_BASE}`);

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  const server = await registerRoutes(app);

  // API 하드닝: API routes에 대한 잘못된 요청 처리
  app.all('/api/*', (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    log(`[API] ${req.method} ${req.path} - Content-Type: ${req.headers['content-type']}`);
    next();
  });

  // API GET 요청에 대해 JSON 404 반환 (Vite HTML 대신)
  app.get('/api/*', (req, res) => {
    log(`[API-404] GET ${req.path} - returning JSON 404 instead of HTML`);
    res.status(404).json({ 
      message: 'API 엔드포인트를 찾을 수 없습니다',
      method: req.method,
      path: req.path,
      hint: 'POST 메서드를 사용해야 하는 엔드포인트인지 확인하세요'
    });
  });

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || '5000', 10);
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true,
  }, () => {
    log(`serving on port ${port}`);
    
    // v7.13 전역 순위 체크 크론 (기본: 오전 7시, 저녁 8시)
    cron.schedule(V713_CONFIG.GLOBAL_RANK_CRON, async () => {
      log("[v7.13 크론] 전역 순위 체크 시작");
      try {
        const { storage } = await import("./storage");
        const { naverBlogScraper } = await import("./blog-scraper");
        
        // 모든 활성 blog-keyword pairs 조회
        const allPairs = await storage.getBlogKeywordTargets();
        const activePairs = allPairs.filter(pair => pair.active);
        
        if (activePairs.length === 0) {
          log("[v7.13 크론] 활성화된 페어가 없습니다");
          return;
        }
        
        log(`[v7.13 크론] ${activePairs.length}개 페어 순위 체크 시작`);
        let successCount = 0;
        let totalCount = 0;
        
        // 동시성 제어를 위해 배치 처리
        const BATCH_SIZE = 5;
        for (let i = 0; i < activePairs.length; i += BATCH_SIZE) {
          const batch = activePairs.slice(i, i + BATCH_SIZE);
          
          const batchPromises = batch.map(async (pair) => {
            try {
              totalCount++;
              log(`[v7.13 크론] 처리 중: ${pair.keyword} @ ${pair.blogUrl}`);
              
              // NaverBlogScraper 사용한 순위 체크
              const scrapingResult = await naverBlogScraper.scrapeNaverBlog({
                query: pair.keyword,
                targetUrl: pair.blogUrl,
                device: 'pc', // PC 우선, 실패시 자동 mobile fallback
                maxPages: 3
              });
              
              if (scrapingResult.success && scrapingResult.data) {
                const rankData = scrapingResult.data;
                
                // 순위 데이터를 rank_time_series에 저장
                await storage.saveRankSnapshot({
                  pairId: pair.id,
                  keyword: pair.keyword,
                  rank: rankData.rank,
                  page: rankData.page || 1,
                  position: rankData.position || rankData.rank || null,
                  title: rankData.title || '',
                  url: rankData.url || pair.blogUrl,
                  snippet: rankData.snippet || '',
                  device: 'pc',
                  checkedAt: new Date(),
                  exposed: rankData.rank !== null ? true : false
                });
                
                successCount++;
                log(`[v7.13 크론] 성공: ${pair.keyword} - 순위 ${rankData.rank || '없음'}`);
              } else {
                log(`[v7.13 크론] 실패: ${pair.keyword} - ${scrapingResult.error || '순위 없음'}`);
              }
              
            } catch (pairError) {
              log(`[v7.13 크론] 페어 처리 실패 (${pair.keyword}): ${pairError instanceof Error ? pairError.message : String(pairError)}`);
            }
          });
          
          // 배치 실행 및 완료 대기
          await Promise.allSettled(batchPromises);
          
          // 배치 간 짧은 대기 (과부하 방지)
          if (i + BATCH_SIZE < activePairs.length) {
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
        }
        
        log(`[v7.13 크론] 전역 순위 체크 완료: ${successCount}/${totalCount} 성공`);
      } catch (error: any) {
        log(`[v7.13 크론] 전역 순위 체크 실패: ${error instanceof Error ? error.message : String(error)}`);
      }
    }, { timezone: V713_CONFIG.TZ });
    
    // 기존 일일 집계도 유지 (자정)
    cron.schedule("0 0 * * *", () => {
      log("[크론] 일일 집계 작업 시작");
      startDailyAggregation().catch((error: Error) => {
        log(`[크론] 일일 집계 실패: ${error instanceof Error ? error.message : String(error)}`);
      });
    }, { timezone: V713_CONFIG.TZ });
    
    log(`[v7.13 크론] 전역 순위 체크 크론 등록됨: ${V713_CONFIG.GLOBAL_RANK_CRON} (${V713_CONFIG.TZ})`);
    log(`[크론] 자정 일일 집계 크론 작업이 등록되었습니다 (${V713_CONFIG.TZ})`);
  });
})();
