import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { scraper } from "./services/scraper";
import { nlpService } from "./services/nlp";
import { extractTop3ByVolume } from "./services/keywords";
import { serpScraper } from "./services/serp-scraper";
import { z } from "zod";
// Health Gate + Keywords Management imports
import { checkOpenAPI, checkSearchAds, checkKeywordsDB, checkAllServices, getHealthWithPrompt } from './services/health';
import { upsertKeywordsFromSearchAds, listKeywords, setKeywordExcluded, listExcluded, getKeywordVolumeMap, findKeywordByText, deleteAllKeywords, upsertMany } from './store/keywords';
import { metaSet, metaGet } from './store/meta';
import { db } from './db';
import type { HealthResponse } from './types';
import multer from 'multer';
import csv from 'csv-parser';
import { Readable } from 'stream';

export async function registerRoutes(app: Express): Promise<Server> {
  
  // Configure multer for CSV file uploads
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: 10 * 1024 * 1024, // 10MB limit
    },
    fileFilter: (req, file, cb) => {
      // Accept CSV files only
      if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
        cb(null, true);
      } else {
        cb(new Error('Only CSV files are allowed'));
      }
    },
  });
  
  // Start SERP analysis with keywords
  app.post("/api/serp/analyze", async (req, res) => {
    try {
      const { keywords, minRank = 2, maxRank = 15, postsPerBlog = 10 } = req.body;
      
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

      // Start analysis in background
      processSerpAnalysisJob(job.id, keywords, minRank, maxRank, postsPerBlog);

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

  // Get SERP job results in new API contract format
  app.get("/api/serp/jobs/:jobId/results", async (req, res) => {
    try {
      const job = await storage.getSerpJob(req.params.jobId);
      if (!job) {
        return res.status(404).json({ error: "Job not found" });
      }

      if (job.status !== "completed") {
        return res.status(400).json({ error: "Job not completed yet" });
      }

      // If job has results JSON data, return it directly
      if (job.results) {
        console.log(`📊 Returning cached results for job ${req.params.jobId}`);
        return res.json(job.results);
      }

      // Get all discovered blogs
      const allBlogs = await storage.getDiscoveredBlogs(job.id);
      const allPosts = [];
      const allKeywords = [];
      
      // Filter blogs with TOP3 keywords that have SERP rank 1-10
      const hitBlogs = [];
      
      // Collect all unique keywords for raw_volume lookup
      const allKeywordTexts = new Set<string>();
      for (const blog of allBlogs) {
        const top3Keywords = await storage.getTopKeywordsByBlog(blog.id);
        top3Keywords.forEach(kw => allKeywordTexts.add(kw.keyword));
      }
      
      // Get raw_volume mapping from keywords DB
      const keywordVolumeMap = await getKeywordVolumeMap(Array.from(allKeywordTexts));
      
      for (const blog of allBlogs) {
        const posts = await storage.getAnalyzedPosts(blog.id);
        const top3Keywords = await storage.getTopKeywordsByBlog(blog.id); // Get TOP3
        
        // Check if base keyword rank is 1-10 (지정 키워드 기준)
        const hasHit = blog.baseRank && blog.baseRank >= 1 && blog.baseRank <= 10;
        
        if (hasHit) {
          hitBlogs.push({
            blog_id: blog.blogId,
            blog_name: blog.blogName, // Added for UI display
            blog_url: blog.blogUrl,
            base_rank: blog.baseRank, // Added for rank badge
            gathered_posts: posts.length
          });
          
          // Add keywords for this blog with raw_volume
          allKeywords.push({
            blog_id: blog.blogId,
            top3: top3Keywords.map(kw => ({
              text: kw.keyword,
              volume: kw.volume || 0, // For ranking weight
              raw_volume: keywordVolumeMap[kw.keyword] || 0, // For display
              rank: kw.rank || 0
            }))
          });
        }
        
        // Add all posts
        allPosts.push(...posts.map(post => ({
          blog_id: blog.blogId,
          post_url: post.url,
          post_title: post.title,
          published_at: post.publishedAt?.toISOString() || null
        })));
      }

      // Calculate counters
      const uniqueKeywords = new Set();
      allKeywords.forEach(blogKw => {
        blogKw.top3.forEach(kw => uniqueKeywords.add(kw.text));
      });

      // Calculate searched_keywords from ALL blogs (not just hit blogs)
      const allUniqueKeywords = new Set();
      for (const blog of allBlogs) {
        const top3Keywords = await storage.getTopKeywordsByBlog(blog.id);
        top3Keywords.forEach(kw => allUniqueKeywords.add(kw.keyword));
      }

      // Get volumes_mode from first blog's analysis (or default to 'fallback')
      let volumesMode = 'fallback';
      if (allBlogs.length > 0) {
        try {
          console.log(`🔍 Determining volumes mode from first blog analysis...`);
          const firstBlogPosts = await storage.getAnalyzedPosts(allBlogs[0].id);
          const titles = firstBlogPosts.map(p => p.title);
          const { volumesMode: firstBlogVolumesMode } = await extractTop3ByVolume(titles);
          console.log(`📊 Volumes mode determined: ${firstBlogVolumesMode}`);
          volumesMode = firstBlogVolumesMode;
        } catch (e) {
          console.log('⚠️ Could not determine volumes mode, defaulting to fallback');
        }
      }
      
      console.log(`📈 Final volumes_mode for response: ${volumesMode}`);

      const response = {
        blogs: hitBlogs,
        keywords: allKeywords, 
        posts: allPosts,
        counters: {
          discovered_blogs: allBlogs.length, // Total blogs found during discovery
          blogs: allBlogs.length, // Existing field (total blogs analyzed)
          posts: allPosts.length,
          selected_keywords: allBlogs.length * 3, // 블로그×3 (요청)
          searched_keywords: allUniqueKeywords.size, // 모든 블로그의 TOP3 키워드 중복 제거 후 실제 질의
          hit_blogs: hitBlogs.length, // base_rank 1-10 기준으로 변경됨
          volumes_mode: volumesMode
        },
        warnings: [],
        errors: []
      };

      res.json(response);
    } catch (error) {
      console.error('Error fetching SERP results:', error);
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
        top3Keywords.forEach(kw => allKeywordTexts.add(kw.keyword));
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
          const raw_volume = keywordVolumeMap[keyword.keyword] || 0;
          const rank = keyword.rank || 0;
          
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
  // UNIFIED HEALTH GATE + KEYWORDS MANAGEMENT
  // ===========================================

  // Enhanced health check endpoint with prompt logic
  app.get('/api/health', async (req, res) => {
    try {
      const healthData = await getHealthWithPrompt(db);
      res.status(200).json(healthData);
    } catch (error) {
      console.error('🏥 Health check failed:', error);
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

  // Enhanced SERP search with strict mode
  app.post('/api/serp/search', async (req, res) => {
    try {
      const { strict = true } = req.body || {};
      console.log(`🔒 SERP search request - Strict mode: ${strict}`);
      
      // Run health checks first
      const openapi = await checkOpenAPI();
      const searchads = await checkSearchAds();
      const keywordsdb = await checkKeywordsDB();
      const health: HealthResponse = { openapi, searchads, keywordsdb };

      // ▶️ Strict mode validation: All services must be operational
      if (strict && (!openapi.ok || searchads.mode === 'fallback' || !keywordsdb.ok)) {
        console.log(`🔒 Strict mode BLOCKED - OpenAPI: ${openapi.ok}, SearchAds: ${searchads.mode}, KeywordsDB: ${keywordsdb.ok}`);
        return res.status(412).json({ 
          error: 'PRECONDITION_FAILED', 
          health, 
          hint: '엄격 모드: 세 서비스 모두 정상이어야 시작합니다.' 
        });
      }

      // If validation passes, delegate to existing analyze endpoint logic
      const { keywords, minRank = 2, maxRank = 15, postsPerBlog = 10 } = req.body;
      
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

      // Start analysis in background (reuse existing function)
      processSerpAnalysisJob(job.id, keywords, minRank, maxRank, postsPerBlog);

      console.log(`🔒 SERP analysis started with job ID: ${job.id}`);
      return res.status(202).json({ jobId: job.id, health });
      
    } catch (error) {
      console.error('🔒 SERP search failed:', error);
      res.status(500).json({ error: 'SERP search failed', details: String(error) });
    }
  });

  // Keywords refresh endpoint
  app.post('/api/keywords/refresh', async (req, res) => {
    try {
      const { base, limit = 300, strict = true } = req.body || {};
      console.log(`📝 Keywords refresh - Base: "${base}", Limit: ${limit}, Strict: ${strict}`);
      
      if (!base || typeof base !== 'string') {
        return res.status(400).json({ error: 'Base keyword is required' });
      }

      // Health check for strict mode
      const openapi = await checkOpenAPI();
      const searchads = await checkSearchAds();
      const keywordsdb = await checkKeywordsDB();
      
      if (strict && (!openapi.ok || searchads.mode === 'fallback' || !keywordsdb.ok)) {
        console.log(`📝 Keywords refresh BLOCKED by strict mode`);
        return res.status(412).json({ 
          error: 'PRECONDITION_FAILED', 
          health: { openapi, searchads, keywordsdb } 
        });
      }

      const result = await upsertKeywordsFromSearchAds(base, limit);
      console.log(`📝 Keywords refresh complete - Mode: ${result.mode}, Inserted: ${result.count}`);
      
      res.json({ 
        ok: true, 
        volumes_mode: result.mode, 
        stats: result.stats, 
        inserted: result.count 
      });
    } catch (error) {
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

  // Keywords DB Management APIs
  app.get("/api/keywords/stats", async (req, res) => {
    try {
      const includedKeywords = await listKeywords({ excluded: false, orderBy: 'raw_volume', dir: 'desc' });
      const excludedKeywords = await listKeywords({ excluded: true, orderBy: 'raw_volume', dir: 'desc' });
      const total = includedKeywords.length + excludedKeywords.length;
      
      // Get last updated timestamp
      const allKeywords = [...includedKeywords, ...excludedKeywords];
      const lastUpdated = allKeywords.length > 0 
        ? Math.max(...allKeywords.map(k => k.updated_at ? new Date(k.updated_at).getTime() : 0))
        : Date.now();
      
      // Get volumes_mode from health or meta
      const healthResponse = await getHealthWithPrompt(db);
      const volumes_mode = healthResponse.searchads?.mode || 'fallback';
      
      res.json({
        total,
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
      
      // Create CSV content
      const header = 'text,raw_volume,volume,grade,excluded,updated_at\n';
      const rows = keywords.map(k => {
        const excluded = k.excluded ? 'true' : 'false';
        const updatedAt = k.updated_at ? new Date(k.updated_at).toISOString() : '';
        return `"${k.text}",${k.raw_volume},${k.volume},"${k.grade}",${excluded},"${updatedAt}"`;
      }).join('\n');
      
      const csvContent = header + rows;
      
      // Set headers for file download
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="keywords-export.csv"');
      
      res.send(csvContent);
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
              source: 'csv_import'
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
async function processSerpAnalysisJob(jobId: string, keywords: string[], minRank: number, maxRank: number, postsPerBlog: number = 10) {
  try {
    // Helper function to check if job is cancelled
    const checkIfCancelled = async (): Promise<boolean> => {
      const currentJob = await storage.getSerpJob(jobId);
      return currentJob?.status === "cancelled";
    };

    const job = await storage.getSerpJob(jobId);
    if (!job) return;

    await storage.updateSerpJob(jobId, {
      status: "running",
      currentStep: "discovering_blogs",
      currentStepDetail: "키워드 검색을 시작합니다...",
      progress: 5
    });

    console.log(`🚀 Starting SERP analysis for job ${jobId} with keywords:`, keywords);
    console.log(`📊 System Configuration: HTTP + RSS based crawling (Playwright removed)`);
    
    // Step 1: Discover blogs for each keyword
    const allDiscoveredBlogs = new Map<string, any>(); // Use URL as key to deduplicate
    
    for (const [index, keyword] of Array.from(keywords.entries())) {
      // Check if job is cancelled before processing each keyword
      if (await checkIfCancelled()) {
        console.log(`Job ${jobId} cancelled during keyword discovery phase`);
        return;
      }
      
      try {
        // Update detailed progress
        await storage.updateSerpJob(jobId, {
          currentStepDetail: `키워드 '${keyword}' 검색 중 (${index + 1}/${keywords.length})`,
          detailedProgress: {
            currentKeyword: keyword,
            keywordIndex: index + 1,
            totalKeywords: keywords.length,
            phase: "keyword_search"
          }
        });
        
        console.log(`Searching blogs for keyword: ${keyword} (${index + 1}/${keywords.length})`);
        
        const serpResults = await serpScraper.searchKeywordOnMobileNaver(keyword, minRank, maxRank);
        
        for (const result of serpResults) {
          if (!allDiscoveredBlogs.has(result.url)) {
            // Extract blog ID from URL (e.g., riche1862 from blog.naver.com/riche1862)
            const blogId = extractBlogIdFromUrl(result.url);
            
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
        progress: Math.min(5 + ((index + 1) * progressIncrement), 35)
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

        // Step 2.3: Extract top 3 keywords by search volume (with frequency fallback)
        const titles = scrapedPosts.map(post => post.title);
        console.log(`   🔤 Extracting volume-based keywords from ${titles.length} titles for ${blog.blogName}`);
        const { top3, detail, volumesMode } = await extractTop3ByVolume(titles);
        
        console.log(`   🏆 Top 3 keywords for ${blog.blogName}: ${detail.map((d: any) => `${d.tier.toUpperCase()}: ${d.keyword} (${d.volume_total})`).join(', ')}`);
        
        // Save top keywords with volume data + base_rank
        for (const [keywordIndex, keywordDetail] of Array.from((detail as any[]).entries())) {
          await storage.createExtractedKeyword({
            jobId: job.id,
            blogId: blog.id,
            keyword: keywordDetail.keyword,
            volume: keywordDetail.volume_total || null,
            frequency: keywordDetail.frequency || 0,
            rank: null, // Will be set by SERP check later for TOP3 keywords
            tier: keywordIndex + 1 // 1, 2, 3 for tier1, tier2, tier3
          });
        }
        
        // Step 2.4: Store base_rank in blog record
        await storage.updateDiscoveredBlog(blog.id, { baseRank: baseRank });
        
        await storage.updateSerpJob(jobId, {
          progress: Math.min(35 + ((index + 1) * (30 / discoveredBlogs.length)), 65)
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
          progress: Math.min(65 + ((index + 1) * progressIncrement), 100)
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