import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { scraper } from "./services/scraper";
import { nlpService } from "./services/nlp";
import { naverApi } from "./services/naver-api";
import { insertBlogSchema, insertAnalysisJobSchema } from "@shared/schema";
import { z } from "zod";

export async function registerRoutes(app: Express): Promise<Server> {
  
  // Start blog analysis
  app.post("/api/blogs/analyze", async (req, res) => {
    try {
      const { url, postLimit = 15, useStopWords = true } = req.body;
      
      if (!url) {
        return res.status(400).json({ error: "Blog URL is required" });
      }

      // Validate and normalize URL
      let blogUrl: string;
      try {
        const urlObj = new URL(url);
        if (!urlObj.hostname.includes('blog.naver.com')) {
          return res.status(400).json({ error: "Only Naver blog URLs are supported" });
        }
        blogUrl = url;
      } catch {
        return res.status(400).json({ error: "Invalid URL format" });
      }

      // Check if blog already exists
      let blog = await storage.getBlogByUrl(blogUrl);
      
      if (!blog) {
        // Create new blog entry
        blog = await storage.createBlog({
          url: blogUrl,
          status: "pending"
        });
      }

      // Create analysis job
      const job = await storage.createAnalysisJob({
        blogId: blog.id,
        status: "pending",
        currentStep: "collecting_posts",
        totalSteps: 3,
        completedSteps: 0,
        progress: 0
      });

      // Start analysis in background
      processAnalysisJob(job.id, blogUrl, postLimit, useStopWords);

      res.json({ 
        blogId: blog.id,
        jobId: job.id,
        message: "Analysis started successfully"
      });

    } catch (error) {
      console.error('Error starting analysis:', error);
      res.status(500).json({ error: "Failed to start analysis" });
    }
  });

  // Get analysis job status
  app.get("/api/jobs/:jobId", async (req, res) => {
    try {
      const job = await storage.getAnalysisJob(req.params.jobId);
      if (!job) {
        return res.status(404).json({ error: "Job not found" });
      }
      res.json(job);
    } catch (error) {
      console.error('Error fetching job:', error);
      res.status(500).json({ error: "Failed to fetch job status" });
    }
  });

  // Get blog details with posts and keywords
  app.get("/api/blogs/:blogId", async (req, res) => {
    try {
      const blog = await storage.getBlog(req.params.blogId);
      if (!blog) {
        return res.status(404).json({ error: "Blog not found" });
      }

      const posts = await storage.getBlogPosts(blog.id);
      const keywords = await storage.getBlogKeywords(blog.id);
      const job = await storage.getAnalysisJobByBlogId(blog.id);

      res.json({
        blog,
        posts,
        keywords,
        job
      });
    } catch (error) {
      console.error('Error fetching blog:', error);
      res.status(500).json({ error: "Failed to fetch blog data" });
    }
  });

  // Export data as CSV
  app.get("/api/blogs/:blogId/export/csv", async (req, res) => {
    try {
      const keywords = await storage.getBlogKeywords(req.params.blogId);
      
      let csv = "키워드,빈도,점수,현재순위,이전순위,순위변화\n";
      keywords.forEach(keyword => {
        csv += `"${keyword.keyword}",${keyword.frequency},${keyword.score},${keyword.searchRank || ''},${keyword.previousRank || ''},${keyword.rankChange}\n`;
      });

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="keywords.csv"');
      res.send('\ufeff' + csv); // BOM for Excel UTF-8 support
    } catch (error) {
      console.error('Error exporting CSV:', error);
      res.status(500).json({ error: "Failed to export data" });
    }
  });

  // Export data as JSON
  app.get("/api/blogs/:blogId/export/json", async (req, res) => {
    try {
      const blog = await storage.getBlog(req.params.blogId);
      const posts = await storage.getBlogPosts(req.params.blogId);
      const keywords = await storage.getBlogKeywords(req.params.blogId);

      const data = {
        blog,
        posts,
        keywords,
        exportedAt: new Date().toISOString()
      };

      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', 'attachment; filename="blog-analysis.json"');
      res.json(data);
    } catch (error) {
      console.error('Error exporting JSON:', error);
      res.status(500).json({ error: "Failed to export data" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}

// Background job processing
async function processAnalysisJob(jobId: string, blogUrl: string, postLimit: number, useStopWords: boolean) {
  try {
    const job = await storage.getAnalysisJob(jobId);
    if (!job) return;

    await storage.updateAnalysisJob(jobId, {
      status: "running",
      currentStep: "collecting_posts",
      progress: 10
    });

    // Step 1: Scrape blog posts
    console.log(`Starting post collection for job ${jobId}`);
    const scrapedPosts = await scraper.scrapeBlogPosts(blogUrl, postLimit);
    
    await storage.updateBlogStatus(job.blogId, "analyzing", scrapedPosts.length);
    
    // Save posts to storage
    for (const post of scrapedPosts) {
      await storage.createBlogPost({
        blogId: job.blogId,
        url: post.url,
        title: post.title,
        publishedAt: post.publishedAt || null
      });
    }

    await storage.updateAnalysisJob(jobId, {
      currentStep: "extracting_keywords",
      completedSteps: 1,
      progress: 40
    });

    // Step 2: Extract keywords
    console.log(`Extracting keywords for job ${jobId}`);
    const titles = scrapedPosts.map(post => post.title);
    const keywordCandidates = nlpService.extractKeywords(titles);

    // Save keywords to storage
    for (const candidate of keywordCandidates) {
      await storage.createKeyword({
        blogId: job.blogId,
        keyword: candidate.keyword,
        frequency: candidate.frequency,
        score: candidate.score
      });
    }

    await storage.updateAnalysisJob(jobId, {
      currentStep: "checking_rankings",
      completedSteps: 2,
      progress: 70
    });

    // Step 3: Check search rankings for top keywords
    console.log(`Checking search rankings for job ${jobId}`);
    const topKeywords = nlpService.getTopKeywords(keywordCandidates, 10);
    
    for (const [index, keyword] of topKeywords.entries()) {
      try {
        const rank = await naverApi.checkKeywordRanking(keyword.keyword, blogUrl);
        
        if (rank) {
          // Find and update the keyword in storage
          const storedKeywords = await storage.getBlogKeywords(job.blogId);
          const targetKeyword = storedKeywords.find(k => k.keyword === keyword.keyword);
          
          if (targetKeyword) {
            await storage.updateKeywordRanking(targetKeyword.id, rank);
          }
        }
        
        // Update progress
        const progressIncrement = (30 / topKeywords.length);
        await storage.updateAnalysisJob(jobId, {
          progress: Math.min(70 + ((index + 1) * progressIncrement), 100)
        });

        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 1000));
        
      } catch (error) {
        console.error(`Error checking ranking for keyword "${keyword.keyword}":`, error);
      }
    }

    // Complete the job
    await storage.updateAnalysisJob(jobId, {
      status: "completed",
      currentStep: "completed",
      completedSteps: 3,
      progress: 100,
      results: {
        postsCollected: scrapedPosts.length,
        keywordsExtracted: keywordCandidates.length,
        rankingsChecked: topKeywords.length
      }
    });

    await storage.updateBlogStatus(job.blogId, "completed", scrapedPosts.length);
    
    console.log(`Analysis job ${jobId} completed successfully`);

  } catch (error) {
    console.error(`Error processing job ${jobId}:`, error);
    
    await storage.updateAnalysisJob(jobId, {
      status: "failed",
      errorMessage: error instanceof Error ? error.message : "Unknown error occurred"
    });
  }
}
