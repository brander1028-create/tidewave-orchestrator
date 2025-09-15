import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { 
  insertSubmissionSchema, 
  insertTrackedTargetSchema, 
  insertManualBlogEntrySchema,
  // v6 새로운 스키마들
  insertBlogTargetSchema,
  insertProductTargetSchema,
  insertRankSnapshotSchema,
  insertMetricSnapshotSchema,
  blogCheckSchema,
  updateReviewStateSchema
} from "@shared/schema";
import { naverBlogScraper } from "./blog-scraper";
import { z } from "zod";
import { scrapingService } from "./scraping-service";

// Scraping validation schemas
const scrapingConfigSchema = z.object({
  targetId: z.string().min(1),
  query: z.string().min(1),
  kind: z.enum(['blog', 'shop']),
  device: z.enum(['mobile', 'pc']),
  sort: z.string().optional(),
  target: z.string().optional()
});

const batchScrapingSchema = z.object({
  targets: z.array(scrapingConfigSchema).min(1).max(10) // Limit batch size
});

// Manual blog entry update schema - only allow safe fields to be updated
const updateManualBlogEntrySchema = z.object({
  keyword: z.string().min(1).optional(),
  url: z.string().url().optional(),
  title: z.string().min(1).optional(),
  rank: z.number().min(1).nullable().optional(),
  notes: z.string().nullable().optional(),
}).strict(); // Reject any extra fields

// v6 Update schemas - only allow safe fields to be updated
const updateBlogTargetSchema = z.object({
  title: z.string().min(1).optional(),
  url: z.string().url().optional(),
  queries: z.array(z.string()).optional(),
  windowMin: z.number().min(1).optional(),
  windowMax: z.number().min(1).optional(),
  scheduleCron: z.string().optional(),
  active: z.boolean().optional(),
}).strict();

const updateProductTargetSchema = z.object({
  title: z.string().min(1).optional(),
  url: z.string().url().optional(),
  queries: z.array(z.string()).optional(),
  sortDefault: z.string().optional(),
  deviceDefault: z.string().optional(),
  windowMin: z.number().min(1).optional(),
  windowMax: z.number().min(1).optional(),
  scheduleCron: z.string().optional(),
  active: z.boolean().optional(),
}).strict();

// v6 Update schemas for snapshots and review state
const updateReviewStateSchema = z.object({
  totalReviews: z.number().min(0).optional(),
  avgRating: z.number().min(0).max(5).optional(),
  recentReviews: z.number().min(0).optional(),
  flaggedReviews: z.number().min(0).optional(),
  positiveRatio: z.number().min(0).max(1).optional(),
}).strict();

export async function registerRoutes(app: Express): Promise<Server> {
  // Real CRUD API routes for user data management
  
  // Tracked Targets API
  app.get("/api/tracked-targets", async (req, res) => {
    try {
      const { owner } = req.query;
      const targets = await storage.getTrackedTargets(owner as string);
      res.json(targets);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch tracked targets", error: String(error) });
    }
  });

  app.post("/api/tracked-targets", async (req, res) => {
    try {
      const validation = insertTrackedTargetSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ 
          message: "Invalid target data",
          errors: validation.error.errors
        });
      }
      
      const target = await storage.createTrackedTarget(validation.data);
      res.json(target);
    } catch (error) {
      res.status(500).json({ message: "Failed to create target", error: String(error) });
    }
  });

  app.patch("/api/tracked-targets/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const target = await storage.updateTrackedTarget(id, req.body);
      res.json(target);
    } catch (error) {
      res.status(500).json({ message: "Failed to update target", error: String(error) });
    }
  });

  app.delete("/api/tracked-targets/:id", async (req, res) => {
    try {
      const { id } = req.params;
      await storage.deleteTrackedTarget(id);
      res.json({ message: "Target deleted successfully" });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete target", error: String(error) });
    }
  });

  // Settings API  
  app.get("/api/settings", async (req, res) => {
    try {
      const settings = await storage.getSettings();
      res.json(settings);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch settings", error: String(error) });
    }
  });

  app.post("/api/settings", async (req, res) => {
    try {
      const { key, value } = req.body;
      if (!key || value === undefined) {
        return res.status(400).json({ message: "key and value are required" });
      }
      
      const setting = await storage.updateSetting(key, value);
      res.json(setting);
    } catch (error) {
      res.status(500).json({ message: "Failed to update setting", error: String(error) });
    }
  });

  // Manual Blog Entries API
  app.get("/api/manual-blogs", async (req, res) => {
    try {
      const entries = await storage.getManualBlogEntries();
      res.json(entries);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch manual blog entries", error: String(error) });
    }
  });

  app.post("/api/manual-blogs", async (req, res) => {
    try {
      const validation = insertManualBlogEntrySchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ 
          message: "Invalid manual blog entry data",
          errors: validation.error.errors
        });
      }
      
      const entry = await storage.createManualBlogEntry(validation.data);
      res.json(entry);
    } catch (error) {
      res.status(500).json({ message: "Failed to create manual blog entry", error: String(error) });
    }
  });

  app.patch("/api/manual-blogs/:id", async (req, res) => {
    try {
      const { id } = req.params;
      
      // Validate update data - only allow safe fields to be modified
      const validation = updateManualBlogEntrySchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ 
          message: "Invalid update data",
          errors: validation.error.errors
        });
      }
      
      // Ensure updatedAt is set server-side
      const updateData = { ...validation.data, updatedAt: new Date() };
      const entry = await storage.updateManualBlogEntry(id, updateData);
      res.json(entry);
    } catch (error) {
      res.status(500).json({ message: "Failed to update manual blog entry", error: String(error) });
    }
  });

  app.delete("/api/manual-blogs/:id", async (req, res) => {
    try {
      const { id } = req.params;
      await storage.deleteManualBlogEntry(id);
      res.json({ message: "Manual blog entry deleted successfully" });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete manual blog entry", error: String(error) });
    }
  });

  // v6 Blog Targets API
  app.get("/api/blog-targets", async (req, res) => {
    try {
      const owner = req.headers['x-role'] as string;
      if (!owner) {
        return res.status(401).json({ message: "권한이 없습니다" });
      }
      const targets = await storage.getBlogTargets(owner);
      res.json(targets);
    } catch (error) {
      res.status(500).json({ message: "블로그 타겟 조회에 실패했습니다", error: String(error) });
    }
  });

  app.get("/api/blog-targets/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const owner = req.headers['x-role'] as string;
      if (!owner) {
        return res.status(401).json({ message: "권한이 없습니다" });
      }
      
      const target = await storage.getBlogTargetById(owner, id);
      if (!target) {
        return res.status(404).json({ message: "블로그 타겟을 찾을 수 없습니다" });
      }
      
      res.json(target);
    } catch (error) {
      res.status(500).json({ message: "블로그 타겟 조회에 실패했습니다", error: String(error) });
    }
  });

  app.post("/api/blog-targets", async (req, res) => {
    try {
      const owner = req.headers['x-role'] as string;
      if (!owner) {
        return res.status(401).json({ message: "권한이 없습니다" });
      }

      const validation = insertBlogTargetSchema.safeParse({
        ...req.body,
        owner
      });
      
      if (!validation.success) {
        return res.status(400).json({ 
          message: "잘못된 블로그 타겟 데이터입니다",
          errors: validation.error.errors
        });
      }
      
      const target = await storage.createBlogTarget(validation.data);
      res.status(201).json(target);
    } catch (error) {
      res.status(500).json({ message: "블로그 타겟 생성에 실패했습니다", error: String(error) });
    }
  });

  app.patch("/api/blog-targets/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const owner = req.headers['x-role'] as string;
      if (!owner) {
        return res.status(401).json({ message: "권한이 없습니다" });
      }
      
      const validation = updateBlogTargetSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ 
          message: "잘못된 블로그 타겟 데이터입니다",
          errors: validation.error.errors
        });
      }
      
      const target = await storage.updateBlogTargetByOwner(owner, id, validation.data);
      if (!target) {
        return res.status(404).json({ message: "블로그 타겟을 찾을 수 없습니다" });
      }
      
      res.json(target);
    } catch (error) {
      res.status(500).json({ message: "블로그 타겟 수정에 실패했습니다", error: String(error) });
    }
  });

  app.delete("/api/blog-targets/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const owner = req.headers['x-role'] as string;
      if (!owner) {
        return res.status(401).json({ message: "권한이 없습니다" });
      }
      
      const deleted = await storage.deleteBlogTargetByOwner(owner, id);
      if (!deleted) {
        return res.status(404).json({ message: "블로그 타겟을 찾을 수 없습니다" });
      }
      
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "블로그 타겟 삭제에 실패했습니다", error: String(error) });
    }
  });

  // v6 Product Targets API
  app.get("/api/product-targets", async (req, res) => {
    try {
      const owner = req.headers['x-role'] as string;
      if (!owner) {
        return res.status(401).json({ message: "권한이 없습니다" });
      }
      const targets = await storage.getProductTargets(owner);
      res.json(targets);
    } catch (error) {
      res.status(500).json({ message: "상품 타겟 조회에 실패했습니다", error: String(error) });
    }
  });

  app.get("/api/product-targets/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const owner = req.headers['x-role'] as string;
      if (!owner) {
        return res.status(401).json({ message: "권한이 없습니다" });
      }
      
      const target = await storage.getProductTargetById(owner, id);
      if (!target) {
        return res.status(404).json({ message: "상품 타겟을 찾을 수 없습니다" });
      }
      
      res.json(target);
    } catch (error) {
      res.status(500).json({ message: "상품 타겟 조회에 실패했습니다", error: String(error) });
    }
  });

  app.post("/api/product-targets", async (req, res) => {
    try {
      const owner = req.headers['x-role'] as string;
      if (!owner) {
        return res.status(401).json({ message: "권한이 없습니다" });
      }

      const validation = insertProductTargetSchema.safeParse({
        ...req.body,
        owner
      });
      
      if (!validation.success) {
        return res.status(400).json({ 
          message: "잘못된 상품 타겟 데이터입니다",
          errors: validation.error.errors
        });
      }
      
      const target = await storage.createProductTarget(validation.data);
      res.status(201).json(target);
    } catch (error) {
      res.status(500).json({ message: "상품 타겟 생성에 실패했습니다", error: String(error) });
    }
  });

  app.patch("/api/product-targets/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const owner = req.headers['x-role'] as string;
      if (!owner) {
        return res.status(401).json({ message: "권한이 없습니다" });
      }
      
      const validation = updateProductTargetSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ 
          message: "잘못된 상품 타겟 데이터입니다",
          errors: validation.error.errors
        });
      }
      
      const target = await storage.updateProductTargetByOwner(owner, id, validation.data);
      if (!target) {
        return res.status(404).json({ message: "상품 타겟을 찾을 수 없습니다" });
      }
      
      res.json(target);
    } catch (error) {
      res.status(500).json({ message: "상품 타겟 수정에 실패했습니다", error: String(error) });
    }
  });

  app.delete("/api/product-targets/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const owner = req.headers['x-role'] as string;
      if (!owner) {
        return res.status(401).json({ message: "권한이 없습니다" });
      }
      
      const deleted = await storage.deleteProductTargetByOwner(owner, id);
      if (!deleted) {
        return res.status(404).json({ message: "상품 타겟을 찾을 수 없습니다" });
      }
      
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "상품 타겟 삭제에 실패했습니다", error: String(error) });
    }
  });

  // v6 Rank Snapshots API
  app.get("/api/rank-snapshots", async (req, res) => {
    try {
      const owner = req.headers['x-role'] as string;
      if (!owner) {
        return res.status(401).json({ message: "권한이 없습니다" });
      }
      
      const { targetId, kind, range = "30d" } = req.query;
      const snapshots = await storage.getRankSnapshots(
        owner, // Owner-aware security fix
        targetId as string, 
        kind as string, 
        range as string
      );
      res.json(snapshots);
    } catch (error) {
      res.status(500).json({ message: "랭킹 스냅샷 조회에 실패했습니다", error: String(error) });
    }
  });

  app.post("/api/rank-snapshots", async (req, res) => {
    try {
      const owner = req.headers['x-role'] as string;
      if (!owner) {
        return res.status(401).json({ message: "권한이 없습니다" });
      }

      const validation = insertRankSnapshotSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ 
          message: "잘못된 랭킹 스냅샷 데이터입니다",
          errors: validation.error.errors
        });
      }

      const snapshot = await storage.insertRankSnapshot(owner, validation.data);
      res.status(201).json(snapshot);
    } catch (error) {
      res.status(500).json({ message: "랭킹 스냅샷 생성에 실패했습니다", error: String(error) });
    }
  });

  app.get("/api/rank/history/:targetId", async (req, res) => {
    try {
      const owner = req.headers['x-role'] as string;
      if (!owner) {
        return res.status(401).json({ message: "권한이 없습니다" });
      }
      
      const { targetId } = req.params;
      const { kind, query, sort, device, range = "30d" } = req.query;
      
      const history = await storage.getRankSnapshotHistory(
        owner, // Owner-aware security fix
        targetId,
        kind as string,
        query as string,
        sort as string,
        device as string,
        range as string
      );
      res.json(history);
    } catch (error) {
      res.status(500).json({ message: "랭킹 히스토리 조회에 실패했습니다", error: String(error) });
    }
  });

  // v6 Metric Snapshots API  
  app.get("/api/metric-snapshots", async (req, res) => {
    try {
      const owner = req.headers['x-role'] as string;
      if (!owner) {
        return res.status(401).json({ message: "권한이 없습니다" });
      }
      
      const { productKey, range = "30d" } = req.query;
      const snapshots = await storage.getMetricSnapshots(
        owner, // Owner-aware security fix
        productKey as string,
        range as string
      );
      res.json(snapshots);
    } catch (error) {
      res.status(500).json({ message: "메트릭 스냅샷 조회에 실패했습니다", error: String(error) });
    }
  });

  app.post("/api/metric-snapshots", async (req, res) => {
    try {
      const owner = req.headers['x-role'] as string;
      if (!owner) {
        return res.status(401).json({ message: "권한이 없습니다" });
      }

      const validation = insertMetricSnapshotSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ 
          message: "잘못된 메트릭 스냅샷 데이터입니다",
          errors: validation.error.errors
        });
      }

      const snapshot = await storage.insertMetricSnapshot(owner, validation.data);
      res.status(201).json(snapshot);
    } catch (error) {
      res.status(500).json({ message: "메트릭 스냅샷 생성에 실패했습니다", error: String(error) });
    }
  });

  app.get("/api/metric/history/:productKey", async (req, res) => {
    try {
      const owner = req.headers['x-role'] as string;
      if (!owner) {
        return res.status(401).json({ message: "권한이 없습니다" });
      }
      
      const { productKey } = req.params;
      const { range = "30d" } = req.query;
      
      const history = await storage.getMetricHistory(
        owner, // Owner-aware security fix
        productKey,
        range as string
      );
      res.json(history);
    } catch (error) {
      res.status(500).json({ message: "메트릭 히스토리 조회에 실패했습니다", error: String(error) });
    }
  });

  // v6 Review State API
  app.get("/api/review-state/:productKey", async (req, res) => {
    try {
      const owner = req.headers['x-role'] as string;
      if (!owner) {
        return res.status(401).json({ message: "권한이 없습니다" });
      }
      
      const { productKey } = req.params;
      const reviewState = await storage.getReviewState(owner, productKey); // Owner-aware security fix
      
      if (!reviewState) {
        return res.status(404).json({ message: "리뷰 상태를 찾을 수 없습니다" });
      }
      
      res.json(reviewState);
    } catch (error) {
      res.status(500).json({ message: "리뷰 상태 조회에 실패했습니다", error: String(error) });
    }
  });

  app.patch("/api/review-state/:productKey", async (req, res) => {
    try {
      const owner = req.headers['x-role'] as string;
      if (!owner) {
        return res.status(401).json({ message: "권한이 없습니다" });
      }

      const validation = updateReviewStateSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ 
          message: "잘못된 리뷰 상태 데이터입니다",
          errors: validation.error.errors
        });
      }

      const { productKey } = req.params;
      // Add productKey to the data for updateReviewState
      const updateData = { ...validation.data, productKey };
      const reviewState = await storage.updateReviewState(owner, updateData); // Owner-aware security fix
      res.json(reviewState);
    } catch (error) {
      res.status(500).json({ message: "리뷰 상태 수정에 실패했습니다", error: String(error) });
    }
  });

  // v6-4: 실제 네이버 블로그 SERP 크롤링 API
  app.post("/api/rank/blog/check", async (req, res) => {
    try {
      const owner = req.headers['x-role'] as string;
      if (!owner) {
        return res.status(401).json({ message: "권한이 없습니다" });
      }

      const validation = blogCheckSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ 
          message: "잘못된 블로그 체크 데이터입니다",
          errors: validation.error.errors
        });
      }

      const { targetId, query, device, maxPages } = validation.data;

      // 1. 대상 블로그 타겟이 해당 owner 소유인지 확인
      const blogTarget = await storage.getBlogTargetById(owner, targetId);
      if (!blogTarget) {
        return res.status(404).json({ message: "블로그 타겟을 찾을 수 없거나 권한이 없습니다" });
      }

      console.log(`[BlogCheck] 시작: ${blogTarget.title} - "${query}" (${device})`);

      // 2. 네이버 블로그 스크래핑 실행
      const scrapingResult = await naverBlogScraper.scrapeNaverBlog({
        query,
        targetUrl: blogTarget.url,
        device,
        maxPages
      });

      if (!scrapingResult.success) {
        return res.status(500).json({
          success: false,
          message: "블로그 크롤링에 실패했습니다",
          error: scrapingResult.error
        });
      }

      // 3. 결과를 rank_snapshots 테이블에 저장 (owner-aware)
      const snapshotData = {
        targetId,
        kind: 'blog' as const,
        query,
        rank: scrapingResult.data?.rank || null,
        page: scrapingResult.data?.page || 1,
        position: scrapingResult.data?.position || null,
        device,
        source: 'naver_blog_scraper',
        metadata: {
          title: scrapingResult.data?.title || '',
          url: scrapingResult.data?.url || '',
          snippet: scrapingResult.data?.snippet || '',
          date: scrapingResult.data?.date || '',
          ...scrapingResult.data?.metadata
        }
      };

      const snapshot = await storage.insertRankSnapshot(owner, snapshotData);

      console.log(`[BlogCheck] 완료: ${blogTarget.title} - 순위 ${snapshotData.rank} 저장됨`);

      res.json({
        success: true,
        data: {
          snapshot,
          scrapingResult: scrapingResult.data
        },
        message: `"${query}" 키워드에서 ${blogTarget.title} 블로그 순위 체크 완료`
      });

    } catch (error) {
      console.error('[BlogCheck] 오류:', error);
      res.status(500).json({ 
        success: false,
        message: "블로그 순위 체크에 실패했습니다", 
        error: String(error) 
      });
    }
  });

  // Submissions API
  app.get("/api/submissions", async (req, res) => {
    try {
      const { status } = req.query;
      const submissions = await storage.getSubmissions(status as string);
      res.json(submissions);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch submissions", error: String(error) });
    }
  });

  app.post("/api/submissions", async (req, res) => {
    try {
      const validation = insertSubmissionSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ 
          message: "Invalid submission data",
          errors: validation.error.errors
        });
      }
      
      const submission = await storage.createSubmission(validation.data);
      res.json(submission);
    } catch (error) {
      res.status(500).json({ message: "Failed to create submission", error: String(error) });
    }
  });

  app.patch("/api/submissions/:id/:action", async (req, res) => {
    try {
      const { id, action } = req.params;
      const { comment } = req.body;
      
      if (action !== 'approve' && action !== 'reject') {
        return res.status(400).json({ message: "Invalid action. Use approve or reject" });
      }
      
      const submission = await storage.updateSubmissionStatus(id, action === 'approve' ? 'approved' : 'rejected', comment);
      res.json(submission);
    } catch (error) {
      res.status(500).json({ message: `Failed to ${req.params.action} submission`, error: String(error) });
    }
  });

  // Real-time web scraping API routes
  
  // Health check for scraping service
  app.get("/api/scraping/health", async (req, res) => {
    try {
      const health = await scrapingService.healthCheck();
      res.json(health);
    } catch (error) {
      res.status(500).json({ message: "Health check failed", error: String(error) });
    }
  });

  // Start live rank check with real scraping
  app.post("/api/scraping/rank-check", async (req, res) => {
    try {
      // Validate request body with Zod
      const validation = scrapingConfigSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ 
          message: "Invalid request data",
          errors: validation.error.errors
        });
      }
      
      const { targetId, query, kind, device, sort, target } = validation.data;

      // Initialize scraping service if needed
      await scrapingService.initialize();

      const config = {
        target: target || '',
        query,
        device: device as 'mobile' | 'pc',
        kind: kind as 'blog' | 'shop',
        sort,
        maxRetries: 3,
        backoffMs: 1000
      };

      const result = await scrapingService.scrapeRanking(config);
      
      if (result.success && result.data) {
        // Save to database
        const rankData = {
          targetId,
          kind,
          query,
          sort: sort || null,
          device,
          rank: result.data.rank || null,
          page: result.data.page || null,
          position: result.data.position || null,
          source: 'playwright_scraping',
          metadata: result.data.metadata
        };

        await storage.insertRankData(rankData);
        
        res.json({
          success: true,
          data: result.data,
          message: "Rank data scraped and saved successfully"
        });
      } else {
        res.status(500).json({
          success: false,
          error: result.error,
          message: "Scraping failed"
        });
      }
    } catch (error) {
      res.status(500).json({ 
        message: "Rank check failed", 
        error: String(error) 
      });
    }
  });

  // Batch rank check for multiple targets
  app.post("/api/scraping/batch-rank-check", async (req, res) => {
    try {
      // Validate request body with Zod
      const validation = batchScrapingSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ 
          message: "Invalid request data",
          errors: validation.error.errors
        });
      }
      
      const { targets } = validation.data;

      await scrapingService.initialize();
      
      const results = [];
      
      for (const targetConfig of targets) {
        const { targetId, query, kind, device, sort, target } = targetConfig;
        
        const config = {
          target: target || '',
          query,
          device: device as 'mobile' | 'pc',
          kind: kind as 'blog' | 'shop',
          sort,
          maxRetries: 3,
          backoffMs: 1000
        };

        const result = await scrapingService.scrapeRanking(config);
        
        if (result.success && result.data) {
          // Save to database
          const rankData = {
            targetId,
            kind,
            query,
            sort: sort || null,
            device,
            rank: result.data.rank || null,
            page: result.data.page || null,
            position: result.data.position || null,
            source: 'playwright_scraping',
            metadata: result.data.metadata
          };

          await storage.insertRankData(rankData);
        }
        
        results.push({
          targetId,
          success: result.success,
          data: result.data,
          error: result.error
        });
        
        // Small delay between requests to be respectful
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
      
      res.json({
        message: "Batch rank check completed",
        results,
        successCount: results.filter(r => r.success).length,
        totalCount: results.length
      });
    } catch (error) {
      res.status(500).json({ 
        message: "Batch rank check failed", 
        error: String(error) 
      });
    }
  });

  // Mock API routes for rank monitoring (fallback)
  
  // Get rank series data
  app.get("/api/mock/rank/series", async (req, res) => {
    try {
      const { target_id, range = "30d" } = req.query;
      if (!target_id || typeof target_id !== "string") {
        return res.status(400).json({ message: "target_id is required" });
      }
      
      const data = await storage.getRankSeries(target_id, range as string);
      res.json(data);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch rank series" });
    }
  });

  // Get rank comparison data
  app.get("/api/mock/rank/compare", async (req, res) => {
    try {
      const { targets, range = "30d" } = req.query;
      if (!targets) {
        return res.status(400).json({ message: "targets parameter is required" });
      }
      
      const targetIds = Array.isArray(targets) ? targets as string[] : [targets as string];
      const data = await storage.getRankCompare(targetIds, range as string);
      res.json(data);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch rank comparison" });
    }
  });

  // Get rank history
  app.get("/api/mock/rank/history", async (req, res) => {
    try {
      const { target_id, period = "30d" } = req.query;
      if (!target_id || typeof target_id !== "string") {
        return res.status(400).json({ message: "target_id is required" });
      }
      
      const data = await storage.getRankHistory(target_id, period as string);
      res.json(data);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch rank history" });
    }
  });

  // Start rank check
  app.post("/api/mock/rank/check", async (req, res) => {
    try {
      const { targetIds } = req.body;
      if (!targetIds || !Array.isArray(targetIds)) {
        return res.status(400).json({ message: "targetIds array is required" });
      }
      
      // Simulate rank check process
      res.json({ 
        message: "Rank check started", 
        targetIds,
        estimatedTime: "2-5 minutes" 
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to start rank check" });
    }
  });

  // Get events
  app.get("/api/mock/rank/events", async (req, res) => {
    try {
      const { target_id, range = "30d" } = req.query;
      const data = await storage.getEvents(target_id as string, range as string);
      res.json(data);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch events" });
    }
  });

  // Get alerts
  app.get("/api/mock/alerts", async (req, res) => {
    try {
      const { seen } = req.query;
      const data = await storage.getAlerts(seen === "true" ? true : seen === "false" ? false : undefined);
      res.json(data);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch alerts" });
    }
  });

  // Mark alert as seen
  app.post("/api/mock/alerts/:id/seen", async (req, res) => {
    try {
      const { id } = req.params;
      await storage.markAlertSeen(id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Failed to mark alert as seen" });
    }
  });

  // Get submissions
  app.get("/api/mock/submissions", async (req, res) => {
    try {
      const { status } = req.query;
      const data = await storage.getSubmissions(status as string);
      res.json(data);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch submissions" });
    }
  });

  // Create submission
  app.post("/api/mock/submissions", async (req, res) => {
    try {
      const validatedData = insertSubmissionSchema.parse(req.body);
      const submission = await storage.createSubmission(validatedData);
      res.status(201).json(submission);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid submission data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create submission" });
    }
  });

  // Approve/reject submission
  app.post("/api/mock/submissions/:id/:action", async (req, res) => {
    try {
      const { id, action } = req.params;
      const { comment } = req.body;
      
      if (!["approve", "reject"].includes(action)) {
        return res.status(400).json({ message: "Action must be 'approve' or 'reject'" });
      }
      
      const status = action === "approve" ? "approved" : "rejected";
      const submission = await storage.updateSubmissionStatus(id, status, comment);
      res.json(submission);
    } catch (error) {
      res.status(500).json({ message: "Failed to update submission" });
    }
  });

  // Get tracked targets
  app.get("/api/mock/targets", async (req, res) => {
    try {
      const { owner } = req.query;
      const data = await storage.getTrackedTargets(owner as string);
      res.json(data);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch tracked targets" });
    }
  });

  // Create tracked target
  app.post("/api/mock/targets", async (req, res) => {
    try {
      const validatedData = insertTrackedTargetSchema.parse(req.body);
      const target = await storage.createTrackedTarget(validatedData);
      res.status(201).json(target);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid target data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create target" });
    }
  });

  // Update tracked target
  app.patch("/api/mock/targets/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const updates = req.body;
      const target = await storage.updateTrackedTarget(id, updates);
      res.json(target);
    } catch (error) {
      res.status(500).json({ message: "Failed to update target" });
    }
  });

  // Delete tracked target
  app.delete("/api/mock/targets/:id", async (req, res) => {
    try {
      const { id } = req.params;
      await storage.deleteTrackedTarget(id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete target" });
    }
  });

  // Get settings
  app.get("/api/mock/settings", async (req, res) => {
    try {
      const data = await storage.getSettings();
      res.json(data);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch settings" });
    }
  });

  // Update settings
  app.post("/api/mock/settings", async (req, res) => {
    try {
      const { key, value } = req.body;
      if (!key || value === undefined) {
        return res.status(400).json({ message: "key and value are required" });
      }
      
      const setting = await storage.updateSetting(key, value);
      res.json(setting);
    } catch (error) {
      res.status(500).json({ message: "Failed to update setting" });
    }
  });

  // Analytics endpoints
  app.get("/api/mock/analytics/kpis", async (req, res) => {
    try {
      const { period = "30d" } = req.query;
      const data = await storage.getKPIData(period as string);
      res.json(data);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch KPI data" });
    }
  });

  app.get("/api/mock/analytics/distribution", async (req, res) => {
    try {
      const data = await storage.getRankDistribution();
      res.json(data);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch rank distribution" });
    }
  });

  app.get("/api/mock/analytics/movers", async (req, res) => {
    try {
      const { direction = "up", limit = "10" } = req.query;
      const data = await storage.getTopMovers(direction as "up" | "down", parseInt(limit as string));
      res.json(data);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch top movers" });
    }
  });

  app.get("/api/mock/analytics/heatmap", async (req, res) => {
    try {
      const { period = "90d" } = req.query;
      const data = await storage.getHeatmapData(period as string);
      res.json(data);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch heatmap data" });
    }
  });

  app.get("/api/mock/analytics/competitors", async (req, res) => {
    try {
      const { target_id } = req.query;
      if (!target_id) {
        return res.status(400).json({ message: "target_id is required" });
      }
      
      const data = await storage.getCompetitorAnalysis(target_id as string);
      res.json(data);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch competitor analysis" });
    }
  });

  // Reviews endpoints
  app.get("/api/mock/reviews/rankings", async (req, res) => {
    try {
      const { product_key } = req.query;
      if (!product_key) {
        return res.status(400).json({ message: "product_key is required" });
      }
      
      const data = await storage.getReviewRankings(product_key as string);
      res.json(data);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch review rankings" });
    }
  });

  app.get("/api/mock/reviews/health", async (req, res) => {
    try {
      const { product_key } = req.query;
      if (!product_key) {
        return res.status(400).json({ message: "product_key is required" });
      }
      
      const data = await storage.getReviewHealth(product_key as string);
      res.json(data);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch review health" });
    }
  });

  app.get("/api/mock/reviews/abuse", async (req, res) => {
    try {
      const { product_key } = req.query;
      if (!product_key) {
        return res.status(400).json({ message: "product_key is required" });
      }
      
      const data = await storage.getAbuseDetection(product_key as string);
      res.json(data);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch abuse detection" });
    }
  });

  // Export endpoints
  app.post("/api/mock/exports", async (req, res) => {
    try {
      const config = req.body;
      const job = await storage.createExportJob(config);
      res.status(201).json(job);
    } catch (error) {
      res.status(500).json({ message: "Failed to create export job" });
    }
  });

  app.get("/api/mock/exports", async (req, res) => {
    try {
      const jobs = await storage.getExportJobs();
      res.json(jobs);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch export jobs" });
    }
  });

  app.get("/api/mock/exports/:id/download", async (req, res) => {
    try {
      const { id } = req.params;
      const download = await storage.getExportDownload(id);
      
      res.setHeader('Content-Type', download.mimeType);
      res.setHeader('Content-Disposition', `attachment; filename="${download.filename}"`);
      res.send(download.data);
    } catch (error) {
      res.status(500).json({ message: "Failed to download export" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
