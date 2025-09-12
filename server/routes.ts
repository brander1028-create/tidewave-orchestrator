import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { scraper } from "./services/scraper";
import { nlpService } from "./services/nlp";
import { serpScraper } from "./services/serp-scraper.js";
import { insertSerpJobSchema } from "@shared/schema";
import { z } from "zod";

export async function registerRoutes(app: Express): Promise<Server> {
  
  // Start SERP analysis with keywords
  app.post("/api/serp/analyze", async (req, res) => {
    try {
      const { keywords, minRank = 2, maxRank = 15 } = req.body;
      
      if (!keywords || !Array.isArray(keywords) || keywords.length === 0) {
        return res.status(400).json({ error: "Keywords array is required (1-20 keywords)" });
      }

      if (keywords.length > 20) {
        return res.status(400).json({ error: "Maximum 20 keywords allowed" });
      }

      if (minRank < 2 || maxRank > 15 || minRank > maxRank) {
        return res.status(400).json({ error: "Invalid rank range. Min: 2, Max: 15" });
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
      processSerpAnalysisJob(job.id, keywords, minRank, maxRank);

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

  // Get SERP job results with discovered blogs and keywords
  app.get("/api/serp/jobs/:jobId/results", async (req, res) => {
    try {
      const job = await storage.getSerpJob(req.params.jobId);
      if (!job) {
        return res.status(404).json({ error: "Job not found" });
      }

      const discoveredBlogs = await storage.getDiscoveredBlogs(job.id);
      const results = [];

      for (const blog of discoveredBlogs) {
        const posts = await storage.getAnalyzedPosts(blog.id);
        const topKeywords = await storage.getTopKeywordsByBlog(blog.id);
        
        results.push({
          blog,
          posts,
          topKeywords
        });
      }

      res.json({
        job,
        results
      });
    } catch (error) {
      console.error('Error fetching SERP results:', error);
      res.status(500).json({ error: "Failed to fetch results" });
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
            csv += `${sanitizeCsvField(blog.blogName)},${sanitizeCsvField(blog.blogUrl)},${sanitizeCsvField(blog.seedKeyword)},${sanitizeCsvField(blog.rank)},${sanitizeCsvField(keyword.keyword)},${sanitizeCsvField(keyword.searchVolume || '')},${sanitizeCsvField(keyword.serpRank || '')}\n`;
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

  const httpServer = createServer(app);
  return httpServer;
}

// Background SERP analysis job processing
async function processSerpAnalysisJob(jobId: string, keywords: string[], minRank: number, maxRank: number) {
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

    console.log(`Starting SERP analysis for job ${jobId} with keywords:`, keywords);
    
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
            const blog = await storage.createDiscoveredBlog({
              jobId: job.id,
              seedKeyword: keyword,
              rank: result.rank,
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
    console.log(`Discovered ${discoveredBlogs.length} unique blogs`);

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
        
        // Scrape recent posts
        const scrapedPosts = await scraper.scrapeBlogPosts(blog.blogUrl, 10);
        
        // Save posts
        for (const post of scrapedPosts) {
          await storage.createAnalyzedPost({
            blogId: blog.id,
            url: post.url,
            title: post.title,
            publishedAt: post.publishedAt || null
          });
        }

        // Extract keywords from post titles
        const titles = scrapedPosts.map(post => post.title);
        const keywordCandidates = nlpService.extractKeywords(titles);
        
        // Get top 3 keywords per post (simplified: take top 3 overall for this blog)
        const topCandidates = keywordCandidates.slice(0, 3);
        
        // Save top keywords
        const posts = await storage.getAnalyzedPosts(blog.id);
        for (const [keywordIndex, candidate] of Array.from(topCandidates.entries())) {
          if (posts[keywordIndex]) {
            await storage.createExtractedKeyword({
              postId: posts[keywordIndex].id,
              keyword: candidate.keyword,
              searchVolume: null, // Will be filled by DataLab API in future
              score: candidate.score,
              rank: keywordIndex + 1 // t1, t2, t3
            });
          }
        }
        
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
              const extractedKeywords = await storage.getExtractedKeywords(keyword.postId);
              const targetKeyword = extractedKeywords.find(k => k.keyword === keyword.keyword);
              
              if (targetKeyword) {
                // Update in storage (would need to implement updateExtractedKeyword method)
                // For now, we'll store in the results
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

    // Complete the job
    await storage.updateSerpJob(jobId, {
      status: "completed",
      currentStep: "completed",
      currentStepDetail: "분석이 완료되었습니다",
      completedSteps: 3,
      progress: 100,
      detailedProgress: {
        phase: "completed"
      },
      results: {
        keywordsSearched: keywords.length,
        blogsDiscovered: discoveredBlogs.length,
        postsAnalyzed: discoveredBlogs.reduce((sum, blog) => sum + blog.postsAnalyzed, 0)
      }
    });
    
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