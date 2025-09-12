import { 
  type SerpJob, 
  type InsertSerpJob, 
  type DiscoveredBlog, 
  type InsertDiscoveredBlog, 
  type AnalyzedPost, 
  type InsertAnalyzedPost, 
  type ExtractedKeyword, 
  type InsertExtractedKeyword 
} from "@shared/schema";
import { randomUUID } from "crypto";

export interface IStorage {
  // SERP Job operations
  createSerpJob(job: InsertSerpJob): Promise<SerpJob>;
  getSerpJob(id: string): Promise<SerpJob | undefined>;
  updateSerpJob(id: string, updates: Partial<SerpJob>): Promise<SerpJob | undefined>;
  
  // Discovered blog operations
  createDiscoveredBlog(blog: InsertDiscoveredBlog): Promise<DiscoveredBlog>;
  getDiscoveredBlogs(jobId: string): Promise<DiscoveredBlog[]>;
  
  // Analyzed post operations
  createAnalyzedPost(post: InsertAnalyzedPost): Promise<AnalyzedPost>;
  getAnalyzedPosts(blogId: string): Promise<AnalyzedPost[]>;
  
  // Extracted keyword operations
  createExtractedKeyword(keyword: InsertExtractedKeyword): Promise<ExtractedKeyword>;
  getExtractedKeywords(postId: string): Promise<ExtractedKeyword[]>;
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
    return this.serpJobs.get(id);
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

  // Discovered blog operations
  async createDiscoveredBlog(insertBlog: InsertDiscoveredBlog): Promise<DiscoveredBlog> {
    const id = randomUUID();
    const blog: DiscoveredBlog = {
      ...insertBlog,
      id,
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
      searchVolume: insertKeyword.searchVolume || null,
      rank: insertKeyword.rank || null,
      serpRank: insertKeyword.serpRank || null,
      createdAt: new Date(),
    };
    this.extractedKeywords.set(id, keyword);
    return keyword;
  }

  async getExtractedKeywords(postId: string): Promise<ExtractedKeyword[]> {
    return Array.from(this.extractedKeywords.values())
      .filter(keyword => keyword.postId === postId)
      .sort((a, b) => b.score - a.score);
  }

  async getTopKeywordsByBlog(blogId: string): Promise<ExtractedKeyword[]> {
    // Get all posts for this blog
    const posts = await this.getAnalyzedPosts(blogId);
    const postIds = posts.map(p => p.id);
    
    // Get all keywords for these posts
    const allKeywords = Array.from(this.extractedKeywords.values())
      .filter(keyword => postIds.includes(keyword.postId))
      .filter(keyword => keyword.rank && keyword.rank <= 3) // Only top 3 per post
      .sort((a, b) => {
        // Sort by search volume first, then by score
        if (b.searchVolume !== a.searchVolume) {
          return (b.searchVolume || 0) - (a.searchVolume || 0);
        }
        return b.score - a.score;
      });
    
    return allKeywords;
  }
}

export const storage = new MemStorage();