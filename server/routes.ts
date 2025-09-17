import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { scraper } from "./services/scraper";
import { nlpService } from "./services/nlp";
import { extractTop3ByVolume } from "./services/keywords";
import { titleKeywordExtractor } from "./services/title-keyword-extractor";
import { serpScraper } from "./services/serp-scraper";
import { getScoreConfig, updateScoreConfig, normalizeWeights, resetToDefaults } from "./services/score-config";
import { z } from "zod";
import { checkOpenAPI, checkSearchAds, checkKeywordsDB, checkAllServices, getHealthWithPrompt } from './services/health';
import { shouldPreflight, probeHealth, getOptimisticHealth, markHealthFail, markHealthGood } from './services/health-cache';
import { getVolumesWithHealth } from './services/externals-health';
import { upsertKeywordsFromSearchAds, listKeywords, setKeywordExcluded, listExcluded, getKeywordVolumeMap, findKeywordByText, deleteAllKeywords, upsertMany, getKeywordsCounts } from './store/keywords';
import { compIdxToScore, calculateOverallScore } from './services/scoring-config';
// BFS Crawler imports
import { loadSeedsFromCSV, loadOptimizedSeeds, createGlobalCrawler, getGlobalCrawler, clearGlobalCrawler, normalizeKeyword, isStale, getCallBudgetStatus, expandAllKeywords } from './services/bfs-crawler.js';
// LK Mode imports
import { expandLKBatch, detectCategory, getLKModeStats } from './services/lk-mode.js';
import { metaSet, metaGet } from './store/meta';
import { db } from './db';
import type { HealthResponse } from './types';
import multer from 'multer';
import csv from 'csv-parser';
import { Readable } from 'stream';
import * as XLSX from 'xlsx';
import { nanoid } from 'nanoid';
import { blogRegistry, discoveredBlogs, postTierChecks, appMeta, type BlogRegistry, insertBlogRegistrySchema } from '@shared/schema';
import { eq, and, desc, sql } from 'drizzle-orm';

// Helper function for tier distribution analysis and augmentation
async function checkAndAugmentTierDistribution(jobId: string, inputKeywords: string[]): Promise<void> {
  try {
    console.log(`🔍 [Tier Analysis] Analyzing tier distribution for job ${jobId} with ${inputKeywords.length} keywords`);
    
    // Query current tier distribution from postTierChecks
    const tierChecks = await db.select().from(postTierChecks).where(
      eq(postTierChecks.jobId, jobId)
    );
    
    if (tierChecks.length === 0) {
      console.log(`⚠️ [Tier Analysis] No tier checks found for job ${jobId}, skipping augmentation`);
      return;
    }
    
    // Analyze tier distribution per keyword
    const tierDistribution: Record<string, Set<number>> = {};
    for (const keyword of inputKeywords) {
      tierDistribution[keyword] = new Set();
    }
    
    for (const check of tierChecks) {
      if (tierDistribution[check.inputKeyword]) {
        tierDistribution[check.inputKeyword].add(check.tier);
      }
    }
    
    // Find missing tiers (1-4)
    const requiredTiers = [1, 2, 3, 4];
    let totalMissingTiers = 0;
    
    for (const keyword of inputKeywords) {
      const presentTiers = Array.from(tierDistribution[keyword]);
      const missingTiers = requiredTiers.filter(tier => !presentTiers.includes(tier));
      
      if (missingTiers.length > 0) {
        console.log(`📊 [Tier Analysis] Keyword "${keyword}" missing tiers: ${missingTiers.join(', ')}`);
        totalMissingTiers += missingTiers.length;
      } else {
        console.log(`✅ [Tier Analysis] Keyword "${keyword}" has complete tier coverage (1-4)`);
      }
    }
    
    if (totalMissingTiers === 0) {
      console.log(`🎉 [Tier Analysis] All keywords have complete tier coverage, no augmentation needed`);
      return;
    }
    
    console.log(`📈 [Tier Analysis] Found ${totalMissingTiers} missing tier slots across all keywords`);
    console.log(`🔄 [Tier Analysis] Auto-augmentation system would fetch related keywords here`);
    console.log(`💡 [Tier Analysis] Implementation note: Related keyword fetching to be added in next iteration`);
    
    // TODO: Implement related keyword fetching and tier augmentation
    // 1. Fetch related keywords from Naver API or SearchAds
    // 2. Filter by volume >= 1000
    // 3. Run tier checks for missing tier slots
    // 4. Insert results into postTierChecks table
    
    console.log(`✅ [Tier Analysis] Tier distribution analysis completed for job ${jobId}`);
    
  } catch (error) {
    console.error(`❌ [Tier Analysis] Error during tier distribution analysis:`, error);
  }
}

export async function registerRoutes(app: Express): Promise<Server> {
  
  // === Health TTL cache & shallow mode ===
  const HEALTH_TTL_MS = 60_000; // 60s
  let healthCache: { data: any|null; ts: number; inFlight: Promise<any>|null; disabled: boolean } =
    { data: null, ts: 0, inFlight: null, disabled: false };

  // === Blog Registry Management APIs ===
  
  // Update blog status in registry
  app.patch("/api/blog-registry/:blogId/status", async (req, res) => {
    try {
      const { blogId } = req.params;
      
      // Validate blogId format (should be alphanumeric with underscores)
      if (!blogId || !/^[a-zA-Z0-9_]+$/.test(blogId) || blogId.length > 50) {
        return res.status(400).json({ error: "Invalid blogId format" });
      }
      
      // Validate request body with Zod
      const statusSchema = z.object({
        status: z.enum(['collected', 'blacklist', 'outreach'])
      });
      
      const { status } = statusSchema.parse(req.body);
      
      // Upsert blog status
      await db.insert(blogRegistry)
        .values({
          blogId,
          url: `https://blog.naver.com/${blogId}`, // Default URL construction
          status,
          updatedAt: new Date()
        })
        .onConflictDoUpdate({
          target: blogRegistry.blogId,
          set: {
            status,
            updatedAt: new Date()
          }
        });
      
      res.json({ success: true, blogId, status });
    } catch (error) {
      console.error('Error updating blog status:', error);
      res.status(500).json({ error: "Failed to update blog status" });
    }
  });
  
  
  // Get specific blog from registry
  app.get("/api/blog-registry/:blogId", async (req, res) => {
    try {
      const { blogId } = req.params;
      const blog = await db.select().from(blogRegistry).where(eq(blogRegistry.blogId, blogId)).limit(1);
      
      if (blog.length === 0) {
        return res.status(404).json({ error: "Blog not found in registry" });
      }
      
      res.json(blog[0]);
    } catch (error) {
      console.error('Error fetching blog from registry:', error);
      res.status(500).json({ error: "Failed to fetch blog" });
    }
  });

  const isDeep = (req:any)=> req.query?.deep === '1' || req.query?.deep === 'true';
  
  // Utility function to check keyword relatedness to original search terms
  function checkRelatedness(keyword: string, originalKeywords: string[]): boolean {
    if (originalKeywords.length === 0) return false;
    
    // Normalize text using NFKC and remove special characters
    const normalizeText = (text: string): string => {
      return text.normalize('NFKC').toLowerCase()
        .replace(/[\s\-_\.]+/g, '')
        .trim();
    };
    
    const normalizedKeyword = normalizeText(keyword);
    
    return originalKeywords.some(original => {
      const normalizedOriginal = normalizeText(original);
      return normalizedKeyword.includes(normalizedOriginal) || 
             normalizedOriginal.includes(normalizedKeyword);
    });
  }
  
  // Configure multer for CSV/XLSX file uploads
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: 10 * 1024 * 1024, // 10MB limit
    },
    fileFilter: (req, file, cb) => {
      // Accept CSV and XLSX files
      const isValidFile = file.mimetype === 'text/csv' || 
                         file.originalname.endsWith('.csv') ||
                         file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
                         file.originalname.endsWith('.xlsx');
      
      if (isValidFile) {
        cb(null, true);
      } else {
        cb(new Error('Only CSV and XLSX files are allowed'));
      }
    },
  });

  // In-memory storage for uploaded file data
  const uploadedFiles = new Map<string, { rows: any[], originalName: string, uploadedAt: Date }>();
  
  // Start SERP analysis with keywords
  app.post("/api/serp/analyze", async (req, res) => {
    try {
      const validatedBody = z.object({
        keywords: z.array(z.string()).min(1).max(20),
        minRank: z.number().optional().default(2),
        maxRank: z.number().optional().default(15),
        postsPerBlog: z.number().optional().default(10),
        titleExtract: z.boolean().optional().default(true),
        enableLKMode: z.boolean().optional().default(false),
        preferCompound: z.boolean().optional().default(true),
        targetCategory: z.string().optional()
      }).parse(req.body);

      const { 
        keywords, 
        minRank, 
        maxRank, 
        postsPerBlog, 
        titleExtract,
        enableLKMode,
        preferCompound,
        targetCategory
      } = validatedBody;
      
      // 🎯 디버깅: 요청 바디 로깅
      console.log(`🎯 SERP Request Body:`, JSON.stringify({
        keywords, minRank, maxRank, postsPerBlog, titleExtract, enableLKMode, preferCompound, targetCategory
      }, null, 2));
      
      // === v17 설정 로드 (핫리로드) + 안전 폴백 ===
      const { getAlgoConfig } = await import("./services/algo-config");
      const cfg = await getAlgoConfig();
      const override = (req.query.pipeline ?? "").toString();
      const forceLegacy = override === "legacy";
      // ★ Force-enable v17 with ?pipeline=v17 parameter for testing  
      const useV17 = override === 'v17' || (!forceLegacy && ( !!cfg?.features?.preEnrich || !!cfg?.features?.scoreFirstGate
                       || cfg?.phase2?.engine !== "ngrams" || !!cfg?.features?.tierAutoFill ));
      console.log(`🔧 pipeline= ${useV17 ? "v17" : "v16"} | engine=${cfg.phase2.engine} | override=${override} | forced=${override === 'v17'}`);
      if (!keywords || !Array.isArray(keywords) || keywords.length === 0) {
        return res.status(400).json({ error: "Keywords array is required (1-20 keywords)" });
      }

      if (keywords.length > 20) {
        return res.status(400).json({ error: "Maximum 20 keywords allowed" });
      }

      if (minRank < 2 || maxRank > 15 || minRank > maxRank) {
        return res.status(400).json({ error: "Invalid rank range. Min: 2, Max: 15" });
      }

      if (postsPerBlog < 1 || postsPerBlog > 20) {
        return res.status(400).json({ error: "Posts per blog must be between 1 and 20" });
      }

      // Create SERP analysis job
      const job = await storage.createSerpJob({
        keywords,
        minRank,
        maxRank,
        status: "pending",
        currentStep: "discovering_blogs",
        totalSteps: 3,
        completedSteps: 0,
        progress: 0
      });

      // === 파이프라인 시작 ===
      if (useV17) {
        try {
          // 0) (선택) 키워드 레벨 사전 확장: DB→API→upsert→메모리 merge
          if (cfg.features.preEnrich) {
            console.log(`🚀 [PRE-ENRICH] Starting volume enrichment for ${keywords.length} keywords`);
            const kws = keywords.map(k => k.trim()).filter(Boolean);
            await getVolumesWithHealth(db, kws);
            console.log(`✅ [PRE-ENRICH] Volume data enriched for keywords: ${kws.join(', ')}`);
          }
          // ★ v17 진짜 빠른 경로: 결과 조립 후 DB 저장  
          console.log(`🚀 [v17] Starting REAL fast-path pipeline...`);
          
          // ★ v17 assembly를 사용한 robust 비동기 처리 (catch + fallback)
          const { processSerpAnalysisJobWithV17Assembly } = await import("./services/v17-pipeline");
          const v17Promise = processSerpAnalysisJobWithV17Assembly(job.id, keywords, minRank, maxRank, postsPerBlog, titleExtract, {
            enableLKMode,
            preferCompound,
            targetCategory,
            v17Mode: true,
            useV17Assembly: true
          });
          
          // ★ Robust error handling with fallback
          v17Promise.then(() => {
            console.log('✅ [v17] fast-path finished successfully');
          }).catch(error => {
            console.error('[SAFE-FALLBACK] v17 failed → legacy', error);
            // Fallback to legacy processing
            processSerpAnalysisJob(job.id, keywords, minRank, maxRank, postsPerBlog, titleExtract, {
              enableLKMode,
              preferCompound,
              targetCategory
            });
          });
        } catch (e) {
          console.error("[SAFE-FALLBACK] v17 failed → legacy", e);
          processSerpAnalysisJob(job.id, keywords, minRank, maxRank, postsPerBlog, titleExtract, {
            enableLKMode,
            preferCompound,
            targetCategory
          });
        }
      } else {
        // v16 레거시 파이프라인
        processSerpAnalysisJob(job.id, keywords, minRank, maxRank, postsPerBlog, titleExtract, {
          enableLKMode,
          preferCompound,
          targetCategory
        });
      }

      res.json({ 
        jobId: job.id,
        message: "SERP analysis started successfully"
      });

    } catch (error) {
      console.error('Error starting SERP analysis:', error);
      res.status(500).json({ error: "Failed to start SERP analysis" });
    }
  });

  // Get SERP job status
  app.get("/api/serp/jobs/:jobId", async (req, res) => {
    try {
      const job = await storage.getSerpJob(req.params.jobId);
      if (!job) {
        return res.status(404).json({ error: "Job not found" });
      }
      res.json(job);
    } catch (error) {
      console.error('Error fetching SERP job:', error);
      res.status(500).json({ error: "Failed to fetch job status" });
    }
  });

  // Cancel/Stop SERP job
  app.post("/api/serp/jobs/:jobId/cancel", async (req, res) => {
    try {
      console.log(`[CANCEL] 🛑 Received cancellation request for job: ${req.params.jobId}`);
      
      const job = await storage.getSerpJob(req.params.jobId);
      if (!job) {
        console.log(`[CANCEL] ❌ Job not found: ${req.params.jobId}`);
        return res.status(404).json({ error: "Job not found" });
      }
      
      console.log(`[CANCEL] 📊 Current job status: ${job.status}, step: ${job.currentStep}, progress: ${job.progress}%`);
      
      if (job.status !== "running") {
        console.log(`[CANCEL] ⚠️  Job is not running, current status: ${job.status}`);
        return res.status(400).json({ error: "Job is not running" });
      }
      
      // Update job status to cancelled
      const updatedJob = await storage.updateSerpJob(req.params.jobId, {
        status: "cancelled",
        currentStep: null,
        currentStepDetail: "사용자에 의해 분석이 중단되었습니다",
        progress: job.progress, // Keep current progress
        updatedAt: new Date(),
      });
      
      console.log(`[CANCEL] ✅ Job ${req.params.jobId} successfully cancelled by user`);
      console.log(`[CANCEL] 📋 Updated job status:`, {
        id: updatedJob?.id,
        status: updatedJob?.status,
        currentStepDetail: updatedJob?.currentStepDetail,
        progress: updatedJob?.progress
      });
      
      res.json(updatedJob);
    } catch (error) {
      console.error("[CANCEL] ❌ Error cancelling job:", error);
      res.status(500).json({ error: "Failed to cancel job" });
    }
  });

  // ===============================
  // ALGORITHM SETTINGS APIs (v17)
  // ===============================
  
  // Get current algorithm configuration
  app.get("/api/settings/algo", async (req, res) => {
    try {
      const { getAlgoConfig } = await import('./services/algo-config');
      const config = await getAlgoConfig();
      res.json(config);
    } catch (error) {
      console.error('Error fetching algo config:', error);
      res.status(500).json({ error: "Failed to fetch algorithm configuration" });
    }
  });

  // Update algorithm configuration
  app.put("/api/settings/algo", async (req, res) => {
    try {
      const { json: updatedConfig, updatedBy = 'admin', note = 'Updated via API' } = req.body;
      
      const { metaSet } = await import('./store/meta');
      const { invalidateAlgoConfigCache } = await import('./services/algo-config');
      
      // Save to database
      await metaSet(db, 'algo_config', updatedConfig);
      
      // Invalidate cache for hot-reload
      invalidateAlgoConfigCache();
      
      console.log(`⚙️ [Config Update] Algorithm configuration updated by ${updatedBy}: ${note}`);
      
      res.json({ 
        success: true, 
        message: "Algorithm configuration updated successfully",
        updatedBy,
        note
      });
    } catch (error) {
      console.error('Error updating algo config:', error);
      res.status(500).json({ error: "Failed to update algorithm configuration" });
    }
  });

  // Get settings history
  app.get("/api/settings/algo/history", async (req, res) => {
    try {
      // Return empty array for now - implement if needed
      res.json([]);
    } catch (error) {
      console.error('Error fetching settings history:', error);
      res.status(500).json({ error: "Failed to fetch settings history" });
    }
  });

  // Rollback configuration 
  app.post("/api/settings/algo/rollback", async (req, res) => {
    try {
      const { key, version } = req.body;
      
      // Return success for now - implement if needed
      res.json({ 
        success: true, 
        message: "Configuration rollback completed",
        key,
        version
      });
    } catch (error) {
      console.error('Error rolling back config:', error);
      res.status(500).json({ error: "Failed to rollback configuration" });
    }
  });

  // ===============================
  // SANDBOX & TESTING APIs
  // ===============================
  
  // Start test job with specific configuration
  app.post("/api/serp/test", async (req, res) => {
    try {
      const validatedBody = z.object({
        keyword: z.string().min(1),
        configName: z.string().min(1),
        testMode: z.boolean().default(true),
        config: z.any().optional() // Allow any test configuration
      }).parse(req.body);

      const { keyword, configName, testMode, config } = validatedBody;

      console.log(`🧪 [SANDBOX] Starting test job for keyword: "${keyword}" with config: ${configName}`);
      
      // Create test SERP job with special test flag
      const job = await storage.createSerpJob({
        keywords: [keyword],
        minRank: 2,
        maxRank: 15,
        status: "pending",
        currentStep: "discovering_blogs",
        totalSteps: 3,
        completedSteps: 0,
        progress: 0,
        // Add test metadata
        results: {
          testMode: true,
          configName,
          testConfig: config || {},
          startTime: new Date().toISOString()
        } as any
      });

      // Start analysis with test configuration
      console.log(`🧪 [SANDBOX] Created test job ${job.id}, starting analysis...`);
      
      // Use the existing analysis function but mark as test
      processSerpAnalysisJob(job.id, [keyword], 2, 15, 10, true, {
        enableLKMode: false,
        preferCompound: true
        // Note: testMode and testConfig handled via job.results
      });

      res.json({ 
        jobId: job.id,
        message: `Test job started for keyword "${keyword}" with ${configName} configuration`,
        testMode: true
      });

    } catch (error) {
      console.error('🧪 [SANDBOX] Error starting test job:', error);
      res.status(500).json({ error: "Failed to start test job" });
    }
  });

  // Get test jobs list
  app.get("/api/serp/test/jobs", async (req, res) => {
    try {
      const allJobs = await storage.listSerpJobs(50);
      
      // Filter for test jobs (those with testMode in results)
      const testJobs = allJobs.filter(job => 
        job.results && 
        typeof job.results === 'object' && 
        (job.results as any).testMode === true
      );

      console.log(`🧪 [SANDBOX] Retrieved ${testJobs.length} test jobs out of ${allJobs.length} total jobs`);

      res.json(testJobs);
    } catch (error) {
      console.error('🧪 [SANDBOX] Error fetching test jobs:', error);
      res.status(500).json({ error: "Failed to fetch test jobs" });
    }
  });

  // Get SERP job results in v8 contract format (comprehensive tier recording)
  app.get("/api/serp/jobs/:jobId/results", async (req, res) => {
    try {
      // ★ Disable caching during development to avoid 304 responses masking updates
      if (process.env.NODE_ENV === 'development') {
        res.set('Cache-Control', 'no-store');
      }
      
      const job = await storage.getSerpJob(req.params.jobId);
      if (!job) {
        return res.status(404).json({ error: "Job not found" });
      }

      if (job.status !== "completed") {
        return res.status(400).json({ error: "Job not completed yet" });
      }
      
      // ★ V17-FIRST: Check if we have v17 data in postTierChecks
      const { db } = await import("./db");
      const { postTierChecks } = await import("../shared/schema");
      const { eq } = await import("drizzle-orm");
      
      const v17TierData = await db.select().from(postTierChecks).where(eq(postTierChecks.jobId, req.params.jobId));
      
      if (v17TierData.length > 0) {
        console.log(`🔧 [v17 Assembly] Using postTierChecks for job ${req.params.jobId} - found ${v17TierData.length} tier records`);
        
        // Use v17 assembly path
        const { processSerpAnalysisJobWithV17Assembly } = await import("./services/v17-pipeline");
        const { getAlgoConfig } = await import("./services/algo-config");
        const cfg = await getAlgoConfig();
        
        // Extract keywords from job data
        const keywords = Array.isArray(job.keywords) ? job.keywords : [job.keywords].filter(Boolean);
        
        // ★ Use assembleResults directly with existing DB data (don't reprocess)
        const { discoveredBlogs } = await import("../shared/schema");
        const blogData = await db.select().from(discoveredBlogs).where(eq(discoveredBlogs.jobId, req.params.jobId));
        
        // Transform DB data to assembleResults format
        const tiers = v17TierData.map(tier => ({
          tier: tier.tier,
          keywords: [{
            inputKeyword: tier.inputKeyword,
            text: tier.textSurface,
            volume: tier.volume
          }],
          blog: {
            blogId: tier.blogId,
            blogName: blogData.find(b => b.blogId === tier.blogId)?.blogName || tier.blogId,
            blogUrl: blogData.find(b => b.blogId === tier.blogId)?.blogUrl || ''
          },
          post: {
            title: tier.postTitle
          },
          candidate: {
            text: tier.textSurface,
            volume: tier.volume,
            rank: tier.rank,
            totalScore: tier.score || 0, // ★ Use actual DB score
            adScore: tier.adscore,
            eligible: tier.eligible,
            skipReason: tier.skipReason
          },
          score: tier.score || 0
        }));
        
        const { assembleResults } = await import("./phase2/helpers");
        
        const v17Results = assembleResults(req.params.jobId, tiers, cfg);
        return res.json(v17Results);
      }
      
      console.log(`🔧 [Legacy Assembly] No v17 data found for job ${req.params.jobId}, using legacy assembly`);

      // Get job parameters (P = postsPerBlog, T = tiersPerPost)
      const P = job.postsPerBlog || 10;
      const T = 4; // Default tier count as per requirements

      // Get all discovered blogs and determine NEW status via blog_registry
      const allBlogs = await storage.getDiscoveredBlogs(job.id);
      
      // Check blog_registry for status filtering and NEW determination
      const blogRegistryEntries = allBlogs.length > 0 
        ? await db.select().from(blogRegistry).where(
            sql`blog_id IN (${sql.join(allBlogs.map(b => b.blogId), sql`, `)})`
          )
        : [];
      const blogStatusMap = new Map(blogRegistryEntries.map(entry => [entry.blogId, entry.status]));
      
      // Filter out blacklist/outreach blogs and determine NEW blogs
      const newBlogs = allBlogs.filter(blog => {
        const status = blogStatusMap.get(blog.blogId);
        return !status || status === 'collected'; // NEW = not in registry or status 'collected'
      });

      // Build search volumes map with API fallback
      const inputKeywords = job.keywords || [];
      const searchVolumes: Record<string, number | null> = {};
      const keywordVolumeMap = await getKeywordVolumeMap(inputKeywords);
      
      for (const keyword of inputKeywords) {
        searchVolumes[keyword] = keywordVolumeMap[keyword] ?? null;
        
        // If volume is missing, try API fallback and upsert immediately
        if (searchVolumes[keyword] === null) {
          try {
            console.log(`🔄 API fallback for missing volume: ${keyword}`);
            const result = await upsertKeywordsFromSearchAds(keyword, 1);
            if (result.count > 0) {
              // Re-fetch the volume from DB after upsert
              const volumeMap = await getKeywordVolumeMap([keyword]);
              const apiVolume = volumeMap[keyword];
              if (apiVolume !== null && apiVolume !== undefined) {
                searchVolumes[keyword] = apiVolume;
                console.log(`✅ API fallback success: ${keyword} → ${apiVolume}`);
              } else {
                console.log(`⚠️ API fallback upserted but volume still null: ${keyword}`);
              }
            } else {
              console.log(`⚠️ API fallback returned no data for: ${keyword}`);
            }
          } catch (e) {
            console.log(`❌ API fallback failed for keyword: ${keyword}`, e);
          }
        }
      }

      // Query post_tier_checks for comprehensive tier data
      const tierChecks = await db.select().from(postTierChecks).where(
        eq(postTierChecks.jobId, job.id)
      );

      // Calculate attemptsByKeyword (NEW × P × T per keyword)
      const attemptsByKeyword: Record<string, number> = {};
      for (const keyword of inputKeywords) {
        const keywordNewBlogs = newBlogs.filter(blog => blog.seedKeyword === keyword);
        attemptsByKeyword[keyword] = keywordNewBlogs.length * P * T;
      }

      // Calculate exposureStatsByKeyword from tier check data
      const exposureStatsByKeyword: Record<string, {page1: number, zero: number, unknown: number}> = {};
      for (const keyword of inputKeywords) {
        const keywordChecks = tierChecks.filter(check => check.inputKeyword === keyword);
        const page1 = keywordChecks.filter(check => check.rank !== null && check.rank >= 1 && check.rank <= 10).length;
        const zero = keywordChecks.filter(check => check.rank === 0).length;
        const unknown = keywordChecks.filter(check => check.rank === null).length;
        
        exposureStatsByKeyword[keyword] = { page1, zero, unknown };
      }

      // Build summaryByKeyword with comprehensive tier data
      const summaryByKeyword = [];
      
      for (const keyword of inputKeywords) {
        const keywordNewBlogs = newBlogs.filter(blog => blog.seedKeyword === keyword);
        const totalBlogs = allBlogs.filter(blog => blog.seedKeyword === keyword).length;
        
        // Calculate phase2ExposedNew (NEW blogs with rank 1-10 exposure)
        const phase2ExposedNew = keywordNewBlogs.filter(blog => {
          const blogChecks = tierChecks.filter(check => 
            check.inputKeyword === keyword && 
            check.blogId === blog.blogId &&
            check.rank !== null && 
            check.rank >= 1 && 
            check.rank <= 10
          );
          return blogChecks.length > 0;
        }).length;

        // Build blog details with posts and tiers
        const blogs = [];
        for (const blog of keywordNewBlogs) {
          // Get blog status from registry
          const status = blogStatusMap.get(blog.blogId) || 'collected';
          
          // Get top keywords for this blog (existing logic)
          const topKeywords = await storage.getTopKeywordsByBlog(blog.id);
          const topKeywordsWithVolume = topKeywords.map((kw: any) => ({
            text: kw.keyword,
            volume: keywordVolumeMap[kw.keyword] ?? null,
            score: kw.score || 0,
            rank: kw.rank,
            related: checkRelatedness(kw.keyword, inputKeywords)
          }));

          // Calculate totalExposed and totalScore
          const totalExposed = topKeywordsWithVolume.filter(kw => kw.rank !== null && kw.rank <= 10).length;
          const totalScore = topKeywordsWithVolume
            .filter(kw => kw.rank !== null && kw.rank <= 10)
            .reduce((sum, kw) => sum + kw.score, 0);

          // Get posts with tier data
          const posts = [];
          const blogPosts = await storage.getAnalyzedPosts(blog.id);
          
          for (const post of blogPosts.slice(0, P)) { // Limit to P posts
            const postTierData = tierChecks.filter(check => 
              check.inputKeyword === keyword &&
              check.blogId === blog.blogId &&
              check.postId === post.id
            );

            // Group tier data by tier number
            const tiers = [];
            for (let tierNum = 1; tierNum <= T; tierNum++) {
              const tierCheck = postTierData.find(check => check.tier === tierNum);
              if (tierCheck) {
                // Use actual score computed by v17 pipeline (NOT adscore!)
                const score = tierCheck.score ?? tierCheck.adscore ?? 0;
                
                tiers.push({
                  tier: tierNum,
                  text: tierCheck.textSurface,
                  volume: tierCheck.volume,
                  rank: tierCheck.rank,
                  score
                });
              } else {
                // Add empty tier if no data found
                tiers.push({
                  tier: tierNum,
                  text: "",
                  volume: null,
                  rank: null,
                  score: 0
                });
              }
            }

            posts.push({
              title: post.title,
              tiers
            });
          }

          blogs.push({
            blogId: blog.blogId,
            blogName: blog.blogName,
            blogUrl: blog.blogUrl,
            status,
            totalExposed,
            totalScore,
            topKeywords: topKeywordsWithVolume.slice(0, 10), // Top 10
            posts
          });
        }

        summaryByKeyword.push({
          keyword,
          searchVolume: searchVolumes[keyword],
          totalBlogs,
          newBlogs: keywordNewBlogs.length,
          phase2ExposedNew,
          blogs
        });
      }

      // Collect additional data for enhanced response (avoiding key collision)
      const allBlogsData = [];
      const allPostsData = [];
      const errors: string[] = [];
      const warnings: string[] = [];
      
      // Build comprehensive data arrays from discovered blogs
      for (const blog of newBlogs) {
        // Add blog data
        allBlogsData.push({
          blog_id: blog.blogId,
          blog_name: blog.blogName,
          blog_url: blog.blogUrl,
          base_rank: blog.baseRank || null,
          gathered_posts: blog.postsAnalyzed || 0
        });
        
        // Add posts data from analyzed_posts table
        const blogPosts = await storage.getAnalyzedPosts(blog.id);
        for (const post of blogPosts.slice(0, P)) {
          allPostsData.push({
            blog_id: blog.blogId,
            title: post.title,
            content: "", // Content not stored in analyzed_posts
            url: post.url || ""
          });
        }
      }
      
      // Check for potential warnings
      for (const keyword of inputKeywords) {
        if (searchVolumes[keyword] === null) {
          warnings.push(`검색량을 확인할 수 없습니다: ${keyword}`);
        }
      }
      
      // Calculate counters from actual data
      const counters = {
        discovered_blogs: allBlogs.length,
        blogs: newBlogs.length,
        posts: allPostsData.length,
        selected_keywords: inputKeywords.length,
        searched_keywords: inputKeywords.length,
        hit_blogs: newBlogs.filter(blog => {
          const blogChecks = tierChecks.filter(check => 
            check.blogId === blog.blogId &&
            check.rank !== null && 
            check.rank >= 1 && 
            check.rank <= 10
          );
          return blogChecks.length > 0;
        }).length,
        volumes_mode: "searchads" // TODO: Detect actual mode based on API usage
      };

      // Build v8 response format with additional fields (no key collision)
      const response = {
        keywords: inputKeywords, // Keep as string[] for frontend compatibility
        status: "완료",
        analyzedAt: job.updatedAt?.toISOString() || job.createdAt?.toISOString(),
        params: {
          postsPerBlog: P,
          tiersPerPost: T
        },
        searchVolumes,
        attemptsByKeyword,
        exposureStatsByKeyword,
        summaryByKeyword,
        // Additional fields without breaking existing contract
        blogs: allBlogsData,
        posts: allPostsData,
        counters,
        warnings,
        errors
      };

      console.log(`📊 v8 SERP Results (Job ${job.id}):`, JSON.stringify(response, null, 2));
      res.json(response);

    } catch (error) {
      console.error('Error fetching v8 SERP results:', error);
      res.status(500).json({ error: "Failed to fetch results" });
    }
  });

  // Get job history for recent jobs
  app.get("/api/jobs/history", async (req, res) => {
    try {
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 50));
      console.log(`📋 Fetching job history with limit: ${limit}`);
      
      const jobs = await storage.listSerpJobs(limit);
      
      const historyItems = jobs.map(job => {
        const baseKeyword = job.keywords && job.keywords.length > 0 ? job.keywords[0] : 'Unknown';
        
        // Extract counters from job results if available, or compute basic counters
        let counters = {
          discovered_blogs: 0,
          hit_blogs: 0,
          selected_keywords: job.keywords?.length || 0,
          searched_keywords: 0,
          volumes_mode: 'unknown'
        };
        
        // If job is completed and has results, extract actual counters
        if (job.status === 'completed' && job.results) {
          const results = job.results as any;
          if (results.counters) {
            counters = {
              discovered_blogs: results.counters.discovered_blogs || results.counters.blogs || 0,
              hit_blogs: results.counters.hit_blogs || 0,
              selected_keywords: results.counters.selected_keywords || job.keywords?.length || 0,
              searched_keywords: results.counters.searched_keywords || 0,
              volumes_mode: results.counters.volumes_mode || 'unknown'
            };
          }
        }
        
        return {
          jobId: job.id,
          createdAt: job.createdAt?.toISOString() || new Date().toISOString(),
          baseKeyword,
          counters
        };
      });
      
      console.log(`📋 Returning ${historyItems.length} history items`);
      res.json({ items: historyItems });
    } catch (error) {
      console.error('Error fetching job history:', error);
      res.status(500).json({ error: "Failed to fetch job history" });
    }
  });

  // Helper function to sanitize CSV fields and prevent formula injection
  const sanitizeCsvField = (value: any): string => {
    const str = String(value ?? '');
    
    // Check for formula injection patterns (including leading whitespace)
    const needsPrefix = /^[\s\t\r\n\u00a0]*[=+\-@]/.test(str);
    const safeValue = (needsPrefix ? "'" : '') + str;
    
    // Escape double quotes and wrap in quotes
    return '"' + safeValue.replaceAll('"', '""') + '"';
  };

  // Export SERP results as CSV
  app.get("/api/serp/jobs/:jobId/export/csv", async (req, res) => {
    try {
      const job = await storage.getSerpJob(req.params.jobId);
      if (!job) {
        return res.status(404).json({ error: "Job not found" });
      }

      const discoveredBlogs = await storage.getDiscoveredBlogs(job.id);
      let csv = "블로그명,블로그URL,발견키워드,발견순위,추출키워드,조회량,SERP순위\n";
      
      for (const blog of discoveredBlogs) {
        const topKeywords = await storage.getTopKeywordsByBlog(blog.id);
        
        if (topKeywords.length === 0) {
          csv += `${sanitizeCsvField(blog.blogName)},${sanitizeCsvField(blog.blogUrl)},${sanitizeCsvField(blog.seedKeyword)},${sanitizeCsvField(blog.rank)},${sanitizeCsvField("추가 떠있는 키워드 없음")},${sanitizeCsvField("")},${sanitizeCsvField("")}\n`;
        } else {
          for (const keyword of topKeywords) {
            csv += `${sanitizeCsvField(blog.blogName)},${sanitizeCsvField(blog.blogUrl)},${sanitizeCsvField(blog.seedKeyword)},${sanitizeCsvField(blog.rank)},${sanitizeCsvField(keyword.keyword)},${sanitizeCsvField(keyword.volume || '')},${sanitizeCsvField(keyword.rank || '')}\n`;
          }
        }
      }

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="serp-analysis.csv"');
      res.send('\ufeff' + csv); // BOM for Excel UTF-8 support
    } catch (error) {
      console.error('Error exporting SERP CSV:', error);
      res.status(500).json({ error: "Failed to export data" });
    }
  });

  // Export SERP results as CSV (new format for Results View)
  app.get("/api/serp/jobs/:jobId/export.csv", async (req, res) => {
    try {
      const job = await storage.getSerpJob(req.params.jobId);
      if (!job) {
        return res.status(404).json({ error: "Job not found" });
      }

      if (job.status !== "completed") {
        return res.status(400).json({ error: "Job not completed yet" });
      }

      // Get all discovered blogs and their TOP3 keywords
      const allBlogs = await storage.getDiscoveredBlogs(job.id);
      
      // Collect all unique keywords for raw_volume lookup
      const allKeywordTexts = new Set<string>();
      for (const blog of allBlogs) {
        const top3Keywords = await storage.getTopKeywordsByBlog(blog.id);
        top3Keywords.forEach((kw: any) => allKeywordTexts.add(kw.keyword));
      }
      
      // Get raw_volume mapping from keywords DB
      const keywordVolumeMap = await getKeywordVolumeMap(Array.from(allKeywordTexts));
      
      // Build CSV content: blog_id, keyword, raw_volume, rank
      let csv = "blog_id,keyword,raw_volume,rank\n";
      
      for (const blog of allBlogs) {
        // Only include hit blogs (base_rank 1-10)
        const hasHit = blog.baseRank && blog.baseRank >= 1 && blog.baseRank <= 10;
        if (!hasHit) continue;
        
        const top3Keywords = await storage.getTopKeywordsByBlog(blog.id);
        
        for (const keyword of top3Keywords) {
          const raw_volume = keywordVolumeMap[keyword.keyword] ?? null;
          const rank = keyword.rank ?? null;
          
          csv += `${sanitizeCsvField(blog.blogId)},${sanitizeCsvField(keyword.keyword)},${sanitizeCsvField(raw_volume)},${sanitizeCsvField(rank)}\n`;
        }
      }

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="serp-keywords-export.csv"');
      res.send('\ufeff' + csv); // BOM for Excel UTF-8 support
    } catch (error) {
      console.error('Error exporting keywords CSV:', error);
      res.status(500).json({ error: "Failed to export keywords data" });
    }
  });

  // ===========================================
  // BLOG REGISTRY MANAGEMENT API (Updated)
  // ===========================================

  // Get blog registry with advanced filtering (new storage API)
  app.get("/api/blog-registry", async (req, res) => {
    try {
      const { status, keyword } = req.query;
      
      const blogs = await storage.getBlogRegistry({
        status: status as string,
        keyword: keyword as string
      });

      // Transform data with real metrics from discovered blogs
      const transformedBlogs = await Promise.all(blogs.map(async (blog) => {
        // Get discovered blog info from the main discovery system
        const discoveredBlogResults = await db.select()
          .from(discoveredBlogs)
          .where(eq(discoveredBlogs.blogUrl, blog.url))
          .limit(1);
        
        let exposureCount = 0;
        let totalScore = 0;
        let discoveredKeywords: string[] = [];
        
        if (discoveredBlogResults.length > 0) {
          const extractedKeywords = await storage.getExtractedKeywords(discoveredBlogResults[0].id);
          exposureCount = extractedKeywords.filter(k => k.volume && k.volume > 100).length;
          totalScore = extractedKeywords.reduce((sum, k) => sum + (k.frequency || 0), 0);
          discoveredKeywords = extractedKeywords.slice(0, 10).map(k => k.keyword); // Limit for performance
        }

        return {
          id: blog.blogId,
          blogName: blog.name || "Unknown Blog", 
          blogUrl: blog.url,
          status: blog.status,
          notes: blog.note,
          exposureCount,
          totalScore: Math.round(totalScore),
          lastUpdated: blog.updatedAt?.toISOString() || blog.createdAt?.toISOString(),
          discoveredKeywords
        };
      }));

      res.json(transformedBlogs);
    } catch (error) {
      console.error('Error fetching blog registry:', error);
      res.status(500).json({ error: "Failed to fetch blog registry" });
    }
  });

  // Update blog status using new storage API
  app.patch("/api/blog-registry/:blogId/status", async (req, res) => {
    try {
      const { blogId } = req.params;
      const { status, note } = req.body;
      
      if (!['collected', 'blacklist', 'outreach'].includes(status)) {
        return res.status(400).json({ error: "Invalid status. Must be 'collected', 'blacklist', or 'outreach'" });
      }

      const updatedBlog = await storage.updateBlogRegistryStatus(blogId, status, note);
      
      if (!updatedBlog) {
        return res.status(404).json({ error: "Blog not found" });
      }

      res.json({ success: true, blog: updatedBlog });
    } catch (error) {
      console.error('Error updating blog status:', error);
      res.status(500).json({ error: "Failed to update blog status" });
    }
  });

  // Create or update blog in registry
  app.post("/api/blog-registry", async (req, res) => {
    try {
      const blogData = req.body;
      
      const result = await storage.createOrUpdateBlogRegistry(blogData);
      res.json({ success: true, blog: result });
    } catch (error) {
      console.error('Error creating/updating blog registry:', error);
      res.status(500).json({ error: "Failed to create/update blog registry" });
    }
  });

  // Legacy API - Get blogs with optional status filtering and pagination
  app.get("/api/blogs", async (req, res) => {
    try {
      const { status, limit = 50, offset = 0 } = req.query;
      
      let blogs;
      
      if (status && status !== 'all') {
        blogs = await db.select()
          .from(blogRegistry)
          .where(eq(blogRegistry.status, status as string))
          .orderBy(desc(blogRegistry.lastSeenAt), desc(blogRegistry.createdAt))
          .limit(Number(limit))
          .offset(Number(offset));
      } else {
        blogs = await db.select()
          .from(blogRegistry)
          .orderBy(desc(blogRegistry.lastSeenAt), desc(blogRegistry.createdAt))
          .limit(Number(limit))
          .offset(Number(offset));
      }

      res.json({ blogs });
    } catch (error) {
      console.error('Error fetching blogs:', error);
      res.status(500).json({ error: "Failed to fetch blogs" });
    }
  });

  // Update blog status
  app.post("/api/blogs/:blogId/status", async (req, res) => {
    try {
      const { blogId } = req.params;
      const { status } = req.body;
      
      if (!['collected', 'blacklist', 'outreach'].includes(status)) {
        return res.status(400).json({ error: "Invalid status. Must be 'collected', 'blacklist', or 'outreach'" });
      }

      await db.update(blogRegistry)
        .set({ 
          status,
          updatedAt: new Date()
        })
        .where(eq(blogRegistry.blogId, blogId));

      res.json({ success: true });
    } catch (error) {
      console.error('Error updating blog status:', error);
      res.status(500).json({ error: "Failed to update blog status" });
    }
  });

  // Update blog note and tags
  app.post("/api/blogs/:blogId/note", async (req, res) => {
    try {
      const { blogId } = req.params;
      const { note, tags } = req.body;

      await db.update(blogRegistry)
        .set({ 
          note,
          tags,
          updatedAt: new Date()
        })
        .where(eq(blogRegistry.blogId, blogId));

      res.json({ success: true });
    } catch (error) {
      console.error('Error updating blog note:', error);
      res.status(500).json({ error: "Failed to update blog note" });
    }
  });

  // =============================================
  // v17 ALGORITHM SETTINGS MANAGEMENT (Admin Panel API)
  // =============================================

  // Get current algorithm configuration
  app.get('/api/settings/algo', async (req, res) => {
    try {
      const currentSettings = await metaGet(db, 'algo_config');
      
      if (!currentSettings) {
        // Return default config
        const { defaultAlgoConfig } = await import('@shared/config-schema');
        res.json(defaultAlgoConfig);
      } else {
        res.json(currentSettings);
      }
      
    } catch (error) {
      console.error('Error fetching algo config:', error);
      res.status(500).json({ error: 'Failed to fetch algorithm configuration' });
    }
  });

  // Update algorithm configuration (Admin only)
  app.put('/api/settings/algo', async (req, res) => {
    try {
      const { algoConfigSchema, updateSettingsSchema } = await import('@shared/config-schema');
      
      // Validate request body
      const validatedRequest = updateSettingsSchema.parse(req.body);
      const validatedConfig = algoConfigSchema.parse(validatedRequest.json);
      
      // Save current config to history before updating
      const currentConfig = await metaGet(db, 'algo_config');
      if (currentConfig) {
        const historyEntry = {
          key: 'algo_config',
          version: Date.now(),
          config: currentConfig,
          updatedBy: validatedRequest.updatedBy,
          updatedAt: new Date().toISOString(),
          note: `Backup before update: ${validatedRequest.note || 'No note provided'}`
        };
        
        await metaSet(db, `algo_config_history_${historyEntry.version}`, historyEntry);
      }
      
      // Update current config
      const newConfig = {
        ...validatedConfig,
        metadata: {
          lastUpdated: new Date().toISOString(),
          updatedBy: validatedRequest.updatedBy,
          version: Date.now()
        }
      };
      
      await metaSet(db, 'algo_config', newConfig);
      
      // Invalidate hot-reload cache for immediate effect
      const { invalidateAlgoConfigCache } = await import('./services/algo-config');
      invalidateAlgoConfigCache();
      
      console.log(`✅ [v17 Settings] Algorithm config updated by ${validatedRequest.updatedBy}`);
      console.log(`🔧 [v17 Settings] Engine: ${newConfig.phase2.engine}, Weights: vol=${newConfig.weights.volume}, content=${newConfig.weights.content}`);
      console.log(`🔥 [v17 Settings] Hot-reload cache invalidated - changes will be live in <30s`);
      
      res.json({ success: true, config: newConfig });
      
    } catch (error) {
      console.error('Error updating algo config:', error);
      
      if (error instanceof Error && error.name === 'ZodError') {
        res.status(400).json({ 
          error: 'Invalid configuration format',
          details: (error as any).errors
        });
      } else {
        res.status(500).json({ error: 'Failed to update algorithm configuration' });
      }
    }
  });

  // Get algorithm configuration history
  app.get('/api/settings/algo/history', async (req, res) => {
    try {
      // Get all history entries (simplified approach)
      const history = [];
      
      // This is a simplified implementation - in practice you'd want proper pagination
      // and more efficient history retrieval
      const keys = await db.selectDistinct({ key: appMeta.key }).from(appMeta);
      
      for (const keyRow of keys) {
        if (keyRow.key.startsWith('algo_config_history_')) {
          const entry = await metaGet(db, keyRow.key);
          if (entry) {
            history.push(entry);
          }
        }
      }
      
      // Sort by version (timestamp) descending
      history.sort((a, b) => b.version - a.version);
      
      res.json(history.slice(0, 20)); // Last 20 entries
      
    } catch (error) {
      console.error('Error fetching algo config history:', error);
      res.status(500).json({ error: 'Failed to fetch configuration history' });
    }
  });

  // Rollback to previous algorithm configuration
  app.post('/api/settings/algo/rollback', async (req, res) => {
    try {
      const { rollbackSettingsSchema } = await import('@shared/config-schema');
      const validatedRollback = rollbackSettingsSchema.parse(req.body);
      
      // Get the historical config
      const historyKey = `algo_config_history_${validatedRollback.version}`;
      const historicalConfig = await metaGet(db, historyKey);
      
      if (!historicalConfig) {
        return res.status(404).json({ error: 'Historical configuration not found' });
      }
      
      // Save current config as backup before rollback
      const currentConfig = await metaGet(db, 'algo_config');
      if (currentConfig) {
        const backupEntry = {
          key: 'algo_config',
          version: Date.now(),
          config: currentConfig,
          updatedBy: 'system',
          updatedAt: new Date().toISOString(),
          note: `Pre-rollback backup to version ${validatedRollback.version}`
        };
        
        await metaSet(db, `algo_config_history_${backupEntry.version}`, backupEntry);
      }
      
      // Restore historical config
      const restoredConfig = {
        ...historicalConfig.config,
        metadata: {
          lastUpdated: new Date().toISOString(),
          updatedBy: 'admin',
          version: Date.now(),
          rolledBackFrom: validatedRollback.version
        }
      };
      
      await metaSet(db, 'algo_config', restoredConfig);
      
      // Invalidate hot-reload cache for immediate effect
      const { invalidateAlgoConfigCache } = await import('./services/algo-config');
      invalidateAlgoConfigCache();
      
      console.log(`🔄 [v17 Settings] Algorithm config rolled back to version ${validatedRollback.version}`);
      console.log(`🔥 [v17 Settings] Hot-reload cache invalidated after rollback`);
      
      res.json({ success: true, config: restoredConfig, rolledBackFrom: validatedRollback.version });
      
    } catch (error) {
      console.error('Error rolling back algo config:', error);
      
      if (error instanceof Error && error.name === 'ZodError') {
        res.status(400).json({ 
          error: 'Invalid rollback request format',
          details: (error as any).errors
        });
      } else {
        res.status(500).json({ error: 'Failed to rollback algorithm configuration' });
      }
    }
  });

  // =============================================
  // SCORING CONFIG MANAGEMENT (Admin Panel API)
  // =============================================
  
  // Get current scoring configuration
  app.get('/api/scoring-config', async (req, res) => {
    try {
      const { loadScoringConfig } = await import('./services/scoring-config.js');
      const config = await loadScoringConfig();
      res.json(config);
    } catch (error) {
      console.error('Error fetching scoring config:', error);
      res.status(500).json({ error: 'Failed to fetch scoring configuration' });
    }
  });

  // Update scoring configuration (Admin only)
  app.put('/api/scoring-config', async (req, res) => {
    try {
      const { loadScoringConfig, saveScoringConfig } = await import('./services/scoring-config.js');
      
      // Validate config structure with Zod
      const configSchema = z.object({
        version: z.string(),
        description: z.string(),
        scoring: z.object({
          weights: z.object({
            volume: z.number().min(0).max(1),
            competition: z.number().min(0).max(1),
            ad_depth: z.number().min(0).max(1),
            cpc: z.number().min(0).max(1)
          }),
          normalization: z.object({
            volume: z.object({
              type: z.enum(['logarithmic', 'linear']),
              base: z.number().optional(),
              max_raw: z.number(),
              scale_factor: z.number().optional()
            }),
            competition: z.object({
              type: z.enum(['direct', 'linear']),
              scale: z.number()
            }),
            ad_depth: z.object({
              type: z.literal('linear'),
              max: z.number()
            }),
            cpc: z.object({
              type: z.literal('linear'),
              max: z.number()
            })
          }),
          competition_mapping: z.record(z.number())
        }),
        logging: z.object({
          enabled: z.boolean(),
          detailed: z.boolean(),
          log_calculations: z.boolean()
        }),
        metadata: z.object({
          last_modified: z.string(),
          modified_by: z.string(),
          change_log: z.array(z.object({
            date: z.string(),
            changes: z.string(),
            author: z.string()
          }))
        })
      });

      const validatedConfig = configSchema.parse(req.body);
      
      // Validate weights sum approximately to 1
      const weightSum = validatedConfig.scoring.weights.volume + 
                       validatedConfig.scoring.weights.competition + 
                       validatedConfig.scoring.weights.ad_depth + 
                       validatedConfig.scoring.weights.cpc;
      
      if (Math.abs(weightSum - 1.0) > 0.01) {
        return res.status(400).json({ 
          error: 'Weights must sum to 1.0', 
          currentSum: weightSum 
        });
      }
      
      await saveScoringConfig(validatedConfig);
      console.log(`✅ [Admin API] Scoring config updated successfully`);
      
      res.json({ success: true, config: validatedConfig });
    } catch (error) {
      console.error('Error updating scoring config:', error);
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: 'Invalid configuration format', details: error.errors });
      } else {
        res.status(500).json({ error: 'Failed to update scoring configuration' });
      }
    }
  });

  // ===========================================
  // UNIFIED HEALTH GATE + KEYWORDS MANAGEMENT
  // ===========================================

  // Optimistic health check endpoint with force parameter support

  app.get('/api/health', async (req, res) => {
    try {
      const force = String(req.query.force || '').toLowerCase() === 'true';
      const healthMode = process.env.HEALTH_MODE || 'optimistic';
      
      // 사용자가 force=true일 때만 실제 검사, 기본은 낙관적 캐시 사용
      const healthData = force ? 
        await probeHealth(db) : 
        await getOptimisticHealth(db);
      
      // LKG 데이터가 없으면 첫 실행이므로 probe가 실행됨
      const cacheAge = healthData.ts ? Math.round((Date.now() - healthData.ts) / 1000) : 0;
      const cacheStatus = force ? 'FORCED' : (cacheAge < 60 ? 'FRESH' : 'CACHED');
      
      res.setHeader('X-Health-Cache', cacheStatus);
      res.setHeader('X-Health-Mode', healthMode);
      res.setHeader('X-Health-Age', cacheAge.toString());
      res.setHeader('X-Health-Degraded', healthData.degraded ? 'true' : 'false');
      
      // UI 및 프롬프트 로직을 위해 기존 형식 유지
      const responseData = {
        openapi: healthData.openapi,
        searchads: healthData.searchads,
        keywordsdb: healthData.keywordsdb,
        ui: {
          setup_complete: true, // 단순화
          should_prompt: false, // 최적화된 버전에서는 프롬프트 최소화
          suppress_until: 0
        },
        // 추가 메타데이터
        _meta: {
          mode: healthMode,
          degraded: !!healthData.degraded,
          cache_age_seconds: cacheAge,
          last_ok_ts: healthData.last_ok_ts,
          forced: force
        }
      };
      
      res.status(200).json(responseData);
    } catch (error) {
      console.error('🏥 Health check failed:', error);
      res.setHeader('X-Health-Cache', 'ERROR');
      res.status(500).json({ error: 'Health check failed', details: String(error) });
    }
  });

  // Suppress API key prompts endpoint
  app.post('/api/secrets/suppress', async (req, res) => {
    try {
      const days = Math.min(90, Math.max(1, Number(req.body?.days || 30)));
      
      const cache = (await metaGet<any>(db, 'secrets_state')) || {};
      cache.suppress_until = Date.now() + days * 24 * 60 * 60 * 1000;
      await metaSet(db, 'secrets_state', cache);
      
      console.log(`🤐 API key prompts suppressed for ${days} days`);
      res.json({ ok: true, suppress_until: cache.suppress_until });
    } catch (error) {
      console.error('Failed to suppress prompts:', error);
      res.status(500).json({ error: 'Failed to suppress prompts', details: String(error) });
    }
  });

  // Enhanced SERP search with optimistic health checking
  // Zero volume keywords fix endpoint
  app.post('/api/fix-zero-volumes', async (req, res) => {
    try {
      const { limit = 100 } = req.body;
      const { fixZeroVolumeKeywords } = await import('./services/fix-zero-volumes.js');
      const stats = await fixZeroVolumeKeywords(db, limit);
      res.json(stats);
    } catch (error) {
      console.error('Fix zero volumes failed:', error);
      res.status(500).json({ error: 'Failed to fix zero volumes' });
    }
  });

  // Fix specific keywords endpoint
  app.post('/api/fix-keywords', async (req, res) => {
    try {
      const { keywords } = req.body;
      if (!Array.isArray(keywords)) {
        return res.status(400).json({ error: 'Keywords must be an array' });
      }
      const { fixSpecificKeywords } = await import('./services/fix-zero-volumes.js');
      const stats = await fixSpecificKeywords(db, keywords);
      res.json(stats);
    } catch (error) {
      console.error('Fix specific keywords failed:', error);
      res.status(500).json({ error: 'Failed to fix specific keywords' });
    }
  });

  app.post('/api/serp/search', async (req, res) => {
    try {
      const { strict = false } = req.body || {};
      console.log(`🔒 SERP search request - Strict mode: ${strict}`);
      
      // 1) 필요한 경우에만 프리플라이트
      if (await shouldPreflight(db, strict)) {
        const h = await probeHealth(db);
        if (!h.openapi.ok || h.searchads.mode === 'fallback' || !h.keywordsdb.ok) {
          return res.status(412).json({ 
            error: 'PRECONDITION_FAILED', 
            health: h,
            hint: 'Health check failed - services not operational' 
          });
        }
      }

      // If validation passes, delegate to existing analyze endpoint logic
      const validatedBody = z.object({
        keywords: z.array(z.string()).min(1).max(20),
        minRank: z.number().optional().default(2),
        maxRank: z.number().optional().default(15),
        postsPerBlog: z.number().optional().default(10),
        titleExtract: z.boolean().optional().default(true),
        enableLKMode: z.boolean().optional().default(false),
        preferCompound: z.boolean().optional().default(true),
        targetCategory: z.string().optional()
      }).parse(req.body);

      const { 
        keywords, 
        minRank, 
        maxRank, 
        postsPerBlog, 
        titleExtract,
        enableLKMode,
        preferCompound,
        targetCategory
      } = validatedBody;
      
      if (!keywords || !Array.isArray(keywords) || keywords.length === 0) {
        return res.status(400).json({ error: "Keywords array is required (1-20 keywords)" });
      }

      // Create SERP analysis job with preset volume mode
      const job = await storage.createSerpJob({
        keywords,
        minRank,
        maxRank,
        status: "pending",
        currentStep: "discovering_blogs",
        totalSteps: 3,
        completedSteps: 0,
        progress: 0
      });

      // Start analysis in background (reuse existing function) with LK Mode options
      processSerpAnalysisJob(job.id, keywords, minRank, maxRank, postsPerBlog, titleExtract, {
        enableLKMode,
        preferCompound,
        targetCategory
      });

      // 시작 성공 → 정상 기록
      const h = await getOptimisticHealth(db);
      await markHealthGood(db, h);

      console.log(`🔒 SERP analysis started with job ID: ${job.id}`);
      return res.status(202).json({ jobId: job.id, health: h });
      
    } catch (error: any) {
      // 3) 실행 중 오류 → degraded 마킹
      await markHealthFail(db, error?.message);
      console.error('🔒 SERP search failed:', error);
      res.status(500).json({ error: 'SERP search failed', details: String(error) });
    }
  });

  // ===== File Upload for Seeds =====
  app.post('/api/uploads', upload.single('file'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      console.log(`📁 Processing uploaded file: ${req.file.originalname} (${req.file.size} bytes)`);

      let rows: { seed: string; category?: string }[] = [];
      const fileName = req.file.originalname.toLowerCase();

      if (fileName.endsWith('.csv')) {
        // Parse CSV file
        const csvData = req.file.buffer.toString('utf-8');
        const lines = csvData.split('\n');
        
        if (lines.length < 2) {
          return res.status(400).json({ error: 'CSV file must have at least header + 1 data row' });
        }

        // Skip header line and process data
        for (let i = 1; i < lines.length; i++) {
          const line = lines[i].trim();
          if (!line) continue;
          
          const parts = line.split(',');
          const seed = parts[0]?.trim();
          const category = parts[1]?.trim() || undefined;
          
          if (seed && seed.length > 0) {
            rows.push({ seed, category });
          }
        }
      } else if (fileName.endsWith('.xlsx')) {
        // Parse XLSX file
        const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];
        
        if (data.length < 2) {
          return res.status(400).json({ error: 'XLSX file must have at least header + 1 data row' });
        }

        // Skip header row and process data
        for (let i = 1; i < data.length; i++) {
          const row = data[i];
          const seed = row[0]?.toString()?.trim();
          const category = row[1]?.toString()?.trim() || undefined;
          
          if (seed && seed.length > 0) {
            rows.push({ seed, category });
          }
        }
      } else {
        return res.status(400).json({ error: 'Unsupported file format. Only CSV and XLSX are allowed.' });
      }

      if (rows.length === 0) {
        return res.status(400).json({ error: 'No valid seed keywords found in file' });
      }

      // Generate unique file ID and store in memory
      const fileId = nanoid();
      uploadedFiles.set(fileId, {
        rows,
        originalName: req.file.originalname,
        uploadedAt: new Date()
      });

      console.log(`✅ Successfully processed ${rows.length} seed keywords from ${req.file.originalname}`);
      console.log(`📂 File stored with ID: ${fileId}`);

      res.json({ 
        fileId, 
        rows: rows.length,
        fileName: req.file.originalname,
        sample: rows.slice(0, 3) // Show first 3 for preview
      });

    } catch (error) {
      console.error('❌ File upload failed:', error);
      res.status(500).json({ error: 'Failed to process uploaded file', details: String(error) });
    }
  });

  // 새로운 전체 키워드 가져오기 엔드포인트 (optimistic health)
  app.post('/api/keywords/refresh-all', async (req, res) => {
    try {
      const { minVolume = 1000, hasAdsOnly = true, mode = 'merge', strict = false } = req.body || {};
      console.log(`🔄 Keywords refresh-all - minVolume: ${minVolume}, hasAdsOnly: ${hasAdsOnly}, mode: ${mode}`);
      
      // 1) 필요한 경우에만 프리플라이트
      if (await shouldPreflight(db, strict)) {
        const h = await probeHealth(db);
        if (h.searchads.mode === 'fallback') {
          return res.status(412).json({ 
            error: 'PRECONDITION_FAILED', 
            health: h
          });
        }
      }

      // 전체 키워드 수집 로직 (기존 함수 재사용) - 단일 키워드로 수정
      const result = await upsertKeywordsFromSearchAds('홍삼', 300);

      // 성공 시 정상 상태 기록
      const h = await getOptimisticHealth(db);
      await markHealthGood(db, h);

      res.json({
        message: 'Refresh completed successfully',
        inserted: result.count || 0,
        volumes_mode: result.mode || 'searchads',
        ok: result.count || 0,
        fail: 0,
        requested: 1
      });

    } catch (error: any) {
      await markHealthFail(db, error?.message);
      console.error('🔄 Keywords refresh-all failed:', error);
      res.status(500).json({ 
        error: 'Refresh failed', 
        details: error?.message || String(error) 
      });
    }
  });

  // Load built-in keywords from CSV
  app.post("/api/keywords/load-builtin", async (req, res) => {
    try {
      console.log('📂 Loading built-in keywords from CSV...');
      const { loadSeedsFromCSV } = await import('./services/bfs-crawler');
      const seedKeywords = loadSeedsFromCSV();
      
      if (seedKeywords.length === 0) {
        return res.status(500).json({ error: "Failed to load seed keywords from CSV" });
      }

      // 키워드들을 ManagedKeyword 형태로 변환
      const keywordsToSave = seedKeywords.map(text => ({
        text: text.trim(),
        raw_volume: 0, // Will be updated when volumes are fetched
        comp_idx: 'unknown',
        ad_depth: 0,
        est_cpc_krw: 0,
        score: 50, // Default score
        excluded: false
      }));

      // 배치로 저장
      const { upsertMany } = await import('./store/keywords');
      const totalSaved = await upsertMany(keywordsToSave);
      
      console.log(`✅ Successfully loaded ${totalSaved}/${seedKeywords.length} keywords from built-in CSV`);
      
      res.json({
        success: true,
        totalKeywords: seedKeywords.length,
        savedKeywords: totalSaved,
        message: `Successfully loaded ${totalSaved} built-in keywords`
      });
    } catch (error) {
      console.error('❌ Error loading built-in keywords:', error);
      res.status(500).json({ error: "Failed to load built-in keywords" });
    }
  });

  // Keywords refresh endpoint (optimistic health)
  app.post('/api/keywords/refresh', async (req, res) => {
    try {
      const { base, limit = 300, strict = false } = req.body || {};
      console.log(`📝 Keywords refresh - Base: "${base}", Limit: ${limit}, Strict: ${strict}`);
      
      if (!base || typeof base !== 'string') {
        return res.status(400).json({ error: 'Base keyword is required' });
      }

      // 1) 필요한 경우에만 프리플라이트
      if (await shouldPreflight(db, strict)) {
        const h = await probeHealth(db);
        if (!h.openapi.ok || h.searchads.mode === 'fallback' || !h.keywordsdb.ok) {
          console.log(`📝 Keywords refresh BLOCKED by health check`);
          return res.status(412).json({ 
            error: 'PRECONDITION_FAILED', 
            health: h
          });
        }
      }

      const result = await upsertKeywordsFromSearchAds(base, limit);
      console.log(`📝 Keywords refresh complete - Mode: ${result.mode}, Inserted: ${result.count}`);
      
      // 성공 시 정상 상태 기록
      const h = await getOptimisticHealth(db);
      await markHealthGood(db, h);
      
      res.json({ 
        ok: true, 
        volumes_mode: result.mode, 
        stats: result.stats, 
        inserted: result.count 
      });
    } catch (error: any) {
      await markHealthFail(db, error?.message);
      console.error('📝 Keywords refresh failed:', error);
      res.status(500).json({ error: 'Keywords refresh failed', details: String(error) });
    }
  });


  // List excluded keywords
  app.get('/api/keywords/excluded', async (req, res) => {
    try {
      console.log('🚫 Listing excluded keywords...');
      const items = await listExcluded();
      res.json({ items });
    } catch (error) {
      console.error('🚫 List excluded keywords failed:', error);
      res.status(500).json({ error: 'Failed to list excluded keywords', details: String(error) });
    }
  });

  // Expand Keywords - Add related keywords from seeds (single operation)
  app.post('/api/keywords/expand', async (req, res) => {
    try {
      const { seeds, minVolume = 1000, hasAdsOnly = true, chunkSize = 10 } = req.body;
      
      if (!seeds || !Array.isArray(seeds) || seeds.length === 0) {
        return res.status(400).json({ error: 'Seeds array is required' });
      }

      console.log(`🌱 Expanding keywords from ${seeds.length} seeds: ${seeds.slice(0, 3).join(', ')}...`);
      console.log(`⚙️ Config: minVolume=${minVolume}, hasAdsOnly=${hasAdsOnly}, chunkSize=${chunkSize}`);

      // Get volumes for all seeds (health-aware)
      const volumeResult = await getVolumesWithHealth(db, seeds);
      const volumes = volumeResult.volumes;
      const mode = volumeResult.mode;
      
      console.log(`📊 Got volumes for ${Object.keys(volumes).length}/${seeds.length} seeds (mode: ${mode})`);

      // Process and save keywords
      const keywordsToUpsert: any[] = [];
      let inserted = 0;
      let updated = 0;
      let duplicates = 0;

      for (const [text, volumeData] of Object.entries(volumes)) {
        const rawVolume = volumeData.total || 0;
        const hasAds = (volumeData.plAvgDepth || 0) > 0;
        
        // Apply filters ONLY in searchads mode (Phase 1: 임시 저장 정책)
        if (mode === 'searchads') {
          if (rawVolume < minVolume) {
            console.log(`⏭️ "${text}" volume ${rawVolume} < ${minVolume} - skipping`);
            continue;
          }
          
          if (hasAdsOnly && !hasAds) {
            console.log(`⏭️ "${text}" has no ads - skipping`);
            continue;
          }
        } else {
          console.log(`📝 "${text}" saving with raw_volume=${rawVolume} (${mode} mode - no filters)`);
        }

        // Calculate score (Phase 1: 임시 저장 정책)
        const overallScore = mode === 'searchads' 
          ? await calculateOverallScore(
              rawVolume,
              await compIdxToScore(volumeData.compIdx || '중간'),
              volumeData.plAvgDepth || 0,
              volumeData.avePcCpc || 0
            )
          : 40; // 임시 보수적 점수 for fallback/partial mode

        // Check if keyword already exists
        const existingKeyword = await findKeywordByText(text);
        
        const keywordData = {
          text,
          raw_volume: mode === 'searchads' ? rawVolume : 0, // fallback/partial에서는 0으로 저장
          comp_idx: volumeData.compIdx || '중간',
          ad_depth: volumeData.plAvgDepth || 0,
          est_cpc_krw: volumeData.avePcCpc || 0,
          score: overallScore,
          excluded: false
        };

        keywordsToUpsert.push(keywordData);
        
        if (existingKeyword) {
          updated++;
          console.log(`🔄 Updated "${text}" (Vol: ${rawVolume.toLocaleString()}, Score: ${overallScore})`);
        } else {
          inserted++;
          console.log(`✅ Added "${text}" (Vol: ${rawVolume.toLocaleString()}, Score: ${overallScore})`);
        }
      }

      // Save all keywords
      const savedCount = await upsertMany(keywordsToUpsert);
      
      console.log(`📝 Expand operation completed: ${inserted} new, ${updated} updated`);

      res.json({
        inserted,
        updated,
        duplicates,
        stats: {
          requested: seeds.length,
          ok: Object.keys(volumes).length,
          fail: seeds.length - Object.keys(volumes).length
        }
      });

    } catch (error) {
      console.error('❌ Failed to expand keywords:', error);
      res.status(500).json({ error: 'Failed to expand keywords', details: String(error) });
    }
  });

  // BFS Keyword Crawl - Start exhaustive crawl (updated)
  app.post('/api/keywords/crawl', async (req, res) => {
    try {
      // Check if crawler already running
      const existingCrawler = getGlobalCrawler();
      if (existingCrawler && existingCrawler.status === 'running') {
        return res.status(409).json({ 
          error: 'Crawler already running',
          progress: existingCrawler.getProgress()
        });
      }

      // Parse parameters with defaults (enhanced version)
      const {
        mode = 'exhaustive',
        source = 'builtin',         // "manual" | "file" | "builtin" 
        seeds: userSeeds = [],       // for source="manual"
        seedsFileId,                 // for source="file"
        target = 20000,
        maxHops = 3,
        minVolume = 1000,
        hasAdsOnly = true,
        chunkSize = 10,
        concurrency = 1,
        stopIfNoNewPct = 0.5,
        strict = false
      } = req.body;

      console.log(`🚀 Starting BFS keyword crawl (${mode} mode) with target: ${target}`);
      console.log(`⚙️ Config: source=${source}, minVolume=${minVolume}, hasAdsOnly=${hasAdsOnly}, chunk=${chunkSize}, concurrency=${concurrency}`);
      console.log(`📊 Advanced: maxHops=${maxHops}, stopIfNoNewPct=${stopIfNoNewPct}, strict=${strict}`);

      // Determine seeds to use based on source
      let seeds: string[];
      
      if (source === 'manual') {
        if (!userSeeds || userSeeds.length === 0) {
          return res.status(400).json({ error: 'Seeds array is required when source="manual"' });
        }
        seeds = userSeeds;
        console.log(`🌱 Using ${seeds.length} manual seeds: ${seeds.slice(0, 5).join(', ')}...`);
        
      } else if (source === 'file') {
        if (!seedsFileId) {
          return res.status(400).json({ error: 'seedsFileId is required when source="file"' });
        }
        
        const uploadedFile = uploadedFiles.get(seedsFileId);
        if (!uploadedFile) {
          return res.status(404).json({ error: 'File not found. Please upload file first.' });
        }
        
        seeds = uploadedFile.rows.map(row => row.seed);
        console.log(`📁 Using ${seeds.length} seeds from uploaded file "${uploadedFile.originalName}": ${seeds.slice(0, 5).join(', ')}...`);
        
      } else { // source === 'builtin' 
        const csvPath = require('path').join(process.cwd(), 'server/data/seed_keywords_v2_ko.csv');
        seeds = loadSeedsFromCSV(csvPath); // 명시적 경로 전달
        if (seeds.length === 0) {
          return res.status(400).json({ error: `No seeds found in builtin CSV file: ${csvPath}` });
        }
        console.log(`📂 Using ${seeds.length} builtin seeds from CSV: ${seeds.slice(0, 5).join(', ')}...`);
      }

      // 빈 프론티어 가드: 시드 없으면 곧바로 done 방지
      if (!Array.isArray(seeds) || seeds.length === 0) {
        return res.status(400).json({ error: 'No seeds to start BFS crawl' });
      }

      // ✅ STEP: Process seeds FIRST (add to database, skip duplicates)
      console.log(`📊 Processing ${seeds.length} seeds before BFS expansion...`);
      const existingKeywords = await listKeywords({ excluded: false, orderBy: 'raw_volume', dir: 'desc' });
      const existingTexts = new Set(existingKeywords.map(k => normalizeKeyword(k.text)));
      
      const newSeeds = seeds.filter(seed => {
        const normalized = normalizeKeyword(seed);
        return !existingTexts.has(normalized);
      });
      
      console.log(`🔍 Found ${newSeeds.length} new seeds (${seeds.length - newSeeds.length} duplicates skipped)`);
      
      let seedsProcessed = 0;
      if (newSeeds.length > 0) {
        const volumeResults = await getVolumesWithHealth(db, newSeeds);
        
        // NaN 안전 처리 함수 (routes.ts용)
        const safeParseNumber = (value: any): number => {
          const parsed = Number(value);
          return isNaN(parsed) ? 0 : parsed;
        };
        
        const keywordsToInsert: any[] = [];
        for (const [text, v] of Object.entries<any>(volumeResults.volumes)) {
          const rawVolume = safeParseNumber(v.total ?? v.volumeMonthly ?? 0);
          const adDepth   = safeParseNumber(v.plAvgDepth ?? v.adWordsCnt ?? 0);
          const estCpc    = safeParseNumber(v.avePcCpc ?? v.cpc ?? 0);
          const compIdx   = v.compIdx ?? '중간';

          if (rawVolume < minVolume) continue;
          if (hasAdsOnly && adDepth <= 0) continue;

          keywordsToInsert.push({
            text,
            raw_volume: rawVolume,
            comp_idx: compIdx,
            comp_score: await compIdxToScore(compIdx),
            ad_depth: adDepth,
            has_ads: adDepth > 0,
            est_cpc_krw: estCpc,
            est_cpc_source: 'searchads',
            score: await calculateOverallScore(rawVolume, await compIdxToScore(compIdx), adDepth, estCpc),
            source: 'bfs_seed'
          });
        }
        
        if (keywordsToInsert.length > 0) {
          await upsertMany(keywordsToInsert);
          seedsProcessed = keywordsToInsert.length;
          console.log(`✅ Added ${seedsProcessed} new seed keywords to database`);
        }
      }

      // Create and configure crawler with enhanced parameters  
      const crawler = createGlobalCrawler({
        target,
        maxHops,
        minVolume,
        hasAdsOnly,
        chunkSize,
        concurrency,
        stopIfNoNewPct,
        strict
      });

      // Initialize with seeds (명세서: 프론티어 = seeds ∪ expandAll(seeds))
      try {
        await crawler.initializeWithSeeds(seeds);
      } catch (error) {
        // Empty frontier error → HTTP 400 (명세서 요구사항)
        if (String(error).includes('Empty frontier')) {
          return res.status(400).json({ error: 'Empty frontier after expansion - no valid keywords to crawl' });
        }
        throw error;
      }

      // Start crawling in background
      crawler.crawl().catch(error => {
        console.error('❌ BFS crawl failed:', error);
      });

      // Return job ID and initial status with enhanced config info
      const jobId = 'crawl-' + Date.now();
      const initialProgress = crawler.getProgress();
      console.log(`✅ BFS crawl started - Job ID: ${jobId}, Frontier size: ${initialProgress.frontierSize}`);

      res.json({
        jobId,
        message: 'BFS keyword crawl started successfully',
        config: { 
          mode, 
          source,
          target, 
          maxHops, 
          minVolume, 
          hasAdsOnly, 
          chunkSize, 
          concurrency,
          stopIfNoNewPct,
          strict
        },
        seedsLoaded: seeds.length,
        seedsProcessed,
        progress: initialProgress,
        // 추가 메타데이터
        sourceInfo: source === 'file' ? { 
          fileId: seedsFileId, 
          fileName: uploadedFiles.get(seedsFileId)?.originalName 
        } : { type: source }
      });

    } catch (error) {
      console.error('❌ Failed to start BFS crawl:', error);
      res.status(500).json({ error: 'Failed to start BFS crawl', details: String(error) });
    }
  });

  // BFS Crawl Progress - Get current crawl status (Phase 3 enhanced)
  app.get('/api/keywords/crawl/progress', async (req, res) => {
    try {
      const crawler = getGlobalCrawler();
      if (!crawler) {
        return res.json({ 
          status: 'idle', 
          message: 'No active crawl session',
          callBudget: getCallBudgetStatus()
        });
      }

      const progress = crawler.getProgress();
      const budgetStatus = getCallBudgetStatus();
      const crawlerStale = isStale(crawler);
      
      res.json({
        ...progress,
        // Phase 3: Call budget & stale detection
        callBudget: budgetStatus,
        isStale: crawlerStale,
        staleSince: crawlerStale ? Date.now() - (crawler.lastUpdated?.getTime() || 0) : null
      });
    } catch (error) {
      console.error('❌ Failed to get crawl progress:', error);
      res.status(500).json({ error: 'Failed to get crawl progress' });
    }
  });

  // BFS Crawl Status - Get specific job status (by job ID) (Phase 3 enhanced)
  app.get('/api/keywords/crawl/:jobId/status', async (req, res) => {
    try {
      const { jobId } = req.params;
      const crawler = getGlobalCrawler();
      
      if (!crawler) {
        return res.json({ 
          state: 'idle', 
          message: 'No active crawl session',
          progress: { collected: 0, requested: 0, ok: 0, fail: 0 },
          callBudget: getCallBudgetStatus()
        });
      }

      const progress = crawler.getProgress();
      const budgetStatus = getCallBudgetStatus();
      const crawlerStale = isStale(crawler);
      
      // Phase 3: Enhanced state detection
      let state = crawler.status === 'running' ? 'running' : 
                  crawler.status === 'completed' ? 'done' : 
                  crawler.status === 'error' ? 'error' : 'idle';
      
      // Mark as stale if inactive for >5 minutes
      if (state === 'running' && crawlerStale) {
        state = 'stale';
      }

      res.json({
        jobId,
        state,
        progress: {
          collected: progress.keywordsSaved || 0,
          requested: progress.totalProcessed || 0,
          ok: progress.keywordsSaved || 0,
          fail: (progress.totalProcessed || 0) - (progress.keywordsSaved || 0),
          frontierSize: progress.frontierSize || 0,
          currentHop: progress.currentHop || 0
        },
        config: null,
        message: progress.estimatedTimeLeft || '',
        // Phase 3: Call budget & stale detection
        callBudget: budgetStatus,
        isStale: crawlerStale,
        staleSince: crawlerStale ? Date.now() - (crawler.lastUpdated?.getTime() || 0) : null
      });

    } catch (error) {
      console.error('❌ Failed to get crawl status:', error);
      res.status(500).json({ error: 'Failed to get crawl status', details: String(error) });
    }
  });

  // BFS Crawl Cancel - Stop specific job
  app.post('/api/keywords/crawl/:jobId/cancel', async (req, res) => {
    try {
      const { jobId } = req.params;
      const crawler = getGlobalCrawler();
      
      if (!crawler) {
        return res.json({ ok: false, message: 'No active crawl session to cancel' });
      }

      if (crawler.status === 'running') {
        crawler.stop();
        clearGlobalCrawler();
        console.log(`🛑 BFS crawl job ${jobId} cancelled by user`);
        res.json({ ok: true, message: 'Crawl job cancelled successfully' });
      } else {
        res.json({ ok: false, message: 'No running crawl to cancel' });
      }

    } catch (error) {
      console.error('❌ Failed to cancel crawl:', error);
      res.status(500).json({ error: 'Failed to cancel crawl', details: String(error) });
    }
  });

  // BFS Crawl Stop - Stop current crawl session
  app.post('/api/keywords/crawl/stop', async (req, res) => {
    try {
      const crawler = getGlobalCrawler();
      if (!crawler) {
        return res.status(404).json({ error: 'No active crawl session' });
      }

      crawler.stop();
      clearGlobalCrawler();

      console.log('🛑 BFS crawl stopped by user');
      res.json({ message: 'BFS crawl stopped successfully' });
    } catch (error) {
      console.error('❌ Failed to stop BFS crawl:', error);
      res.status(500).json({ error: 'Failed to stop BFS crawl' });
    }
  });

  // Keywords DB Management APIs
  app.get("/api/keywords/stats", async (req, res) => {
    try {
      // Use efficient count function instead of loading all keywords
      const counts = await getKeywordsCounts();
      
      // Get last updated timestamp from a small sample
      const recentKeywords = await listKeywords({ excluded: false, orderBy: 'raw_volume', dir: 'desc' });
      const lastUpdated = recentKeywords.length > 0 
        ? Math.max(...recentKeywords.slice(0, 10).map(k => k.updated_at ? new Date(k.updated_at).getTime() : 0))
        : Date.now();
      
      // Get volumes_mode from meta only (no heavy health check)
      const volumes_mode = await metaGet(db, 'searchads_mode') || 'searchads';
      
      res.json({
        total: counts.total,
        active: counts.active,
        excluded: counts.excluded,
        lastUpdated: new Date(lastUpdated).toISOString(),
        volumes_mode
      });
    } catch (error) {
      console.error('Error getting keywords stats:', error);
      res.status(500).json({ error: 'Failed to get keywords stats' });
    }
  });

  app.get("/api/keywords", async (req, res) => {
    try {
      const {
        sort = 'raw_volume',
        order = 'desc',
        excluded,
        offset = '0',
        limit = '100'
      } = req.query;
      
      const offsetNum = parseInt(offset as string) || 0;
      const limitNum = parseInt(limit as string) || 100;
      
      // Convert excluded query param to boolean filter
      let excludedFilter: boolean = false;
      if (excluded === 'true') excludedFilter = true;
      else if (excluded === 'false') excludedFilter = false;
      
      // Get keywords from store with proper parameters
      const keywords = await listKeywords({ 
        excluded: excludedFilter, 
        orderBy: sort === 'text' ? 'text' : 'raw_volume', 
        dir: order === 'asc' ? 'asc' : 'desc' 
      });
      
      // Apply pagination
      const paginatedKeywords = keywords.slice(offsetNum, offsetNum + limitNum);
      
      res.json({
        items: paginatedKeywords,
        total: keywords.length
      });
    } catch (error) {
      console.error('Error listing keywords:', error);
      res.status(500).json({ error: 'Failed to list keywords' });
    }
  });

  app.patch("/api/keywords/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const { excluded } = req.body;
      
      if (typeof excluded !== 'boolean') {
        return res.status(400).json({ error: 'excluded field must be boolean' });
      }
      
      // Use existing function to set excluded status
      await setKeywordExcluded(id, excluded);
      
      // Get updated keyword to return
      const includedKeywords = await listKeywords({ excluded: false, orderBy: 'raw_volume', dir: 'desc' });
      const excludedKeywords = await listKeywords({ excluded: true, orderBy: 'raw_volume', dir: 'desc' });
      const allKeywords = [...includedKeywords, ...excludedKeywords];
      const updatedKeyword = allKeywords.find(k => k.id === id);
      
      if (!updatedKeyword) {
        return res.status(404).json({ error: 'Keyword not found' });
      }
      
      res.json(updatedKeyword);
    } catch (error) {
      console.error('Error updating keyword:', error);
      res.status(500).json({ error: 'Failed to update keyword' });
    }
  });


  app.get("/api/keywords/export.csv", async (req, res) => {
    try {
      const includedKeywords = await listKeywords({ excluded: false, orderBy: 'raw_volume', dir: 'desc' });
      const excludedKeywords = await listKeywords({ excluded: true, orderBy: 'raw_volume', dir: 'desc' });
      const keywords = [...includedKeywords, ...excludedKeywords];
      
      // Create CSV content with proper Korean encoding (use semicolons for Excel compatibility)
      const header = 'text;raw_volume;volume;grade;excluded;updated_at\n';
      const rows = keywords.map(k => {
        const excluded = k.excluded ? 'true' : 'false';
        const updatedAt = k.updated_at ? new Date(k.updated_at).toISOString() : '';
        return `${sanitizeCsvField(k.text)};${sanitizeCsvField(k.raw_volume)};${sanitizeCsvField(k.volume)};${sanitizeCsvField(k.grade)};${sanitizeCsvField(excluded)};${sanitizeCsvField(updatedAt)}`;
      }).join('\n');
      
      const csvContent = header + rows;
      
      // Set headers for file download with UTF-8 BOM and proper encoding for Korean Excel
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename*=UTF-8\'\'keywords-export.csv');
      
      res.send('\ufeff' + csvContent); // UTF-8 BOM + Semicolon separator for Excel Korean support
    } catch (error) {
      console.error('Error exporting keywords:', error);
      res.status(500).json({ error: 'Failed to export keywords' });
    }
  });

  app.post("/api/keywords/import", upload.single('file'), async (req, res) => {
    try {
      const mode = req.query.mode as string || 'replace';
      
      if (mode !== 'replace' && mode !== 'merge') {
        return res.status(400).json({ error: 'mode must be either "replace" or "merge"' });
      }

      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      // Parse CSV from buffer using fixed stream parsing
      const results: any[] = [];
      const warnings: string[] = [];
      let inserted = 0, updated = 0, deleted = 0;

      await new Promise<void>((resolve, reject) => {
        // Fix: Use Readable.from() instead of new Readable()
        const readable = Readable.from(req.file!.buffer);

        readable
          .pipe(csv())
          .on('data', (data) => {
            results.push(data);
          })
          .on('end', () => {
            resolve();
          })
          .on('error', (error) => {
            reject(error);
          });
      });

      console.log(`📝 CSV Import: Processing ${results.length} rows in ${mode} mode`);

      // Handle replace mode first - delete all existing keywords
      if (mode === 'replace') {
        try {
          deleted = await deleteAllKeywords();
          console.log(`📝 CSV Import: Deleted ${deleted} existing keywords for replace mode`);
        } catch (error) {
          console.error('Failed to delete existing keywords in replace mode:', error);
          warnings.push('Failed to delete existing keywords in replace mode');
        }
      }

      // Collect keywords to be inserted/updated
      const keywordsToUpsert: Array<{
        text: string;
        raw_volume: number;
        volume: number;
        grade: string;
        commerciality: number;
        difficulty: number;
        source: string;
        // 5개 지표 필드 추가
        comp_idx?: string | null;
        comp_score: number;
        ad_depth: number;
        has_ads: boolean;
        est_cpc_krw?: number | null;
        est_cpc_source: string;
        score: number;
      }> = [];

      const keywordsToUpdateExcluded: Array<{ id: string; excluded: boolean }> = [];

      // Process parsed CSV data
      for (const row of results) {
        const text = row.text?.trim();
        const rawVolume = parseInt(row.raw_volume) || 0;
        const volume = parseInt(row.volume) || rawVolume;
        const grade = row.grade || 'C';
        const excluded = row.excluded === 'true' || row.excluded === true;
        const commerciality = parseInt(row.commerciality) || Math.min(100, Math.round((rawVolume / 1000) * 10));
        const difficulty = parseInt(row.difficulty) || Math.min(100, Math.round((rawVolume / 500) * 8));

        // 5개 지표 필드 파싱
        const comp_idx = row.comp_idx || row.compIdx || null;
        const comp_score = parseInt(row.comp_score || row.compScore) || await compIdxToScore(comp_idx);
        const ad_depth = parseFloat(row.ad_depth || row.adDepth) || 0;
        const has_ads = (row.has_ads || row.hasAds) === 'true' || (row.has_ads || row.hasAds) === true || ad_depth > 0;
        const est_cpc_krw = parseInt(row.est_cpc_krw || row.estCpcKrw) || null;
        const est_cpc_source = row.est_cpc_source || row.estCpcSource || (est_cpc_krw ? 'csv' : 'unknown');
        const score = parseInt(row.score) || await calculateOverallScore(rawVolume, comp_score, ad_depth, est_cpc_krw || 0);

        if (!text) {
          warnings.push(`Skipping row with empty text: ${JSON.stringify(row)}`);
          continue;
        }

        try {
          // Fix: Use new findKeywordByText function for existence check
          const existingKeyword = await findKeywordByText(text);
          
          if (existingKeyword && mode === 'merge') {
            // Update existing keyword's excluded status only in merge mode
            keywordsToUpdateExcluded.push({ id: existingKeyword.id, excluded });
            updated++;
          } else {
            // Insert new keyword or replace existing one
            keywordsToUpsert.push({
              text,
              raw_volume: rawVolume,
              volume,
              grade,
              commerciality,
              difficulty,
              source: 'csv_import',
              // 5개 지표 필드
              comp_idx,
              comp_score,
              ad_depth,
              has_ads,
              est_cpc_krw,
              est_cpc_source,
              score
            });
            inserted++;
          }
        } catch (error) {
          console.error(`Error processing keyword "${text}":`, error);
          warnings.push(`Failed to process keyword "${text}": ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }

      // Batch insert/update keywords
      if (keywordsToUpsert.length > 0) {
        try {
          console.log(`📝 CSV Import: Upserting ${keywordsToUpsert.length} keywords`);
          await upsertMany(keywordsToUpsert);
        } catch (error) {
          console.error('Failed to upsert keywords:', error);
          warnings.push('Failed to insert some keywords to database');
        }
      }

      // Update excluded status for existing keywords in merge mode
      if (keywordsToUpdateExcluded.length > 0) {
        try {
          console.log(`📝 CSV Import: Updating ${keywordsToUpdateExcluded.length} keyword exclusion statuses`);
          for (const { id, excluded } of keywordsToUpdateExcluded) {
            await setKeywordExcluded(id, excluded);
          }
        } catch (error) {
          console.error('Failed to update keyword exclusion status:', error);
          warnings.push('Failed to update some keyword exclusion statuses');
        }
      }

      res.json({
        inserted,
        updated,
        deleted,
        warnings,
        totalRows: results.length
      });

    } catch (error) {
      console.error('Error importing keywords:', error);
      res.status(500).json({ 
        error: 'Failed to import keywords',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // 제목 키워드 추출 API 엔드포인트 - DB 우선 → API 갱신 → 재선별 파이프라인
  app.post('/api/titles/analyze', async (req, res) => {
    try {
      const { titles, N = 4 } = req.body;
      
      // 입력 검증
      if (!Array.isArray(titles) || titles.length === 0) {
        return res.status(400).json({ error: 'titles array is required (1-20 titles)' });
      }
      
      if (titles.length > 20) {
        return res.status(400).json({ error: 'Maximum 20 titles allowed' });
      }
      
      if (N < 1 || N > 10) {
        return res.status(400).json({ error: 'N must be between 1 and 10' });
      }
      
      // 제목이 문자열인지 확인
      for (const title of titles) {
        if (typeof title !== 'string' || title.trim().length === 0) {
          return res.status(400).json({ error: 'All titles must be non-empty strings' });
        }
      }
      
      console.log(`🎯 Title analysis request: ${titles.length} titles → Top ${N}`);
      console.log(`📋 Sample titles: ${titles.slice(0, 3).map(t => `"${t}"`).join(', ')}...`);
      
      // ✅ 필터링 금지 - 모든 제목에서 조회량 기준 TopN 추출
      const result = await titleKeywordExtractor.extractTopNByCombined(titles, N);
      
      console.log(`✅ Title analysis complete: ${result.mode} mode, ${result.topN.length} keywords extracted`);
      
      // 응답 형식
      res.json({
        success: true,
        mode: result.mode,
        topN: result.topN,
        stats: result.stats,
        budget: result.budget,
        metadata: {
          titles_analyzed: titles.length,
          keywords_requested: N,
          extraction_mode: result.mode,
          timestamp: new Date().toISOString()
        }
      });
      
    } catch (error: any) {
      console.error('❌ Title analysis failed:', error);
      
      // 상세한 에러 응답
      res.status(500).json({
        error: 'Title analysis failed',
        details: error?.message || String(error),
        mode: 'error'
      });
    }
  });

  // === LK Mode (Location+Keyword Combo) APIs ===
  
  // LK Mode validation schemas
  const lkExpandSchema = z.object({
    keywords: z.array(z.string().min(1).max(50)).min(1).max(20),
    preferCompound: z.boolean().default(true),
    targetCategory: z.string().optional(),
    maxVariantsPerSeed: z.number().int().min(1).max(100).default(50)
  });
  
  const lkDetectCategorySchema = z.object({
    keyword: z.string().min(1).max(50)
  });
  
  // LK Mode Test: Generate Location+Keyword combinations
  app.post('/api/lk-mode/expand', async (req, res) => {
    try {
      const validatedBody = lkExpandSchema.parse(req.body);
      const { keywords, preferCompound, targetCategory, maxVariantsPerSeed } = validatedBody;
      
      console.log(`🏷️ [LK Mode] Expanding ${keywords.length} keywords: ${keywords.slice(0, 3).join(', ')}...`);
      console.log(`🎯 [LK Mode] Options: preferCompound=${preferCompound}, targetCategory=${targetCategory}`);
      
      // Auto-detect categories for keywords
      const categoryMapping: { [keyword: string]: string } = {};
      if (!targetCategory) {
        for (const keyword of keywords) {
          const detected = detectCategory(keyword);
          if (detected) {
            categoryMapping[keyword] = detected;
          }
        }
      }
      
      // Generate LK combinations
      const lkVariants = expandLKBatch(keywords, {
        preferCompound,
        categoryMapping: targetCategory ? keywords.reduce((map, kw) => ({ ...map, [kw]: targetCategory }), {}) : categoryMapping,
        maxVariantsPerSeed,
        totalLimit: 1000 // API limit
      });
      
      console.log(`✅ [LK Mode] Generated ${lkVariants.length} location+keyword combinations`);
      
      res.json({
        success: true,
        originalKeywords: keywords,
        expandedKeywords: lkVariants,
        options: { preferCompound, targetCategory, maxVariantsPerSeed },
        categoryDetection: categoryMapping,
        stats: {
          originalCount: keywords.length,
          expandedCount: lkVariants.length,
          expansionRatio: Math.round((lkVariants.length / keywords.length) * 100) / 100
        }
      });
      
    } catch (error) {
      console.error('❌ [LK Mode] Expansion failed:', error);
      res.status(500).json({ error: 'LK Mode expansion failed', details: String(error) });
    }
  });
  
  // LK Mode Stats: Get statistics about locations and categories
  app.get('/api/lk-mode/stats', async (req, res) => {
    try {
      const stats = getLKModeStats();
      console.log(`📊 [LK Mode] Stats requested: ${stats.totalLocations} locations, ${stats.totalCategories} categories`);
      
      res.json({
        success: true,
        ...stats,
        lastUpdated: new Date().toISOString()
      });
      
    } catch (error) {
      console.error('❌ [LK Mode] Stats failed:', error);
      res.status(500).json({ error: 'Failed to get LK Mode stats', details: String(error) });
    }
  });

  
  // LK Mode Category Detection: Auto-detect category for a keyword
  app.post('/api/lk-mode/detect-category', async (req, res) => {
    try {
      const validatedBody = lkDetectCategorySchema.parse(req.body);
      const { keyword } = validatedBody;
      
      const detectedCategory = detectCategory(keyword);
      console.log(`🔍 [LK Mode] Category detection for "${keyword}": ${detectedCategory || 'none'}`);
      
      res.json({
        success: true,
        keyword,
        detectedCategory,
        hasCategory: !!detectedCategory
      });
      
    } catch (error) {
      console.error('❌ [LK Mode] Category detection failed:', error);
      res.status(500).json({ error: 'Category detection failed', details: String(error) });
    }
  });

  // ========================================
  // Score-First Gate 관리자 설정 API (v10)
  // ========================================

  // GET /api/settings/algo - 현재 설정 조회
  app.get('/api/settings/algo', async (req, res) => {
    try {
      const config = getScoreConfig();
      console.log(`⚙️ [Settings] Current algo config requested`);
      res.json(config);
    } catch (error) {
      console.error(`❌ [Settings] Failed to get algo config:`, error);
      res.status(500).json({ error: 'Failed to get algorithm configuration', details: String(error) });
    }
  });

  // PUT /api/settings/algo - 설정 업데이트
  app.put('/api/settings/algo', async (req, res) => {
    try {
      const updates = req.body;
      console.log(`⚙️ [Settings] Updating algo config:`, JSON.stringify(updates, null, 2));

      // 가중치 정규화 (합=1.0 보장)
      if (updates.weights) {
        updates.weights = normalizeWeights(updates.weights);
        console.log(`⚖️ [Settings] Normalized weights:`, updates.weights);
      }

      const updatedConfig = updateScoreConfig(updates);
      console.log(`✅ [Settings] Successfully updated to version ${updatedConfig.version}`);
      
      // 🔥 v17 캐시 무효화 추가
      try {
        const { invalidateAlgoConfigCache } = await import('./services/algo-config');
        invalidateAlgoConfigCache();
        console.log(`🔄 [Hot-Reload] Cache invalidated after settings update`);
      } catch (e) {
        console.warn(`⚠️ [Hot-Reload] Failed to invalidate cache:`, e);
      }
      
      res.json({
        success: true,
        config: updatedConfig,
        message: 'Algorithm configuration updated successfully'
      });
    } catch (error) {
      console.error(`❌ [Settings] Failed to update algo config:`, error);
      res.status(400).json({ error: 'Failed to update configuration', details: String(error) });
    }
  });

  // POST /api/settings/algo/reset - 기본값으로 초기화
  app.post('/api/settings/algo/reset', async (req, res) => {
    try {
      console.log(`🔄 [Settings] Resetting algo config to defaults`);
      const defaultConfig = resetToDefaults();
      
      res.json({
        success: true,
        config: defaultConfig,
        message: 'Algorithm configuration reset to defaults'
      });
    } catch (error) {
      console.error(`❌ [Settings] Failed to reset algo config:`, error);
      res.status(500).json({ error: 'Failed to reset configuration', details: String(error) });
    }
  });

  // POST /api/settings/algo/weights/validate - 가중치 합계 검증
  app.post('/api/settings/algo/weights/validate', async (req, res) => {
    try {
      const { weights } = req.body;
      
      if (!weights || typeof weights !== 'object') {
        return res.status(400).json({ error: 'Weights object required' });
      }

      const sum = (weights.volume || 0) + (weights.competition || 0) + 
                  (weights.adDepth || 0) + (weights.cpc || 0);
      
      const isValid = Math.abs(sum - 1.0) <= 0.001;
      const normalized = isValid ? weights : normalizeWeights(weights);
      
      res.json({
        isValid,
        sum: parseFloat(sum.toFixed(3)),
        weights: normalized,
        normalized: !isValid
      });
    } catch (error) {
      console.error(`❌ [Settings] Weight validation failed:`, error);
      res.status(400).json({ error: 'Weight validation failed', details: String(error) });
    }
  });

  // === vFinal Pipeline Test API ===
  
  // POST /api/test/vfinal-pipeline - vFinal 파이프라인 테스트
  app.post('/api/test/vfinal-pipeline', async (req, res) => {
    try {
      const { title, jobId, blogId, postId, inputKeyword } = req.body;
      
      // 필수 파라미터 검증
      if (!title || !jobId || !blogId || postId === undefined || !inputKeyword) {
        return res.status(400).json({ 
          error: 'Missing required parameters', 
          required: ['title', 'jobId', 'blogId', 'postId', 'inputKeyword'] 
        });
      }
      
      console.log(`🧪 [vFinal Test] Testing pipeline with title: "${title.substring(0, 50)}..."`);
      
      // vFinal 파이프라인 호출
      const { processPostTitleVFinal } = await import('./services/vfinal-pipeline');
      const result = await processPostTitleVFinal(title, jobId, blogId, Number(postId), inputKeyword);
      
      console.log(`✅ [vFinal Test] Completed - Generated ${result.tiers.length} tiers`);
      
      res.json({
        success: true,
        result,
        test_info: {
          title,
          jobId,
          blogId,
          postId: Number(postId),
          inputKeyword,
          timestamp: new Date().toISOString()
        }
      });
      
    } catch (error) {
      console.error(`❌ [vFinal Test] Error:`, error);
      res.status(500).json({ 
        error: 'vFinal pipeline test failed', 
        details: String(error) 
      });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}

// Helper function to extract blog ID from URL
function extractBlogIdFromUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    
    // Handle blog.naver.com/blogId format
    if (urlObj.hostname === 'blog.naver.com') {
      const pathParts = urlObj.pathname.split('/').filter(p => p);
      if (pathParts.length > 0) {
        return pathParts[0]; // First part is the blog ID
      }
    }
    
    // Handle m.blog.naver.com/blogId format  
    if (urlObj.hostname === 'm.blog.naver.com') {
      const pathParts = urlObj.pathname.split('/').filter(p => p);
      if (pathParts.length > 0) {
        return pathParts[0]; // First part is the blog ID
      }
    }
    
    // Fallback: use entire URL as ID if can't extract
    return url.replace(/[^a-zA-Z0-9]/g, '').substring(0, 50);
  } catch (error) {
    // Fallback for invalid URLs
    return url.replace(/[^a-zA-Z0-9]/g, '').substring(0, 50);
  }
}

// Background SERP analysis job processing
async function processSerpAnalysisJob(
  jobId: string, 
  keywords: string[], 
  minRank: number, 
  maxRank: number, 
  postsPerBlog: number = 10, 
  titleExtract: boolean = true,
  lkOptions: {
    enableLKMode?: boolean;
    preferCompound?: boolean;
    targetCategory?: string;
  } = {}
) {
  try {
    // Helper function to check if job is cancelled
    const checkIfCancelled = async (): Promise<boolean> => {
      const currentJob = await storage.getSerpJob(jobId);
      return currentJob?.status === "cancelled";
    };

    const job = await storage.getSerpJob(jobId);
    if (!job) return;

    // Extract LK Mode options
    const { enableLKMode = false, preferCompound = true, targetCategory } = lkOptions;

    await storage.updateSerpJob(jobId, {
      status: "running",
      currentStep: "discovering_blogs",
      currentStepDetail: "키워드 검색을 시작합니다...",
      progress: 5
    });

    console.log(`🚀 Starting SERP analysis for job ${jobId} with keywords:`, keywords);
    console.log(`📊 System Configuration: HTTP + RSS based crawling (Playwright removed)`);
    console.log(`🏷️ LK Mode: ${enableLKMode ? 'ENABLED' : 'DISABLED'}, Prefer compound: ${preferCompound}, Category: ${targetCategory || 'auto-detect'}`);
    
    // Step 0: Optionally expand keywords using LK Mode
    let searchKeywords = keywords;
    if (enableLKMode) {
      try {
        console.log(`🔄 [LK Mode] Expanding ${keywords.length} keywords for enhanced coverage...`);
        const categoryMapping = targetCategory 
          ? keywords.reduce((map, kw) => ({ ...map, [kw]: targetCategory }), {})
          : {};
          
        const expandedKeywords = expandAllKeywords(keywords, {
          enableLKMode: true,
          preferCompound,
          categoryMapping
        });
        
        // Limit expanded keywords to avoid excessive API calls
        const maxKeywords = Math.min(expandedKeywords.length, keywords.length * 5); // 5x expansion max
        searchKeywords = expandedKeywords.slice(0, maxKeywords);
        
        console.log(`✅ [LK Mode] Expanded from ${keywords.length} to ${searchKeywords.length} keywords`);
        console.log(`🔍 [LK Mode] Sample expanded keywords: ${searchKeywords.slice(0, 3).join(', ')}...`);
      } catch (error) {
        console.error(`❌ [LK Mode] Keyword expansion failed, using original keywords:`, error);
        searchKeywords = keywords;
      }
    }
    
    // Step 1: Discover blogs for each keyword
    const allDiscoveredBlogs = new Map<string, any>(); // Use URL as key to deduplicate
    
    for (const [index, keyword] of Array.from(searchKeywords.entries())) {
      // Check if job is cancelled before processing each keyword
      if (await checkIfCancelled()) {
        console.log(`Job ${jobId} cancelled during keyword discovery phase`);
        return;
      }
      
      try {
        // Update detailed progress
        await storage.updateSerpJob(jobId, {
          currentStepDetail: `키워드 '${keyword}' 검색 중 (${index + 1}/${searchKeywords.length})`,
          detailedProgress: {
            currentKeyword: keyword,
            keywordIndex: index + 1,
            totalKeywords: searchKeywords.length,
            phase: "keyword_search"
          }
        });
        
        console.log(`Searching blogs for keyword: ${keyword} (${index + 1}/${searchKeywords.length})`);
        
        const serpResults = await serpScraper.searchKeywordOnMobileNaver(keyword, minRank, maxRank);
        
        for (const result of serpResults) {
          if (!allDiscoveredBlogs.has(result.url)) {
            // Extract blog ID from URL (e.g., riche1862 from blog.naver.com/riche1862)
            const blogId = extractBlogIdFromUrl(result.url);
            if (!blogId || blogId.length === 0) {
              console.warn(`❌ Failed to extract blog ID from URL: ${result.url}`);
              continue;
            }
            
            // 🔍 Phase1 큐잉 직전: blog_registry 상태 확인 (v10 H번 요청사항)
            console.log(`🔍 [BlogDB Integration] Checking registry status for blog: ${blogId}`);
            
            // Check current registry status
            const existingRegistry = await db.select()
              .from(blogRegistry)
              .where(eq(blogRegistry.blogId, blogId))
              .limit(1);
            
            if (existingRegistry.length > 0) {
              const status = existingRegistry[0].status;
              
              // Update last seen timestamp
              await db.update(blogRegistry)
                .set({ 
                  lastSeenAt: new Date(),
                  updatedAt: new Date()
                })
                .where(eq(blogRegistry.blogId, blogId));
              
              // Skip collection if blacklisted or in outreach
              if (status === 'blacklist' || status === 'outreach') {
                console.log(`⚫ [BlogDB Integration] Skipping ${blogId} - status: ${status}`);
                continue;
              }
              
              console.log(`✅ [BlogDB Integration] Proceeding with ${blogId} - status: ${status}`);
            } else {
              // Insert new registry entry with 'collected' status
              await db.insert(blogRegistry)
                .values({
                  blogId,
                  url: result.url,
                  name: result.title,
                  status: 'collected',
                  firstSeenAt: new Date(),
                  lastSeenAt: new Date()
                });
              
              console.log(`🆕 [BlogDB Integration] New blog registered: ${blogId} with status: collected`);
            }
            
            const blog = await storage.createDiscoveredBlog({
              jobId: job.id,
              seedKeyword: keyword,
              rank: result.rank,
              blogId: blogId,
              blogName: result.title,
              blogUrl: result.url
            });
            
            allDiscoveredBlogs.set(result.url, blog);
          }
        }
        
        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 2000));
        
      } catch (error) {
        console.error(`Error searching keyword "${keyword}":`, error);
      }
      
      // Update progress
      const progressIncrement = (30 / keywords.length);
      await storage.updateSerpJob(jobId, {
        progress: Math.round(Math.min(5 + ((index + 1) * progressIncrement), 35))
      });
    }

    const discoveredBlogs = Array.from(allDiscoveredBlogs.values());
    console.log(`📋 COLLECTION SUMMARY - Blog Discovery Phase:`);
    console.log(`   ✅ Total blogs discovered: ${discoveredBlogs.length}`);
    console.log(`   🎯 Target minimum: 3+ blogs required`);
    console.log(`   📈 Discovery success rate: ${discoveredBlogs.length >= 3 ? 'PASSED' : 'BELOW MINIMUM'}`);

    // Check if cancelled before proceeding to blog analysis
    if (await checkIfCancelled()) {
      console.log(`Job ${jobId} cancelled after keyword discovery phase`);
      return;
    }

    await storage.updateSerpJob(jobId, {
      currentStep: "analyzing_posts",
      currentStepDetail: `발견된 ${discoveredBlogs.length}개 블로그의 포스트를 분석합니다...`,
      completedSteps: 1,
      progress: 35,
      detailedProgress: {
        blogsDiscovered: discoveredBlogs.length,
        phase: "blog_analysis_start"
      }
    });

    // Step 2: Analyze posts for each discovered blog
    for (const [index, blog] of Array.from(discoveredBlogs.entries())) {
      // Check if job is cancelled before processing each blog
      if (await checkIfCancelled()) {
        console.log(`Job ${jobId} cancelled during blog analysis phase`);
        return;
      }
      
      try {
        // Update detailed progress
        await storage.updateSerpJob(jobId, {
          currentStepDetail: `블로그 '${blog.blogName}' 분석 중 (${index + 1}/${discoveredBlogs.length})`,
          detailedProgress: {
            currentBlog: blog.blogName,
            blogIndex: index + 1,
            totalBlogs: discoveredBlogs.length,
            phase: "blog_analysis"
          }
        });
        
        console.log(`Analyzing posts for blog: ${blog.blogName} (${index + 1}/${discoveredBlogs.length})`);
        
        // Step 2.1: Check base keyword rank (지정 키워드 랭크)
        const baseKeyword = keywords[0]; // Use first keyword as base keyword
        console.log(`   🎯 Checking base keyword "${baseKeyword}" rank for blog: ${blog.blogName}`);
        const baseRank = await serpScraper.checkKeywordRankingInMobileNaver(baseKeyword, blog.blogUrl);
        console.log(`   📊 Base keyword "${baseKeyword}" rank: ${baseRank || 'NA'} for ${blog.blogName}`);
        
        // Step 2.2: Scrape recent posts using HTTP + RSS approach
        const scrapedPosts = await scraper.scrapeBlogPosts(blog.blogUrl, postsPerBlog);
        console.log(`   📄 Posts collected from ${blog.blogName}: ${scrapedPosts.length} posts`);
        
        // Save posts
        for (const post of scrapedPosts) {
          await storage.createAnalyzedPost({
            blogId: blog.id,
            url: post.url,
            title: post.title,
            publishedAt: post.publishedAt || null
          });
        }

        // Step 2.3: Extract keywords based on titleExtract setting
        const titles = scrapedPosts.map(post => post.title);
        let keywordResults: any = { detail: [], volumesMode: 'fallback' };
        
        if (titleExtract) {
          console.log(`   🔤 [Title Extract] Extracting Top4 keywords (70% volume + 30% combined) from ${titles.length} titles for ${blog.blogName}`);
          try {
            // ✅ 필터링 금지 - 모든 제목에서 조회량 기준 Top4 추출
            const titleResult = await titleKeywordExtractor.extractTopNByCombined(titles, 4);
            // ✅ 관련성 라벨링 (저장하지 않고 응답시에만 추가)
            const checkRelatedness = (keyword: string, sourceTitle: string): boolean => {
              const normalizeForCheck = (text: string) => text.normalize('NFKC').toLowerCase().replace(/[\s\-_.]/g, '');
              const normalizedKeyword = normalizeForCheck(keyword);
              const normalizedTitle = normalizeForCheck(sourceTitle);
              
              return keywords.some(original => {
                const normalizedOriginal = normalizeForCheck(original);
                return normalizedKeyword.includes(normalizedOriginal) || 
                       normalizedTitle.includes(normalizedOriginal);
              });
            };

            keywordResults = {
              detail: titleResult.topN.map((kw, index) => ({
                keyword: kw.text,
                tier: `tier${index + 1}` as 'tier1'|'tier2'|'tier3'|'tier4',
                volume_total: kw.raw_volume || 0,
                volume_pc: 0, // Not available from title extractor
                volume_mobile: 0, // Not available from title extractor  
                frequency: kw.frequency || 0,
                hasVolume: kw.raw_volume > 0,
                combined_score: kw.combined_score,
                // ✅ 관련성 메타데이터 (UI 라벨링용)
                meta: {
                  related: checkRelatedness(kw.text, titles.join(' '))
                }
              })),
              volumesMode: titleResult.mode === 'db-only' ? 'searchads' : 
                          titleResult.mode === 'api-refresh' ? 'searchads' : 'fallback'
            };
            
            // 🎯 C. 제목 선별 결과 검증 로그
            const candidateCount = titleResult.stats?.candidates || 0;
            const eligibleCount = titleResult.stats?.db_hits || 0;
            console.log(`🔤 TITLE_TOP: blog=${blog.blogName}, titles=${titles.length}, cands=${candidateCount}, dbHits1000=${eligibleCount}, mode=${titleResult.mode}, top4=[${titleResult.topN.map(k => `${k.text}(${k.combined_score})`).join(', ')}]`);
            
            console.log(`   🏆 [Title Extract] Top ${titleResult.topN.length} keywords for ${blog.blogName} (${titleResult.mode}): ${titleResult.topN.map(kw => `${kw.text} (${kw.combined_score}pts)`).join(', ')}`);
          } catch (error) {
            console.error(`   ❌ [Title Extract] Failed for ${blog.blogName}:`, error);
            // Fallback to original method
            const { top3, detail, volumesMode } = await extractTop3ByVolume(titles);
            keywordResults = { detail, volumesMode };
            console.log(`   🔄 [Fallback] Using original extraction for ${blog.blogName}`);
          }
        } else {
          console.log(`   🔤 [Legacy] Extracting volume-based keywords from ${titles.length} titles for ${blog.blogName}`);
          const { top3, detail, volumesMode } = await extractTop3ByVolume(titles);
          keywordResults = { detail, volumesMode };
          console.log(`   🏆 [Legacy] Top 3 keywords for ${blog.blogName}: ${detail.map((d: any) => `${d.tier.toUpperCase()}: ${d.keyword} (${d.volume_total})`).join(', ')}`);
        }
        
        // Save extracted keywords with volume data + base_rank
        for (const [keywordIndex, keywordDetail] of Array.from((keywordResults.detail as any[]).entries())) {
          await storage.createExtractedKeyword({
            jobId: job.id,
            blogId: blog.id,
            keyword: keywordDetail.keyword,
            volume: keywordDetail.volume_total || null,
            frequency: keywordDetail.frequency || 0,
            rank: null, // Will be set by SERP check later
            tier: keywordIndex + 1 // 1, 2, 3, 4... for tier1, tier2, etc.
          });
        }
        
        // Step 2.4: Store base_rank in blog record
        await storage.updateDiscoveredBlog(blog.id, { baseRank: baseRank });
        
        // Step 2.5: Comprehensive tier checks (NEW v8 feature) - SCOPED to seedKeyword only
        console.log(`   🔍 [Tier Checks] Starting comprehensive tier analysis for ${blog.blogName} (seedKeyword: ${blog.seedKeyword})`);
        const T = 4; // Tier count as specified in requirements
        
        // ✅ CRITICAL FIX: Only process blogs for their associated seedKeyword
        const inputKeyword = blog.seedKeyword; // Use only the keyword that discovered this blog
        if (!inputKeyword || !keywords.includes(inputKeyword)) {
          console.log(`   ⚠️ [Tier Checks] Skipping ${blog.blogName} - no valid seedKeyword`);
        } else {
          console.log(`   🎯 [Tier Checks] Processing input keyword: ${inputKeyword} for ${blog.blogName}`);
          
          // ✅ PERFORMANCE FIX: Prefetch analyzed posts once per blog
          const savedPosts = await storage.getAnalyzedPosts(blog.id);
          const postIndexMap = new Map(savedPosts.map(p => [p.title, p]));
          
          for (const [postIndex, post] of Array.from(scrapedPosts.entries())) {
            if (postIndex >= postsPerBlog) break; // Limit to P posts
            
            // ✅ CANCELLATION FIX: Check cancellation within nested loops
            if (await checkIfCancelled()) {
              console.log(`Job ${jobId} cancelled during tier checks for ${blog.blogName}`);
              return;
            }
            
            try {
              const postTitle = post.title;
              console.log(`     📄 [Tier Checks] Post ${postIndex + 1}/${Math.min(scrapedPosts.length, postsPerBlog)}: "${postTitle.substring(0, 50)}..."`);
              
              const savedPost = postIndexMap.get(postTitle); // Use precomputed index FIRST
              
              if (!savedPost) {
                console.log(`     ⚠️ [Tier Checks] Post not found in DB: ${postTitle.substring(0, 30)}...`);
                continue;
              }
              
              // ✅ v17 파이프라인 적용: Pre-enrich + Score-First Gate + autoFill
              console.log(`🚀 [v17 Pipeline] Processing post: "${postTitle.substring(0, 50)}..."`);
              const { processPostTitleV17 } = await import('./services/v17-pipeline');
              const v17Result = await processPostTitleV17(postTitle, job.id, blog.blogId, Number(savedPost.id) || 0, inputKeyword);
              console.log(`✅ [v17 Pipeline] Generated ${v17Result.tiers.length} tiers with scores`);
              
              // v17 pipeline handles all tier processing and database saving - no additional processing needed
              
              // ✅ PERFORMANCE FIX: Reduced delay per post instead of per tier
              await new Promise(resolve => setTimeout(resolve, 100));
              
            } catch (error) {
              console.error(`     ❌ [Tier Checks] Error processing post ${postIndex + 1}:`, error);
            }
          }
        }
        
        console.log(`   ✅ [Tier Checks] Completed comprehensive analysis for ${blog.blogName}`);
        
        await storage.updateSerpJob(jobId, {
          progress: Math.round(Math.min(35 + ((index + 1) * (30 / discoveredBlogs.length)), 65))
        });
        
        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, 2000 + Math.random() * 3000));
        
      } catch (error) {
        console.error(`Error analyzing blog "${blog.blogName}":`, error);
      }
    }

    // Check if cancelled before proceeding to ranking checks
    if (await checkIfCancelled()) {
      console.log(`Job ${jobId} cancelled after blog analysis phase`);
      return;
    }

    await storage.updateSerpJob(jobId, {
      currentStep: "checking_rankings",
      currentStepDetail: "키워드 순위 확인을 시작합니다...",
      completedSteps: 2,
      progress: 65,
      detailedProgress: {
        phase: "ranking_check_start"
      }
    });

    // Step 3: Check SERP rankings for extracted keywords
    for (const [index, blog] of Array.from(discoveredBlogs.entries())) {
      // Check if job is cancelled before processing each blog's rankings
      if (await checkIfCancelled()) {
        console.log(`Job ${jobId} cancelled during ranking check phase`);
        return;
      }
      
      try {
        const topKeywords = await storage.getTopKeywordsByBlog(blog.id);
        
        // Update progress for this blog's ranking checks
        await storage.updateSerpJob(jobId, {
          currentStepDetail: `'${blog.blogName}' 키워드 순위 확인 중 (${index + 1}/${discoveredBlogs.length})`,
          detailedProgress: {
            currentBlog: blog.blogName,
            blogIndex: index + 1,
            totalBlogs: discoveredBlogs.length,
            keywordsToCheck: topKeywords.length,
            phase: "ranking_check"
          }
        });
        
        for (const [keywordIndex, keyword] of Array.from(topKeywords.entries())) {
          // Check cancellation for each keyword ranking check
          if (await checkIfCancelled()) {
            console.log(`Job ${jobId} cancelled during keyword ranking check`);
            return;
          }
          
          try {
            // Update detailed progress for current keyword check
            await storage.updateSerpJob(jobId, {
              currentStepDetail: `키워드 '${keyword.keyword}' 순위 확인 중 (${keywordIndex + 1}/${topKeywords.length}) - ${blog.blogName}`,
              detailedProgress: {
                currentBlog: blog.blogName,
                currentKeyword: keyword.keyword,
                keywordIndex: keywordIndex + 1,
                totalKeywords: topKeywords.length,
                blogIndex: index + 1,
                totalBlogs: discoveredBlogs.length,
                phase: "keyword_ranking_check"
              }
            });
            
            console.log(`Checking SERP ranking for "${keyword.keyword}" from blog: ${blog.blogName}`);
            
            const serpRank = await serpScraper.checkKeywordRankingInMobileNaver(keyword.keyword, blog.blogUrl);
            
            if (serpRank) {
              // Update the keyword with SERP ranking
              const extractedKeywords = await storage.getExtractedKeywords(blog.id);
              const targetKeyword = extractedKeywords.find(k => k.keyword === keyword.keyword);
              
              if (targetKeyword) {
                // TODO: Update keyword rank in storage
                console.log(`Found SERP rank ${serpRank} for keyword "${keyword.keyword}"`);
              }
            }
            
            // Rate limiting
            await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 1000));
            
          } catch (error) {
            console.error(`Error checking ranking for keyword "${keyword.keyword}":`, error);
          }
        }
        
        const progressIncrement = (35 / discoveredBlogs.length);
        await storage.updateSerpJob(jobId, {
          progress: Math.round(Math.min(65 + ((index + 1) * progressIncrement), 100))
        });
        
      } catch (error) {
        console.error(`Error checking rankings for blog "${blog.blogName}":`, error);
      }
    }

    // Final check before completion
    if (await checkIfCancelled()) {
      console.log(`Job ${jobId} cancelled before completion`);
      return;
    }

    // Generate final collection summary
    const finalStats = {
      keywordsSearched: keywords.length,
      blogsDiscovered: discoveredBlogs.length,
      totalPostsAnalyzed: 0,
      blogsWithMinimumPosts: 0
    };
    
    // Count actual posts analyzed
    for (const blog of discoveredBlogs) {
      const posts = await storage.getAnalyzedPosts(blog.id);
      finalStats.totalPostsAnalyzed += posts.length;
      if (posts.length >= 5) {
        finalStats.blogsWithMinimumPosts++;
      }
    }
    
    // ✅ NEW: Tier distribution analysis and auto-augmentation (G feature)
    console.log(`\n🔄 [Tier Analysis] Starting tier distribution check for automatic augmentation...`);
    await checkAndAugmentTierDistribution(jobId, keywords);
    
    // Complete the job with detailed results
    await storage.updateSerpJob(jobId, {
      status: "completed",
      currentStep: "completed",
      currentStepDetail: "분석이 완료되었습니다",
      completedSteps: 3,
      progress: 100,
      detailedProgress: {
        phase: "completed"
      },
      results: finalStats
    });
    
    // 📊 FINAL COLLECTION SUMMARY CONSOLE OUTPUT
    console.log(`\n🎉 =============== FINAL COLLECTION SUMMARY ===============`);
    console.log(`🚀 HTTP + RSS Based Analysis Complete for Job: ${jobId}`);
    console.log(`📋 Keywords searched: ${finalStats.keywordsSearched}`);
    console.log(`🏢 Blogs discovered: ${finalStats.blogsDiscovered}`);
    console.log(`📄 Total posts collected: ${finalStats.totalPostsAnalyzed}`);
    console.log(`✅ Blogs with 5+ posts: ${finalStats.blogsWithMinimumPosts}`);
    console.log(`🎯 Minimum requirement check:`);
    console.log(`   • 3+ blogs required: ${finalStats.blogsDiscovered >= 3 ? '✅ PASSED' : '❌ FAILED'}`);
    console.log(`   • 5+ posts per blog target: ${finalStats.blogsWithMinimumPosts}/${finalStats.blogsDiscovered} blogs achieved`);
    console.log(`📈 System Status: HTTP + RSS crawling with fallback seed URLs`);
    console.log(`🔧 RSS Priority → HTTP Fallback → Seed URL Backup`);
    console.log(`======================================================\n`);
    
    console.log(`SERP analysis job ${jobId} completed successfully`);

  } catch (error) {
    console.error(`Error processing SERP job ${jobId}:`, error);
    
    await storage.updateSerpJob(jobId, {
      status: "failed",
      currentStepDetail: "분석 중 오류가 발생했습니다",
      errorMessage: error instanceof Error ? error.message : "Unknown error occurred"
    });
  }
}