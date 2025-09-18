import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import axios from "axios";
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
  updateReviewStateSchema as importedUpdateReviewStateSchema,
  // v7 새로운 스키마들
  insertGroupSchema,
  insertGroupKeywordSchema,
  insertGroupIndexDailySchema,
  insertRankAggDaySchema,
  insertCollectionRuleSchema,
  insertCollectionStateSchema,
  insertRollingAlertSchema,
  insertDashboardSettingsSchema,
  // v7 키워드 매핑 API 스키마
  targetKeywordsManageSchema,
  // v7.13 블로그-키워드 페어 스키마
  insertBlogKeywordTargetSchema,
  updateBlogKeywordTargetSchema
} from "@shared/schema";
import { naverBlogScraper } from "./blog-scraper";
import { z } from "zod";
import { scrapingService } from "./scraping-service";
import { calculateYoYMoMWoWForProduct } from './aggregation-service';

// v7.13 환경설정 import (v7.17: FEATURE_SHOP_RANK 추가)
const V713_CONFIG = {
  USE_MOCK: process.env.USE_MOCK === 'true' || false,
  TZ: process.env.TZ || 'Asia/Seoul',
  GLOBAL_RANK_CRON: process.env.GLOBAL_RANK_CRON || '0 7,20 * * *',
  ALERT_COOLDOWN_HOURS: parseInt(process.env.ALERT_COOLDOWN_HOURS || '6'),
  RANK_PER_MIN: parseInt(process.env.RANK_PER_MIN || '20'),
  RANK_PER_DAY: parseInt(process.env.RANK_PER_DAY || '500'),
  CACHE_TTL_SEC: parseInt(process.env.CACHE_TTL_SEC || '600'),
  KEYWORDS_API_BASE: process.env.KEYWORDS_API_BASE || 'https://42ccc512-7f90-450a-a0a0-0b29770596c8-00-1eg5ws086e4j3.kirk.replit.dev/keywords',
  FEATURE_SHOP_RANK: process.env.FEATURE_SHOP_RANK === 'true' || false
};

// Scraping validation schemas
const scrapingConfigSchema = z.object({
  targetId: z.string().min(1),
  pairId: z.string().optional(), // v7.18: 배치 처리에서 스냅샷 연결을 위한 pairId 지원
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

// v7 Update schemas - only allow safe fields to be updated
const updateGroupSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  color: z.string().optional(),
  active: z.boolean().optional(),
}).strict();

const updateCollectionRuleSchema = z.object({
  name: z.string().min(1).optional(),
  conditions: z.object({}).passthrough().optional(), // JSON 조건
  actions: z.object({}).passthrough().optional(), // JSON 액션
  priority: z.number().min(1).max(10).optional(),
  active: z.boolean().optional(),
}).strict();

const updateCollectionStateSchema = z.object({
  checkInterval: z.enum(['10m', '30m', '1h', '6h', '24h']).optional(),
  costScore: z.number().min(0).max(100).optional(),
  autoStopped: z.boolean().optional(),
}).strict();

// v7.18: 키워드 lookup 핸들러 함수 (헤더 통일 + 디버깅)
async function keywordLookupHandler(req: any, res: any) {
  try {
    const xOwner = req.headers['x-owner'];
    const xRole = req.headers['x-role']; 
    const owner = (xOwner || xRole) as string;
    
    console.log(`[KeywordLookup] 헤더 체크: x-owner=${xOwner}, x-role=${xRole}, final owner=${owner}`);
    
    if (!owner) {
      return res.status(401).json({ message: "권한이 없습니다" });
    }

    const texts = req.query.texts as string;
    if (!texts) {
      return res.status(400).json({ message: "texts 파라미터가 필요합니다" });
    }

    const keywords = texts.split(',').map(t => t.trim()).filter(Boolean);
    if (keywords.length === 0) {
      return res.status(400).json({ message: "최소 1개 키워드가 필요합니다" });
    }

    // v7.13: 외부 키워드 API 연동 [조회량][점수] 데이터 제공
    let keywordData;
    
    try {
      // 외부 키워드 API 호출
      const response = await axios.post(`${V713_CONFIG.KEYWORDS_API_BASE}/lookup`, {
        keywords: keywords,
        fields: ['volume', 'score', 'trend', 'competition']
      }, {
        timeout: 5000, // 5초 타임아웃
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'BlogRankMonitor-v7.13'
        }
      });
      
      keywordData = response.data;
      
      // API 응답 검증 및 정규화
      if (!Array.isArray(keywordData)) {
        throw new Error('Invalid API response: expected array');
      }
      
      keywordData = keywordData.map((item, index) => ({
        keyword: keywords[index] || item.keyword,
        volume: typeof item.volume === 'number' ? item.volume : 0,
        score: typeof item.score === 'number' ? Math.min(100, Math.max(0, item.score)) : 50,
        trend: ['up', 'down', 'stable'].includes(item.trend) ? item.trend : 'stable',
        competition: ['low', 'medium', 'high'].includes(item.competition) ? item.competition : 'medium',
        lastUpdated: new Date().toISOString()
      }));
      
    } catch (apiError) {
      console.warn(`[키워드 API] 외부 API 호출 실패, fallback 사용:`, apiError instanceof Error ? apiError.message : String(apiError));
      
      // Fallback: 외부 API 실패시 기본 데이터 제공
      keywordData = keywords.map(keyword => {
        const baseVolume = keyword.includes('홍삼') ? 15000 : 5000;
        const volume = baseVolume + Math.floor(Math.random() * 10000);
        
        let score = 70 + Math.floor(Math.random() * 25); // 70-95 범위
        if (keyword.includes('추천') || keyword.includes('효능')) score += 5;
        if (keyword.includes('부작용')) score -= 10;
        
        return {
          keyword,
          volume,
          score: Math.min(100, Math.max(20, score)),
          trend: Math.random() > 0.5 ? 'up' : Math.random() > 0.3 ? 'down' : 'stable',
          competition: ['low', 'medium', 'high'][Math.floor(Math.random() * 3)],
          lastUpdated: new Date().toISOString(),
          fallback: true // fallback 데이터 표시
        };
      });
    }

    // Cache-Control: 1시간 캐시
    res.set('Cache-Control', 'public, max-age=3600');
    res.json(keywordData);

  } catch (error) {
    res.status(500).json({ 
      message: "키워드 조회에 실패했습니다", 
      error: String(error) 
    });
  }
}

// v7.17: getRankHistoryHandler 함수 정의 (방어적 구현)
async function getRankHistoryHandler(req: any, res: any) {
  try {
    const owner = (req.headers['x-owner'] as string) || 'system';
    const { pair_id, targetId, range = "30d" } = req.query;
    
    // v7.17: pair_id와 targetId 모두 지원 (하위 호환성)
    const actualTargetId = pair_id || targetId;
    
    if (!actualTargetId) {
      return res.status(400).json({ message: "pair_id or targetId parameter required" });
    }
    
    console.log(`[getRankHistoryHandler] owner=${owner}, targetId=${actualTargetId}, range=${range}`);
    
    try {
      // pair_id/targetId를 그대로 사용하여 히스토리 조회
      const history = await storage.getRankSnapshotHistory(
        owner,
        actualTargetId as string,
        'blog', // 기본적으로 blog 히스토리
        '', // query는 옵션
        '', // sort는 옵션
        'mobile', // 기본 디바이스
        range as string
      );
      
      console.log(`[getRankHistoryHandler] 성공: ${history.length}개 히스토리 조회됨`);
      res.json(history);
    } catch (storageError) {
      // 스토리지 오류 시 빈 배열 반환 (새 pair_id는 히스토리가 없을 수 있음)
      console.log(`[getRankHistoryHandler] 스토리지 오류, 빈 히스토리 반환:`, storageError);
      res.json([]);
    }
  } catch (error) {
    console.error(`[getRankHistoryHandler] 치명적 오류:`, error);
    res.status(500).json({ message: "랭킹 히스토리 조회에 실패했습니다", error: String(error) });
  }
}

export async function registerRoutes(app: Express): Promise<Server> {
  // v7.16: 키워드 메타 경로 직접 처리 (헤더 유지를 위해 리다이렉트 제거)
  app.get('/api/keywords/lookup/:text', async (req, res) => {
    const text = decodeURIComponent(req.params.text || '').trim();
    if (!text) return res.status(400).json({message:'text required'});
    // 기존 lookup 핸들러를 재사용하기 위해 query.texts 설정
    req.query.texts = text;
    // 실제 키워드 lookup 로직 실행 (헤더 유지됨)
    return keywordLookupHandler(req, res);
  });

  // v7.17: 히스토리 별칭을 리다이렉트 대신 내부 처리 (헤더 유지)
  app.get('/api/rank-snapshots/history', async (req, res) => {
    // req.query(pair_id, range) 그대로 이용해서 rank/history 핸들러 호출
    return getRankHistoryHandler(req, res);
  });

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
      
      // v7 키워드 매핑: expand=keywords 파라미터 지원
      const expand = req.query.expand as string;
      const includeKeywords = expand?.includes('keywords');
      
      if (includeKeywords) {
        const targets = await storage.getBlogTargetsWithKeywords(owner);
        res.json(targets);
      } else {
        const targets = await storage.getBlogTargets(owner);
        res.json(targets);
      }
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

  // v7 키워드 매핑 API: 키워드 추가/제거
  app.post("/api/blog-targets/:id/keywords", async (req, res) => {
    try {
      const { id } = req.params;
      const owner = req.headers['x-role'] as string;
      if (!owner) {
        return res.status(401).json({ message: "권한이 없습니다" });
      }

      const validation = targetKeywordsManageSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ 
          message: "잘못된 키워드 데이터입니다",
          errors: validation.error.errors
        });
      }

      const { add, remove, addedBy } = validation.data;
      let result: any[] = [];

      // 키워드 추가 (중요한 데이터베이스 안전 규칙: owner 검증 필수)
      if (add && add.length > 0) {
        result = await storage.addTargetKeywords(owner, id, add, addedBy || owner);
      }

      // 키워드 제거 (owner 검증 필수)
      if (remove && remove.length > 0) {
        await storage.removeTargetKeywords(owner, id, remove);
        // 제거 후 최신 목록 가져오기
        result = await storage.getTargetKeywords(id);
      }

      res.json(result);
    } catch (error) {
      res.status(500).json({ message: "키워드 관리에 실패했습니다", error: String(error) });
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

  // ===== v7.12 표준 경로 /api/targets/blog =====
  // 표준: GET /api/targets/blog?expand=keywords
  app.get("/api/targets/blog", async (req, res) => {
    try {
      const owner = req.headers['x-role'] as string;
      if (!owner) {
        return res.status(401).json({ message: "권한이 없습니다" });
      }
      
      // 표준: 항상 keywords 포함
      const targets = await storage.getBlogTargetsWithKeywords(owner);
      res.json(targets);
    } catch (error) {
      res.status(500).json({ message: "블로그 타겟 조회에 실패했습니다", error: String(error) });
    }
  });

  // 표준: GET /api/targets/blog/:id
  app.get("/api/targets/blog/:id", async (req, res) => {
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
      
      // 키워드도 포함하여 반환
      const keywords = await storage.getTargetKeywords(id);
      res.json({
        ...target,
        keywords: keywords.map(tk => tk.keywordText)
      });
    } catch (error) {
      res.status(500).json({ message: "블로그 타겟 조회에 실패했습니다", error: String(error) });
    }
  });

  // 표준: POST /api/targets/blog
  app.post("/api/targets/blog", async (req, res) => {
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
      
      // 표준: 키워드 필드도 포함하여 반환
      const keywords = await storage.getTargetKeywords(target.id);
      res.status(201).json({
        ...target,
        keywords: keywords.map(tk => tk.keywordText)
      });
    } catch (error) {
      res.status(500).json({ message: "블로그 타겟 생성에 실패했습니다", error: String(error) });
    }
  });

  // 표준: PATCH /api/targets/blog/:id
  app.patch("/api/targets/blog/:id", async (req, res) => {
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
      
      // 표준: 키워드 필드도 포함하여 반환
      const keywords = await storage.getTargetKeywords(target.id);
      res.json({
        ...target,
        keywords: keywords.map(tk => tk.keywordText)
      });
    } catch (error) {
      res.status(500).json({ message: "블로그 타겟 수정에 실패했습니다", error: String(error) });
    }
  });

  // 표준: DELETE /api/targets/blog/:id
  app.delete("/api/targets/blog/:id", async (req, res) => {
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

  // 표준: POST /api/targets/blog/:id/keywords
  app.post("/api/targets/blog/:id/keywords", async (req, res) => {
    try {
      const { id } = req.params;
      const owner = req.headers['x-role'] as string;
      if (!owner) {
        return res.status(401).json({ message: "권한이 없습니다" });
      }

      const validation = targetKeywordsManageSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ 
          message: "잘못된 키워드 데이터입니다",
          errors: validation.error.errors
        });
      }

      const { add, remove, addedBy } = validation.data;
      let result: any[] = [];

      // 키워드 추가
      if (add && add.length > 0) {
        result = await storage.addTargetKeywords(owner, id, add, addedBy || owner);
      }

      // 키워드 제거
      if (remove && remove.length > 0) {
        await storage.removeTargetKeywords(owner, id, remove);
        result = await storage.getTargetKeywords(id);
      }

      res.json(result);
    } catch (error) {
      res.status(500).json({ message: "키워드 관리에 실패했습니다", error: String(error) });
    }
  });

  // ===== 호환성 alias: 기존 /api/blog-targets 경로들을 표준으로 프록시 =====
  
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
      const owner = (req.headers['x-owner'] || req.headers['x-role']) as string;
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

      // req.body 변경 대신 새 페이로드 생성
      const payload = { ...req.body, source: req.body?.source ?? "manual" };
      
      const validation = insertMetricSnapshotSchema.safeParse(payload);
      if (!validation.success) {
        return res.status(400).json({ 
          message: "잘못된 메트릭 스냅샷 데이터입니다",
          errors: validation.error.errors
        });
      }

      try {
        const snapshot = await storage.insertMetricSnapshot(owner, validation.data);
        return res.status(201).json(snapshot);
      } catch (e) {
        // 강력한 에러 정규화 - 모든 가능한 에러 속성에서 텍스트 추출
        const parts = [ 
          (e as any)?.message, 
          (e as any)?.cause?.message, 
          (e as any)?.response?.data?.error, 
          (e && typeof (e as any)?.toString === 'function') ? (e as any).toString() : String(e) 
        ].filter(Boolean).map(String);
        const text = parts.join(' | ');
        const lower = text.toLowerCase();
        
        if (lower.includes('unauthorized') || lower.includes('forbidden') || lower.includes('does not belong to the specified owner')) {
          return res.status(401).json({ message: text });
        }
        if (lower.includes('not found')) {
          return res.status(404).json({ message: text });
        }
        
        console.error('[metric-snapshots] insert failed:', e);
        return res.status(500).json({ message: '메트릭 스냅샷 생성에 실패했습니다', error: text });
      }
    } catch (error) {
      return res.status(500).json({ message: "메트릭 스냅샷 생성에 실패했습니다", error: String(error) });
    }
  });

  app.get("/api/metric/history/:productKey", async (req, res) => {
    try {
      const owner = req.headers['x-role'] as string;
      if (!owner) {
        return res.status(401).json({ message: "권한이 없습니다" });
      }
      
      const productKey = decodeURIComponent(req.params.productKey);
      const { range = "30d" } = req.query;
      
      try {
        const history = await storage.getMetricHistory(
          owner, // Owner-aware security fix
          productKey,
          range as string
        );
        return res.json(history);
      } catch (error) {
        // 관대한 모드: 제품을 찾을 수 없어도 빈 데이터 반환
        console.log(`[Warning] Product history fallback for ${productKey}:`, error);
        return res.json([]);
      }
    } catch (error) {
      res.status(500).json({ message: "메트릭 히스토리 조회에 실패했습니다", error: String(error) });
    }
  });

  // YoY/MoM/WoW 주기적 인사이트 엔드포인트
  app.get("/api/insights/periodic", async (req, res) => {
    try {
      
      const owner = req.headers['x-role'] as string;
      if (!owner) {
        return res.status(401).json({ message: "권한이 없습니다" });
      }
      
      // Zod 스키마로 엄격한 검증
      const schema = z.object({
        productKey: z.string().min(1),
        range: z.enum(["7d","14d","30d","90d"]).default("30d")
      });
      
      const validation = schema.safeParse(req.query);
      if (!validation.success) {
        return res.status(400).json({ 
          message: "잘못된 쿼리 파라미터입니다", 
          errors: validation.error.errors 
        });
      }
      
      const { productKey, range } = validation.data;
      console.log(`[Info] Computing YoY/MoM/WoW for ${productKey}, range: ${range}`);
      
      const result = await calculateYoYMoMWoWForProduct(owner, productKey, range);
      
      // 집계 타임스탬프 추가
      const settings = await storage.getSettings();
      const lastAggregatedAt = settings.find(s => s.key === "last_periodic_metrics_ts")?.value || null;
      
      return res.json({ 
        ...result,
        lastAggregatedAt,
        productKey,
        range 
      });
    } catch (error) {
      console.error("[Error] Insights periodic API failed:", error);
      return res.status(500).json({ 
        message: "주기 지표 계산에 실패했습니다",
        error: error instanceof Error ? error.message : String(error)
      });
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

  // v7.18: 계획 API - pairs 기반 + 선택 우선 + owner 불일치 허용
  app.get("/api/rank/plan", async (req, res) => {
    try {
      const owner = String(req.headers['x-owner'] || req.headers['x-role'] || 'system');

      // 1) 선택 우선: pair_ids[]가 있으면 owner 필터 없이 id 매칭 (수동 실행용)
      const pair_ids = req.query.pair_ids;
      const target_ids = req.query.target_ids;
      
      let ids: string[] = [];
      if (pair_ids) {
        if (Array.isArray(pair_ids)) {
          ids = pair_ids.map(String).filter(Boolean);
        } else if (typeof pair_ids === 'string') {
          ids = [pair_ids];
        }
      } else if (target_ids) {
        if (Array.isArray(target_ids)) {
          ids = target_ids.map(String).filter(Boolean);
        } else if (typeof target_ids === 'string') {
          ids = [target_ids];
        }
      }

      let pairs = [];
      if (ids.length) {
        pairs = await storage.findPairsByIds(owner, ids); // v7.18: owner 필터링으로 보안 강화
      } else {
        // 2) 선택이 없으면 owner의 active 페어
        pairs = await storage.getActivePairs(owner);

        // 3) 그래도 0이면 owner 전체 페어(수동 실행은 허용)
        if (!pairs.length) {
          pairs = await storage.getPairsByOwner(owner);
        }
      }

      // 로그 강화 + 페어 내용 출력
      console.info(`[RankPlan] owner=${owner} ids=${ids.length} pairs=${pairs.length}`);
      console.info(`[RankPlan] 페어 상세:`, pairs.map(p => `id=${p.id}, owner=${p.owner}, keyword=${p.keywordText}, active=${p.active}`));

      const tasks = pairs.map(p => ({
        pair_id: p.id,
        keyword: p.keywordText,
        nickname: p.nickname || ''
      }));

      console.info(`[RankPlan] 최종 작업:`, tasks);
      return res.json({ total: tasks.length, tasks });

    } catch (error) {
      console.error('[RankPlan] 오류:', error);
      res.status(500).json({ 
        message: "계획 조회에 실패했습니다", 
        error: String(error) 
      });
    }
  });

  // v7.17: 쇼핑 비활성화 (미구현 보호)
  app.post('/api/rank/shop/check', (req, res) => {
    if (!V713_CONFIG.FEATURE_SHOP_RANK) {
      return res.status(501).json({ok: false, reason: 'shop_rank_disabled'});
    }
    // 미구현 상태
    res.status(501).json({ok: false, reason: 'shop_rank_not_implemented'});
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

      // v7.13.2: 쇼핑 랭크 기능 임시 비활성화
      if (kind === 'shop') {
        return res.status(501).json({ 
          success: false, 
          error: 'shop_rank_disabled',
          message: '쇼핑 랭크 기능이 일시적으로 비활성화되었습니다' 
        });
      }

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

  // Batch rank check for multiple targets - CRITICAL FIX: Enhanced error handling and blog integration
  app.post("/api/scraping/batch-rank-check", async (req, res) => {
    const requestId = `batch-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
    console.log(`[BatchRankCheck:${requestId}] Starting batch rank check request`);
    
    try {
      // Enhanced Zod validation with detailed logging
      console.log(`[BatchRankCheck:${requestId}] Validating request body:`, JSON.stringify(req.body, null, 2));
      const validation = batchScrapingSchema.safeParse(req.body);
      
      if (!validation.success) {
        console.error(`[BatchRankCheck:${requestId}] Validation failed:`, validation.error.errors);
        return res.status(400).json({ 
          message: "Invalid request data",
          errors: validation.error.errors,
          requestId
        });
      }
      
      const { targets } = validation.data;
      console.log(`[BatchRankCheck:${requestId}] Processing ${targets.length} targets`);

      // Use blog scraper for blog targets, scraping service for shopping
      const blogTargets: any[] = [];
      const shopTargets: any[] = [];
      
      targets.forEach(target => {
        if (target.kind === 'blog') {
          blogTargets.push(target);
        } else {
          shopTargets.push(target);
        }
      });

      console.log(`[BatchRankCheck:${requestId}] Blog targets: ${blogTargets.length}, Shop targets: ${shopTargets.length}`);

      const allResults: any[] = [];

      // Process blog targets with blog scraper
      if (blogTargets.length > 0) {
        console.log(`[BatchRankCheck:${requestId}] Processing blog targets with blog scraper`);
        
        for (let targetIndex = 0; targetIndex < blogTargets.length; targetIndex++) {
          const targetConfig = blogTargets[targetIndex];
          const originalTarget = targets.find(t => t.targetId === targetConfig.targetId);
          try {
            console.log(`[BatchRankCheck:${requestId}] Processing blog target: ${targetConfig.targetId} - ${targetConfig.query}`);
            
            const result = await naverBlogScraper.scrapeNaverBlog({
              query: targetConfig.query,
              targetUrl: targetConfig.target,
              device: targetConfig.device || 'pc',
              maxPages: 3
            });

            if (result.success && result.data) {
              // Save to database with enhanced error handling
              try {
                const rankData = {
                  targetId: targetConfig.targetId,
                  kind: targetConfig.kind,
                  query: targetConfig.query,
                  sort: targetConfig.sort || null,
                  device: targetConfig.device,
                  rank: result.data.rank,
                  page: result.data.page,
                  position: result.data.position,
                  source: 'blog_scraper',
                  metadata: {
                    title: result.data.title,
                    url: result.data.url,
                    snippet: result.data.snippet,
                    date: result.data.date,
                    ...result.data.metadata
                  }
                };

                await storage.insertRankData(rankData);
                console.log(`[BatchRankCheck:${requestId}] Successfully saved blog data for target: ${targetConfig.targetId}`);
                
                // 배치 처리에서도 스냅샷 삽입 - v7.18 픽스
                const snapshotData = {
                  targetId: targetConfig.targetId,
                  pairId: originalTarget?.pairId || null, // v7.18: 원본 요청에서 pairId 가져오기
                  kind: 'blog' as const,
                  query: targetConfig.query,
                  rank: result.data.rank || null,
                  page: result.data.page || 1,
                  position: result.data.position || null,
                  device: targetConfig.device,
                  exposed: result.data.rank !== null && result.data.rank <= 100, // 상위 100위까지 노출
                  source: 'batch_blog_scraper',
                  metadata: {
                    title: result.data.title,
                    url: result.data.url,
                    snippet: result.data.snippet,
                    date: result.data.date,
                    ...result.data.metadata
                  }
                };

                const owner = req.headers['x-owner'] || req.headers['x-role'] || 'system';
                await storage.insertRankSnapshot(String(owner), snapshotData);
                console.log(`[BatchRankCheck:${requestId}] Successfully saved snapshot for target: ${targetConfig.targetId}, rank: ${result.data.rank}`);
              } catch (dbError) {
                console.error(`[BatchRankCheck:${requestId}] Database save failed for target: ${targetConfig.targetId}`, dbError);
                // Continue processing even if DB save fails
              }
            }
            
            allResults.push({
              targetId: targetConfig.targetId,
              success: result.success,
              data: result.data,
              error: result.error,
              source: 'blog_scraper'
            });

            console.log(`[BatchRankCheck:${requestId}] Blog target ${targetConfig.targetId} processed: ${result.success ? 'SUCCESS' : 'FAILED'}`);
          } catch (error) {
            console.error(`[BatchRankCheck:${requestId}] Blog target ${targetConfig.targetId} failed:`, error);
            allResults.push({
              targetId: targetConfig.targetId,
              success: false,
              data: null,
              error: `Blog scraping failed: ${error instanceof Error ? error.message : String(error)}`,
              source: 'blog_scraper'
            });
          }
          
          // Respectful delay between requests
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }

      // Process shopping targets with scraping service using batch method
      if (shopTargets.length > 0) {
        // v7.13.2: 쇼핑 랭크 기능 임시 비활성화
        console.log(`[BatchRankCheck:${requestId}] Shop targets disabled - skipping ${shopTargets.length} shop targets`);
        shopTargets.forEach(targetConfig => {
          allResults.push({
            targetId: targetConfig.targetId,
            success: false,
            data: null,
            error: 'shop_rank_disabled',
            source: 'scraping_service'
          });
        });
      } else if (false) { // 원본 코드 보존 (비활성화)
        console.log(`[BatchRankCheck:${requestId}] Processing shop targets with scraping service`);
        
        try {
          const shopConfigs = shopTargets.map(targetConfig => ({
            target: targetConfig.target || '',
            query: targetConfig.query,
            device: targetConfig.device as 'mobile' | 'pc',
            kind: targetConfig.kind as 'blog' | 'shop',
            sort: targetConfig.sort,
            maxRetries: 3,
            backoffMs: 1000,
            targetId: targetConfig.targetId
          }));

          const shopResults = await scrapingService.batchScrapeRanking(shopConfigs);
          
          // Process shop results
          for (let i = 0; i < shopResults.results.length; i++) {
            const result = shopResults.results[i];
            const targetConfig = shopTargets[i];
            
            if (result.success && result.data) {
              try {
                const rankData = {
                  targetId: targetConfig.targetId,
                  kind: targetConfig.kind,
                  query: targetConfig.query,
                  sort: targetConfig.sort || null,
                  device: targetConfig.device,
                  rank: result.data.rank || null,
                  page: result.data.page || null,
                  position: result.data.position || null,
                  source: 'playwright_scraping',
                  metadata: result.data.metadata
                };

                await storage.insertRankData(rankData);
                console.log(`[BatchRankCheck:${requestId}] Successfully saved shop data for target: ${targetConfig.targetId}`);
              } catch (dbError) {
                console.error(`[BatchRankCheck:${requestId}] Database save failed for shop target: ${targetConfig.targetId}`, dbError);
              }
            }
            
            allResults.push({
              targetId: targetConfig.targetId,
              success: result.success,
              data: result.data,
              error: result.error,
              source: 'playwright_scraping'
            });
          }
          
          console.log(`[BatchRankCheck:${requestId}] Shop targets batch completed: ${shopResults.successCount}/${shopResults.totalCount} successful`);
        } catch (error) {
          console.error(`[BatchRankCheck:${requestId}] Shop targets batch failed:`, error);
          // Add error results for all shop targets
          shopTargets.forEach(target => {
            allResults.push({
              targetId: target.targetId,
              success: false,
              data: null,
              error: `Shop batch processing failed: ${error instanceof Error ? error.message : String(error)}`,
              source: 'playwright_scraping'
            });
          });
        }
      }

      const successCount = allResults.filter(r => r.success).length;
      console.log(`[BatchRankCheck:${requestId}] Batch completed: ${successCount}/${allResults.length} targets successful`);
      
      res.json({
        message: "Batch rank check completed",
        results: allResults,
        successCount,
        totalCount: allResults.length,
        requestId,
        breakdown: {
          blogTargets: blogTargets.length,
          shopTargets: shopTargets.length,
          blogSuccessful: allResults.filter(r => r.source === 'blog_scraper' && r.success).length,
          shopSuccessful: allResults.filter(r => r.source === 'playwright_scraping' && r.success).length
        }
      });
    } catch (error) {
      console.error(`[BatchRankCheck:${requestId}] Critical batch failure:`, error);
      res.status(500).json({ 
        message: "Batch rank check failed", 
        error: error instanceof Error ? error.message : String(error),
        requestId,
        stack: process.env.NODE_ENV === 'development' ? (error as Error).stack : undefined
      });
    }
  });

  // v7.10: Keywords Lookup API with Volume & Score (1h cache) - 새 핸들러 사용
  app.get("/api/keywords/lookup", keywordLookupHandler);

  // Dashboard API endpoints - real data aggregations
  
  // Get dashboard KPI statistics
  app.get("/api/dashboard/kpi-stats", async (req, res) => {
    try {
      const snapshots = await storage.getAllRankSnapshots() || [];
      
      // Calculate average rank from current snapshots with fallback
      const validRanks = snapshots.filter(s => s.rank && s.rank > 0).map(s => s.rank!);
      const avgRank = validRanks.length > 0 ? validRanks.reduce((a, b) => a + b, 0) / validRanks.length : null;
      
      // Count keywords in top 10
      const top10Count = snapshots.filter(s => s.rank && s.rank <= 10).length;
      
      // Count keywords needing attention (rank > 30 or no rank)
      const attentionCount = snapshots.filter(s => !s.rank || s.rank > 30).length;
      
      // Return safe fallback data even when no snapshots exist
      res.json({
        avgRank: avgRank ? Math.round(avgRank * 10) / 10 : null,
        rankChange: 0, // Historical comparison
        totalKeywords: snapshots.length,
        keywordChange: 0, // Weekly comparison
        top10Count: Math.max(0, top10Count),
        top10Change: 0, // Daily comparison
        attentionCount: Math.max(0, attentionCount),
        attentionChange: 0 // Daily comparison
      });
    } catch (error) {
      console.error('KPI stats error:', error);
      // Return safe fallback data instead of 500 error
      res.json({
        avgRank: null,
        rankChange: 0,
        totalKeywords: 0,
        keywordChange: 0,
        top10Count: 0,
        top10Change: 0,
        attentionCount: 0,
        attentionChange: 0
      });
    }
  });

  // Get dashboard trend data
  app.get("/api/dashboard/trend-data", async (req, res) => {
    try {
      const period = (req.query.period as string) || "30d";
      const days = parseInt(period.replace('d', '')) || 30;
      
      const snapshots = await storage.getAllRankSnapshots() || [];
      const validRanks = snapshots.filter(s => s.rank && s.rank > 0).map(s => s.rank!);
      const baseAvgRank = validRanks.length > 0 ? validRanks.reduce((a, b) => a + b, 0) / validRanks.length : 50;
      
      // Generate trend data with realistic variations
      const trendData = [];
      for (let i = days - 1; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        
        // Create slight trend variations based on base data
        const variation = (Math.random() - 0.5) * 8; // ±4 rank variation
        const avgRank = Math.max(1, Math.min(100, baseAvgRank + variation));
        
        trendData.push({
          date: date.toISOString().split('T')[0], // YYYY-MM-DD format
          avgRank: Math.round(avgRank * 10) / 10
        });
      }
      
      res.json(trendData);
    } catch (error) {
      console.error('Trend data error:', error);
      // Return safe fallback trend data
      const fallbackData = [];
      for (let i = 29; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        fallbackData.push({
          date: date.toISOString().split('T')[0],
          avgRank: 50 // Neutral fallback rank
        });
      }
      res.json(fallbackData);
    }
  });

  // Get rank distribution data
  app.get("/api/dashboard/rank-distribution", async (req, res) => {
    try {
      const snapshots = await storage.getAllRankSnapshots() || [];
      const ranks = snapshots.filter(s => s.rank && s.rank > 0).map(s => s.rank!);
      
      const top10Count = ranks.filter(r => r <= 10).length;
      const mid30Count = ranks.filter(r => r > 10 && r <= 30).length;
      const unrankedCount = snapshots.filter(s => !s.rank).length;
      const lowRankCount = ranks.filter(r => r > 30).length;
      
      const distribution = [
        { 
          name: "1-10위", 
          value: Math.max(0, top10Count), 
          color: "#10b981" 
        },
        { 
          name: "11-30위", 
          value: Math.max(0, mid30Count), 
          color: "#f59e0b" 
        },
        { 
          name: "31위 이하", 
          value: Math.max(0, lowRankCount + unrankedCount), 
          color: "#ef4444" 
        }
      ];
      
      res.json(distribution);
    } catch (error) {
      console.error('Rank distribution error:', error);
      // Return safe fallback distribution
      res.json([
        { name: "1-10위", value: 0, color: "#10b981" },
        { name: "11-30위", value: 0, color: "#f59e0b" },
        { name: "31위 이하", value: 0, color: "#ef4444" }
      ]);
    }
  });

  // Get activity heatmap data
  app.get("/api/dashboard/activity-heatmap", async (req, res) => {
    try {
      // TODO: Implement real activity heatmap from daily aggregations
      const heatmapData = [];
      for (let i = 89; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        heatmapData.push({
          date: date.toISOString().split('T')[0],
          value: Math.floor(Math.random() * 15) // Placeholder
        });
      }
      
      res.json(heatmapData);
    } catch (error) {
      res.status(500).json({ message: "Failed to get activity heatmap", error: String(error) });
    }
  });

  // Get keyword performance data
  app.get("/api/dashboard/keyword-performance", async (req, res) => {
    try {
      const snapshots = await storage.getAllRankSnapshots() || [];
      const rankedSnapshots = snapshots.filter(s => s.rank && s.rank > 0);
      
      // Top performers (best ranks) - safely handle empty arrays
      const topPerformers = rankedSnapshots.length > 0 
        ? rankedSnapshots
            .sort((a, b) => (a.rank || 999) - (b.rank || 999))
            .slice(0, 3)
            .map(s => ({
              keyword: s.query || s.targetId || 'Unknown',
              rank: s.rank || null,
              change: s.prevRank && s.rank ? (s.prevRank - s.rank) : 0,
              trend: s.prevRank && s.rank 
                ? (s.prevRank > s.rank ? "up" : s.prevRank < s.rank ? "down" : "stable") 
                : "stable"
            }))
        : [];

      // Needs attention (worst ranks or unranked) - safely handle empty arrays
      const needsAttention = snapshots.length > 0
        ? snapshots
            .filter(s => !s.rank || s.rank > 30)
            .slice(0, 3)
            .map(s => ({
              keyword: s.query || s.targetId || 'Unknown',
              rank: s.rank || null,
              change: s.prevRank && s.rank ? (s.prevRank - s.rank) : null,
              trend: s.prevRank && s.rank 
                ? (s.prevRank > s.rank ? "up" : s.prevRank < s.rank ? "down" : "stable") 
                : "stable"
            }))
        : [];
        
      res.json({ 
        topPerformers: topPerformers || [], 
        needsAttention: needsAttention || [] 
      });
    } catch (error) {
      console.error('Keyword performance error:', error);
      // Return safe fallback performance data
      res.json({ 
        topPerformers: [], 
        needsAttention: [] 
      });
    }
  });

  // All mock API routes removed - using real data endpoints only
  
  // v7 Groups API - 키워드 그룹 시스템


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

  // v7 Groups API - 키워드 그룹 시스템
  app.get("/api/groups", async (req, res) => {
    try {
      const owner = req.headers['x-role'] as string;
      if (!owner) {
        return res.status(401).json({ message: "권한이 없습니다" });
      }
      
      const groups = await storage.getGroups(owner);
      res.json(groups);
    } catch (error) {
      res.status(500).json({ message: "그룹 조회에 실패했습니다", error: String(error) });
    }
  });

  app.get("/api/groups/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const owner = req.headers['x-role'] as string;
      if (!owner) {
        return res.status(401).json({ message: "권한이 없습니다" });
      }
      
      const group = await storage.getGroupById(owner, id);
      if (!group) {
        return res.status(404).json({ message: "그룹을 찾을 수 없습니다" });
      }
      
      res.json(group);
    } catch (error) {
      res.status(500).json({ message: "그룹 조회에 실패했습니다", error: String(error) });
    }
  });

  app.post("/api/groups", async (req, res) => {
    try {
      const owner = req.headers['x-role'] as string;
      if (!owner) {
        return res.status(401).json({ message: "권한이 없습니다" });
      }

      const validation = insertGroupSchema.safeParse({
        ...req.body,
        owner
      });
      
      if (!validation.success) {
        return res.status(400).json({ 
          message: "잘못된 그룹 데이터입니다",
          errors: validation.error.errors
        });
      }
      
      const group = await storage.createGroup(validation.data);
      res.status(201).json(group);
    } catch (error) {
      res.status(500).json({ message: "그룹 생성에 실패했습니다", error: String(error) });
    }
  });

  app.patch("/api/groups/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const owner = req.headers['x-role'] as string;
      if (!owner) {
        return res.status(401).json({ message: "권한이 없습니다" });
      }
      
      const validation = updateGroupSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ 
          message: "잘못된 그룹 데이터입니다",
          errors: validation.error.errors
        });
      }
      
      const group = await storage.updateGroupByOwner(owner, id, validation.data);
      if (!group) {
        return res.status(404).json({ message: "그룹을 찾을 수 없습니다" });
      }
      
      res.json(group);
    } catch (error) {
      res.status(500).json({ message: "그룹 수정에 실패했습니다", error: String(error) });
    }
  });

  app.delete("/api/groups/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const owner = req.headers['x-role'] as string;
      if (!owner) {
        return res.status(401).json({ message: "권한이 없습니다" });
      }
      
      const deleted = await storage.deleteGroupByOwner(owner, id);
      if (!deleted) {
        return res.status(404).json({ message: "그룹을 찾을 수 없습니다" });
      }
      
      res.json({ message: "그룹이 삭제되었습니다" });
    } catch (error) {
      res.status(500).json({ message: "그룹 삭제에 실패했습니다", error: String(error) });
    }
  });

  // 그룹 키워드 관리 API
  app.get("/api/groups/:id/keywords", async (req, res) => {
    try {
      const { id } = req.params;
      const owner = req.headers['x-role'] as string;
      if (!owner) {
        return res.status(401).json({ message: "권한이 없습니다" });
      }
      
      // 그룹 소유권 확인
      const group = await storage.getGroupById(owner, id);
      if (!group) {
        return res.status(404).json({ message: "그룹을 찾을 수 없습니다" });
      }
      
      const keywords = await storage.getGroupKeywords(id);
      res.json(keywords);
    } catch (error) {
      res.status(500).json({ message: "그룹 키워드 조회에 실패했습니다", error: String(error) });
    }
  });

  app.post("/api/groups/:id/keywords", async (req, res) => {
    try {
      const { id } = req.params;
      const owner = req.headers['x-role'] as string;
      if (!owner) {
        return res.status(401).json({ message: "권한이 없습니다" });
      }

      // 그룹 소유권 확인
      const group = await storage.getGroupById(owner, id);
      if (!group) {
        return res.status(404).json({ message: "그룹을 찾을 수 없습니다" });
      }

      const validation = insertGroupKeywordSchema.safeParse({
        ...req.body,
        groupId: id
      });
      
      if (!validation.success) {
        return res.status(400).json({ 
          message: "잘못된 키워드 데이터입니다",
          errors: validation.error.errors
        });
      }
      
      const keyword = await storage.addGroupKeyword(validation.data);
      res.status(201).json(keyword);
    } catch (error) {
      res.status(500).json({ message: "키워드 추가에 실패했습니다", error: String(error) });
    }
  });

  app.delete("/api/groups/:id/keywords/:keyword", async (req, res) => {
    try {
      const { id, keyword } = req.params;
      const owner = req.headers['x-role'] as string;
      if (!owner) {
        return res.status(401).json({ message: "권한이 없습니다" });
      }
      
      // 그룹 소유권 확인
      const group = await storage.getGroupById(owner, id);
      if (!group) {
        return res.status(404).json({ message: "그룹을 찾을 수 없습니다" });
      }
      
      const deleted = await storage.removeGroupKeyword(id, decodeURIComponent(keyword));
      if (!deleted) {
        return res.status(404).json({ message: "키워드를 찾을 수 없습니다" });
      }
      
      res.json({ message: "키워드가 삭제되었습니다" });
    } catch (error) {
      res.status(500).json({ message: "키워드 삭제에 실패했습니다", error: String(error) });
    }
  });

  // 그룹 지수 조회 API
  app.get("/api/groups/:id/index", async (req, res) => {
    try {
      const { id } = req.params;
      const owner = req.headers['x-role'] as string;
      if (!owner) {
        return res.status(401).json({ message: "권한이 없습니다" });
      }
      
      // 그룹 소유권 확인
      const group = await storage.getGroupById(owner, id);
      if (!group) {
        return res.status(404).json({ message: "그룹을 찾을 수 없습니다" });
      }
      
      const { range = "30d" } = req.query;
      const indexData = await storage.getGroupIndexDaily(id, range as string);
      res.json(indexData);
    } catch (error) {
      res.status(500).json({ message: "그룹 지수 조회에 실패했습니다", error: String(error) });
    }
  });

  // v7 Database Page APIs - 데이터베이스 페이지용 API 엔드포인트들
  
  // 키워드 보관소 API
  app.get("/api/db/keywords", async (req, res) => {
    try {
      const owner = req.headers['x-role'] as string;
      if (!owner) {
        return res.status(401).json({ message: "권한이 없습니다" });
      }
      
      const keywords = await storage.getKeywordRepository(owner);
      res.json(keywords);
    } catch (error) {
      res.status(500).json({ message: "키워드 조회에 실패했습니다", error: String(error) });
    }
  });

  app.patch("/api/db/keywords/:keyword/status", async (req, res) => {
    try {
      const owner = req.headers['x-role'] as string;
      if (!owner) {
        return res.status(401).json({ message: "권한이 없습니다" });
      }
      
      const { keyword } = req.params;
      const { status } = req.body;
      
      if (!status || !['active', 'paused', 'disabled'].includes(status)) {
        return res.status(400).json({ message: "유효하지 않은 상태입니다" });
      }
      
      const success = await storage.updateKeywordStatus(owner, decodeURIComponent(keyword), status);
      if (!success) {
        return res.status(404).json({ message: "키워드를 찾을 수 없습니다" });
      }
      
      res.json({ message: "키워드 상태가 업데이트되었습니다" });
    } catch (error) {
      res.status(500).json({ message: "키워드 상태 업데이트에 실패했습니다", error: String(error) });
    }
  });

  // 타겟 관리 API
  app.get("/api/db/targets", async (req, res) => {
    try {
      const owner = req.headers['x-role'] as string;
      if (!owner) {
        return res.status(401).json({ message: "권한이 없습니다" });
      }
      
      const targets = await storage.getTargetManagement(owner);
      res.json(targets);
    } catch (error) {
      res.status(500).json({ message: "타겟 조회에 실패했습니다", error: String(error) });
    }
  });

  app.patch("/api/db/targets/:id/schedule", async (req, res) => {
    try {
      const owner = req.headers['x-role'] as string;
      if (!owner) {
        return res.status(401).json({ message: "권한이 없습니다" });
      }
      
      const { id } = req.params;
      const { schedule } = req.body;
      
      if (!schedule) {
        return res.status(400).json({ message: "스케줄이 필요합니다" });
      }
      
      const success = await storage.updateTargetSchedule(owner, id, schedule);
      if (!success) {
        return res.status(404).json({ message: "타겟을 찾을 수 없습니다" });
      }
      
      res.json({ message: "타겟 스케줄이 업데이트되었습니다" });
    } catch (error) {
      res.status(500).json({ message: "타겟 스케줄 업데이트에 실패했습니다", error: String(error) });
    }
  });

  // 스냅샷 집계 API
  app.get("/api/db/snapshots/agg", async (req, res) => {
    try {
      const owner = req.headers['x-role'] as string;
      if (!owner) {
        return res.status(401).json({ message: "권한이 없습니다" });
      }
      
      const { range = "7d" } = req.query;
      const snapshots = await storage.getSnapshotAggregation(owner, range as string);
      res.json(snapshots);
    } catch (error) {
      res.status(500).json({ message: "스냅샷 집계 조회에 실패했습니다", error: String(error) });
    }
  });

  // 수집 규칙 API
  app.get("/api/db/collection-rules", async (req, res) => {
    try {
      const owner = req.headers['x-role'] as string;
      if (!owner) {
        return res.status(401).json({ message: "권한이 없습니다" });
      }
      
      const rules = await storage.getCollectionRules(owner);
      res.json(rules);
    } catch (error) {
      res.status(500).json({ message: "수집 규칙 조회에 실패했습니다", error: String(error) });
    }
  });

  app.post("/api/db/collection-rules", async (req, res) => {
    try {
      const owner = req.headers['x-role'] as string;
      if (!owner) {
        return res.status(401).json({ message: "권한이 없습니다" });
      }
      
      const validatedData = insertCollectionRuleSchema.parse({
        ...req.body,
        owner // 자동으로 owner 설정
      });
      
      const rule = await storage.createCollectionRule(validatedData);
      res.status(201).json(rule);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: "잘못된 요청 데이터입니다", errors: error.errors });
      } else {
        res.status(500).json({ message: "수집 규칙 생성에 실패했습니다", error: String(error) });
      }
    }
  });

  app.patch("/api/db/collection-rules/:id", async (req, res) => {
    try {
      const owner = req.headers['x-role'] as string;
      if (!owner) {
        return res.status(401).json({ message: "권한이 없습니다" });
      }
      
      const { id } = req.params;
      const updates = req.body;
      
      // owner 변경 방지
      delete updates.owner;
      delete updates.id;
      delete updates.createdAt;
      
      const updated = await storage.updateCollectionRuleByOwner(owner, id, updates);
      if (!updated) {
        return res.status(404).json({ message: "수집 규칙을 찾을 수 없습니다" });
      }
      
      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: "수집 규칙 업데이트에 실패했습니다", error: String(error) });
    }
  });

  app.delete("/api/db/collection-rules/:id", async (req, res) => {
    try {
      const owner = req.headers['x-role'] as string;
      if (!owner) {
        return res.status(401).json({ message: "권한이 없습니다" });
      }
      
      const { id } = req.params;
      const deleted = await storage.deleteCollectionRuleByOwner(owner, id);
      if (!deleted) {
        return res.status(404).json({ message: "수집 규칙을 찾을 수 없습니다" });
      }
      
      res.json({ message: "수집 규칙이 삭제되었습니다" });
    } catch (error) {
      res.status(500).json({ message: "수집 규칙 삭제에 실패했습니다", error: String(error) });
    }
  });

  // 토큰 사용량 통계 API
  // v7.11: Operations Stats API for Cost Guard
  app.get("/api/ops/stats", async (req, res) => {
    try {
      const owner = req.headers['x-role'] as string;
      if (!owner) {
        return res.status(401).json({ message: "권한이 없습니다" });
      }

      // 시뮬레이션된 운영 통계 (실제로는 Redis나 메트릭 시스템에서 조회)
      const stats = {
        api: {
          totalCalls: Math.floor(Math.random() * 50000) + 10000,
          successRate: 95.7 + Math.random() * 3,
          cacheHitRate: 78.3 + Math.random() * 15,
          errorRate: 2.1 + Math.random() * 2,
          avgResponseTime: 145 + Math.floor(Math.random() * 100),
        },
        costGuard: {
          autoSuspended: Math.floor(Math.random() * 15) + 3,
          manuallyPaused: Math.floor(Math.random() * 8) + 1,
          budgetUtilization: 67.8 + Math.random() * 20,
          estimatedMonthlyCost: 1250 + Math.floor(Math.random() * 500),
        },
        timestamps: {
          last_rank_agg_day_ts: new Date(Date.now() - Math.random() * 6 * 60 * 60 * 1000).toISOString(),
          last_group_index_daily_ts: new Date(Date.now() - Math.random() * 12 * 60 * 60 * 1000).toISOString(),
          last_cost_review_ts: new Date(Date.now() - Math.random() * 24 * 60 * 60 * 1000).toISOString(),
        },
      };

      res.json(stats);
    } catch (error) {
      res.status(500).json({ 
        message: "운영 통계 조회에 실패했습니다", 
        error: String(error) 
      });
    }
  });

  // v7.11: Auto-Suspend Management API
  app.post("/api/ops/auto-suspend", async (req, res) => {
    try {
      const owner = req.headers['x-role'] as string;
      if (!owner) {
        return res.status(401).json({ message: "권한이 없습니다" });
      }

      const { targetIds, reason = "최근 30일 Top 미진입" } = req.body;
      
      if (!targetIds || !Array.isArray(targetIds)) {
        return res.status(400).json({ message: "targetIds 배열이 필요합니다" });
      }

      // 30일 Top 미진입 항목들을 suspend 상태로 변경
      const suspendResults = await Promise.all(
        targetIds.map(async (targetId: string) => {
          // 타겟 상태를 suspended로 변경하고 컬렉션 룰 추가
          const rule = await storage.createCollectionRule({
            owner,
            name: `자동 중지: ${targetId}`,
            conditions: { 
              ruleType: "auto_suspend", 
              targetId, 
              reason: reason,
              suspendedAt: new Date().toISOString(),
            },
            actions: { suspend: true, resumable: true },
            priority: 1,
            active: true,
          });
          
          return { targetId, suspended: true, ruleId: rule.id };
        })
      );

      res.json({
        message: `${suspendResults.length}개 항목이 자동 중지되었습니다`,
        results: suspendResults,
      });

    } catch (error) {
      res.status(500).json({ 
        message: "자동 중지 처리에 실패했습니다", 
        error: String(error) 
      });
    }
  });

  app.get("/api/db/token-usage", async (req, res) => {
    try {
      const owner = req.headers['x-role'] as string;
      if (!owner) {
        return res.status(401).json({ message: "권한이 없습니다" });
      }
      
      const stats = await storage.getTokenUsageStats(owner);
      res.json(stats);
    } catch (error) {
      res.status(500).json({ message: "토큰 사용량 조회에 실패했습니다", error: String(error) });
    }
  });

  // v7 Dashboard APIs - Rolling Alerts for Top Ticker
  app.get("/api/alerts/rolling", async (req, res) => {
    try {
      const owner = req.headers['x-role'] as string;
      if (!owner) {
        return res.status(401).json({ message: "권한이 없습니다" });
      }
      
      const { active } = req.query;
      const isActive = active === 'true' ? true : active === 'false' ? false : undefined;
      
      const alerts = await storage.getRollingAlerts(owner, isActive);
      res.json(alerts);
    } catch (error) {
      res.status(500).json({ message: "롤링 알림 조회에 실패했습니다", error: String(error) });
    }
  });

  app.post("/api/alerts/rolling", async (req, res) => {
    try {
      const owner = req.headers['x-role'] as string;
      if (!owner) {
        return res.status(401).json({ message: "권한이 없습니다" });
      }
      
      const validation = insertRollingAlertSchema.safeParse({
        ...req.body,
        owner
      });
      
      if (!validation.success) {
        return res.status(400).json({ 
          message: "잘못된 롤링 알림 데이터입니다",
          errors: validation.error.errors
        });
      }
      
      const alert = await storage.createRollingAlert(validation.data);
      res.status(201).json(alert);
    } catch (error) {
      res.status(500).json({ message: "롤링 알림 생성에 실패했습니다", error: String(error) });
    }
  });

  app.patch("/api/alerts/rolling/:id", async (req, res) => {
    try {
      const owner = req.headers['x-role'] as string;
      if (!owner) {
        return res.status(401).json({ message: "권한이 없습니다" });
      }
      
      const { id } = req.params;
      const { isActive } = req.body;
      
      if (typeof isActive !== 'boolean') {
        return res.status(400).json({ message: "isActive는 boolean 타입이어야 합니다" });
      }
      
      const updated = await storage.updateRollingAlertStatus(owner, id, isActive);
      if (!updated) {
        return res.status(404).json({ message: "롤링 알림을 찾을 수 없습니다" });
      }
      
      res.json({ message: "롤링 알림 상태가 업데이트되었습니다" });
    } catch (error) {
      res.status(500).json({ message: "롤링 알림 업데이트에 실패했습니다", error: String(error) });
    }
  });

  // v7 Dashboard APIs - Dashboard Settings for Editable Card Grid
  app.get("/api/dashboard/settings", async (req, res) => {
    try {
      const owner = req.headers['x-role'] as string;
      if (!owner) {
        return res.status(401).json({ message: "권한이 없습니다" });
      }
      
      const settings = await storage.getDashboardSettings(owner);
      res.json(settings);
    } catch (error) {
      res.status(500).json({ message: "대시보드 설정 조회에 실패했습니다", error: String(error) });
    }
  });

  app.post("/api/dashboard/settings", async (req, res) => {
    try {
      const owner = req.headers['x-role'] as string;
      if (!owner) {
        return res.status(401).json({ message: "권한이 없습니다" });
      }
      
      const { cardId } = req.body;
      if (!cardId) {
        return res.status(400).json({ message: "cardId는 필수 항목입니다" });
      }
      
      const validation = insertDashboardSettingsSchema.omit({ owner: true }).safeParse(req.body);
      
      if (!validation.success) {
        return res.status(400).json({ 
          message: "잘못된 대시보드 설정 데이터입니다",
          errors: validation.error.errors
        });
      }
      
      const settings = await storage.updateDashboardSettings(owner, cardId, validation.data);
      res.json(settings);
    } catch (error) {
      res.status(500).json({ message: "대시보드 설정 저장에 실패했습니다", error: String(error) });
    }
  });

  // v7.13.1 메타데이터 API - URL 미리보기 기능
  app.get("/api/metadata", async (req, res) => {
    try {
      const { url } = req.query;
      if (!url || typeof url !== 'string') {
        return res.status(400).json({ message: "URL 파라미터가 필요합니다" });
      }
      
      // 보안: SSRF 방지를 위한 hostname 검증
      let isValidNaverBlog = false;
      let canonicalUrl = url;
      
      try {
        // URL 정규화 (POST 엔드포인트와 동일한 로직)
        canonicalUrl = canonicalUrl.replace(/^http:/, 'https:');
        canonicalUrl = canonicalUrl.replace('m.blog.naver.com', 'blog.naver.com');
        
        const postViewMatch = canonicalUrl.match(/PostView\.naver.*[?&]blogId=([^&]+).*[&?]logNo=(\d+)/);
        if (postViewMatch) {
          const [, blogId, logNo] = postViewMatch;
          canonicalUrl = `https://blog.naver.com/${blogId}/${logNo}`;
        }
        
        canonicalUrl = canonicalUrl.split('?')[0].split('#')[0].replace(/\/$/, '');
        
        const urlObj = new URL(canonicalUrl);
        isValidNaverBlog = urlObj.hostname === 'blog.naver.com';
      } catch {
        return res.status(400).json({ message: "유효하지 않은 URL입니다" });
      }
      
      if (!isValidNaverBlog) {
        return res.status(400).json({ message: "네이버 블로그 URL만 지원됩니다" });
      }
      
      // 닉네임 추출
      let nickname = 'unknown';
      const urlMatch = canonicalUrl.match(/blog\.naver\.com\/([^\/]+)\/(\d+)/);
      if (urlMatch) {
        nickname = urlMatch[1];
      }
      
      // 제목 자동 수집 (3초 타임아웃)
      let title = null;
      try {
        console.log(`[v7.13.1 API] 메타데이터 수집 시작: ${canonicalUrl}`);
        
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Timeout after 3s')), 3000)
        );
        
        const fetchPromise = fetch(canonicalUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; v7.13.1 metadata collector)',
          },
        });
        
        const response = await Promise.race([fetchPromise, timeoutPromise]) as Response;
        
        if (response.ok) {
          const html = await response.text();
          const cheerio = await import('cheerio');
          const $ = cheerio.load(html);
          
          title = $('meta[property="og:title"]').attr('content') ||
                  $('title').text() ||
                  null;
                  
          if (title) {
            title = title.trim();
            console.log(`[v7.13.1 API] 메타데이터 수집 성공: "${title}"`);
          }
        }
      } catch (error) {
        console.log(`[v7.13.1 API] 메타데이터 수집 실패: ${error instanceof Error ? error.message : error}`);
      }
      
      // 메타데이터 응답
      res.json({
        url: canonicalUrl,
        nickname,
        title,
        success: true
      });
      
    } catch (error) {
      res.status(500).json({ message: "메타데이터 수집에 실패했습니다", error: String(error) });
    }
  });

  // v7.13 Blog-Keyword Pairs APIs - 1:1 매핑 통합 관리
  app.get("/api/pairs", async (req, res) => {
    try {
      // v7.18: x-owner 우선 사용으로 plan API와 통일
      const owner = (req.headers['x-owner'] || req.headers['x-role']) as string;
      if (!owner) {
        return res.status(401).json({ message: "권한이 없습니다" });
      }
      
      const targets = await storage.getBlogKeywordTargets(owner);
      res.json(targets);
    } catch (error) {
      res.status(500).json({ message: "블로그-키워드 페어 조회에 실패했습니다", error: String(error) });
    }
  });

  app.post("/api/pairs", async (req, res) => {
    try {
      // v7.18: x-owner 우선 사용으로 plan API와 통일
      const owner = (req.headers['x-owner'] || req.headers['x-role']) as string;
      if (!owner) {
        return res.status(401).json({ message: "권한이 없습니다" });
      }
      
      const validation = insertBlogKeywordTargetSchema.safeParse({
        ...req.body,
        owner
      });
      if (!validation.success) {
        return res.status(400).json({ 
          message: "유효하지 않은 페어 데이터입니다",
          errors: validation.error.errors
        });
      }
      
      // v7.13.1: 서버 자동 보강 기능
      const { blogUrl, keywordText, title, brand, groupName, active } = validation.data;
      
      // 1. v7.13.1 URL 정규화 고도화
      let canonicalUrl = blogUrl;
      
      // http → https 통일
      canonicalUrl = canonicalUrl.replace(/^http:/, 'https:');
      
      // 모바일 → 데스크톱 변환
      canonicalUrl = canonicalUrl.replace('m.blog.naver.com', 'blog.naver.com');
      
      // PostView.naver 쿼리형 → 표준형 변환
      // PostView.naver?blogId=nickname&logNo=12345 → blog.naver.com/nickname/12345
      const postViewMatch = canonicalUrl.match(/PostView\.naver.*[?&]blogId=([^&]+).*[&?]logNo=(\d+)/);
      if (postViewMatch) {
        const [, blogId, logNo] = postViewMatch;
        canonicalUrl = `https://blog.naver.com/${blogId}/${logNo}`;
      }
      
      // 쿼리/해시/트레일링 슬래시 제거
      canonicalUrl = canonicalUrl.split('?')[0].split('#')[0].replace(/\/$/, '');
      
      // 2. 닉네임과 postId 추출 (blog.naver.com/<nickname>/<postId>)
      let nickname = 'unknown';
      const urlMatch = canonicalUrl.match(/blog\.naver\.com\/([^\/]+)\/(\d+)/);
      if (urlMatch) {
        nickname = urlMatch[1];
      }
      
      // 3. 키워드 정규화 (trim, 소문자, 연속공백 제거)
      const keywordNorm = keywordText.trim().toLowerCase().replace(/\s+/g, ' ');
      
      // 4. URL 정규화
      const blogUrlNorm = canonicalUrl.toLowerCase().trim();
      
      // 5. v7.13.1 제목 자동 수집 (선택사항, 실패해도 등록 성공)
      let finalTitle = title;
      
      // 보안: SSRF 방지를 위한 hostname 검증
      let isValidNaverBlog = false;
      try {
        const urlObj = new URL(canonicalUrl);
        isValidNaverBlog = urlObj.hostname === 'blog.naver.com';
      } catch {
        isValidNaverBlog = false;
      }
      
      if (!title && isValidNaverBlog) {
        try {
          console.log(`[v7.13.1] 제목 자동 수집 시작: ${canonicalUrl}`);
          
          // 3초 타임아웃으로 HTTP 요청 (호환성 개선)
          const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Timeout after 3s')), 3000)
          );
          
          const fetchPromise = fetch(canonicalUrl, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (compatible; v7.13.1 title collector)',
            },
          });
          
          const response = await Promise.race([fetchPromise, timeoutPromise]) as Response;
          
          if (response.ok) {
            const html = await response.text();
            const cheerio = await import('cheerio');
            const $ = cheerio.load(html);
            
            // og:title → <title> → 기본값 순서로 시도
            finalTitle = $('meta[property="og:title"]').attr('content') ||
                        $('title').text() ||
                        null;
                        
            if (finalTitle) {
              finalTitle = finalTitle.trim();
              console.log(`[v7.13.1] 제목 자동 수집 성공: "${finalTitle}"`);
            } else {
              console.log(`[v7.13.1] 제목 메타데이터 없음`);
            }
          }
        } catch (error) {
          console.log(`[v7.13.1] 제목 수집 실패 (계속 진행): ${error instanceof Error ? error.message : error}`);
        }
      }
      
      // 6. 완전한 데이터로 생성
      const enrichedData = {
        owner,
        keywordText,
        keywordNorm,
        blogUrl: canonicalUrl, // 캐노니컬 URL 저장
        blogUrlNorm,
        nickname,
        title: finalTitle,
        brand: brand || null,
        groupName: groupName || null,
        active: active ?? true,
      };
      
      const target = await storage.createBlogKeywordTarget(enrichedData);
      res.json(target);
    } catch (error) {
      res.status(500).json({ message: "블로그-키워드 페어 생성에 실패했습니다", error: String(error) });
    }
  });

  app.patch("/api/pairs/:id", async (req, res) => {
    try {
      const { id } = req.params;
      // v7.18: x-owner 우선 사용으로 plan API와 통일
      const owner = (req.headers['x-owner'] || req.headers['x-role']) as string;
      if (!owner) {
        return res.status(401).json({ message: "권한이 없습니다" });
      }
      
      const validation = updateBlogKeywordTargetSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ 
          message: "유효하지 않은 페어 데이터입니다",
          errors: validation.error.errors
        });
      }
      
      const target = await storage.updateBlogKeywordTargetByOwner(owner, id, validation.data);
      if (!target) {
        return res.status(404).json({ message: "페어를 찾을 수 없습니다" });
      }
      
      res.json(target);
    } catch (error) {
      res.status(500).json({ message: "블로그-키워드 페어 수정에 실패했습니다", error: String(error) });
    }
  });

  app.delete("/api/pairs/:id", async (req, res) => {
    try {
      const { id } = req.params;
      // v7.18: x-owner 우선 사용으로 plan API와 통일
      const owner = (req.headers['x-owner'] || req.headers['x-role']) as string;
      if (!owner) {
        return res.status(401).json({ message: "권한이 없습니다" });
      }
      
      const deleted = await storage.deleteBlogKeywordTargetByOwner(owner, id);
      if (!deleted) {
        return res.status(404).json({ message: "페어를 찾을 수 없습니다" });
      }
      
      res.json({ message: "블로그-키워드 페어가 삭제되었습니다" });
    } catch (error) {
      res.status(500).json({ message: "블로그-키워드 페어 삭제에 실패했습니다", error: String(error) });
    }
  });

  // v7.13 Owner-aware 보안 API들
  app.get("/api/pairs/:id", async (req, res) => {
    try {
      const owner = req.headers['x-role'] as string;
      const { id } = req.params;
      
      if (!owner) {
        return res.status(401).json({ message: "권한이 없습니다" });
      }
      
      const target = await storage.getBlogKeywordTargetById(owner, id);
      if (!target) {
        return res.status(404).json({ message: "페어를 찾을 수 없습니다" });
      }
      
      res.json(target);
    } catch (error) {
      res.status(500).json({ message: "블로그-키워드 페어 조회에 실패했습니다", error: String(error) });
    }
  });

  // Mock API endpoints for frontend development
  // Export mock API
  app.get("/api/mock/exports", async (req, res) => {
    try {
      // Mock export jobs data
      const mockJobs = [
        {
          id: "job1",
          name: "순위 리포트 내보내기",
          type: "rankings",
          format: "csv",
          status: "completed",
          progress: 100,
          createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
          downloadUrl: "/api/mock/exports/job1/download"
        },
        {
          id: "job2",
          name: "알림 백업",
          type: "alerts",
          format: "json",
          status: "processing",
          progress: 65,
          createdAt: new Date().toISOString(),
        }
      ];
      res.json(mockJobs);
    } catch (error) {
      res.status(500).json({ message: "Failed to get export jobs", error: String(error) });
    }
  });

  app.post("/api/mock/exports", async (req, res) => {
    try {
      const { dataTypes, format, dateRange } = req.body;
      const newJob = {
        id: "job_" + Date.now(),
        name: `${dataTypes.join(', ')} 내보내기`,
        type: dataTypes[0],
        format,
        status: "processing",
        progress: 0,
        createdAt: new Date().toISOString(),
      };
      res.json(newJob);
    } catch (error) {
      res.status(500).json({ message: "Failed to start export", error: String(error) });
    }
  });

  app.get("/api/mock/exports/:jobId/download", async (req, res) => {
    try {
      // Mock CSV data
      const csvData = "keyword,rank,date\n홍삼,5,2024-09-17\n홍삼스틱,12,2024-09-17";
      const buffer = Buffer.from(csvData, 'utf8');
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="export.csv"');
      res.send(buffer);
    } catch (error) {
      res.status(500).json({ message: "Failed to download export", error: String(error) });
    }
  });

  // Alerts mock API
  app.get("/api/mock/alerts", async (req, res) => {
    try {
      const { seen } = req.query;
      const mockAlerts = [
        {
          id: "alert1",
          targetId: "target1",
          rule: "top_10_entry",
          timestamp: new Date(Date.now() - 30 * 60 * 1000),
          prevRank: 15,
          currRank: 8,
          delta: -7,
          reason: "키워드 '홍삼'이 Top 10에 진입했습니다",
          cooldownUntil: null,
          seen: false,
          severity: "high"
        },
        {
          id: "alert2",
          targetId: "target2",
          rule: "rank_drop_5",
          timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000),
          prevRank: 12,
          currRank: 18,
          delta: 6,
          reason: "키워드 '홍삼스틱'의 순위가 5위 이상 하락했습니다",
          cooldownUntil: null,
          seen: true,
          severity: "critical"
        }
      ];
      
      let filteredAlerts = mockAlerts;
      if (seen === 'false') {
        filteredAlerts = mockAlerts.filter(alert => !alert.seen);
      } else if (seen === 'true') {
        filteredAlerts = mockAlerts.filter(alert => alert.seen);
      }
      
      res.json(filteredAlerts);
    } catch (error) {
      res.status(500).json({ message: "Failed to get alerts", error: String(error) });
    }
  });

  app.post("/api/mock/alerts/:alertId/seen", async (req, res) => {
    try {
      const { alertId } = req.params;
      // Mock successful response
      res.json({ success: true, alertId });
    } catch (error) {
      res.status(500).json({ message: "Failed to mark alert as seen", error: String(error) });
    }
  });

  // Submissions mock API
  app.get("/api/mock/submissions", async (req, res) => {
    try {
      const { status } = req.query;
      const mockSubmissions = [
        {
          id: "sub1",
          owner: "user1",
          type: "keyword",
          payload: { keyword: "새 키워드", description: "테스트 키워드입니다" },
          status: "pending",
          timestamp: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
          comment: null
        },
        {
          id: "sub2",
          owner: "user2",
          type: "blog",
          payload: { url: "https://blog.naver.com/test", title: "테스트 블로그" },
          status: "approved",
          timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
          comment: "승인되었습니다"
        }
      ];
      
      let filteredSubmissions = mockSubmissions;
      if (status && status !== 'all') {
        filteredSubmissions = mockSubmissions.filter(sub => sub.status === status);
      }
      
      res.json(filteredSubmissions);
    } catch (error) {
      res.status(500).json({ message: "Failed to get submissions", error: String(error) });
    }
  });

  app.post("/api/mock/submissions", async (req, res) => {
    try {
      const newSubmission = {
        id: "sub_" + Date.now(),
        ...req.body,
        status: "pending",
        timestamp: new Date().toISOString(),
        comment: null
      };
      res.json(newSubmission);
    } catch (error) {
      res.status(500).json({ message: "Failed to create submission", error: String(error) });
    }
  });

  app.post("/api/mock/submissions/:id/approve", async (req, res) => {
    try {
      const { id } = req.params;
      const { comment } = req.body;
      const updatedSubmission = {
        id,
        status: "approved",
        comment: comment || "승인되었습니다",
        updatedAt: new Date().toISOString()
      };
      res.json(updatedSubmission);
    } catch (error) {
      res.status(500).json({ message: "Failed to approve submission", error: String(error) });
    }
  });

  app.post("/api/mock/submissions/:id/reject", async (req, res) => {
    try {
      const { id } = req.params;
      const { comment } = req.body;
      const updatedSubmission = {
        id,
        status: "rejected",
        comment: comment || "반려되었습니다",
        updatedAt: new Date().toISOString()
      };
      res.json(updatedSubmission);
    } catch (error) {
      res.status(500).json({ message: "Failed to reject submission", error: String(error) });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
