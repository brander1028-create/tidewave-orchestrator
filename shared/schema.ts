import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, timestamp, boolean, json, decimal, unique, primaryKey } from "drizzle-orm/pg-core";
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

// v6 자사 수동 타겟 전용 테이블들

// 블로그 타겟 관리
export const blogTargets = pgTable("blog_targets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  url: text("url").notNull(),
  queries: json("queries").$type<string[]>().notNull(), // ["홍삼", "홍삼스틱"]
  windowMin: integer("window_min").default(1),
  windowMax: integer("window_max").default(10),
  scheduleCron: varchar("schedule_cron").default("0 * * * *"), // 기본 1시간
  owner: varchar("owner").notNull(),
  active: boolean("active").default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// 상품 타겟 관리
export const productTargets = pgTable("product_targets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  productKey: varchar("product_key").notNull().unique(),
  title: text("title").notNull(),
  url: text("url").notNull(),
  queries: json("queries").$type<string[]>().notNull(), // ["홍삼스틱"]
  sortDefault: varchar("sort_default").default("review"), // 'popularity'|'review'|'rating'|'price_asc'|'price_desc'|'recent'
  deviceDefault: varchar("device_default").default("pc"), // 'pc'|'mobile'
  windowMin: integer("window_min").default(1),
  windowMax: integer("window_max").default(40),
  scheduleCron: varchar("schedule_cron").default("0 * * * *"),
  owner: varchar("owner").notNull(),
  active: boolean("active").default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// 랭킹 스냅샷 (v6 실구동)
export const rankSnapshots = pgTable("rank_snapshots", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  targetId: varchar("target_id").notNull(),
  kind: varchar("kind").notNull(), // 'blog' | 'shop'
  query: text("query").notNull(),
  rank: integer("rank"),
  page: integer("page"),
  position: integer("position"),
  sort: varchar("sort"), // 쇼핑몰용
  device: varchar("device").notNull(), // 'pc' | 'mobile'
  timestamp: timestamp("timestamp").notNull().defaultNow(),
  source: varchar("source").notNull(),
  metadata: json("metadata"),
});

// 메트릭 스냅샷 (리뷰/상품 헬스)
export const metricSnapshots = pgTable("metric_snapshots", {
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
  source: varchar("source").notNull(),
  metadata: json("metadata"), // 상위10 리뷰 정보 등
});

// 리뷰 상태 추적 (신규 리뷰 감지용)
export const reviewState = pgTable("review_state", {
  productKey: varchar("product_key").primaryKey(),
  lastReviewId: varchar("last_review_id"),
  lastCheckedAt: timestamp("last_checked_at").notNull().defaultNow(),
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

// v7 롤링 알림 (Top Ticker용)
export const rollingAlerts = pgTable("rolling_alerts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  owner: varchar("owner").notNull(), // multi-tenant
  type: varchar("type").notNull(), // 'alert' | 'success' | 'warning' | 'info'
  icon: varchar("icon"), // lucide icon name
  message: text("message").notNull(),
  time: varchar("time").notNull(), // "30분 전", "1시간 전" 등 
  priority: integer("priority").notNull().default(1),
  isActive: boolean("is_active").notNull().default(true),
  targetId: varchar("target_id"), // 관련 타겟 ID (optional)
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// v7 대시보드 설정 (사용자별 카드 설정)
export const dashboardSettings = pgTable("dashboard_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  owner: varchar("owner").notNull(), // multi-tenant
  cardId: varchar("card_id").notNull(), // 카드 식별자
  visible: boolean("visible").notNull().default(true),
  order: integer("order").notNull().default(1),
  size: varchar("size").default("medium"), // 'small' | 'medium' | 'large'
  position: json("position"), // { x: number, y: number } 등 위치 정보
  config: json("config"), // 카드별 추가 설정
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  // 한 사용자당 카드별로 하나의 설정만 가능
  uniqueOwnerCard: unique("unique_owner_card").on(table.owner, table.cardId),
}));

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

// v6 새로운 테이블 타입들
export type BlogTarget = typeof blogTargets.$inferSelect;
export type InsertBlogTarget = z.infer<typeof insertBlogTargetSchema>;

export type ProductTarget = typeof productTargets.$inferSelect;
export type InsertProductTarget = z.infer<typeof insertProductTargetSchema>;

export type RankSnapshot = typeof rankSnapshots.$inferSelect;
export type InsertRankSnapshot = z.infer<typeof insertRankSnapshotSchema>;

export type MetricSnapshot = typeof metricSnapshots.$inferSelect;
export type InsertMetricSnapshot = z.infer<typeof insertMetricSnapshotSchema>;

export type ReviewState = typeof reviewState.$inferSelect;
export type InsertReviewState = z.infer<typeof insertReviewStateSchema>;

// v7 키워드 매핑 시스템 (단일 소스 오브 트루스)

// 타겟-키워드 매핑 테이블 (기존 queries_json 대체)
export const targetKeywords = pgTable("target_keywords", {
  targetId: varchar("target_id").notNull().references(() => blogTargets.id, { onDelete: "cascade" }),
  keywordText: text("keyword_text").notNull(),
  active: boolean("active").default(true),
  addedBy: varchar("added_by").notNull(),
  ts: timestamp("ts").notNull().defaultNow(),
}, (table) => ({
  // 복합 기본키
  pk: primaryKey({ columns: [table.targetId, table.keywordText], name: "target_keywords_pk" }),
}));

// v7 키워드 그룹 시스템

// 키워드 그룹 (블로그 전용)
export const groups = pgTable("groups", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  owner: varchar("owner").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  color: varchar("color").default("#3b82f6"), // 그룹 표시 색상
  active: boolean("active").default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// 그룹-키워드 관계
export const groupKeywords = pgTable("group_keywords", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  groupId: varchar("group_id").notNull(),
  keyword: text("keyword").notNull(),
  addedAt: timestamp("added_at").notNull().defaultNow(),
});

// 그룹별 일일 집계 지수
export const groupIndexDaily = pgTable("group_index_daily", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  groupId: varchar("group_id").notNull(),
  date: timestamp("date").notNull(),
  avgRank: decimal("avg_rank", { precision: 5, scale: 2 }),
  keywordCount: integer("keyword_count"),
  topRankCount: integer("top_rank_count"), // 상위 10위 내 키워드 수
  improvementCount: integer("improvement_count"), // 순위 상승 키워드 수
  alertCount: integer("alert_count"), // 해당일 알림 수
  indexScore: decimal("index_score", { precision: 5, scale: 2 }), // 종합 점수 (0-100)
});

// 일일 랭킹 집계 (기존 rank_aggregated 대체)
export const rankAggDay = pgTable("rank_agg_day", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  targetId: varchar("target_id").notNull(),
  keyword: text("keyword").notNull(),
  date: timestamp("date").notNull(),
  avgRank: decimal("avg_rank", { precision: 5, scale: 2 }),
  minRank: integer("min_rank"),
  maxRank: integer("max_rank"),
  deltaDaily: integer("delta_daily"),
  deltaWeekly: integer("delta_weekly"),
  checkCount: integer("check_count"), // 해당일 체크 횟수
  volatility: decimal("volatility", { precision: 5, scale: 2 }),
});

// 수집 규칙 (자동 수집 최적화)
export const collectionRules = pgTable("collection_rules", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  owner: varchar("owner").notNull(),
  name: text("name").notNull(),
  conditions: json("conditions").notNull(), // 조건: 키워드, 순위범위, 시간대 등
  actions: json("actions").notNull(), // 액션: 수집빈도, 알림설정 등
  priority: integer("priority").default(5), // 1-10, 높을수록 우선
  active: boolean("active").default(true),
  lastTriggered: timestamp("last_triggered"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// 수집 상태 추적 (비용 가드)
export const collectionState = pgTable("collection_state", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  owner: varchar("owner").notNull(),
  targetId: varchar("target_id").notNull(),
  keyword: text("keyword").notNull(),
  lastCheckAt: timestamp("last_check_at").notNull().defaultNow(),
  lastRank: integer("last_rank"),
  consecutiveFailures: integer("consecutive_failures").default(0),
  checkInterval: varchar("check_interval").default("1h"), // '10m'|'30m'|'1h'|'6h'|'24h'
  nextCheckAt: timestamp("next_check_at"),
  costScore: decimal("cost_score", { precision: 5, scale: 2 }).default(sql`50.0`), // 비용 효율성 점수
  autoStopped: boolean("auto_stopped").default(false), // 30일 미진입시 자동 중지
  autoStoppedAt: timestamp("auto_stopped_at"),
});

// v7 키워드 매핑 타입 정의들
export type TargetKeyword = typeof targetKeywords.$inferSelect;
export type InsertTargetKeyword = z.infer<typeof insertTargetKeywordSchema>;

// v7 타입 정의들
export type Group = typeof groups.$inferSelect;
export type InsertGroup = z.infer<typeof insertGroupSchema>;

export type GroupKeyword = typeof groupKeywords.$inferSelect;
export type InsertGroupKeyword = z.infer<typeof insertGroupKeywordSchema>;

export type GroupIndexDaily = typeof groupIndexDaily.$inferSelect;
export type InsertGroupIndexDaily = z.infer<typeof insertGroupIndexDailySchema>;

export type RankAggDay = typeof rankAggDay.$inferSelect;
export type InsertRankAggDay = z.infer<typeof insertRankAggDaySchema>;

export type CollectionRule = typeof collectionRules.$inferSelect;
export type InsertCollectionRule = z.infer<typeof insertCollectionRuleSchema>;

export type CollectionState = typeof collectionState.$inferSelect;
export type InsertCollectionState = z.infer<typeof insertCollectionStateSchema>;

export type RollingAlert = typeof rollingAlerts.$inferSelect;
export type DashboardSettings = typeof dashboardSettings.$inferSelect;

// v6 Insert 스키마들
export const insertBlogTargetSchema = createInsertSchema(blogTargets).omit({
  id: true,
  createdAt: true,
});

export const insertProductTargetSchema = createInsertSchema(productTargets).omit({
  id: true,
  createdAt: true,
});

export const insertRankSnapshotSchema = createInsertSchema(rankSnapshots).omit({
  id: true,
  timestamp: true,
});

export const insertMetricSnapshotSchema = createInsertSchema(metricSnapshots).omit({
  id: true,
  timestamp: true,
});

export const insertReviewStateSchema = createInsertSchema(reviewState).omit({
  lastCheckedAt: true,
});

// Update Review State schema
export const updateReviewStateSchema = z.object({
  lastReviewId: z.string().optional(),
});

// Blog check API schema for v6 real-time scraping
export const blogCheckSchema = z.object({
  targetId: z.string().min(1, "Target ID는 필수입니다"),
  query: z.string().min(1, "검색 키워드는 필수입니다"),
  device: z.enum(['pc', 'mobile']).default('pc'),
  maxPages: z.number().min(1).max(5).default(3),
});

// v7 키워드 매핑 Insert 스키마
export const insertTargetKeywordSchema = createInsertSchema(targetKeywords).omit({
  ts: true,
});

// v7 Insert 스키마들
export const insertGroupSchema = createInsertSchema(groups).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertGroupKeywordSchema = createInsertSchema(groupKeywords).omit({
  id: true,
  addedAt: true,
});

export const insertGroupIndexDailySchema = createInsertSchema(groupIndexDaily).omit({
  id: true,
});

export const insertRankAggDaySchema = createInsertSchema(rankAggDay).omit({
  id: true,
});

export const insertCollectionRuleSchema = createInsertSchema(collectionRules).omit({
  id: true,
  lastTriggered: true,
  createdAt: true,
});

export const insertCollectionStateSchema = createInsertSchema(collectionState).omit({
  id: true,
  lastCheckAt: true,
  autoStoppedAt: true,
});

// v7 Dashboard APIs Insert 스키마들
export const insertRollingAlertSchema = createInsertSchema(rollingAlerts).omit({
  id: true,
  createdAt: true,
});

export const insertDashboardSettingsSchema = createInsertSchema(dashboardSettings).omit({
  id: true,
  updatedAt: true,
});

export type InsertRollingAlert = z.infer<typeof insertRollingAlertSchema>;
export type InsertDashboardSettings = z.infer<typeof insertDashboardSettingsSchema>;
