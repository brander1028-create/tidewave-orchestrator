import { type Blog, type InsertBlog, type BlogPost, type InsertBlogPost, type Keyword, type InsertKeyword, type AnalysisJob, type InsertAnalysisJob } from "@shared/schema";
import { randomUUID } from "crypto";

export interface IStorage {
  // Blog operations
  createBlog(blog: InsertBlog): Promise<Blog>;
  getBlog(id: string): Promise<Blog | undefined>;
  getBlogByUrl(url: string): Promise<Blog | undefined>;
  updateBlogStatus(id: string, status: string, postsCollected?: number): Promise<void>;
  
  // Blog post operations
  createBlogPost(post: InsertBlogPost): Promise<BlogPost>;
  getBlogPosts(blogId: string): Promise<BlogPost[]>;
  
  // Keyword operations
  createKeyword(keyword: InsertKeyword): Promise<Keyword>;
  getBlogKeywords(blogId: string): Promise<Keyword[]>;
  updateKeywordRanking(id: string, searchRank: number, previousRank?: number): Promise<void>;
  
  // Analysis job operations
  createAnalysisJob(job: InsertAnalysisJob): Promise<AnalysisJob>;
  getAnalysisJob(id: string): Promise<AnalysisJob | undefined>;
  updateAnalysisJob(id: string, updates: Partial<AnalysisJob>): Promise<void>;
  getAnalysisJobByBlogId(blogId: string): Promise<AnalysisJob | undefined>;
}

export class MemStorage implements IStorage {
  private blogs: Map<string, Blog> = new Map();
  private blogPosts: Map<string, BlogPost> = new Map();
  private keywords: Map<string, Keyword> = new Map();
  private analysisJobs: Map<string, AnalysisJob> = new Map();

  // Blog operations
  async createBlog(insertBlog: InsertBlog): Promise<Blog> {
    const id = randomUUID();
    const blog: Blog = {
      ...insertBlog,
      id,
      postsCollected: 0,
      createdAt: new Date(),
      lastAnalyzedAt: null,
    };
    this.blogs.set(id, blog);
    return blog;
  }

  async getBlog(id: string): Promise<Blog | undefined> {
    return this.blogs.get(id);
  }

  async getBlogByUrl(url: string): Promise<Blog | undefined> {
    return Array.from(this.blogs.values()).find(blog => blog.url === url);
  }

  async updateBlogStatus(id: string, status: string, postsCollected?: number): Promise<void> {
    const blog = this.blogs.get(id);
    if (blog) {
      this.blogs.set(id, {
        ...blog,
        status,
        postsCollected: postsCollected ?? blog.postsCollected,
        lastAnalyzedAt: new Date(),
      });
    }
  }

  // Blog post operations
  async createBlogPost(insertPost: InsertBlogPost): Promise<BlogPost> {
    const id = randomUUID();
    const post: BlogPost = {
      ...insertPost,
      id,
      createdAt: new Date(),
    };
    this.blogPosts.set(id, post);
    return post;
  }

  async getBlogPosts(blogId: string): Promise<BlogPost[]> {
    return Array.from(this.blogPosts.values()).filter(post => post.blogId === blogId);
  }

  // Keyword operations
  async createKeyword(insertKeyword: InsertKeyword): Promise<Keyword> {
    const id = randomUUID();
    const keyword: Keyword = {
      ...insertKeyword,
      id,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.keywords.set(id, keyword);
    return keyword;
  }

  async getBlogKeywords(blogId: string): Promise<Keyword[]> {
    return Array.from(this.keywords.values())
      .filter(keyword => keyword.blogId === blogId)
      .sort((a, b) => b.score - a.score);
  }

  async updateKeywordRanking(id: string, searchRank: number, previousRank?: number): Promise<void> {
    const keyword = this.keywords.get(id);
    if (keyword) {
      const rankChange = previousRank ? previousRank - searchRank : 0;
      this.keywords.set(id, {
        ...keyword,
        searchRank,
        previousRank: previousRank ?? keyword.searchRank,
        rankChange,
        updatedAt: new Date(),
      });
    }
  }

  // Analysis job operations
  async createAnalysisJob(insertJob: InsertAnalysisJob): Promise<AnalysisJob> {
    const id = randomUUID();
    const job: AnalysisJob = {
      ...insertJob,
      id,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.analysisJobs.set(id, job);
    return job;
  }

  async getAnalysisJob(id: string): Promise<AnalysisJob | undefined> {
    return this.analysisJobs.get(id);
  }

  async updateAnalysisJob(id: string, updates: Partial<AnalysisJob>): Promise<void> {
    const job = this.analysisJobs.get(id);
    if (job) {
      this.analysisJobs.set(id, {
        ...job,
        ...updates,
        updatedAt: new Date(),
      });
    }
  }

  async getAnalysisJobByBlogId(blogId: string): Promise<AnalysisJob | undefined> {
    return Array.from(this.analysisJobs.values()).find(job => job.blogId === blogId);
  }
}

export const storage = new MemStorage();
