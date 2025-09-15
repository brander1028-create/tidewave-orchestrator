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

export const insertSettingsSchema = createInsertSchema(settings).omit({
  id: true,
  updatedAt: true,
});

// Types
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
export type InsertSettings = z.infer<typeof insertSettingsSchema>;
