import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, timestamp, jsonb, boolean, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// New API contract schema - matching specification document
export const serpJobs = pgTable("serp_jobs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  keywords: text("keywords").array().notNull(), // Input keywords array
  minRank: integer("min_rank").notNull().default(2),
  maxRank: integer("max_rank").notNull().default(15),
  postsPerBlog: integer("posts_per_blog").notNull().default(10),
  status: text("status").notNull().default("pending"), // pending, running, completed, failed, cancelled
  progress: integer("progress").default(0), // 0-100
  currentStep: text("current_step"), // discovering_blogs, analyzing_posts, checking_rankings
  currentStepDetail: text("current_step_detail"), // "홍삼스틱" 키워드 검색 중... (3/5)
  totalSteps: integer("total_steps").default(3),
  completedSteps: integer("completed_steps").default(0),
  detailedProgress: jsonb("detailed_progress"), // { currentKeyword, processedKeywords, totalKeywords, currentBlog, etc }
  errorMessage: text("error_message"),
  results: jsonb("results"), // final analysis results in new contract format
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const discoveredBlogs = pgTable("discovered_blogs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  jobId: varchar("job_id").references(() => serpJobs.id).notNull(),
  seedKeyword: text("seed_keyword").notNull(), // Original keyword that led to this blog
  rank: integer("rank").notNull(), // Position in SERP (2-15)
  blogId: text("blog_id").notNull(), // Blog ID from URL (e.g., "riche1862")
  blogName: text("blog_name").notNull(),
  blogUrl: text("blog_url").notNull(),
  baseRank: integer("base_rank"), // Rank for the main target keyword (1-10 for hit blogs)
  postsAnalyzed: integer("posts_analyzed").default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

export const analyzedPosts = pgTable("analyzed_posts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  blogId: varchar("blog_id").references(() => discoveredBlogs.id).notNull(),
  url: text("url").notNull(),
  title: text("title").notNull(),
  publishedAt: timestamp("published_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const extractedKeywords = pgTable("extracted_keywords", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  blogId: varchar("blog_id").references(() => discoveredBlogs.id).notNull(), // Link to blog instead of post
  jobId: varchar("job_id").references(() => serpJobs.id).notNull(),
  keyword: text("keyword").notNull(),
  volume: integer("volume").default(0), // Monthly search volume from SearchAd API
  frequency: integer("frequency").notNull().default(0), // N-gram frequency count
  rank: integer("rank"), // SERP ranking 1-10 or 0 for not found
  tier: integer("tier"), // 1=TIER1, 2=TIER2, 3=TIER3 based on volume
  createdAt: timestamp("created_at").defaultNow(),
});

// Keywords management table for Unified Health Gate system
export const managedKeywords = pgTable("managed_keywords", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  text: text("text").notNull().unique(),
  raw_volume: integer("raw_volume").notNull().default(0), // Original SearchAd API volume
  volume: integer("volume").notNull().default(0), // Processed/adjusted volume
  grade: text("grade").notNull().default("C"), // A/B/C grade
  commerciality: integer("commerciality").notNull().default(0), // 0-100 commercial intent
  difficulty: integer("difficulty").notNull().default(0), // 0-100 SEO difficulty
  excluded: boolean("excluded").notNull().default(false), // Excluded from analysis
  source: text("source").notNull().default("searchads"), // searchads, manual, etc
  // 5개 지표 확장 필드
  comp_idx: text("comp_idx"), // 경쟁도 텍스트: 낮음/중간/높음
  comp_score: integer("comp_score").default(0), // 경쟁도 점수: 20/60/100
  ad_depth: real("ad_depth").default(0), // plAvgDepth - 평균 광고 노출 깊이
  has_ads: boolean("has_ads").notNull().default(false), // ad_depth > 0
  est_cpc_krw: integer("est_cpc_krw"), // 예상 CPC (KRW, nullable)
  est_cpc_source: text("est_cpc_source").default("unknown"), // account/estimated/unknown
  score: integer("score").notNull().default(0), // 종합점수 0-100
  updated_at: timestamp("updated_at").defaultNow(),
  created_at: timestamp("created_at").defaultNow(),
});

// 키워드별 크롤링 이력 추적 테이블 (Phase 3: 중복 크롤링 방지)
export const keywordCrawlHistory = pgTable("keyword_crawl_history", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  keyword: text("keyword").notNull().unique(), // 정규화된 키워드
  lastCrawledAt: timestamp("last_crawled_at").defaultNow().notNull(), // 마지막 크롤링 시각
  crawlCount: integer("crawl_count").notNull().default(1), // 총 크롤링 횟수
  firstCrawledAt: timestamp("first_crawled_at").defaultNow().notNull(), // 첫 크롤링 시각
  source: text("source").notNull().default("bfs"), // bfs, manual, upload 등
});

// Blog registry for status management (Phase1 filtering)
export const blogRegistry = pgTable("blog_registry", {
  blogId: text("blog_id").primaryKey(), // Naver: blog.naver.com/{아이디}에서 아이디 추출
  url: text("url").notNull(),
  name: text("name"),
  status: text("status").notNull().default("collected"), // 'collected' | 'blacklist' | 'outreach'
  tags: text("tags"),
  note: text("note"),
  firstSeenAt: timestamp("first_seen_at"),
  lastSeenAt: timestamp("last_seen_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// App metadata table for persistent storage (API key state, etc)
export const appMeta = pgTable("app_meta", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// v17: App settings for hot-reloadable configuration
export const appSettings = pgTable("app_settings", {
  key: text("key").primaryKey(),
  json: jsonb("json").notNull(),
  version: integer("version").notNull().default(1),
  updatedBy: text("updated_by").notNull().default("system"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// v17: Settings history for rollback support
export const settingsHistory = pgTable("settings_history", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  key: text("key").notNull(),
  json: jsonb("json").notNull(),
  version: integer("version").notNull(),
  updatedBy: text("updated_by").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
  note: text("note"), // Change summary/description
});

// Post tier checks table for comprehensive tier recording (v10 Score-First Gate requirements)
export const postTierChecks = pgTable("post_tier_checks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  jobId: varchar("job_id").references(() => serpJobs.id).notNull(),
  inputKeyword: text("input_keyword").notNull(), // User input keyword for grouping
  blogId: text("blog_id").notNull(),
  postId: text("post_id").notNull(),
  postTitle: text("post_title").notNull(),
  tier: integer("tier").notNull(), // 1..T (variable)
  textSurface: text("text_surface").notNull(), // Original extracted text
  textNrm: text("text_nrm").notNull(), // Normalized text for deduplication
  volume: integer("volume"), // Search volume (null allowed)
  rank: integer("rank"), // SERP rank: 0 | 1..N | null
  device: text("device").default("mobile"), // 'mobile' | 'pc'  
  related: boolean("related").notNull().default(false), // Keyword relatedness to input
  // ★ v17 Score + v10 Gate extensions
  score: real("score"), // v17 실제 계산 점수 (totalScore from v17 pipeline)
  eligible: boolean("eligible").notNull().default(true), // AdScore gate passed
  adscore: real("adscore"), // Calculated AdScore (Volume+Competition+AdDepth+CPC)
  skipReason: text("skip_reason"), // "score<thr", "vol<thr", "addepth<thr", "cpc<thr"
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  // Unique constraint to prevent duplicates
  uniqueCheck: sql`UNIQUE(${table.jobId}, ${table.inputKeyword}, ${table.blogId}, ${table.postId}, ${table.tier}, ${table.textNrm})`,
  // Indexes for efficient querying
  jobKeywordIdx: sql`CREATE INDEX IF NOT EXISTS idx_post_tier_checks_job_keyword ON post_tier_checks(job_id, input_keyword)`,
  blogIdx: sql`CREATE INDEX IF NOT EXISTS idx_post_tier_checks_blog ON post_tier_checks(blog_id)`,
  postIdx: sql`CREATE INDEX IF NOT EXISTS idx_post_tier_checks_post ON post_tier_checks(post_id)`,
  rankIdx: sql`CREATE INDEX IF NOT EXISTS idx_post_tier_checks_rank ON post_tier_checks(rank)`,
}));

// Insert schemas for new entities
export const insertSerpJobSchema = createInsertSchema(serpJobs).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertDiscoveredBlogSchema = createInsertSchema(discoveredBlogs).omit({
  id: true,
  createdAt: true,
});

export const insertAnalyzedPostSchema = createInsertSchema(analyzedPosts).omit({
  id: true,
  createdAt: true,
});

export const insertExtractedKeywordSchema = createInsertSchema(extractedKeywords).omit({
  id: true,
  createdAt: true,
});

export const insertManagedKeywordSchema = createInsertSchema(managedKeywords).omit({
  id: true,
  created_at: true,
  updated_at: true,
});

export const insertKeywordCrawlHistorySchema = createInsertSchema(keywordCrawlHistory).omit({
  id: true,
  firstCrawledAt: true,
  lastCrawledAt: true,
});

export const insertBlogRegistrySchema = createInsertSchema(blogRegistry).omit({
  createdAt: true,
  updatedAt: true,
});

export const insertPostTierCheckSchema = createInsertSchema(postTierChecks).omit({
  id: true,
  createdAt: true,
});

export const insertAppSettingsSchema = createInsertSchema(appSettings).omit({
  updatedAt: true,
});

export const insertSettingsHistorySchema = createInsertSchema(settingsHistory).omit({
  id: true,
});

// Types for new entities
export type SerpJob = typeof serpJobs.$inferSelect;
export type InsertSerpJob = z.infer<typeof insertSerpJobSchema>;
export type DiscoveredBlog = typeof discoveredBlogs.$inferSelect;
export type InsertDiscoveredBlog = z.infer<typeof insertDiscoveredBlogSchema>;
export type AnalyzedPost = typeof analyzedPosts.$inferSelect;
export type InsertAnalyzedPost = z.infer<typeof insertAnalyzedPostSchema>;
export type ExtractedKeyword = typeof extractedKeywords.$inferSelect;
export type InsertExtractedKeyword = z.infer<typeof insertExtractedKeywordSchema>;
export type ManagedKeyword = typeof managedKeywords.$inferSelect;
export type InsertManagedKeyword = z.infer<typeof insertManagedKeywordSchema>;
export type KeywordCrawlHistory = typeof keywordCrawlHistory.$inferSelect;
export type InsertKeywordCrawlHistory = z.infer<typeof insertKeywordCrawlHistorySchema>;
export type BlogRegistry = typeof blogRegistry.$inferSelect;
export type InsertBlogRegistry = z.infer<typeof insertBlogRegistrySchema>;
export type PostTierCheck = typeof postTierChecks.$inferSelect;
export type InsertPostTierCheck = z.infer<typeof insertPostTierCheckSchema>;
export type AppSettings = typeof appSettings.$inferSelect;
export type InsertAppSettings = z.infer<typeof insertAppSettingsSchema>;
export type SettingsHistory = typeof settingsHistory.$inferSelect;
export type InsertSettingsHistory = z.infer<typeof insertSettingsHistorySchema>;

// New API contract interface - matches specification document
export interface SerpResultsData {
  blogs: {
    blog_id: string;
    blog_name: string; // Added for UI display
    blog_url: string;
    base_rank?: number; // Added for rank badge display
    gathered_posts: number;
  }[];
  keywords: {
    blog_id: string;
    top3: {
      text: string;
      volume: number; // For ranking weight calculation
      raw_volume: number; // For display purposes (0 allowed)
      rank: number;
    }[];
  }[];
  posts: {
    blog_id: string;
    title: string;
    content: string;
    url: string;
  }[];
  summaryByKeyword?: {
    keyword: string;
    searchVolume: number | null;
    totalBlogs: number;
    newBlogs: number;
    phase2ExposedNew: number;
    items: {
      blogName: string;
      blogUrl: string;
      scannedPosts: number;
      titlesSample: string[];
      topKeywords: {
        text: string;
        volume: number | null;
        score: number;
        rank: number | null;
        related: boolean;
      }[];
    }[];
  }[];
  counters: {
    discovered_blogs: number; // Total blogs found during discovery
    blogs: number; // Existing field (total blogs analyzed)
    posts: number;
    selected_keywords: number;
    searched_keywords: number;
    hit_blogs: number; // Blogs with rank 1-10
    volumes_mode: string; // "searchads", "partial", "fallback"
  };
  warnings: string[];
  errors: string[];
}

// History item for job listing
export interface HistoryItem {
  jobId: string;
  createdAt: string; // ISO date string
  baseKeyword: string; // First keyword from job
  counters: {
    discovered_blogs: number;
    hit_blogs: number;
    selected_keywords: number;
    searched_keywords: number;
    volumes_mode: string;
  };
}

// History response
export interface HistoryResponse {
  items: HistoryItem[];
}
