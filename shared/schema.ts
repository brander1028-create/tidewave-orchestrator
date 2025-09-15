import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, timestamp, boolean, json, decimal } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// 순위 시계열 원본 데이터
export const rankTimeSeries = pgTable("rank_time_series", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  targetId: varchar("target_id").notNull(),
  kind: varchar("kind").notNull(), // 'blog' | 'shop'
  query: text("query").notNull(),
  sort: varchar("sort"), // for shopping: 'popularity' | 'review' | 'rating' | 'price_asc' | 'price_desc' | 'recent'
  device: varchar("device").notNull(), // 'pc' | 'mobile'
  timestamp: timestamp("timestamp").notNull().defaultNow(),
  rank: integer("rank"),
  page: integer("page"),
  position: integer("position"),
  source: varchar("source").notNull(),
  metadata: json("metadata"),
});

// 순위 집계 데이터 (성능 최적화용)
export const rankAggregated = pgTable("rank_aggregated", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  targetId: varchar("target_id").notNull(),
  date: timestamp("date").notNull(),
  rankAvg: decimal("rank_avg", { precision: 5, scale: 2 }),
  rankMin: integer("rank_min"),
  rankMax: integer("rank_max"),
  deltaDaily: integer("delta_daily"),
  deltaWeekly: integer("delta_weekly"),
  deltaMonthly: integer("delta_monthly"),
  volatility7d: decimal("volatility_7d", { precision: 5, scale: 2 }),
});

// 메트릭 시계열 (리뷰/상품 헬스)
export const metricTimeSeries = pgTable("metric_time_series", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  productKey: varchar("product_key").notNull(),
  timestamp: timestamp("timestamp").notNull().defaultNow(),
  starAvg: decimal("star_avg", { precision: 3, scale: 2 }),
  reviewCount: integer("review_count"),
  photoRatio: decimal("photo_ratio", { precision: 3, scale: 2 }),
  newReviews7d: integer("new_reviews_7d"),
  newReviews30d: integer("new_reviews_30d"),
  qaCount: integer("qa_count"),
  price: integer("price"),
  stockFlag: boolean("stock_flag"),
});

// 이벤트/알림
export const events = pgTable("events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  targetId: varchar("target_id").notNull(),
  type: varchar("type").notNull(), // 'NewPost' | 'NewReview' | 'AbuseReview' | 'StaffSubmit' | 'PriceChange' | 'StockOut' | 'AdOnOff'
  actor: varchar("actor"),
  timestamp: timestamp("timestamp").notNull().defaultNow(),
  payload: json("payload"),
  severity: varchar("severity").notNull(), // 'low' | 'medium' | 'high' | 'critical'
});

export const alerts = pgTable("alerts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  targetId: varchar("target_id").notNull(),
  rule: varchar("rule").notNull(),
  timestamp: timestamp("timestamp").notNull().defaultNow(),
  prevRank: integer("prev_rank"),
  currRank: integer("curr_rank"),
  delta: integer("delta"),
  reason: text("reason"),
  cooldownUntil: timestamp("cooldown_until"),
  seen: boolean("seen").default(false),
});

// 제출함/타겟/트래킹
export const submissions = pgTable("submissions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  owner: varchar("owner").notNull(),
  type: varchar("type").notNull(), // 'blog' | 'product' | 'keyword'
  payload: json("payload").notNull(),
  status: varchar("status").notNull().default("pending"), // 'pending' | 'approved' | 'rejected'
  timestamp: timestamp("timestamp").notNull().defaultNow(),
  comment: text("comment"),
});

export const trackedTargets = pgTable("tracked_targets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  owner: varchar("owner").notNull(),
  kind: varchar("kind").notNull(), // 'blog' | 'shop'
  query: text("query"),
  productKey: varchar("product_key"),
  url: text("url"),
  windowMin: integer("window_min").default(1),
  windowMax: integer("window_max").default(10),
  thresholds: json("thresholds"),
  schedule: varchar("schedule").default("1h"), // '10m' | '30m' | '1h' | '6h' | '12h' | '24h'
  enabled: boolean("enabled").default(true),
  tags: json("tags"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// 설정
export const settings = pgTable("settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  key: varchar("key").notNull().unique(),
  value: json("value").notNull(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// 수동 블로그 입력 데이터
export const manualBlogEntries = pgTable("manual_blog_entries", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  keyword: text("keyword").notNull(),
  url: text("url").notNull(),
  title: text("title").notNull(),
  rank: integer("rank"),
  notes: text("notes"), // 특이사항
  submittedBy: varchar("submitted_by").notNull(), // 입력자
  submittedAt: timestamp("submitted_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  isActive: boolean("is_active").default(true),
});

// 수익성 계산 및 최적화 점수
export const profitabilityAnalysis = pgTable("profitability_analysis", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  productKey: varchar("product_key").notNull(),
  timestamp: timestamp("timestamp").notNull().defaultNow(),
  
  // 비용 구조
  productCost: decimal("product_cost", { precision: 10, scale: 2 }),
  shippingCost: decimal("shipping_cost", { precision: 10, scale: 2 }),
  advertisingCost: decimal("advertising_cost", { precision: 10, scale: 2 }),
  platformFee: decimal("platform_fee", { precision: 10, scale: 2 }),
  otherCosts: decimal("other_costs", { precision: 10, scale: 2 }),
  
  // 매출 데이터
  sellingPrice: decimal("selling_price", { precision: 10, scale: 2 }),
  avgDailySales: integer("avg_daily_sales"),
  conversionRate: decimal("conversion_rate", { precision: 5, scale: 4 }),
  
  // 계산된 수익성 지표
  grossProfit: decimal("gross_profit", { precision: 10, scale: 2 }),
  grossMargin: decimal("gross_margin", { precision: 5, scale: 4 }),
  roi: decimal("roi", { precision: 5, scale: 4 }),
  breakEvenPoint: integer("break_even_point"),
  
  // 최적화 점수 (0-100)
  optimizationScore: integer("optimization_score"),
  
  // 최적화 제안사항
  recommendations: json("recommendations"),
  
  // 경쟁력 분석
  competitivenessScore: integer("competitiveness_score"),
  marketPosition: varchar("market_position"),
});

// 리스팅 최적화 체크리스트
export const listingOptimization = pgTable("listing_optimization", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  productKey: varchar("product_key").notNull(),
  timestamp: timestamp("timestamp").notNull().defaultNow(),
  
  // SEO 최적화 점수
  titleScore: integer("title_score"), // 0-100
  descriptionScore: integer("description_score"),
  keywordDensity: decimal("keyword_density", { precision: 5, scale: 2 }),
  
  // 이미지 최적화
  imageCount: integer("image_count"),
  imageQualityScore: integer("image_quality_score"),
  hasLifestyleImages: boolean("has_lifestyle_images"),
  
  // 가격 경쟁력
  priceCompetitiveness: integer("price_competitiveness"),
  pricePosition: varchar("price_position"), // 'lowest' | 'competitive' | 'premium' | 'overpriced'
  
  // 리뷰 및 평점
  reviewOptimization: integer("review_optimization"),
  avgRating: decimal("avg_rating", { precision: 3, scale: 2 }),
  reviewCount: integer("review_count"),
  
  // 카테고리 최적화
  categoryAccuracy: integer("category_accuracy"),
  attributeCompleteness: integer("attribute_completeness"),
  
  // 전체 최적화 점수
  overallScore: integer("overall_score"),
  grade: varchar("grade"), // 'A+' | 'A' | 'B+' | 'B' | 'C+' | 'C' | 'D'
  
  // 개선 제안
  improvements: json("improvements"),
});

// Type exports
export type RankTimeSeries = typeof rankTimeSeries.$inferSelect;
export type InsertRankTimeSeries = z.infer<typeof insertRankTimeSeriesSchema>;

export type RankAggregated = typeof rankAggregated.$inferSelect;
export type MetricTimeSeries = typeof metricTimeSeries.$inferSelect;
export type Event = typeof events.$inferSelect;
export type Alert = typeof alerts.$inferSelect;
export type Submission = typeof submissions.$inferSelect;
export type InsertSubmission = z.infer<typeof insertSubmissionSchema>;
export type TrackedTarget = typeof trackedTargets.$inferSelect;
export type InsertTrackedTarget = z.infer<typeof insertTrackedTargetSchema>;
export type Settings = typeof settings.$inferSelect;
export type ManualBlogEntry = typeof manualBlogEntries.$inferSelect;
export type InsertManualBlogEntry = z.infer<typeof insertManualBlogEntrySchema>;

export type ProfitabilityAnalysis = typeof profitabilityAnalysis.$inferSelect;
export type InsertProfitabilityAnalysis = z.infer<typeof insertProfitabilityAnalysisSchema>;
export type ListingOptimization = typeof listingOptimization.$inferSelect;
export type InsertListingOptimization = z.infer<typeof insertListingOptimizationSchema>;

// Insert schemas
export const insertRankTimeSeriesSchema = createInsertSchema(rankTimeSeries).omit({
  id: true,
  timestamp: true,
});

export const insertSubmissionSchema = createInsertSchema(submissions).omit({
  id: true,
  timestamp: true,
});

export const insertTrackedTargetSchema = createInsertSchema(trackedTargets).omit({
  id: true,
  createdAt: true,
});

export const insertProfitabilityAnalysisSchema = createInsertSchema(profitabilityAnalysis).omit({
  id: true,
  timestamp: true,
});

export const insertListingOptimizationSchema = createInsertSchema(listingOptimization).omit({
  id: true,
  timestamp: true,
});

export const insertSettingsSchema = createInsertSchema(settings).omit({
  id: true,
  updatedAt: true,
});

export const insertManualBlogEntrySchema = createInsertSchema(manualBlogEntries).omit({
  id: true,
  submittedAt: true,
  updatedAt: true,
});

export type InsertSettings = z.infer<typeof insertSettingsSchema>;
