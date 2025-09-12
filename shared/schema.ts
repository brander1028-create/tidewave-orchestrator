import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// New schema for keyword-driven SERP analysis
export const serpJobs = pgTable("serp_jobs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  keywords: text("keywords").array().notNull(), // Input keywords array
  minRank: integer("min_rank").notNull().default(2),
  maxRank: integer("max_rank").notNull().default(15),
  status: text("status").notNull().default("pending"), // pending, running, completed, failed, cancelled
  progress: integer("progress").default(0), // 0-100
  currentStep: text("current_step"), // discovering_blogs, analyzing_posts, checking_rankings
  currentStepDetail: text("current_step_detail"), // "홍삼스틱" 키워드 검색 중... (3/5)
  totalSteps: integer("total_steps").default(3),
  completedSteps: integer("completed_steps").default(0),
  detailedProgress: jsonb("detailed_progress"), // { currentKeyword, processedKeywords, totalKeywords, currentBlog, etc }
  errorMessage: text("error_message"),
  results: jsonb("results"), // final analysis results
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const discoveredBlogs = pgTable("discovered_blogs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  jobId: varchar("job_id").references(() => serpJobs.id).notNull(),
  seedKeyword: text("seed_keyword").notNull(), // Original keyword that led to this blog
  rank: integer("rank").notNull(), // Position in SERP (2-15)
  blogName: text("blog_name").notNull(),
  blogUrl: text("blog_url").notNull(),
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
  postId: varchar("post_id").references(() => analyzedPosts.id).notNull(),
  keyword: text("keyword").notNull(),
  searchVolume: integer("search_volume"), // From Naver DataLab
  score: integer("score").notNull(), // Calculated relevance score
  rank: integer("rank"), // t1=1, t2=2, t3=3 (top 3 keywords per post)
  serpRank: integer("serp_rank"), // Position in Naver search results (1-10) or null
  createdAt: timestamp("created_at").defaultNow(),
});

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

// Types for new entities
export type SerpJob = typeof serpJobs.$inferSelect;
export type InsertSerpJob = z.infer<typeof insertSerpJobSchema>;
export type DiscoveredBlog = typeof discoveredBlogs.$inferSelect;
export type InsertDiscoveredBlog = z.infer<typeof insertDiscoveredBlogSchema>;
export type AnalyzedPost = typeof analyzedPosts.$inferSelect;
export type InsertAnalyzedPost = z.infer<typeof insertAnalyzedPostSchema>;
export type ExtractedKeyword = typeof extractedKeywords.$inferSelect;
export type InsertExtractedKeyword = z.infer<typeof insertExtractedKeywordSchema>;
