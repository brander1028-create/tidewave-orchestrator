import { 
  type SerpJob, 
  type InsertSerpJob, 
  type DiscoveredBlog, 
  type InsertDiscoveredBlog, 
  type AnalyzedPost, 
  type InsertAnalyzedPost, 
  type ExtractedKeyword, 
  type InsertExtractedKeyword,
  type KeywordCrawlHistory,
  type InsertKeywordCrawlHistory,
  type BlogRegistry,
  type InsertBlogRegistry,
  serpJobs,
  discoveredBlogs,
  analyzedPosts,
  extractedKeywords,
  keywordCrawlHistory,
  blogRegistry
} from "@shared/schema";
import { randomUUID } from "crypto";
import { db } from "./db";
import { desc, eq, sql, and, gte, or, like } from "drizzle-orm";

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
  
  // Keyword crawl history operations (Phase 3: 중복 크롤링 방지)
  recordKeywordCrawl(keyword: string, source?: string): Promise<void>;
  getRecentlyCrawledKeywords(daysPast?: number): Promise<string[]>;
  filterUncrawledKeywords(keywords: string[], daysPast?: number): Promise<string[]>;
  
  // Blog registry operations (Phase1 filtering)
  createOrUpdateBlogRegistry(blogData: InsertBlogRegistry): Promise<BlogRegistry>;
  getBlogRegistry(filters?: { status?: string; keyword?: string }): Promise<BlogRegistry[]>;
  updateBlogRegistryStatus(blogId: string, status: string, note?: string): Promise<BlogRegistry | undefined>;
  getBlogRegistryByBlogId(blogId: string): Promise<BlogRegistry | undefined>;
}

export class MemStorage implements IStorage {
  // ❌ REMOVED: All Memory Maps replaced with DB operations
  // Previously: private discoveredBlogs/analyzedPosts/extractedKeywords: Map<...> = new Map();

  // SERP Job operations
  async createSerpJob(insertJob: InsertSerpJob): Promise<SerpJob> {
    // Let database generate ID automatically
    const insertData = {
      ...insertJob,
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
    };
    
    // Store in database and return the inserted job with generated ID
    const [createdJob] = await db.insert(serpJobs).values(insertData).returning();
    console.log(`💾 Created SERP job ${createdJob.id} in database`);
    
    return createdJob;
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
    // Update in database instead of memory
    const updatedData = {
      ...updates,
      updatedAt: new Date(),
    };
    
    await db.update(serpJobs)
      .set(updatedData)
      .where(eq(serpJobs.id, id));
    
    console.log(`📝 Updated SERP job ${id} in database`);
    
    // Return the updated job
    const jobs = await db.select().from(serpJobs)
      .where(eq(serpJobs.id, id))
      .limit(1);
    
    return jobs[0] || undefined;
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
    try {
      // ✅ DB INSERT with error handling and logging
      const [createdBlog] = await db.insert(discoveredBlogs).values(insertBlog).returning();
      console.log(`📝 INSERT_SUCCESS: discovered_blogs`, { id: createdBlog.id, jobId: createdBlog.jobId, blogId: createdBlog.blogId });
      return createdBlog;
    } catch (error) {
      console.error('INSERT_FAIL', { table: 'discovered_blogs', err: error, payloadExcerpt: { jobId: insertBlog.jobId, blogId: insertBlog.blogId } });
      throw error;
    }
  }

  async getDiscoveredBlogs(jobId: string): Promise<DiscoveredBlog[]> {
    try {
      // ✅ DB SELECT instead of memory filter
      const blogs = await db.select().from(discoveredBlogs)
        .where(eq(discoveredBlogs.jobId, jobId))
        .orderBy(discoveredBlogs.rank);
      
      console.log(`📊 SELECT discovered_blogs: found ${blogs.length} blogs for jobId=${jobId}`);
      return blogs;
    } catch (error) {
      console.error('SELECT_FAIL', { table: 'discovered_blogs', jobId, err: error });
      return [];
    }
  }

  async updateDiscoveredBlog(id: string, updates: Partial<DiscoveredBlog>): Promise<DiscoveredBlog | undefined> {
    try {
      // ✅ DB UPDATE instead of memory map
      const [updatedBlog] = await db.update(discoveredBlogs)
        .set(updates)
        .where(eq(discoveredBlogs.id, id))
        .returning();
      
      if (updatedBlog) {
        console.log(`📝 UPDATE_SUCCESS: discovered_blogs`, { id, updates: Object.keys(updates) });
        return updatedBlog;
      }
      return undefined;
    } catch (error) {
      console.error('UPDATE_FAIL', { table: 'discovered_blogs', id, err: error });
      return undefined;
    }
  }

  // Analyzed post operations
  async createAnalyzedPost(insertPost: InsertAnalyzedPost): Promise<AnalyzedPost> {
    try {
      // ✅ DB INSERT with error handling and logging
      const [createdPost] = await db.insert(analyzedPosts).values(insertPost).returning();
      console.log(`📝 INSERT_SUCCESS: analyzed_posts`, { id: createdPost.id, blogId: createdPost.blogId, title: createdPost.title?.substring(0, 30) + '...' });
      return createdPost;
    } catch (error) {
      console.error('INSERT_FAIL', { table: 'analyzed_posts', err: error, payloadExcerpt: { blogId: insertPost.blogId, title: insertPost.title?.substring(0, 30) } });
      throw error;
    }
  }

  async getAnalyzedPosts(blogId: string): Promise<AnalyzedPost[]> {
    try {
      // ✅ DB SELECT instead of memory filter
      const posts = await db.select().from(analyzedPosts)
        .where(eq(analyzedPosts.blogId, blogId))
        .orderBy(desc(analyzedPosts.createdAt));
      
      console.log(`📊 SELECT analyzed_posts: found ${posts.length} posts for blogId=${blogId}`);
      return posts;
    } catch (error) {
      console.error('SELECT_FAIL', { table: 'analyzed_posts', blogId, err: error });
      return [];
    }
  }

  // Extracted keyword operations
  async createExtractedKeyword(insertKeyword: InsertExtractedKeyword): Promise<ExtractedKeyword> {
    try {
      // ✅ DB INSERT with error handling and logging
      const [createdKeyword] = await db.insert(extractedKeywords).values(insertKeyword).returning();
      console.log(`📝 INSERT_SUCCESS: extracted_keywords`, { id: createdKeyword.id, blogId: createdKeyword.blogId, keyword: createdKeyword.keyword });
      return createdKeyword;
    } catch (error) {
      console.error('INSERT_FAIL', { table: 'extracted_keywords', err: error, payloadExcerpt: { blogId: insertKeyword.blogId, keyword: insertKeyword.keyword } });
      throw error;
    }
  }

  async getExtractedKeywords(blogId: string): Promise<ExtractedKeyword[]> {
    try {
      // ✅ DB SELECT instead of memory filter
      const keywords = await db.select().from(extractedKeywords)
        .where(eq(extractedKeywords.blogId, blogId))
        .orderBy(desc(extractedKeywords.volume), desc(extractedKeywords.frequency));
      
      console.log(`📊 SELECT extracted_keywords: found ${keywords.length} keywords for blogId=${blogId}`);
      return keywords;
    } catch (error) {
      console.error('SELECT_FAIL', { table: 'extracted_keywords', blogId, err: error });
      return [];
    }
  }

  async getTopKeywordsByBlog(blogId: string): Promise<ExtractedKeyword[]> {
    try {
      // ✅ DB SELECT with proper ordering and limit
      const topKeywords = await db.select().from(extractedKeywords)
        .where(eq(extractedKeywords.blogId, blogId))
        .orderBy(desc(extractedKeywords.volume), desc(extractedKeywords.frequency))
        .limit(3);
      
      console.log(`📊 SELECT top3_keywords: found ${topKeywords.length} keywords for blogId=${blogId}`);
      return topKeywords;
    } catch (error) {
      console.error('SELECT_FAIL', { table: 'top_keywords', blogId, err: error });
      return [];
    }
  }

  // Keyword crawl history operations (Phase 3: 중복 크롤링 방지)
  async recordKeywordCrawl(keyword: string, source: string = "bfs"): Promise<void> {
    try {
      // 이미 존재하면 업데이트, 없으면 생성 (UPSERT)
      await db.insert(keywordCrawlHistory)
        .values({
          keyword,
          source,
          crawlCount: 1
        })
        .onConflictDoUpdate({
          target: keywordCrawlHistory.keyword,
          set: {
            lastCrawledAt: sql`NOW()`,
            crawlCount: sql`${keywordCrawlHistory.crawlCount} + 1`,
            source
          }
        });
      
      console.log(`📝 Recorded crawl for keyword: ${keyword} (source: ${source})`);
    } catch (error) {
      console.error(`❌ Failed to record keyword crawl: ${keyword}`, error);
    }
  }

  async getRecentlyCrawledKeywords(daysPast: number = 30): Promise<string[]> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysPast);
      
      const recentHistory = await db
        .select({ keyword: keywordCrawlHistory.keyword })
        .from(keywordCrawlHistory)
        .where(gte(keywordCrawlHistory.lastCrawledAt, cutoffDate));
      
      const keywords = recentHistory.map(row => row.keyword);
      console.log(`🔍 Found ${keywords.length} keywords crawled in last ${daysPast} days`);
      return keywords;
    } catch (error) {
      console.error(`❌ Failed to get recently crawled keywords:`, error);
      return [];
    }
  }

  async filterUncrawledKeywords(keywords: string[], daysPast: number = 30): Promise<string[]> {
    try {
      const recentlyCrawled = await this.getRecentlyCrawledKeywords(daysPast);
      const recentlyCrawledSet = new Set(recentlyCrawled);
      
      const uncrawled = keywords.filter(keyword => !recentlyCrawledSet.has(keyword));
      
      console.log(`🚫 Filtered out ${keywords.length - uncrawled.length}/${keywords.length} already crawled keywords`);
      console.log(`✅ ${uncrawled.length} new keywords ready for crawling`);
      
      return uncrawled;
    } catch (error) {
      console.error(`❌ Failed to filter uncrawled keywords:`, error);
      return keywords; // 에러 시 모든 키워드 반환 (안전장치)
    }
  }

  // Blog registry operations (Phase1 filtering)
  async createOrUpdateBlogRegistry(blogData: InsertBlogRegistry): Promise<BlogRegistry> {
    try {
      // Extract blog ID from URL for Naver blogs
      let blogId = blogData.blogId;
      if (!blogId && blogData.url) {
        const match = blogData.url.match(/blog\.naver\.com\/([^\/]+)/);
        if (match) {
          blogId = match[1];
        }
      }

      const insertData = {
        ...blogData,
        blogId: blogId || randomUUID(),
        firstSeenAt: new Date(),
        lastSeenAt: new Date(),
      };

      // Use upsert (insert or update)
      const [result] = await db.insert(blogRegistry)
        .values(insertData)
        .onConflictDoUpdate({
          target: blogRegistry.blogId,
          set: {
            url: insertData.url,
            name: insertData.name,
            status: insertData.status,
            tags: insertData.tags,
            note: insertData.note,
            lastSeenAt: new Date(),
            updatedAt: new Date(),
          }
        })
        .returning();

      console.log(`📝 Created/Updated blog registry for: ${result.blogId}`);
      return result;
    } catch (error) {
      console.error(`❌ Failed to create/update blog registry:`, error);
      throw error;
    }
  }

  async getBlogRegistry(filters?: { status?: string; keyword?: string }): Promise<BlogRegistry[]> {
    try {
      const conditions: any[] = [];

      if (filters?.status && filters.status !== 'all') {
        conditions.push(eq(blogRegistry.status, filters.status));
      }

      if (filters?.keyword) {
        conditions.push(
          or(
            like(blogRegistry.name, `%${filters.keyword}%`),
            like(blogRegistry.url, `%${filters.keyword}%`),
            sql`array_to_string(${blogRegistry.tags}, ',') ILIKE ${'%' + filters.keyword + '%'}`
          )
        );
      }

      let query = db.select().from(blogRegistry);
      
      if (conditions.length > 0) {
        query = query.where(and(...conditions));
      }

      const results = await query.orderBy(desc(blogRegistry.updatedAt)).limit(100);
      
      console.log(`🔍 Retrieved ${results.length} blog registry entries`);
      return results;
    } catch (error) {
      console.error(`❌ Failed to get blog registry:`, error);
      return [];
    }
  }

  async updateBlogRegistryStatus(blogId: string, status: string, note?: string): Promise<BlogRegistry | undefined> {
    try {
      const updateData: Partial<BlogRegistry> = {
        status,
        updatedAt: new Date(),
      };

      if (note !== undefined) {
        updateData.note = note;
      }

      const [result] = await db.update(blogRegistry)
        .set(updateData)
        .where(eq(blogRegistry.blogId, blogId))
        .returning();

      if (result) {
        console.log(`📝 Updated blog registry status: ${blogId} -> ${status}`);
      }

      return result;
    } catch (error) {
      console.error(`❌ Failed to update blog registry status:`, error);
      return undefined;
    }
  }

  async getBlogRegistryByBlogId(blogId: string): Promise<BlogRegistry | undefined> {
    try {
      const [result] = await db.select()
        .from(blogRegistry)
        .where(eq(blogRegistry.blogId, blogId))
        .limit(1);

      return result;
    } catch (error) {
      console.error(`❌ Failed to get blog registry by blogId:`, error);
      return undefined;
    }
  }
}

export const storage = new MemStorage();