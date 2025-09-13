import { 
  type SerpJob, 
  type InsertSerpJob, 
  type DiscoveredBlog, 
  type InsertDiscoveredBlog, 
  type AnalyzedPost, 
  type InsertAnalyzedPost, 
  type ExtractedKeyword, 
  type InsertExtractedKeyword,
  serpJobs
} from "@shared/schema";
import { randomUUID } from "crypto";
import { db } from "./db";
import { desc, eq } from "drizzle-orm";

export interface IStorage {
  // SERP Job operations
  createSerpJob(job: InsertSerpJob): Promise<SerpJob>;
  getSerpJob(id: string): Promise<SerpJob | undefined>;
  updateSerpJob(id: string, updates: Partial<SerpJob>): Promise<SerpJob | undefined>;
  listSerpJobs(limit?: number): Promise<SerpJob[]>; // Added for history
  
  // Discovered blog operations
  createDiscoveredBlog(blog: InsertDiscoveredBlog): Promise<DiscoveredBlog>;
  getDiscoveredBlogs(jobId: string): Promise<DiscoveredBlog[]>;
  updateDiscoveredBlog(id: string, updates: Partial<DiscoveredBlog>): Promise<DiscoveredBlog | undefined>;
  
  // Analyzed post operations
  createAnalyzedPost(post: InsertAnalyzedPost): Promise<AnalyzedPost>;
  getAnalyzedPosts(blogId: string): Promise<AnalyzedPost[]>;
  
  // Extracted keyword operations
  createExtractedKeyword(keyword: InsertExtractedKeyword): Promise<ExtractedKeyword>;
  getExtractedKeywords(blogId: string): Promise<ExtractedKeyword[]>;
  getTopKeywordsByBlog(blogId: string): Promise<ExtractedKeyword[]>;
}

export class MemStorage implements IStorage {
  private serpJobs: Map<string, SerpJob> = new Map();
  private discoveredBlogs: Map<string, DiscoveredBlog> = new Map();
  private analyzedPosts: Map<string, AnalyzedPost> = new Map();
  private extractedKeywords: Map<string, ExtractedKeyword> = new Map();

  // SERP Job operations
  async createSerpJob(insertJob: InsertSerpJob): Promise<SerpJob> {
    const id = randomUUID();
    const job: SerpJob = {
      ...insertJob,
      id,
      status: insertJob.status || "pending",
      minRank: insertJob.minRank || 2,
      maxRank: insertJob.maxRank || 15,
      postsPerBlog: insertJob.postsPerBlog || 10,
      progress: insertJob.progress || 0,
      results: insertJob.results || null,
      currentStep: insertJob.currentStep || null,
      currentStepDetail: insertJob.currentStepDetail || null,
      detailedProgress: insertJob.detailedProgress || null,
      totalSteps: insertJob.totalSteps || 3,
      completedSteps: insertJob.completedSteps || 0,
      errorMessage: insertJob.errorMessage || null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.serpJobs.set(id, job);
    return job;
  }

  async getSerpJob(id: string): Promise<SerpJob | undefined> {
    // Use actual database query instead of memory storage
    const jobs = await db.select().from(serpJobs)
      .where(eq(serpJobs.id, id))
      .limit(1);
    
    const job = jobs[0];
    if (job) {
      console.log(`🔍 getSerpJob(${id}): status=${job.status}, results type=${typeof job.results}, has results=${!!job.results}`);
      if (job.results) {
        console.log(`📋 getSerpJob(${id}): results preview=`, JSON.stringify(job.results).substring(0, 200) + '...');
      }
    }
    return job || undefined;
  }

  async updateSerpJob(id: string, updates: Partial<SerpJob>): Promise<SerpJob | undefined> {
    const job = this.serpJobs.get(id);
    if (job) {
      const updatedJob = {
        ...job,
        ...updates,
        updatedAt: new Date(),
      };
      this.serpJobs.set(id, updatedJob);
      return updatedJob;
    }
    return undefined;
  }

  async listSerpJobs(limit: number = 50): Promise<SerpJob[]> {
    // Use actual database query instead of memory storage for history
    const jobs = await db.select().from(serpJobs)
      .orderBy(desc(serpJobs.createdAt))
      .limit(limit);
    
    return jobs;
  }

  // Discovered blog operations
  async createDiscoveredBlog(insertBlog: InsertDiscoveredBlog): Promise<DiscoveredBlog> {
    const id = randomUUID();
    const blog: DiscoveredBlog = {
      ...insertBlog,
      id,
      baseRank: insertBlog.baseRank || null,
      postsAnalyzed: insertBlog.postsAnalyzed || 0,
      createdAt: new Date(),
    };
    this.discoveredBlogs.set(id, blog);
    return blog;
  }

  async getDiscoveredBlogs(jobId: string): Promise<DiscoveredBlog[]> {
    return Array.from(this.discoveredBlogs.values())
      .filter(blog => blog.jobId === jobId)
      .sort((a, b) => a.rank - b.rank);
  }

  async updateDiscoveredBlog(id: string, updates: Partial<DiscoveredBlog>): Promise<DiscoveredBlog | undefined> {
    const blog = this.discoveredBlogs.get(id);
    if (blog) {
      const updatedBlog = { ...blog, ...updates };
      this.discoveredBlogs.set(id, updatedBlog);
      return updatedBlog;
    }
    return undefined;
  }

  // Analyzed post operations
  async createAnalyzedPost(insertPost: InsertAnalyzedPost): Promise<AnalyzedPost> {
    const id = randomUUID();
    const post: AnalyzedPost = {
      ...insertPost,
      id,
      publishedAt: insertPost.publishedAt || null,
      createdAt: new Date(),
    };
    this.analyzedPosts.set(id, post);
    return post;
  }

  async getAnalyzedPosts(blogId: string): Promise<AnalyzedPost[]> {
    return Array.from(this.analyzedPosts.values())
      .filter(post => post.blogId === blogId)
      .sort((a, b) => (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0));
  }

  // Extracted keyword operations
  async createExtractedKeyword(insertKeyword: InsertExtractedKeyword): Promise<ExtractedKeyword> {
    const id = randomUUID();
    const keyword: ExtractedKeyword = {
      ...insertKeyword,
      id,
      volume: insertKeyword.volume || null,
      frequency: insertKeyword.frequency || 0,
      rank: insertKeyword.rank || null,
      tier: insertKeyword.tier || null,
      createdAt: new Date(),
    };
    this.extractedKeywords.set(id, keyword);
    return keyword;
  }

  async getExtractedKeywords(blogId: string): Promise<ExtractedKeyword[]> {
    return Array.from(this.extractedKeywords.values())
      .filter(keyword => keyword.blogId === blogId)
      .sort((a, b) => (b.volume || 0) - (a.volume || 0) || b.frequency - a.frequency);
  }

  async getTopKeywordsByBlog(blogId: string): Promise<ExtractedKeyword[]> {
    // Get all keywords for this blog, ordered by volume then frequency
    const blogKeywords = Array.from(this.extractedKeywords.values())
      .filter(keyword => keyword.blogId === blogId)
      .sort((a, b) => {
        // Sort by volume first (higher is better), then frequency
        const volumeA = a.volume || 0;
        const volumeB = b.volume || 0;
        if (volumeB !== volumeA) return volumeB - volumeA;
        return b.frequency - a.frequency;
      });
    
    // Return top 3 keywords
    return blogKeywords.slice(0, 3);
  }
}

export const storage = new MemStorage();