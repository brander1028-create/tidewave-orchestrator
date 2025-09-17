import { 
  type RankTimeSeries, type InsertRankTimeSeries,
  type RankAggregated, type MetricTimeSeries, 
  type Event, type Alert,
  type Submission, type InsertSubmission,
  type TrackedTarget, type InsertTrackedTarget,
  type Settings,
  type ManualBlogEntry, type InsertManualBlogEntry,
  // v6 새로운 타입들
  type BlogTarget, type InsertBlogTarget,
  type ProductTarget, type InsertProductTarget,
  type RankSnapshot, type InsertRankSnapshot,
  type MetricSnapshot, type InsertMetricSnapshot,
  type ReviewState, type InsertReviewState,
  // v7 키워드 매핑 타입들
  type TargetKeyword, type InsertTargetKeyword,
  // v7 키워드 그룹 타입들
  type Group, type InsertGroup,
  type GroupKeyword, type InsertGroupKeyword,
  type GroupIndexDaily, type InsertGroupIndexDaily,
  type RankAggDay, type InsertRankAggDay,
  type CollectionRule, type InsertCollectionRule,
  type CollectionState, type InsertCollectionState,
  // v7 대시보드 타입들
  type RollingAlert, type InsertRollingAlert,
  type DashboardSettings, type InsertDashboardSettings,
  rankTimeSeries,
  metricTimeSeries,
  events,
  alerts,
  submissions,
  trackedTargets,
  settings,
  manualBlogEntries,
  // v6 새로운 테이블들
  blogTargets,
  productTargets,
  rankSnapshots,
  metricSnapshots,
  reviewState,
  // v7 키워드 매핑 테이블들
  targetKeywords,
  // v7 키워드 그룹 테이블들
  groups,
  groupKeywords,
  groupIndexDaily,
  rankAggDay,
  collectionRules,
  collectionState,
  // v7 대시보드 테이블들
  rollingAlerts,
  dashboardSettings
} from "@shared/schema";
import { randomUUID } from "crypto";
import { db } from "./db";
import { eq, desc, asc, and, gte, lte, sql } from "drizzle-orm";

export interface IStorage {
  // Rank operations
  getRankSeries(targetId: string, range?: string): Promise<RankTimeSeries[]>;
  insertRankData(data: InsertRankTimeSeries): Promise<RankTimeSeries>;
  getRankCompare(targetIds: string[], range?: string): Promise<RankTimeSeries[]>;
  getRankHistory(targetId: string, period?: string): Promise<RankTimeSeries[]>;
  
  // Events and alerts
  getEvents(targetId?: string, range?: string): Promise<Event[]>;
  getAlerts(seen?: boolean): Promise<Alert[]>;
  markAlertSeen(alertId: string): Promise<void>;
  
  // Submissions
  getSubmissions(status?: string): Promise<Submission[]>;
  createSubmission(data: InsertSubmission): Promise<Submission>;
  updateSubmissionStatus(id: string, status: string, comment?: string): Promise<Submission>;
  
  // Tracked targets
  getTrackedTargets(owner?: string): Promise<TrackedTarget[]>;
  createTrackedTarget(data: InsertTrackedTarget): Promise<TrackedTarget>;
  updateTrackedTarget(id: string, updates: Partial<TrackedTarget>): Promise<TrackedTarget>;
  deleteTrackedTarget(id: string): Promise<void>;
  
  // Settings
  getSettings(): Promise<Settings[]>;
  updateSetting(key: string, value: any): Promise<Settings>;
  getSetting(key: string): Promise<Settings | undefined>;
  
  // Manual Blog Entries
  getManualBlogEntries(): Promise<ManualBlogEntry[]>;
  createManualBlogEntry(data: InsertManualBlogEntry): Promise<ManualBlogEntry>;
  updateManualBlogEntry(id: string, updates: Partial<ManualBlogEntry>): Promise<ManualBlogEntry>;
  deleteManualBlogEntry(id: string): Promise<void>;
  
  // v6 Blog Targets (자사 블로그 타겟 관리)
  getBlogTargets(owner?: string): Promise<BlogTarget[]>;
  createBlogTarget(data: InsertBlogTarget): Promise<BlogTarget>;
  updateBlogTarget(id: string, updates: Partial<BlogTarget>): Promise<BlogTarget>;
  deleteBlogTarget(id: string): Promise<void>;
  getBlogTarget(id: string): Promise<BlogTarget | null>;
  // Owner-aware methods for security
  getBlogTargetById(owner: string, id: string): Promise<BlogTarget | null>;
  updateBlogTargetByOwner(owner: string, id: string, updates: Partial<BlogTarget>): Promise<BlogTarget | null>;
  deleteBlogTargetByOwner(owner: string, id: string): Promise<boolean>;

  // v6 Product Targets (자사 상품 타겟 관리)
  getProductTargets(owner?: string): Promise<ProductTarget[]>;
  createProductTarget(data: InsertProductTarget): Promise<ProductTarget>;
  updateProductTarget(id: string, updates: Partial<ProductTarget>): Promise<ProductTarget>;
  deleteProductTarget(id: string): Promise<void>;
  getProductTarget(id: string): Promise<ProductTarget | null>;
  // Owner-aware methods for security  
  getProductTargetById(owner: string, id: string): Promise<ProductTarget | null>;
  updateProductTargetByOwner(owner: string, id: string, updates: Partial<ProductTarget>): Promise<ProductTarget | null>;
  deleteProductTargetByOwner(owner: string, id: string): Promise<boolean>;

  // v6 Rank Snapshots (실시간 랭킹 스냅샷) - Owner-aware methods for security
  getRankSnapshots(owner: string, targetId?: string, kind?: string, range?: string): Promise<RankSnapshot[]>;
  insertRankSnapshot(owner: string, data: InsertRankSnapshot): Promise<RankSnapshot>;
  getRankSnapshotHistory(owner: string, targetId: string, kind: string, query?: string, sort?: string, device?: string, range?: string): Promise<RankSnapshot[]>;

  // v6 Metric Snapshots (리뷰/상품 헬스) - Owner-aware methods for security
  getMetricSnapshots(owner: string, productKey?: string, range?: string): Promise<MetricSnapshot[]>;
  insertMetricSnapshot(owner: string, data: InsertMetricSnapshot): Promise<MetricSnapshot>;
  getMetricHistory(owner: string, productKey: string, range?: string): Promise<MetricSnapshot[]>;

  // v6 Review State (신규 리뷰 감지) - Owner-aware methods for security
  getReviewState(owner: string, productKey: string): Promise<ReviewState | null>;
  updateReviewState(owner: string, data: InsertReviewState): Promise<ReviewState>;
  
  // v7 Group CRUD operations (키워드 그룹 관리) - Owner-aware methods for security
  getGroups(owner: string): Promise<Group[]>;
  getGroupById(owner: string, id: string): Promise<Group | null>;
  createGroup(data: InsertGroup): Promise<Group>;
  updateGroupByOwner(owner: string, id: string, updates: Partial<Group>): Promise<Group | null>;
  deleteGroupByOwner(owner: string, id: string): Promise<boolean>;

  // v7 Group Keywords operations (그룹 키워드 관리)
  getGroupKeywords(groupId: string): Promise<GroupKeyword[]>;
  addGroupKeyword(data: InsertGroupKeyword): Promise<GroupKeyword>;
  removeGroupKeyword(groupId: string, keyword: string): Promise<boolean>;

  // v7 Group Index and Analytics (그룹 인덱스 및 집계)
  getGroupIndexDaily(groupId: string, range?: string): Promise<GroupIndexDaily[]>;
  insertGroupIndexDaily(data: InsertGroupIndexDaily): Promise<GroupIndexDaily>;

  // v7 Rank Aggregation Daily (일일 랭킹 집계)
  getRankAggDay(targetId: string, keyword: string, range?: string): Promise<RankAggDay[]>;
  insertRankAggDay(data: InsertRankAggDay): Promise<RankAggDay>;

  // v7 Collection Rules and State (수집 규칙 및 상태) - Owner-aware methods for security
  getCollectionRules(owner: string): Promise<CollectionRule[]>;
  createCollectionRule(data: InsertCollectionRule): Promise<CollectionRule>;
  updateCollectionRuleByOwner(owner: string, id: string, updates: Partial<CollectionRule>): Promise<CollectionRule | null>;
  deleteCollectionRuleByOwner(owner: string, id: string): Promise<boolean>;
  getCollectionState(owner: string, targetId: string, keyword: string): Promise<CollectionState | null>;
  updateCollectionState(owner: string, data: InsertCollectionState): Promise<CollectionState>;
  
  // v7 Database Page APIs (데이터베이스 페이지용 API)
  getKeywordRepository(owner: string): Promise<any[]>; // 키워드 보관소 조회
  updateKeywordStatus(owner: string, keyword: string, status: string): Promise<boolean>; // 키워드 상태 변경
  getTargetManagement(owner: string): Promise<any[]>; // 타겟 관리 조회 (상태, 스케줄 포함)
  updateTargetSchedule(owner: string, targetId: string, schedule: any): Promise<boolean>; // 타겟 스케줄 변경
  getSnapshotAggregation(owner: string, range?: string): Promise<any[]>; // 스냅샷 집계 조회
  getTokenUsageStats(owner: string): Promise<any>; // 토큰 사용량 통계
  
  // v7 Target Keywords operations (타겟-키워드 매핑 관리) - Owner-aware methods for security
  getTargetKeywords(targetId: string): Promise<TargetKeyword[]>; // 타겟의 키워드 목록 조회
  addTargetKeywords(owner: string, targetId: string, keywords: string[], addedBy: string): Promise<TargetKeyword[]>; // 키워드 추가
  removeTargetKeywords(owner: string, targetId: string, keywords: string[]): Promise<void>; // 키워드 제거
  getBlogTargetsWithKeywords(owner: string): Promise<(BlogTarget & { keywords: string[] })[]>; // 키워드 포함된 블로그 타겟 조회

  // v7 Dashboard APIs (대시보드용 API)
  getRollingAlerts(owner: string, isActive?: boolean): Promise<RollingAlert[]>; // Top Ticker용 롤링 알림 조회
  createRollingAlert(data: InsertRollingAlert): Promise<RollingAlert>; // 롤링 알림 생성
  updateRollingAlertStatus(owner: string, alertId: string, isActive: boolean): Promise<boolean>; // 알림 상태 변경
  getDashboardSettings(owner: string): Promise<DashboardSettings[]>; // 사용자별 대시보드 카드 설정 조회
  updateDashboardSettings(owner: string, cardId: string, settings: Partial<InsertDashboardSettings>): Promise<DashboardSettings>; // 카드 설정 업데이트
  
  // Analytics
  getKPIData(period?: string): Promise<any>;
  getRankDistribution(): Promise<any>;
  getTopMovers(direction: "up" | "down", limit?: number): Promise<any>;
  getHeatmapData(period?: string): Promise<any>;
  getCompetitorAnalysis(targetId: string): Promise<any>;
  
  // Reviews
  getReviewRankings(productKey: string): Promise<any[]>;
  getReviewHealth(productKey: string): Promise<any>;
  getAbuseDetection(productKey: string): Promise<any>;
  
  // Export
  createExportJob(config: any): Promise<any>;
  getExportJobs(): Promise<any[]>;
  getExportDownload(jobId: string): Promise<any>;
  updateExportJobStatus(jobId: string, status: string, progress?: number): Promise<any>;
  processExportJob(jobId: string): Promise<void>;
}

// Database storage implementation
export class DatabaseStorage implements IStorage {
  async getRankSeries(targetId: string, range = "30d"): Promise<RankTimeSeries[]> {
    const days = parseInt(range.replace('d', ''));
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    return await db.select()
      .from(rankTimeSeries)
      .where(and(
        eq(rankTimeSeries.targetId, targetId),
        gte(rankTimeSeries.timestamp, cutoffDate)
      ))
      .orderBy(desc(rankTimeSeries.timestamp));
  }

  async insertRankData(data: InsertRankTimeSeries): Promise<RankTimeSeries> {
    const [result] = await db.insert(rankTimeSeries)
      .values(data)
      .returning();
    return result;
  }

  async getRankCompare(targetIds: string[], range = "30d"): Promise<RankTimeSeries[]> {
    const days = parseInt(range.replace('d', ''));
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    return await db.select()
      .from(rankTimeSeries)
      .where(and(
        sql`${rankTimeSeries.targetId} = ANY(${targetIds})`,
        gte(rankTimeSeries.timestamp, cutoffDate)
      ))
      .orderBy(desc(rankTimeSeries.timestamp));
  }

  async getRankHistory(targetId: string, period = "30d"): Promise<RankTimeSeries[]> {
    return this.getRankSeries(targetId, period);
  }

  async getEvents(targetId?: string, range = "30d"): Promise<Event[]> {
    const days = parseInt(range.replace('d', ''));
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    const conditions = [gte(events.timestamp, cutoffDate)];
    if (targetId) {
      conditions.push(eq(events.targetId, targetId));
    }

    return await db.select()
      .from(events)
      .where(and(...conditions))
      .orderBy(desc(events.timestamp));
  }

  async getAlerts(seen?: boolean): Promise<Alert[]> {
    const conditions = [];
    if (seen !== undefined) {
      conditions.push(eq(alerts.seen, seen));
    }

    return await db.select()
      .from(alerts)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(alerts.timestamp));
  }

  async markAlertSeen(alertId: string): Promise<void> {
    await db.update(alerts)
      .set({ seen: true })
      .where(eq(alerts.id, alertId));
  }

  async getSubmissions(status?: string): Promise<Submission[]> {
    const conditions = [];
    if (status) {
      conditions.push(eq(submissions.status, status));
    }

    return await db.select()
      .from(submissions)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(submissions.timestamp));
  }

  async createSubmission(data: InsertSubmission): Promise<Submission> {
    const [result] = await db.insert(submissions)
      .values(data)
      .returning();
    return result;
  }

  async updateSubmissionStatus(id: string, status: string, comment?: string): Promise<Submission> {
    const updateData: any = { status };
    if (comment) updateData.comment = comment;

    const [result] = await db.update(submissions)
      .set(updateData)
      .where(eq(submissions.id, id))
      .returning();
    return result;
  }

  async getTrackedTargets(owner?: string): Promise<TrackedTarget[]> {
    const conditions = [];
    if (owner) {
      conditions.push(eq(trackedTargets.owner, owner));
    }

    return await db.select()
      .from(trackedTargets)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(trackedTargets.createdAt));
  }

  async createTrackedTarget(data: InsertTrackedTarget): Promise<TrackedTarget> {
    const [result] = await db.insert(trackedTargets)
      .values(data)
      .returning();
    return result;
  }

  async updateTrackedTarget(id: string, updates: Partial<TrackedTarget>): Promise<TrackedTarget> {
    const [result] = await db.update(trackedTargets)
      .set(updates)
      .where(eq(trackedTargets.id, id))
      .returning();
    return result;
  }

  async deleteTrackedTarget(id: string): Promise<void> {
    await db.delete(trackedTargets)
      .where(eq(trackedTargets.id, id));
  }

  async getSettings(): Promise<Settings[]> {
    return await db.select()
      .from(settings)
      .orderBy(asc(settings.key));
  }

  async updateSetting(key: string, value: any): Promise<Settings> {
    // Try to update existing setting first
    const existing = await db.select()
      .from(settings)
      .where(eq(settings.key, key))
      .limit(1);

    if (existing.length > 0) {
      const [result] = await db.update(settings)
        .set({ value, updatedAt: new Date() })
        .where(eq(settings.key, key))
        .returning();
      return result;
    } else {
      // Create new setting
      const [result] = await db.insert(settings)
        .values({ key, value })
        .returning();
      return result;
    }
  }

  async getSetting(key: string): Promise<Settings | undefined> {
    const [result] = await db.select()
      .from(settings)
      .where(eq(settings.key, key))
      .limit(1);
    return result;
  }

  // Analytics methods with mock data for now
  async getKPIData(period = "30d"): Promise<any> {
    // This would need complex aggregation queries
    return {
      totalTargets: 25,
      avgRank: 12.5,
      rankingUp: 8,
      rankingDown: 5,
      weeklyChange: 2.3,
      monthlyChange: -1.8,
      volatility: 15.2,
      sov: 0.42
    };
  }

  async getRankDistribution(): Promise<any> {
    return [
      { range: "1-3", count: 4, percentage: 16 },
      { range: "4-10", count: 8, percentage: 32 },
      { range: "11-20", count: 7, percentage: 28 },
      { range: "21-50", count: 4, percentage: 16 },
      { range: "51+", count: 2, percentage: 8 }
    ];
  }

  async getTopMovers(direction: "up" | "down", limit = 5): Promise<any> {
    return Array.from({ length: limit }, (_, i) => ({
      id: `target-${i + 1}`,
      query: `키워드 ${i + 1}`,
      prevRank: direction === "up" ? 20 + i * 3 : 5 + i * 2,
      currRank: direction === "up" ? 8 + i * 2 : 15 + i * 3,
      change: direction === "up" ? -(12 + i) : (10 + i),
      url: `https://example.com/product/${i + 1}`
    }));
  }

  async getHeatmapData(period = "30d"): Promise<any> {
    const data = [];
    const today = new Date();
    for (let i = 0; i < 30; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      data.push({
        date: date.toISOString().split('T')[0],
        value: Math.floor(Math.random() * 4) + 1
      });
    }
    return data;
  }

  async getCompetitorAnalysis(targetId: string): Promise<any> {
    return {
      our_rank: 8,
      competitors: [
        { name: "경쟁사 A", rank: 5, change: -2 },
        { name: "경쟁사 B", rank: 12, change: 3 },
        { name: "경쟁사 C", rank: 15, change: 0 }
      ]
    };
  }

  async getReviewRankings(productKey: string): Promise<any[]> {
    return Array.from({ length: 10 }, (_, i) => ({
      rank: i + 1,
      reviewer: `사용자${i + 1}`,
      rating: 4 + Math.random(),
      helpfulCount: Math.floor(Math.random() * 50) + 5,
      date: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000),
      change: Math.floor(Math.random() * 7) - 3
    }));
  }

  async getReviewHealth(productKey: string): Promise<any> {
    return {
      starAvg: 4.2,
      reviewCount: 1248,
      photoRatio: 0.73,
      newReviews7d: 15,
      newReviews30d: 89,
      qaCount: 23
    };
  }

  async getAbuseDetection(productKey: string): Promise<any> {
    return {
      suspiciousReviews: 3,
      abuseScore: 0.15,
      flaggedKeywords: ["가짜", "조작"],
      riskLevel: "low"
    };
  }

  async createExportJob(config: any): Promise<any> {
    const job = {
      id: randomUUID(),
      type: config.type,
      status: "processing",
      progress: 0,
      createdAt: new Date(),
      config
    };
    return job;
  }

  async getExportJobs(): Promise<any[]> {
    return [];
  }

  async getExportDownload(jobId: string): Promise<any> {
    const mimeTypes: Record<string, string> = {
      csv: "text/csv",
      xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      json: "application/json",
      pdf: "application/pdf"
    };
    
    return {
      filename: `export-${jobId}.csv`,
      mimeType: mimeTypes["csv"],
      data: "키워드,순위,변동\n홍삼,5,+2\n홍삼스틱,8,-1"
    };
  }

  async updateExportJobStatus(jobId: string, status: string, progress = 0): Promise<any> {
    return { id: jobId, status, progress };
  }

  async processExportJob(jobId: string): Promise<void> {
    // Export processing logic would go here
  }

  // Initialize database with default settings if needed
  async initializeDefaults(): Promise<void> {
    const existingSettings = await this.getSettings();
    if (existingSettings.length === 0) {
      const defaultSettings = [
        { key: 'checkInterval', value: { interval: '1h' } },
        { key: 'alertCooldown', value: { cooldown: '6h' } },
        { key: 'rateLimits', value: { perMin: 60, perDay: 10000 } },
        { key: 'cacheTTL', value: { ttl: '10m' } },
        { key: 'defaultDevice', value: 'mobile' },
        { key: 'autoCheck', value: true },
        { key: 'dataRetention', value: '90d' },
        { key: 'dailySummaryTime', value: '09:00' },
      ];

      for (const setting of defaultSettings) {
        await this.updateSetting(setting.key, setting.value);
      }
    }

    // Initialize default blog targets if none exist
    const existingBlogTargets = await this.getBlogTargets('system');
    if (existingBlogTargets.length === 0) {
      const defaultBlogTargets = [
        {
          title: '홍삼 건강 블로그',
          url: 'https://blog.naver.com/ginseng_health',
          queries: ['홍삼', '홍삼 효능', '홍삼 추천'],
          windowMin: 1,
          windowMax: 10,
          scheduleCron: '0 * * * *',
          owner: 'system',
          active: true
        },
        {
          title: '프리미엄 건강식품 리뷰',
          url: 'https://blog.naver.com/premium_health',
          queries: ['홍삼스틱', '홍삼 가격', '홍삼 제품'],
          windowMin: 1,
          windowMax: 15,
          scheduleCron: '0 */2 * * *',
          owner: 'system',
          active: true
        },
        {
          title: '자연의 힘 웰니스',
          url: 'https://blog.naver.com/nature_wellness',
          queries: ['정관장 홍삼', '홍삼 복용법', '홍삼 부작용'],
          windowMin: 1,
          windowMax: 20,
          scheduleCron: '0 */3 * * *',
          owner: 'system',
          active: true
        },
        {
          title: '건강한 라이프스타일',
          url: 'https://blog.naver.com/healthy_lifestyle',
          queries: ['고려홍삼', '홍삼 선택법'],
          windowMin: 1,
          windowMax: 12,
          scheduleCron: '0 */4 * * *',
          owner: 'system',
          active: true
        }
      ];

      for (const blogTargetData of defaultBlogTargets) {
        const blogTarget = await this.createBlogTarget(blogTargetData);
        
        // Add keywords for this blog target
        const keywords = blogTargetData.queries;
        for (const keyword of keywords) {
          await db.insert(targetKeywords).values({
            targetId: blogTarget.id,
            keywordText: keyword,
            active: true,
            addedBy: 'system'
          });
        }
      }
    }
  }

  // Manual Blog Entries Implementation
  async getManualBlogEntries(): Promise<ManualBlogEntry[]> {
    return await db.select()
      .from(manualBlogEntries)
      .where(eq(manualBlogEntries.isActive, true))
      .orderBy(desc(manualBlogEntries.submittedAt));
  }

  async createManualBlogEntry(data: InsertManualBlogEntry): Promise<ManualBlogEntry> {
    const [created] = await db.insert(manualBlogEntries)
      .values(data)
      .returning();
    return created;
  }

  async updateManualBlogEntry(id: string, updates: Partial<ManualBlogEntry>): Promise<ManualBlogEntry> {
    const [updated] = await db.update(manualBlogEntries)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(manualBlogEntries.id, id))
      .returning();
    if (!updated) {
      throw new Error(`Manual blog entry not found: ${id}`);
    }
    return updated;
  }

  async deleteManualBlogEntry(id: string): Promise<void> {
    // Soft delete by setting isActive to false
    await db.update(manualBlogEntries)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(manualBlogEntries.id, id));
  }

  // v6 Blog Targets Implementation
  async getBlogTargets(owner?: string): Promise<BlogTarget[]> {
    const conditions = [eq(blogTargets.active, true)];
    if (owner) {
      conditions.push(eq(blogTargets.owner, owner));
    }
    return await db.select().from(blogTargets)
      .where(and(...conditions))
      .orderBy(desc(blogTargets.createdAt));
  }

  async createBlogTarget(data: InsertBlogTarget): Promise<BlogTarget> {
    const insertData = {
      ...data,
      queries: data.queries as string[],
      active: data.active ?? true  // 기본값을 true로 설정하여 getBlogTargets에서 조회되도록 함
    };
    const [target] = await db.insert(blogTargets).values([insertData]).returning();
    if (!target) {
      throw new Error("Failed to create blog target");
    }
    return target;
  }

  async getBlogTargetById(owner: string, id: string): Promise<BlogTarget | null> {
    const [target] = await db.select().from(blogTargets)
      .where(and(
        eq(blogTargets.id, id),
        eq(blogTargets.owner, owner),
        eq(blogTargets.active, true)
      ));
    return target || null;
  }

  async updateBlogTarget(id: string, updates: Partial<BlogTarget>): Promise<BlogTarget> {
    const [updated] = await db.update(blogTargets)
      .set(updates)
      .where(eq(blogTargets.id, id))
      .returning();
    if (!updated) {
      throw new Error(`Blog target not found: ${id}`);
    }
    return updated;
  }

  async updateBlogTargetByOwner(owner: string, id: string, updates: Partial<BlogTarget>): Promise<BlogTarget | null> {
    const [updated] = await db.update(blogTargets)
      .set(updates)
      .where(and(
        eq(blogTargets.id, id),
        eq(blogTargets.owner, owner),
        eq(blogTargets.active, true)
      ))
      .returning();
    return updated || null;
  }

  async deleteBlogTarget(id: string): Promise<void> {
    // Soft delete by setting active to false
    await db.update(blogTargets)
      .set({ active: false })
      .where(eq(blogTargets.id, id));
  }

  async deleteBlogTargetByOwner(owner: string, id: string): Promise<boolean> {
    const [result] = await db.update(blogTargets)
      .set({ active: false })
      .where(and(
        eq(blogTargets.id, id),
        eq(blogTargets.owner, owner),
        eq(blogTargets.active, true)
      ))
      .returning({ id: blogTargets.id });
    return !!result;
  }

  async getBlogTarget(id: string): Promise<BlogTarget | null> {
    const [target] = await db.select().from(blogTargets)
      .where(and(eq(blogTargets.id, id), eq(blogTargets.active, true)));
    return target || null;
  }

  // v6 Product Targets Implementation
  async getProductTargets(owner?: string): Promise<ProductTarget[]> {
    const conditions = [eq(productTargets.active, true)];
    if (owner) {
      conditions.push(eq(productTargets.owner, owner));
    }
    return await db.select().from(productTargets)
      .where(and(...conditions))
      .orderBy(desc(productTargets.createdAt));
  }

  async createProductTarget(data: InsertProductTarget): Promise<ProductTarget> {
    const insertData = {
      ...data,
      queries: data.queries as string[]
    };
    const [target] = await db.insert(productTargets).values([insertData]).returning();
    if (!target) {
      throw new Error("Failed to create product target");
    }
    return target;
  }

  async getProductTargetById(owner: string, id: string): Promise<ProductTarget | null> {
    const [target] = await db.select().from(productTargets)
      .where(and(
        eq(productTargets.id, id),
        eq(productTargets.owner, owner),
        eq(productTargets.active, true)
      ));
    return target || null;
  }

  async updateProductTarget(id: string, updates: Partial<ProductTarget>): Promise<ProductTarget> {
    const [updated] = await db.update(productTargets)
      .set(updates)
      .where(eq(productTargets.id, id))
      .returning();
    if (!updated) {
      throw new Error(`Product target not found: ${id}`);
    }
    return updated;
  }

  async updateProductTargetByOwner(owner: string, id: string, updates: Partial<ProductTarget>): Promise<ProductTarget | null> {
    const [updated] = await db.update(productTargets)
      .set(updates)
      .where(and(
        eq(productTargets.id, id),
        eq(productTargets.owner, owner),
        eq(productTargets.active, true)
      ))
      .returning();
    return updated || null;
  }

  async deleteProductTarget(id: string): Promise<void> {
    // Soft delete by setting active to false
    await db.update(productTargets)
      .set({ active: false })
      .where(eq(productTargets.id, id));
  }

  async deleteProductTargetByOwner(owner: string, id: string): Promise<boolean> {
    const [result] = await db.update(productTargets)
      .set({ active: false })
      .where(and(
        eq(productTargets.id, id),
        eq(productTargets.owner, owner),
        eq(productTargets.active, true)
      ))
      .returning({ id: productTargets.id });
    return !!result;
  }

  async getProductTarget(id: string): Promise<ProductTarget | null> {
    const [target] = await db.select().from(productTargets)
      .where(and(eq(productTargets.id, id), eq(productTargets.active, true)));
    return target || null;
  }

  // v6 Rank Snapshots Implementation - Owner-aware for security
  async getRankSnapshots(owner: string, targetId?: string, kind?: string, range = "30d"): Promise<RankSnapshot[]> {
    const days = parseInt(range.replace('d', ''));
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    // Collect all WHERE conditions in array to avoid overwriting
    const conditions = [
      eq(blogTargets.owner, owner),
      eq(blogTargets.active, true),
      gte(rankSnapshots.timestamp, cutoffDate)
    ];

    // Add optional filters to conditions array
    if (targetId) {
      conditions.push(eq(rankSnapshots.targetId, targetId));
    }
    if (kind) {
      conditions.push(eq(rankSnapshots.kind, kind));
    }

    // Single WHERE call with all conditions
    const query = db.select({
      id: rankSnapshots.id,
      targetId: rankSnapshots.targetId,
      kind: rankSnapshots.kind,
      query: rankSnapshots.query,
      sort: rankSnapshots.sort,
      device: rankSnapshots.device,
      timestamp: rankSnapshots.timestamp,
      rank: rankSnapshots.rank,
      page: rankSnapshots.page,
      position: rankSnapshots.position,
      source: rankSnapshots.source,
      metadata: rankSnapshots.metadata
    })
    .from(rankSnapshots)
    .innerJoin(blogTargets, eq(rankSnapshots.targetId, blogTargets.id))
    .where(and(...conditions))
    .orderBy(desc(rankSnapshots.timestamp));

    return await query;
  }

  async insertRankSnapshot(owner: string, data: InsertRankSnapshot): Promise<RankSnapshot> {
    // First verify that targetId belongs to the owner by checking blogTargets
    const targetOwnership = await db.select({ id: blogTargets.id })
      .from(blogTargets)
      .where(and(
        eq(blogTargets.id, data.targetId),
        eq(blogTargets.owner, owner),
        eq(blogTargets.active, true)
      ))
      .limit(1);

    if (targetOwnership.length === 0) {
      throw new Error('Unauthorized: Target does not belong to the specified owner or is inactive');
    }

    // Only insert if ownership is verified
    const [snapshot] = await db.insert(rankSnapshots).values(data).returning();
    return snapshot;
  }

  async getRankSnapshotHistory(owner: string, targetId: string, kind: string, query?: string, sort?: string, device?: string, range = "30d"): Promise<RankSnapshot[]> {
    const days = parseInt(range.replace('d', ''));
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    // Owner-aware query with JOIN to validate targetId ownership
    let query_builder = db.select({
      id: rankSnapshots.id,
      targetId: rankSnapshots.targetId,
      kind: rankSnapshots.kind,
      query: rankSnapshots.query,
      sort: rankSnapshots.sort,
      device: rankSnapshots.device,
      timestamp: rankSnapshots.timestamp,
      rank: rankSnapshots.rank,
      page: rankSnapshots.page,
      position: rankSnapshots.position,
      source: rankSnapshots.source,
      metadata: rankSnapshots.metadata
    })
    .from(rankSnapshots)
    .innerJoin(blogTargets, eq(rankSnapshots.targetId, blogTargets.id))
    .where(and(
      eq(blogTargets.owner, owner),
      eq(blogTargets.active, true),
      eq(rankSnapshots.targetId, targetId),
      eq(rankSnapshots.kind, kind),
      gte(rankSnapshots.timestamp, cutoffDate)
    ));

    // Add optional filters
    const additionalConditions = [];
    if (query) {
      additionalConditions.push(eq(rankSnapshots.query, query));
    }
    if (sort) {
      additionalConditions.push(eq(rankSnapshots.sort, sort));
    }
    if (device) {
      additionalConditions.push(eq(rankSnapshots.device, device));
    }

    // Apply additional conditions if any exist
    if (additionalConditions.length > 0) {
      // Collect all conditions including additional ones
      const allConditions = [
        eq(blogTargets.owner, owner),
        eq(blogTargets.active, true),
        eq(rankSnapshots.targetId, targetId),
        eq(rankSnapshots.kind, kind),
        gte(rankSnapshots.timestamp, cutoffDate),
        ...additionalConditions
      ];
      
      // Rebuild query with all conditions combined
      query_builder = db.select({
        id: rankSnapshots.id,
        targetId: rankSnapshots.targetId,
        kind: rankSnapshots.kind,
        query: rankSnapshots.query,
        sort: rankSnapshots.sort,
        device: rankSnapshots.device,
        timestamp: rankSnapshots.timestamp,
        rank: rankSnapshots.rank,
        page: rankSnapshots.page,
        position: rankSnapshots.position,
        source: rankSnapshots.source,
        metadata: rankSnapshots.metadata
      })
      .from(rankSnapshots)
      .innerJoin(blogTargets, eq(rankSnapshots.targetId, blogTargets.id))
      .where(and(...allConditions));
    }

    return await query_builder.orderBy(asc(rankSnapshots.timestamp));
  }

  // v6 Metric Snapshots Implementation - Owner-aware for security
  async getMetricSnapshots(owner: string, productKey?: string, range = "30d"): Promise<MetricSnapshot[]> {
    const days = parseInt(range.replace('d', ''));
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    // Collect all WHERE conditions in array to avoid overwriting
    const conditions = [
      eq(productTargets.owner, owner),
      eq(productTargets.active, true),
      gte(metricSnapshots.timestamp, cutoffDate)
    ];

    // Add productKey filter if specified
    if (productKey) {
      conditions.push(eq(metricSnapshots.productKey, productKey));
    }

    // Single WHERE call with all conditions
    const query = db.select({
      id: metricSnapshots.id,
      productKey: metricSnapshots.productKey,
      timestamp: metricSnapshots.timestamp,
      starAvg: metricSnapshots.starAvg,
      reviewCount: metricSnapshots.reviewCount,
      photoRatio: metricSnapshots.photoRatio,
      newReviews7d: metricSnapshots.newReviews7d,
      newReviews30d: metricSnapshots.newReviews30d,
      qaCount: metricSnapshots.qaCount,
      price: metricSnapshots.price,
      stockFlag: metricSnapshots.stockFlag,
      source: metricSnapshots.source,
      metadata: metricSnapshots.metadata
    })
    .from(metricSnapshots)
    .innerJoin(productTargets, eq(metricSnapshots.productKey, productTargets.id))
    .where(and(...conditions))
    .orderBy(desc(metricSnapshots.timestamp));

    return await query;
  }

  async insertMetricSnapshot(owner: string, data: InsertMetricSnapshot): Promise<MetricSnapshot> {
    // First verify that productKey belongs to the owner by checking productTargets
    const productOwnership = await db.select({ id: productTargets.id })
      .from(productTargets)
      .where(and(
        eq(productTargets.id, data.productKey),
        eq(productTargets.owner, owner),
        eq(productTargets.active, true)
      ))
      .limit(1);

    if (productOwnership.length === 0) {
      throw new Error('Unauthorized: Product does not belong to the specified owner or is inactive');
    }

    // Only insert if ownership is verified
    const [snapshot] = await db.insert(metricSnapshots).values([data]).returning();
    if (!snapshot) {
      throw new Error("Failed to create metric snapshot");
    }
    return snapshot;
  }

  async getMetricHistory(owner: string, productKey: string, range = "30d"): Promise<MetricSnapshot[]> {
    return this.getMetricSnapshots(owner, productKey, range);
  }

  // v6 Review State Implementation - Owner-aware for security
  async getReviewState(owner: string, productKey: string): Promise<ReviewState | null> {
    const [state] = await db.select({
      productKey: reviewState.productKey,
      lastReviewId: reviewState.lastReviewId,
      lastCheckedAt: reviewState.lastCheckedAt
    })
    .from(reviewState)
    .innerJoin(productTargets, eq(reviewState.productKey, productTargets.id))
    .where(and(
      eq(productTargets.owner, owner),
      eq(productTargets.active, true),
      eq(reviewState.productKey, productKey)
    ));
    return state || null;
  }

  async updateReviewState(owner: string, data: InsertReviewState): Promise<ReviewState> {
    // First validate that the productKey belongs to this owner
    const productTarget = await db.select()
      .from(productTargets)
      .where(and(
        eq(productTargets.id, data.productKey),
        eq(productTargets.owner, owner),
        eq(productTargets.active, true)
      ))
      .limit(1);

    if (productTarget.length === 0) {
      throw new Error('Product not found or access denied');
    }

    const [updated] = await db.insert(reviewState)
      .values(data)
      .onConflictDoUpdate({
        target: reviewState.productKey,
        set: {
          lastReviewId: data.lastReviewId,
          lastCheckedAt: new Date()
        }
      })
      .returning();
    return updated;
  }

  // v7 Group CRUD Implementation - Owner-aware for security
  async getGroups(owner: string): Promise<Group[]> {
    return await db.select()
      .from(groups)
      .where(eq(groups.owner, owner))
      .orderBy(desc(groups.createdAt));
  }

  async getGroupById(owner: string, id: string): Promise<Group | null> {
    const [group] = await db.select()
      .from(groups)
      .where(and(
        eq(groups.id, id),
        eq(groups.owner, owner)
      ))
      .limit(1);
    return group || null;
  }

  async createGroup(data: InsertGroup): Promise<Group> {
    const [group] = await db.insert(groups)
      .values(data)
      .returning();
    return group;
  }

  async updateGroupByOwner(owner: string, id: string, updates: Partial<Group>): Promise<Group | null> {
    const [updated] = await db.update(groups)
      .set({ ...updates, updatedAt: new Date() })
      .where(and(
        eq(groups.id, id),
        eq(groups.owner, owner)
      ))
      .returning();
    return updated || null;
  }

  async deleteGroupByOwner(owner: string, id: string): Promise<boolean> {
    const deleted = await db.delete(groups)
      .where(and(
        eq(groups.id, id),
        eq(groups.owner, owner)
      ))
      .returning({ id: groups.id });
    return deleted.length > 0;
  }

  // v7 Group Keywords Implementation
  async getGroupKeywords(groupId: string): Promise<GroupKeyword[]> {
    return await db.select()
      .from(groupKeywords)
      .where(eq(groupKeywords.groupId, groupId))
      .orderBy(desc(groupKeywords.addedAt));
  }

  async addGroupKeyword(data: InsertGroupKeyword): Promise<GroupKeyword> {
    const [keyword] = await db.insert(groupKeywords)
      .values(data)
      .returning();
    return keyword;
  }

  async removeGroupKeyword(groupId: string, keyword: string): Promise<boolean> {
    const deleted = await db.delete(groupKeywords)
      .where(and(
        eq(groupKeywords.groupId, groupId),
        eq(groupKeywords.keyword, keyword)
      ))
      .returning({ groupId: groupKeywords.groupId });
    return deleted.length > 0;
  }

  // v7 Group Index Implementation
  async getGroupIndexDaily(groupId: string, range = "30d"): Promise<GroupIndexDaily[]> {
    const days = parseInt(range.replace('d', ''));
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    return await db.select()
      .from(groupIndexDaily)
      .where(and(
        eq(groupIndexDaily.groupId, groupId),
        gte(groupIndexDaily.date, cutoffDate)
      ))
      .orderBy(desc(groupIndexDaily.date));
  }

  // v7 Rank Aggregation Daily Implementation
  async getRankAggDay(targetId: string, keyword: string, range = "30d"): Promise<RankAggDay[]> {
    const days = parseInt(range.replace('d', ''));
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    return await db.select()
      .from(rankAggDay)
      .where(and(
        eq(rankAggDay.targetId, targetId),
        eq(rankAggDay.keyword, keyword),
        gte(rankAggDay.date, cutoffDate)
      ))
      .orderBy(desc(rankAggDay.date));
  }

  async insertRankAggDay(data: InsertRankAggDay): Promise<RankAggDay> {
    const [aggDay] = await db.insert(rankAggDay)
      .values(data)
      .returning();
    return aggDay;
  }

  async insertGroupIndexDaily(data: InsertGroupIndexDaily): Promise<GroupIndexDaily> {
    const [groupIndex] = await db.insert(groupIndexDaily)
      .values(data)
      .returning();
    return groupIndex;
  }

  // v7 Collection Rules and State Implementation - Owner-aware for security
  async getCollectionRules(owner: string): Promise<CollectionRule[]> {
    return await db.select()
      .from(collectionRules)
      .where(eq(collectionRules.owner, owner))
      .orderBy(desc(collectionRules.priority), desc(collectionRules.createdAt));
  }

  async getCollectionState(owner: string, targetId: string, keyword: string): Promise<CollectionState | null> {
    const [state] = await db.select()
      .from(collectionState)
      .where(and(
        eq(collectionState.owner, owner),
        eq(collectionState.targetId, targetId),
        eq(collectionState.keyword, keyword)
      ))
      .limit(1);
    return state || null;
  }

  // v7 Database Page APIs Implementation
  async createCollectionRule(data: InsertCollectionRule): Promise<CollectionRule> {
    const [rule] = await db.insert(collectionRules)
      .values(data)
      .returning();
    return rule;
  }

  async updateCollectionRuleByOwner(owner: string, id: string, updates: Partial<CollectionRule>): Promise<CollectionRule | null> {
    const [rule] = await db.update(collectionRules)
      .set(updates)
      .where(and(
        eq(collectionRules.id, id),
        eq(collectionRules.owner, owner)
      ))
      .returning();
    return rule || null;
  }

  async deleteCollectionRuleByOwner(owner: string, id: string): Promise<boolean> {
    const result = await db.delete(collectionRules)
      .where(and(
        eq(collectionRules.id, id),
        eq(collectionRules.owner, owner)
      ));
    return (result.rowCount ?? 0) > 0;
  }

  async updateCollectionState(owner: string, data: InsertCollectionState): Promise<CollectionState> {
    // Upsert: check if exists, then update or insert
    const existing = await this.getCollectionState(owner, data.targetId, data.keyword);
    
    if (existing) {
      const [updated] = await db.update(collectionState)
        .set({
          ...data,
          owner // ensure owner consistency
        })
        .where(eq(collectionState.id, existing.id))
        .returning();
      return updated;
    } else {
      const [inserted] = await db.insert(collectionState)
        .values({ ...data, owner })
        .returning();
      return inserted;
    }
  }

  async getKeywordRepository(owner: string): Promise<any[]> {
    // Get keywords from group_keywords joined with groups by owner
    const keywords = await db.select({
      keyword: groupKeywords.keyword,
      groupId: groups.id,
      groupName: groups.name
    })
    .from(groupKeywords)
    .innerJoin(groups, eq(groupKeywords.groupId, groups.id))
    .where(eq(groups.owner, owner));

    // Aggregate by keyword
    const keywordMap = new Map();
    for (const kw of keywords) {
      if (!keywordMap.has(kw.keyword)) {
        keywordMap.set(kw.keyword, {
          id: `kw-${kw.keyword}`,
          keyword: kw.keyword,
          volume: Math.floor(Math.random() * 2000) + 500, // placeholder
          score: Math.floor(Math.random() * 30) + 70, // placeholder
          status: "active", // default
          lastChecked: "5분 전", // placeholder
          groupCount: 0,
          rankHistory: []
        });
      }
      keywordMap.get(kw.keyword).groupCount++;
    }

    // Get status from collection rules
    const statusRules = await db.select()
      .from(collectionRules)
      .where(and(
        eq(collectionRules.owner, owner),
        sql`${collectionRules.conditions}->>'ruleType' = 'keyword_status'`
      ));

    for (const rule of statusRules) {
      const keyword = (rule.conditions as any)?.keyword;
      const status = (rule.actions as any)?.status || "active";
      if (keywordMap.has(keyword)) {
        keywordMap.get(keyword).status = status;
      }
    }

    return Array.from(keywordMap.values());
  }

  async updateKeywordStatus(owner: string, keyword: string, status: string): Promise<boolean> {
    // Upsert a collection rule for keyword status
    const existing = await db.select()
      .from(collectionRules)
      .where(and(
        eq(collectionRules.owner, owner),
        sql`${collectionRules.conditions}->>'ruleType' = 'keyword_status'`,
        sql`${collectionRules.conditions}->>'keyword' = ${keyword}`
      ))
      .limit(1);

    const ruleData = {
      owner,
      name: `키워드 상태: ${keyword}`,
      conditions: { ruleType: "keyword_status", keyword },
      actions: { status },
      priority: 5,
      active: true
    };

    if (existing.length > 0) {
      await db.update(collectionRules)
        .set({
          actions: ruleData.actions,
          name: ruleData.name
        })
        .where(eq(collectionRules.id, existing[0].id));
    } else {
      await db.insert(collectionRules).values(ruleData);
    }

    return true;
  }

  async getTargetManagement(owner: string): Promise<any[]> {
    const targets = await db.select()
      .from(trackedTargets)
      .where(eq(trackedTargets.owner, owner));

    return targets.map((target, index) => ({
      ...target,
      statusDetail: target.enabled ? 
        (["running", "paused", "error", "idle"][index % 4] as any) : "paused",
      lastRun: ["5분 전", "10분 전", "1시간 전", "3시간 전"][index % 4] || "5분 전",
      nextRun: ["10분 후", "20분 후", "1시간 후", "중지됨"][index % 4] || "10분 후",
      successRate: [98.5, 95.2, 87.3, 92.1][index % 4] || 95.0,
      keywordCount: target.query ? target.query.split(' ').length : Math.floor(Math.random() * 10) + 1
    }));
  }

  async updateTargetSchedule(owner: string, targetId: string, schedule: any): Promise<boolean> {
    const result = await db.update(trackedTargets)
      .set({ schedule: schedule.interval || schedule })
      .where(and(
        eq(trackedTargets.id, targetId),
        eq(trackedTargets.owner, owner)
      ));
    return (result.rowCount ?? 0) > 0;
  }

  async getSnapshotAggregation(owner: string, range = "7d"): Promise<any[]> {
    const days = parseInt(range.replace('d', ''));
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    // Get owner's targets
    const ownerTargets = await db.select({ id: trackedTargets.id })
      .from(trackedTargets)
      .where(eq(trackedTargets.owner, owner));
    
    const targetIds = ownerTargets.map(t => t.id);

    if (targetIds.length === 0) {
      return Array.from({ length: days }, (_, i) => {
        const date = new Date();
        date.setDate(date.getDate() - i);
        return {
          date: date.toLocaleDateString('ko-KR'),
          totalChecks: 0,
          successfulChecks: 0,
          avgRank: 0,
          topKeywords: 0,
          dataSize: "0MB"
        };
      });
    }

    // Generate mock aggregation data
    return Array.from({ length: days }, (_, i) => {
      const date = new Date();
      date.setDate(date.getDate() - i);
      return {
        date: date.toLocaleDateString('ko-KR'),
        totalChecks: Math.floor(Math.random() * 500) + 200,
        successfulChecks: Math.floor(Math.random() * 450) + 150,
        avgRank: Math.floor(Math.random() * 10) + 8,
        topKeywords: Math.floor(Math.random() * 50) + 20,
        dataSize: `${(Math.random() * 50 + 10).toFixed(1)}MB`
      };
    });
  }

  async getTokenUsageStats(owner: string): Promise<any> {
    // Mock token usage stats until real tracking exists
    return {
      today: Math.floor(Math.random() * 5000) + 1000,
      dailyLimit: 10000,
      usagePercent: Math.floor(Math.random() * 80) + 20,
      cacheHitRate: Math.floor(Math.random() * 20) + 80,
      errorRate: Math.floor(Math.random() * 20) / 10,
      avgResponseTime: Math.floor(Math.random() * 20) / 10 + 0.5
    };
  }

  // v7 Dashboard APIs Implementation
  async getRollingAlerts(owner: string, isActive = true): Promise<RollingAlert[]> {
    const conditions = [eq(rollingAlerts.owner, owner)];
    if (isActive !== undefined) {
      conditions.push(eq(rollingAlerts.isActive, isActive));
    }
    
    return await db.select()
      .from(rollingAlerts)
      .where(and(...conditions))
      .orderBy(asc(rollingAlerts.priority), desc(rollingAlerts.createdAt));
  }

  async createRollingAlert(data: InsertRollingAlert): Promise<RollingAlert> {
    const [result] = await db.insert(rollingAlerts)
      .values(data)
      .returning();
    return result;
  }

  async updateRollingAlertStatus(owner: string, alertId: string, isActive: boolean): Promise<boolean> {
    const result = await db.update(rollingAlerts)
      .set({ isActive })
      .where(and(
        eq(rollingAlerts.id, alertId),
        eq(rollingAlerts.owner, owner)
      ));
    return (result.rowCount ?? 0) > 0;
  }

  async getDashboardSettings(owner: string): Promise<DashboardSettings[]> {
    return await db.select()
      .from(dashboardSettings)
      .where(eq(dashboardSettings.owner, owner))
      .orderBy(asc(dashboardSettings.order));
  }

  async updateDashboardSettings(owner: string, cardId: string, settings: Partial<InsertDashboardSettings>): Promise<DashboardSettings> {
    // Upsert: Update if exists, insert if not
    const existingSettings = await db.select()
      .from(dashboardSettings)
      .where(and(
        eq(dashboardSettings.owner, owner),
        eq(dashboardSettings.cardId, cardId)
      ))
      .limit(1);

    if (existingSettings.length > 0) {
      // Update existing
      const [result] = await db.update(dashboardSettings)
        .set({ ...settings, updatedAt: new Date() })
        .where(and(
          eq(dashboardSettings.owner, owner),
          eq(dashboardSettings.cardId, cardId)
        ))
        .returning();
      return result;
    } else {
      // Insert new
      const [result] = await db.insert(dashboardSettings)
        .values({
          owner,
          cardId,
          ...settings,
        } as InsertDashboardSettings)
        .returning();
      return result;
    }
  }

  // v7 Target Keywords operations implementation
  async getTargetKeywords(targetId: string): Promise<TargetKeyword[]> {
    return await db.select()
      .from(targetKeywords)
      .where(and(
        eq(targetKeywords.targetId, targetId),
        eq(targetKeywords.active, true)
      ))
      .orderBy(asc(targetKeywords.keywordText));
  }

  async addTargetKeywords(owner: string, targetId: string, keywords: string[], addedBy: string): Promise<TargetKeyword[]> {
    // 먼저 타겟의 소유권 확인 (중요한 데이터베이스 안전 규칙)
    const target = await db.select()
      .from(blogTargets)
      .where(and(
        eq(blogTargets.id, targetId),
        eq(blogTargets.owner, owner)
      ))
      .limit(1);

    if (target.length === 0) {
      throw new Error(`Unauthorized: Target ${targetId} does not belong to owner ${owner}`);
    }

    // 키워드 정규화 (소문자 트림)
    const normalizedKeywords = keywords.map(kw => kw.trim().toLowerCase()).filter(kw => kw.length > 0);

    // 중복 방지를 위한 on conflict do nothing
    if (normalizedKeywords.length > 0) {
      const values = normalizedKeywords.map(keywordText => ({
        targetId,
        keywordText,
        addedBy,
        active: true
      } as InsertTargetKeyword));

      await db.insert(targetKeywords)
        .values(values)
        .onConflictDoNothing({ target: [targetKeywords.targetId, targetKeywords.keywordText] });
    }

    // 현재 키워드 목록 반환
    return await this.getTargetKeywords(targetId);
  }

  async removeTargetKeywords(owner: string, targetId: string, keywords: string[]): Promise<void> {
    // 먼저 타겟의 소유권 확인 (중요한 데이터베이스 안전 규칙)
    const target = await db.select()
      .from(blogTargets)
      .where(and(
        eq(blogTargets.id, targetId),
        eq(blogTargets.owner, owner)
      ))
      .limit(1);

    if (target.length === 0) {
      throw new Error(`Unauthorized: Target ${targetId} does not belong to owner ${owner}`);
    }

    // 키워드 정규화 (소문자 트림)
    const normalizedKeywords = keywords.map(kw => kw.trim().toLowerCase()).filter(kw => kw.length > 0);

    if (normalizedKeywords.length > 0) {
      await db.delete(targetKeywords)
        .where(and(
          eq(targetKeywords.targetId, targetId),
          sql`${targetKeywords.keywordText} = ANY(${normalizedKeywords})`
        ));
    }
  }

  async getBlogTargetsWithKeywords(owner: string): Promise<(BlogTarget & { keywords: string[] })[]> {
    // 먼저 블로그 타겟들 조회 (소유권 필터링 적용)
    const targets = await this.getBlogTargets(owner);
    
    // 각 타겟에 대해 키워드 목록 조회 - 키워드가 없어도 타겟은 포함
    const result = [];
    for (const target of targets) {
      const keywords = await this.getTargetKeywords(target.id);
      result.push({
        ...target,
        // 키워드가 없으면 빈 배열 또는 기존 queries를 fallback으로 사용
        keywords: keywords.length > 0 ? keywords.map(tk => tk.keywordText) : (target.queries || [])
      });
    }

    return result;
  }
}

export class MemStorage implements IStorage {
  private rankSeries: Map<string, RankTimeSeries>;
  private events: Map<string, Event>;
  private alerts: Map<string, Alert>;
  private submissions: Map<string, Submission>;
  private targets: Map<string, TrackedTarget>;
  private settings: Map<string, Settings>;
  private reviewMetrics: Map<string, MetricTimeSeries>;
  private exportJobs: Map<string, any>;
  private manualBlogEntries: Map<string, ManualBlogEntry>;
  // v6 새로운 변수들
  private blogTargets: Map<string, BlogTarget>;
  private productTargets: Map<string, ProductTarget>;
  private rankSnapshots: Map<string, RankSnapshot>;
  private metricSnapshots: Map<string, MetricSnapshot>;
  private reviewStates: Map<string, ReviewState>;
  // v7 키워드 매핑 변수들
  private targetKeywords: Map<string, TargetKeyword>;
  // v7 키워드 그룹 변수들
  private groups: Map<string, Group>;
  private groupKeywords: Map<string, GroupKeyword>;
  private groupIndexDaily: Map<string, GroupIndexDaily>;
  private rankAggDay: Map<string, RankAggDay>;
  private collectionRules: Map<string, CollectionRule>;
  private collectionState: Map<string, CollectionState>;

  constructor() {
    this.rankSeries = new Map();
    this.events = new Map();
    this.alerts = new Map();
    this.submissions = new Map();
    this.targets = new Map();
    this.settings = new Map();
    this.reviewMetrics = new Map();
    this.exportJobs = new Map();
    this.manualBlogEntries = new Map();
    // v6 새로운 변수들 초기화
    this.blogTargets = new Map();
    this.productTargets = new Map();
    this.rankSnapshots = new Map();
    this.metricSnapshots = new Map();
    this.reviewStates = new Map();
    // v7 키워드 매핑 변수들 초기화
    this.targetKeywords = new Map();
    // v7 키워드 그룹 변수들 초기화
    this.groups = new Map();
    this.groupKeywords = new Map();
    this.groupIndexDaily = new Map();
    this.rankAggDay = new Map();
    this.collectionRules = new Map();
    this.collectionState = new Map();
    this.initializeMockData();
  }

  private initializeMockData() {
    // Initialize default settings
    const defaultSettings = [
      { key: 'checkInterval', value: { interval: '1h' } },
      { key: 'alertCooldown', value: { cooldown: '6h' } },
      { key: 'rateLimits', value: { perMin: 60, perDay: 10000 } },
      { key: 'cacheTTL', value: { ttl: '10m' } },
      { key: 'defaultDevice', value: 'mobile' },
      { key: 'autoCheck', value: true },
      { key: 'dataRetention', value: '90d' },
      { key: 'dailySummaryTime', value: '09:00' },
    ];

    defaultSettings.forEach(setting => {
      const id = randomUUID();
      this.settings.set(id, {
        id,
        key: setting.key,
        value: setting.value,
        updatedAt: new Date(),
      });
    });

    // Initialize mock tracked targets
    this.initializeTrackedTargets();
    
    // Initialize mock rank data
    this.initializeRankData();
    
    // Initialize mock alerts
    this.initializeAlerts();
    
    // Initialize mock events
    this.initializeEvents();
    
    // Initialize mock submissions
    this.initializeSubmissions();
    
    // Initialize mock review metrics
    this.initializeReviewMetrics();
    
    // Initialize mock blog targets
    this.initializeBlogTargets();
  }

  private initializeTrackedTargets() {
    const keywords = ['홍삼', '홍삼스틱', '홍삼 효능', '홍삼 가격', '홍삼 추천'];
    const owners = ['system', 'admin', 'manager'];
    
    keywords.forEach((keyword, index) => {
      const id = `target-${index + 1}`;
      this.targets.set(id, {
        id,
        owner: owners[Math.floor(Math.random() * owners.length)],
        kind: 'blog',
        query: keyword,
        productKey: null,
        url: null,
        windowMin: 1,
        windowMax: 10,
        thresholds: {
          warning: 15,
          critical: 25,
          topEntry: 10,
          topExit: 10
        },
        schedule: ['10m', '30m', '1h', '6h'][Math.floor(Math.random() * 4)],
        enabled: Math.random() > 0.2,
        tags: ['홍삼', '건강식품', 'SEO'],
        createdAt: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000)
      });
    });

    // Add shopping targets
    const shoppingProducts = [
      { name: '진생가 홍삼스틱', key: 'ginseng_stick_001' },
      { name: '정관장 홍삼정', key: 'ginseng_extract_002' },
      { name: '고려홍삼 프리미엄', key: 'korea_ginseng_003' }
    ];
    
    shoppingProducts.forEach((product, index) => {
      const id = `shop-target-${index + 1}`;
      this.targets.set(id, {
        id,
        owner: 'system',
        kind: 'shop',
        query: product.name,
        productKey: product.key,
        url: `https://smartstore.naver.com/product${1000 + index}`,
        windowMin: 1,
        windowMax: 40,
        thresholds: {
          warning: 20,
          critical: 30,
          topEntry: 10,
          topExit: 10
        },
        schedule: '1h',
        enabled: true,
        tags: ['홍삼', '쇼핑', 'E-commerce'],
        createdAt: new Date(Date.now() - Math.random() * 15 * 24 * 60 * 60 * 1000)
      });
    });
  }

  private initializeBlogTargets() {
    const defaultBlogTargets = [
      {
        id: 'blog-target-1',
        title: '홍삼 건강 블로그',
        url: 'https://blog.naver.com/ginseng_health',
        queries: ['홍삼', '홍삼 효능', '홍삼 추천'],
        windowMin: 1,
        windowMax: 10,
        scheduleCron: '0 * * * *',
        owner: 'system',
        active: true,
        createdAt: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000)
      },
      {
        id: 'blog-target-2',
        title: '프리미엄 건강식품 리뷰',
        url: 'https://blog.naver.com/premium_health',
        queries: ['홍삼스틱', '홍삼 가격', '홍삼 제품'],
        windowMin: 1,
        windowMax: 15,
        scheduleCron: '0 */2 * * *',
        owner: 'system',
        active: true,
        createdAt: new Date(Date.now() - Math.random() * 14 * 24 * 60 * 60 * 1000)
      },
      {
        id: 'blog-target-3',
        title: '자연의 힘 웰니스',
        url: 'https://blog.naver.com/nature_wellness',
        queries: ['정관장 홍삼', '홍삼 복용법', '홍삼 부작용'],
        windowMin: 1,
        windowMax: 20,
        scheduleCron: '0 */3 * * *',
        owner: 'system',
        active: true,
        createdAt: new Date(Date.now() - Math.random() * 21 * 24 * 60 * 60 * 1000)
      },
      {
        id: 'blog-target-4',
        title: '건강한 라이프스타일',
        url: 'https://blog.naver.com/healthy_lifestyle',
        queries: ['고려홍삼', '홍삼 선택법'],
        windowMin: 1,
        windowMax: 12,
        scheduleCron: '0 */4 * * *',
        owner: 'system',
        active: true,
        createdAt: new Date(Date.now() - Math.random() * 28 * 24 * 60 * 60 * 1000)
      }
    ];

    defaultBlogTargets.forEach(target => {
      this.blogTargets.set(target.id, target);
      
      // Add keywords for each blog target
      target.queries.forEach(keyword => {
        const keywordKey = `${target.id}-${keyword}`;
        this.targetKeywords.set(keywordKey, {
          targetId: target.id,
          keywordText: keyword,
          active: true,
          addedBy: 'system',
          ts: new Date()
        });
      });
    });
  }

  private initializeRankData() {
    const targetIds = Array.from(this.targets.keys());
    
    targetIds.forEach(targetId => {
      const baseRank = Math.floor(Math.random() * 20) + 5;
      
      for (let i = 29; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        
        const variation = Math.floor(Math.random() * 6) - 3;
        const rank = Math.max(1, Math.min(50, baseRank + variation));
        const page = Math.ceil(rank / 10);
        const position = rank % 10 || 10;
        
        const id = `${targetId}-${i}`;
        this.rankSeries.set(id, {
          id,
          targetId,
          kind: targetId.includes('shop') ? 'shop' : 'blog',
          query: targetId.includes('shop') ? '홍삼스틱' : '홍삼',
          sort: targetId.includes('shop') ? 'popularity' : null,
          device: 'mobile',
          timestamp: date,
          rank,
          page,
          position,
          source: 'naver',
          metadata: { 
            url: `blog.naver.com/example${Math.floor(Math.random() * 1000)}`,
            title: `홍삼 관련 포스팅 ${Math.floor(Math.random() * 100)}`
          }
        });
      }
    });
  }

  private initializeAlerts() {
    const alertTypes = [
      { rule: 'top_10_entry', reason: 'Top 10 진입', severity: 'medium' as const },
      { rule: 'top_10_exit', reason: 'Top 10 이탈', severity: 'high' as const },
      { rule: 'rank_drop_5', reason: '5위 이상 하락', severity: 'high' as const },
      { rule: 'consecutive_drop_3', reason: '연속 3일 하락', severity: 'critical' as const },
      { rule: 'new_post', reason: '신규 포스팅 감지', severity: 'low' as const },
      { rule: 'abuse_review', reason: '악성 리뷰 감지', severity: 'medium' as const }
    ];

    const targetIds = Array.from(this.targets.keys());
    
    for (let i = 0; i < 15; i++) {
      const alertType = alertTypes[Math.floor(Math.random() * alertTypes.length)];
      const hoursAgo = Math.floor(Math.random() * 72);
      const timestamp = new Date(Date.now() - hoursAgo * 60 * 60 * 1000);
      const targetId = targetIds[Math.floor(Math.random() * targetIds.length)];
      
      const prevRank = Math.floor(Math.random() * 20) + 5;
      const currRank = alertType.rule.includes('drop') ? 
        prevRank + Math.floor(Math.random() * 10) + 1 : 
        Math.max(1, prevRank - Math.floor(Math.random() * 5));
      
      const id = `alert-${i}`;
      this.alerts.set(id, {
        id,
        targetId,
        rule: alertType.rule,
        timestamp,
        prevRank,
        currRank,
        delta: currRank - prevRank,
        reason: alertType.reason,
        cooldownUntil: new Date(timestamp.getTime() + 6 * 60 * 60 * 1000),
        seen: Math.random() > 0.3
      });
    }
  }

  private initializeEvents() {
    const eventTypes = [
      { type: 'NewPost', actor: 'system', severity: 'low' as const },
      { type: 'NewReview', actor: 'system', severity: 'low' as const },
      { type: 'AbuseReview', actor: 'detector', severity: 'medium' as const },
      { type: 'StaffSubmit', actor: 'staff', severity: 'low' as const },
      { type: 'PriceChange', actor: 'monitor', severity: 'medium' as const },
      { type: 'StockOut', actor: 'monitor', severity: 'high' as const }
    ];

    const targetIds = Array.from(this.targets.keys());
    
    for (let i = 0; i < 25; i++) {
      const eventType = eventTypes[Math.floor(Math.random() * eventTypes.length)];
      const hoursAgo = Math.floor(Math.random() * 168);
      const targetId = targetIds[Math.floor(Math.random() * targetIds.length)];
      
      const id = `event-${i}`;
      this.events.set(id, {
        id,
        targetId,
        type: eventType.type as any,
        actor: eventType.actor,
        timestamp: new Date(Date.now() - hoursAgo * 60 * 60 * 1000),
        payload: {
          message: `${eventType.type} 이벤트가 발생했습니다`,
          details: { source: 'automated_monitor' }
        },
        severity: eventType.severity
      });
    }
  }

  private initializeSubmissions() {
    const submissionTypes = ['blog', 'product', 'keyword'] as const;
    const statuses = ['pending', 'approved', 'rejected'] as const;
    const owners = ['김철수', '이영희', '박민수', '정지훈', '최서연'];
    
    for (let i = 0; i < 20; i++) {
      const type = submissionTypes[Math.floor(Math.random() * submissionTypes.length)];
      const status = statuses[Math.floor(Math.random() * statuses.length)];
      const owner = owners[Math.floor(Math.random() * owners.length)];
      const hoursAgo = Math.floor(Math.random() * 72);
      
      let payload: any = {};
      switch (type) {
        case 'blog':
          payload = {
            url: `https://blog.naver.com/user${Math.floor(Math.random() * 1000)}/post${Math.floor(Math.random() * 10000)}`,
            description: '홍삼 관련 블로그 포스팅',
            keywords: ['홍삼', '건강식품']
          };
          break;
        case 'product':
          payload = {
            name: `홍삼스틱 프리미엄 ${Math.floor(Math.random() * 10) + 1}호`,
            productKey: `ginseng_stick_${String(Math.floor(Math.random() * 100)).padStart(3, '0')}`,
            brand: '진생가',
            url: `https://smartstore.naver.com/product${Math.floor(Math.random() * 10000)}`
          };
          break;
        case 'keyword':
          payload = {
            keyword: ['홍삼 효능', '홍삼 가격', '홍삼 추천', '홍삼 부작용', '홍삼스틱 리뷰'][Math.floor(Math.random() * 5)],
            priority: Math.floor(Math.random() * 3) + 1,
            category: '건강식품'
          };
          break;
      }
      
      const id = `submission-${i}`;
      this.submissions.set(id, {
        id,
        owner,
        type,
        payload,
        status,
        timestamp: new Date(Date.now() - hoursAgo * 60 * 60 * 1000),
        comment: status === 'rejected' ? '추가 정보가 필요합니다' : null
      });
    }
  }

  private initializeReviewMetrics() {
    const productKeys = ['ginseng_stick_001', 'ginseng_extract_002', 'korea_ginseng_003'];
    
    productKeys.forEach(productKey => {
      for (let i = 29; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        
        const id = `metric-${productKey}-${i}`;
        this.reviewMetrics.set(id, {
          id,
          productKey,
          timestamp: date,
          starAvg: (4.2 + Math.random() * 0.6).toFixed(1),
          reviewCount: Math.floor(Math.random() * 50) + 100,
          photoRatio: (Math.random() * 0.3 + 0.4).toFixed(2),
          newReviews7d: Math.floor(Math.random() * 20) + 5,
          newReviews30d: Math.floor(Math.random() * 80) + 20,
          qaCount: Math.floor(Math.random() * 10) + 2,
          price: Math.floor(Math.random() * 20000) + 30000,
          stockFlag: Math.random() > 0.1
        });
      }
    });
  }

  // Rank operations
  async getRankSeries(targetId: string, range = '30d'): Promise<RankTimeSeries[]> {
    return Array.from(this.rankSeries.values())
      .filter(item => item.targetId === targetId)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }

  async insertRankData(data: InsertRankTimeSeries): Promise<RankTimeSeries> {
    const id = randomUUID();
    const rankData: RankTimeSeries = {
      ...data,
      id,
      timestamp: new Date(),
      sort: data.sort ?? null,
      page: data.page ?? null,
      rank: data.rank ?? null,
      position: data.position ?? null,
      metadata: data.metadata ?? null,
    };
    this.rankSeries.set(id, rankData);
    return rankData;
  }

  async getRankCompare(targetIds: string[], range = '30d'): Promise<RankTimeSeries[]> {
    return Array.from(this.rankSeries.values())
      .filter(item => targetIds.includes(item.targetId))
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }

  async getRankHistory(targetId: string, period = '30d'): Promise<RankTimeSeries[]> {
    return this.getRankSeries(targetId, period);
  }

  // Events and alerts
  async getEvents(targetId?: string, range = '30d'): Promise<Event[]> {
    let result = Array.from(this.events.values());
    if (targetId) {
      result = result.filter(event => event.targetId === targetId);
    }
    return result.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }

  async getAlerts(seen?: boolean): Promise<Alert[]> {
    let result = Array.from(this.alerts.values());
    if (seen !== undefined) {
      result = result.filter(alert => alert.seen === seen);
    }
    return result.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }

  async markAlertSeen(alertId: string): Promise<void> {
    const alert = this.alerts.get(alertId);
    if (alert) {
      alert.seen = true;
      this.alerts.set(alertId, alert);
    }
  }

  // Submissions
  async getSubmissions(status?: string): Promise<Submission[]> {
    let result = Array.from(this.submissions.values());
    if (status) {
      result = result.filter(sub => sub.status === status);
    }
    return result.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }

  async createSubmission(data: InsertSubmission): Promise<Submission> {
    const id = randomUUID();
    const submission: Submission = {
      ...data,
      id,
      timestamp: new Date(),
      comment: null,
      status: data.status || 'pending',
    };
    this.submissions.set(id, submission);
    return submission;
  }

  async updateSubmissionStatus(id: string, status: string, comment?: string): Promise<Submission> {
    const submission = this.submissions.get(id);
    if (!submission) {
      throw new Error('Submission not found');
    }
    submission.status = status;
    submission.comment = comment || null;
    this.submissions.set(id, submission);
    return submission;
  }

  // Tracked targets
  async getTrackedTargets(owner?: string): Promise<TrackedTarget[]> {
    let result = Array.from(this.targets.values());
    if (owner) {
      result = result.filter(target => target.owner === owner);
    }
    return result.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async createTrackedTarget(data: InsertTrackedTarget): Promise<TrackedTarget> {
    const id = randomUUID();
    const target: TrackedTarget = {
      ...data,
      id,
      createdAt: new Date(),
      query: data.query ?? null,
      productKey: data.productKey ?? null,
      url: data.url ?? null,
      windowMin: data.windowMin ?? null,
      windowMax: data.windowMax ?? null,
      thresholds: data.thresholds ?? null,
      schedule: data.schedule ?? null,
      enabled: data.enabled ?? null,
      tags: data.tags ?? null,
    };
    this.targets.set(id, target);
    return target;
  }

  async updateTrackedTarget(id: string, updates: Partial<TrackedTarget>): Promise<TrackedTarget> {
    const target = this.targets.get(id);
    if (!target) {
      throw new Error('Target not found');
    }
    const updated = { ...target, ...updates };
    this.targets.set(id, updated);
    return updated;
  }

  async deleteTrackedTarget(id: string): Promise<void> {
    this.targets.delete(id);
  }

  // Settings
  async getSettings(): Promise<Settings[]> {
    return Array.from(this.settings.values());
  }

  async updateSetting(key: string, value: any): Promise<Settings> {
    const existing = Array.from(this.settings.values()).find(s => s.key === key);
    if (existing) {
      existing.value = value;
      existing.updatedAt = new Date();
      this.settings.set(existing.id, existing);
      return existing;
    } else {
      const id = randomUUID();
      const setting: Settings = {
        id,
        key,
        value,
        updatedAt: new Date(),
      };
      this.settings.set(id, setting);
      return setting;
    }
  }

  async getSetting(key: string): Promise<Settings | undefined> {
    return Array.from(this.settings.values()).find(s => s.key === key);
  }

  // Analytics
  async getKPIData(period = '30d'): Promise<any> {
    const rankings = Array.from(this.rankSeries.values());
    const totalRankings = rankings.length;
    
    if (totalRankings === 0) {
      return {
        averageRank: 0,
        dailyChange: 0,
        weeklyChange: 0,
        monthlyChange: 0,
        volatility7d: 0,
        sovPercentage: 0,
        topTenCount: 0,
        needsAttentionCount: 0
      };
    }

    const averageRank = rankings.reduce((sum, r) => sum + (r.rank || 0), 0) / totalRankings;
    const topTenCount = rankings.filter(r => (r.rank || 50) <= 10).length;
    const needsAttention = rankings.filter(r => (r.rank || 0) > 30 || (r.rank || 0) === 0).length;
    
    return {
      averageRank: Math.round(averageRank * 10) / 10,
      dailyChange: -2.1,
      weeklyChange: 12.5,
      monthlyChange: -5.2,
      volatility7d: 2.1,
      sovPercentage: 15.3,
      topTenCount,
      needsAttentionCount: needsAttention
    };
  }

  async getRankDistribution(): Promise<any> {
    const rankings = Array.from(this.rankSeries.values());
    const oneToTen = rankings.filter(r => (r.rank || 50) <= 10).length;
    const elevenToThirty = rankings.filter(r => (r.rank || 50) > 10 && (r.rank || 50) <= 30).length;
    const thirtyPlus = rankings.filter(r => (r.rank || 50) > 30).length;
    
    return [
      { name: "1-10위", value: oneToTen, color: "#10b981" },
      { name: "11-30위", value: elevenToThirty, color: "#f59e0b" },
      { name: "31위 이하", value: thirtyPlus, color: "#ef4444" }
    ];
  }

  async getTopMovers(direction: "up" | "down", limit = 10): Promise<any> {
    // Simulate rank changes for demo
    const movers = [
      { keyword: "홍삼 추천", prevRank: 7, currRank: 4, change: 3 },
      { keyword: "홍삼 가격", prevRank: 12, currRank: 9, change: 3 },
      { keyword: "홍삼 효과", prevRank: 18, currRank: 16, change: 2 },
      { keyword: "홍삼스틱", prevRank: 8, currRank: 15, change: -7 },
      { keyword: "홍삼 복용법", prevRank: 25, currRank: 32, change: -7 },
      { keyword: "홍삼 부작용", prevRank: 45, currRank: null, change: null }
    ];
    
    return direction === "up" 
      ? movers.filter(m => (m.change || 0) > 0).slice(0, limit)
      : movers.filter(m => (m.change || 0) < 0).slice(0, limit);
  }

  async getHeatmapData(period = '90d'): Promise<any> {
    return Array.from({ length: 90 }, (_, i) => {
      const date = new Date();
      date.setDate(date.getDate() - (89 - i));
      return {
        date: date.toISOString().split('T')[0],
        value: Math.floor(Math.random() * 15)
      };
    });
  }

  async getCompetitorAnalysis(targetId: string): Promise<any> {
    return [
      { name: "우리", value: 15.3, color: "#3b82f6" },
      { name: "경쟁사 A", value: 22.1, color: "#ef4444" },
      { name: "경쟁사 B", value: 18.7, color: "#f59e0b" },
      { name: "경쟁사 C", value: 12.4, color: "#8b5cf6" },
      { name: "기타", value: 31.5, color: "#6b7280" }
    ];
  }

  // Reviews
  async getReviewRankings(productKey: string): Promise<any[]> {
    return Array.from({ length: 10 }, (_, i) => ({
      id: `review-${productKey}-${i + 1}`,
      reviewId: `R${String(i + 1).padStart(6, '0')}`,
      rank: i + 1,
      helpCount: Math.floor(Math.random() * 100) + 10,
      change: Math.floor(Math.random() * 6) - 3,
      content: `이 제품은 정말 좋습니다. ${i + 1}번째 리뷰입니다.`,
      author: `사용자${i + 1}`,
      rating: 4 + Math.random(),
      timestamp: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000)
    }));
  }

  async getReviewHealth(productKey: string): Promise<any> {
    const metrics = Array.from(this.reviewMetrics.values())
      .filter(m => m.productKey === productKey)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0];
      
    return metrics || {
      starAvg: 4.5,
      reviewCount: 150,
      photoRatio: 0.65,
      newReviews7d: 12,
      newReviews30d: 45,
      qaCount: 8,
      price: 35000,
      stockFlag: true
    };
  }

  async getAbuseDetection(productKey: string): Promise<any> {
    return {
      suspiciousReviews: Math.floor(Math.random() * 5),
      duplicateContent: Math.floor(Math.random() * 3),
      rapidBurst: Math.floor(Math.random() * 2),
      riskLevel: ['low', 'medium', 'high'][Math.floor(Math.random() * 3)],
      lastCheck: new Date()
    };
  }

  // Export
  async createExportJob(config: any): Promise<any> {
    const id = randomUUID();
    const job = {
      id,
      name: `${config.dataTypes.join(", ")} (${config.format.toUpperCase()})`,
      type: config.dataTypes.join(","),
      format: config.format,
      status: "pending",
      progress: 0,
      createdAt: new Date(),
      config,
      data: null
    };
    
    this.exportJobs.set(id, job);
    
    // Process the export job synchronously for demonstration
    try {
      console.log('Starting export job processing for ID:', id);
      await this.processExportJob(id);
      console.log('Export job processing completed for ID:', id);
    } catch (error) {
      console.error('Export job processing failed:', error);
      await this.updateExportJobStatus(id, "failed", 0);
    }
    
    return job;
  }

  async getExportJobs(): Promise<any[]> {
    return Array.from(this.exportJobs.values())
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async updateExportJobStatus(jobId: string, status: string, progress?: number): Promise<any> {
    const job = this.exportJobs.get(jobId);
    if (!job) {
      throw new Error("Export job not found");
    }
    
    job.status = status;
    if (progress !== undefined) {
      job.progress = progress;
    }
    
    this.exportJobs.set(jobId, job);
    return job;
  }

  async processExportJob(jobId: string): Promise<void> {
    const job = this.exportJobs.get(jobId);
    if (!job) return;

    try {
      // Update status to processing
      await this.updateExportJobStatus(jobId, "processing", 10);

      // Generate data based on config
      const data = await this.generateExportData(job.config);
      await this.updateExportJobStatus(jobId, "processing", 50);

      // Format data based on requested format
      const formattedData = await this.formatExportData(data, job.format);
      await this.updateExportJobStatus(jobId, "processing", 80);

      // Store the formatted data
      job.data = formattedData;
      job.downloadUrl = `#`; // In a real app, this would be a file URL
      
      await this.updateExportJobStatus(jobId, "completed", 100);
    } catch (error) {
      await this.updateExportJobStatus(jobId, "failed", 0);
    }
  }

  private async generateExportData(config: any): Promise<any> {
    const { dataTypes, dateRange } = config;
    const result: any = {};

    for (const dataType of dataTypes) {
      switch (dataType) {
        case 'rankings':
          result.rankings = await this.exportRankingData(dateRange);
          break;
        case 'alerts':
          result.alerts = await this.exportAlertsData(dateRange);
          break;
        case 'submissions':
          result.submissions = await this.exportSubmissionsData(dateRange);
          break;
        case 'events':
          result.events = await this.exportEventsData(dateRange);
          break;
        case 'metrics':
          result.metrics = await this.exportMetricsData(dateRange);
          break;
      }
    }

    return result;
  }

  private async exportRankingData(dateRange: any): Promise<any[]> {
    const fromDate = new Date(dateRange.from);
    const toDate = new Date(dateRange.to);
    
    const ranks = await db.select()
      .from(rankTimeSeries)
      .where(and(
        gte(rankTimeSeries.timestamp, fromDate),
        lte(rankTimeSeries.timestamp, toDate)
      ));
    
    return ranks.map(rank => ({
      timestamp: rank.timestamp,
      targetId: rank.targetId,
      query: rank.query,
      rank: rank.rank,
      device: rank.device,
      source: rank.source
    }));
  }

  private async exportAlertsData(dateRange: any): Promise<any[]> {
    const fromDate = new Date(dateRange.from);
    const toDate = new Date(dateRange.to);
    
    const alertsList = await db.select()
      .from(alerts)
      .where(and(
        gte(alerts.timestamp, fromDate),
        lte(alerts.timestamp, toDate)
      ));
    
    return alertsList.map(alert => ({
      id: alert.id,
      timestamp: alert.timestamp,
      rule: alert.rule,
      targetId: alert.targetId,
      prevRank: alert.prevRank,
      currRank: alert.currRank,
      delta: alert.delta,
      reason: alert.reason,
      seen: alert.seen
    }));
  }

  private async exportSubmissionsData(dateRange: any): Promise<any[]> {
    const fromDate = new Date(dateRange.from);
    const toDate = new Date(dateRange.to);
    
    const submissionsList = await db.select()
      .from(submissions)
      .where(and(
        gte(submissions.timestamp, fromDate),
        lte(submissions.timestamp, toDate)
      ));
    
    return submissionsList.map(submission => ({
      id: submission.id,
      timestamp: submission.timestamp,
      type: submission.type,
      status: submission.status,
      payload: submission.payload,
      owner: submission.owner,
      comment: submission.comment
    }));
  }

  private async exportEventsData(dateRange: any): Promise<any[]> {
    const fromDate = new Date(dateRange.from);
    const toDate = new Date(dateRange.to);
    
    const eventsList = await db.select()
      .from(events)
      .where(and(
        gte(events.timestamp, fromDate),
        lte(events.timestamp, toDate)
      ));
    
    return eventsList.map(event => ({
      id: event.id,
      timestamp: event.timestamp,
      type: event.type,
      targetId: event.targetId,
      actor: event.actor,
      payload: event.payload,
      severity: event.severity
    }));
  }

  private async exportMetricsData(dateRange: any): Promise<any[]> {
    const fromDate = new Date(dateRange.from);
    const toDate = new Date(dateRange.to);
    
    return Array.from(this.reviewMetrics.values())
      .filter(metric => {
        const metricDate = new Date(metric.timestamp);
        return metricDate >= fromDate && metricDate <= toDate;
      })
      .map(metric => ({
        timestamp: metric.timestamp,
        productKey: metric.productKey,
        starAvg: metric.starAvg,
        reviewCount: metric.reviewCount,
        photoRatio: metric.photoRatio,
        newReviews7d: metric.newReviews7d,
        newReviews30d: metric.newReviews30d
      }));
  }

  private async formatExportData(data: any, format: string): Promise<string> {
    switch (format.toLowerCase()) {
      case 'csv':
        return this.formatAsCSV(data);
      case 'xlsx':
        return this.formatAsExcel(data);
      case 'json':
        return JSON.stringify(data, null, 2);
      case 'pdf':
        return this.formatAsPDF(data);
      default:
        return JSON.stringify(data, null, 2);
    }
  }

  private formatAsCSV(data: any): string {
    let csv = '';
    
    for (const [dataType, records] of Object.entries(data)) {
      if (!Array.isArray(records) || records.length === 0) continue;
      
      csv += `\n=== ${dataType.toUpperCase()} ===\n`;
      
      // Get headers from first record
      const headers = Object.keys(records[0]);
      csv += headers.join(',') + '\n';
      
      // Add data rows
      for (const record of records) {
        const row = headers.map(header => {
          const value = record[header];
          if (typeof value === 'string' && value.includes(',')) {
            return `"${value.replace(/"/g, '""')}"`;
          }
          return value || '';
        });
        csv += row.join(',') + '\n';
      }
      
      csv += '\n';
    }
    
    return csv;
  }

  private formatAsExcel(data: any): string {
    // In a real implementation, you'd use a library like xlsx or exceljs
    // For now, return CSV format as Excel can open CSV files
    return this.formatAsCSV(data);
  }

  private formatAsPDF(data: any): string {
    // In a real implementation, you'd use a library like jsPDF or pdfkit
    // For now, return a formatted text representation
    let pdf = 'DATA EXPORT REPORT\n';
    pdf += '===================\n\n';
    
    for (const [dataType, records] of Object.entries(data)) {
      if (!Array.isArray(records)) continue;
      
      pdf += `${dataType.toUpperCase()}:\n`;
      pdf += `Records: ${records.length}\n\n`;
      
      // Show first few records as sample
      const sample = records.slice(0, 3);
      for (const record of sample) {
        pdf += JSON.stringify(record, null, 2) + '\n\n';
      }
      
      if (records.length > 3) {
        pdf += `... and ${records.length - 3} more records\n\n`;
      }
    }
    
    return pdf;
  }

  async getExportDownload(jobId: string): Promise<any> {
    const job = this.exportJobs.get(jobId);
    if (!job || job.status !== "completed") {
      throw new Error("Export job not found or not completed");
    }
    
    const mimeTypes: Record<string, string> = {
      csv: 'text/csv',
      xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      json: 'application/json',
      pdf: 'application/pdf'
    };
    
    return {
      filename: `export-${job.createdAt.toISOString().split('T')[0]}-${jobId.substring(0, 8)}.${job.format}`,
      data: job.data || 'No data available',
      mimeType: mimeTypes[job.format] || 'text/plain'
    };
  }

  // Manual Blog Entries Implementation
  async getManualBlogEntries(): Promise<ManualBlogEntry[]> {
    return Array.from(this.manualBlogEntries.values())
      .filter(entry => entry.isActive)
      .sort((a, b) => b.submittedAt.getTime() - a.submittedAt.getTime());
  }

  async createManualBlogEntry(data: InsertManualBlogEntry): Promise<ManualBlogEntry> {
    const id = randomUUID();
    const now = new Date();
    const entry: ManualBlogEntry = {
      id,
      ...data,
      notes: data.notes ?? null,
      rank: data.rank ?? null,
      submittedAt: now,
      updatedAt: now,
      isActive: true,
    };
    this.manualBlogEntries.set(id, entry);
    return entry;
  }

  async updateManualBlogEntry(id: string, updates: Partial<ManualBlogEntry>): Promise<ManualBlogEntry> {
    const entry = this.manualBlogEntries.get(id);
    if (!entry) {
      throw new Error(`Manual blog entry not found: ${id}`);
    }
    const updated = { ...entry, ...updates, updatedAt: new Date() };
    this.manualBlogEntries.set(id, updated);
    return updated;
  }

  async deleteManualBlogEntry(id: string): Promise<void> {
    const entry = this.manualBlogEntries.get(id);
    if (!entry) {
      throw new Error(`Manual blog entry not found: ${id}`);
    }
    // Soft delete by setting isActive to false
    const updated = { ...entry, isActive: false, updatedAt: new Date() };
    this.manualBlogEntries.set(id, updated);
  }

  // v6 Blog Targets Implementation
  async getBlogTargets(owner?: string): Promise<BlogTarget[]> {
    const targets = Array.from(this.blogTargets.values())
      .filter(target => target.active)
      .filter(target => !owner || target.owner === owner)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return targets;
  }

  async createBlogTarget(data: InsertBlogTarget): Promise<BlogTarget> {
    const id = randomUUID();
    const now = new Date();
    const target: BlogTarget = {
      id,
      ...data,
      queries: data.queries as string[],
      windowMin: data.windowMin ?? null,
      windowMax: data.windowMax ?? null,
      scheduleCron: data.scheduleCron ?? null,
      active: data.active ?? true,  // 기본값을 true로 설정하여 getBlogTargets에서 조회되도록 함
      createdAt: now,
    };
    this.blogTargets.set(id, target);
    return target;
  }

  async updateBlogTarget(id: string, updates: Partial<BlogTarget>): Promise<BlogTarget> {
    const target = this.blogTargets.get(id);
    if (!target) {
      throw new Error(`Blog target not found: ${id}`);
    }
    const updated = { ...target, ...updates };
    this.blogTargets.set(id, updated);
    return updated;
  }

  async deleteBlogTarget(id: string): Promise<void> {
    const target = this.blogTargets.get(id);
    if (!target) {
      throw new Error(`Blog target not found: ${id}`);
    }
    // Soft delete by setting active to false
    const updated = { ...target, active: false };
    this.blogTargets.set(id, updated);
  }

  async getBlogTarget(id: string): Promise<BlogTarget | null> {
    const target = this.blogTargets.get(id);
    return (target && target.active) ? target : null;
  }

  // Owner-aware methods for security
  async getBlogTargetById(owner: string, id: string): Promise<BlogTarget | null> {
    const target = this.blogTargets.get(id);
    if (!target || target.owner !== owner || !target.active) {
      return null;
    }
    return target;
  }

  async updateBlogTargetByOwner(owner: string, id: string, updates: Partial<BlogTarget>): Promise<BlogTarget | null> {
    const target = this.blogTargets.get(id);
    if (!target || target.owner !== owner || !target.active) {
      return null;
    }
    const updated = { ...target, ...updates };
    this.blogTargets.set(id, updated);
    return updated;
  }

  async deleteBlogTargetByOwner(owner: string, id: string): Promise<boolean> {
    const target = this.blogTargets.get(id);
    if (!target || target.owner !== owner || !target.active) {
      return false;
    }
    // Soft delete by setting active to false
    const updated = { ...target, active: false };
    this.blogTargets.set(id, updated);
    return true;
  }

  // v6 Product Targets Implementation
  async getProductTargets(owner?: string): Promise<ProductTarget[]> {
    const targets = Array.from(this.productTargets.values())
      .filter(target => target.active)
      .filter(target => !owner || target.owner === owner)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return targets;
  }

  async createProductTarget(data: InsertProductTarget): Promise<ProductTarget> {
    const id = randomUUID();
    const now = new Date();
    const target: ProductTarget = {
      id,
      ...data,
      queries: data.queries as string[],
      windowMin: data.windowMin ?? null,
      windowMax: data.windowMax ?? null,
      scheduleCron: data.scheduleCron ?? null,
      sortDefault: data.sortDefault ?? null,
      deviceDefault: data.deviceDefault ?? null,
      active: data.active ?? null,
      createdAt: now,
    };
    this.productTargets.set(id, target);
    return target;
  }

  async updateProductTarget(id: string, updates: Partial<ProductTarget>): Promise<ProductTarget> {
    const target = this.productTargets.get(id);
    if (!target) {
      throw new Error(`Product target not found: ${id}`);
    }
    const updated = { ...target, ...updates };
    this.productTargets.set(id, updated);
    return updated;
  }

  async deleteProductTarget(id: string): Promise<void> {
    const target = this.productTargets.get(id);
    if (!target) {
      throw new Error(`Product target not found: ${id}`);
    }
    // Soft delete by setting active to false
    const updated = { ...target, active: false };
    this.productTargets.set(id, updated);
  }

  async getProductTarget(id: string): Promise<ProductTarget | null> {
    const target = this.productTargets.get(id);
    return (target && target.active) ? target : null;
  }

  // Owner-aware methods for security  
  async getProductTargetById(owner: string, id: string): Promise<ProductTarget | null> {
    const target = this.productTargets.get(id);
    if (!target || target.owner !== owner || !target.active) {
      return null;
    }
    return target;
  }

  async updateProductTargetByOwner(owner: string, id: string, updates: Partial<ProductTarget>): Promise<ProductTarget | null> {
    const target = this.productTargets.get(id);
    if (!target || target.owner !== owner || !target.active) {
      return null;
    }
    const updated = { ...target, ...updates };
    this.productTargets.set(id, updated);
    return updated;
  }

  async deleteProductTargetByOwner(owner: string, id: string): Promise<boolean> {
    const target = this.productTargets.get(id);
    if (!target || target.owner !== owner || !target.active) {
      return false;
    }
    // Soft delete by setting active to false
    const updated = { ...target, active: false };
    this.productTargets.set(id, updated);
    return true;
  }

  // v6 Rank Snapshots Implementation
  async getRankSnapshots(owner: string, targetId?: string, kind?: string, range = "30d"): Promise<RankSnapshot[]> {
    const days = parseInt(range.replace('d', ''));
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    // Get owner's active blog targets for validation
    const ownerTargets = Array.from(this.blogTargets.values())
      .filter(target => target.owner === owner && target.active)
      .map(target => target.id);

    const snapshots = Array.from(this.rankSnapshots.values())
      .filter(snapshot => ownerTargets.includes(snapshot.targetId)) // Owner validation
      .filter(snapshot => snapshot.timestamp >= cutoffDate)
      .filter(snapshot => !targetId || snapshot.targetId === targetId)
      .filter(snapshot => !kind || snapshot.kind === kind)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    
    return snapshots;
  }

  async insertRankSnapshot(owner: string, data: InsertRankSnapshot): Promise<RankSnapshot> {
    // Verify that targetId belongs to the owner by checking blogTargets
    const targetOwnership = Array.from(this.blogTargets.values())
      .find(target => target.id === data.targetId && target.owner === owner && target.active);

    if (!targetOwnership) {
      throw new Error('Unauthorized: Target does not belong to the specified owner or is inactive');
    }

    const id = randomUUID();
    const snapshot: RankSnapshot = {
      id,
      ...data,
      sort: data.sort ?? null,
      rank: data.rank ?? null,
      page: data.page ?? null,
      position: data.position ?? null,
      metadata: data.metadata ?? null,
      timestamp: new Date(),
    };
    this.rankSnapshots.set(id, snapshot);
    return snapshot;
  }

  async getRankSnapshotHistory(owner: string, targetId: string, kind: string, query?: string, sort?: string, device?: string, range = "30d"): Promise<RankSnapshot[]> {
    const days = parseInt(range.replace('d', ''));
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    // Validate target ownership
    const target = this.blogTargets.get(targetId);
    if (!target || target.owner !== owner || !target.active) {
      throw new Error('Target not found or access denied');
    }

    const snapshots = Array.from(this.rankSnapshots.values())
      .filter(snapshot => 
        snapshot.targetId === targetId &&
        snapshot.kind === kind &&
        snapshot.timestamp >= cutoffDate &&
        (!query || snapshot.query === query) &&
        (!sort || snapshot.sort === sort) &&
        (!device || snapshot.device === device)
      )
      .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    
    return snapshots;
  }

  // v6 Metric Snapshots Implementation
  async getMetricSnapshots(owner: string, productKey?: string, range = "30d"): Promise<MetricSnapshot[]> {
    const days = parseInt(range.replace('d', ''));
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    // Get owner's active product targets for validation
    const ownerProducts = Array.from(this.productTargets.values())
      .filter(target => target.owner === owner && target.active)
      .map(target => target.id);

    const snapshots = Array.from(this.metricSnapshots.values())
      .filter(snapshot => ownerProducts.includes(snapshot.productKey)) // Owner validation
      .filter(snapshot => snapshot.timestamp >= cutoffDate)
      .filter(snapshot => !productKey || snapshot.productKey === productKey)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    
    return snapshots;
  }

  async insertMetricSnapshot(owner: string, data: InsertMetricSnapshot): Promise<MetricSnapshot> {
    // Verify that productKey belongs to the owner by checking productTargets
    const productOwnership = Array.from(this.productTargets.values())
      .find(product => product.id === data.productKey && product.owner === owner && product.active);

    if (!productOwnership) {
      throw new Error('Unauthorized: Product does not belong to the specified owner or is inactive');
    }

    const id = randomUUID();
    const snapshot: MetricSnapshot = {
      id,
      ...data,
      source: 'system',
      metadata: data.metadata ?? null,
      starAvg: data.starAvg ?? null,
      reviewCount: data.reviewCount ?? null,
      photoRatio: data.photoRatio ?? null,
      newReviews7d: data.newReviews7d ?? null,
      newReviews30d: data.newReviews30d ?? null,
      qaCount: data.qaCount ?? null,
      price: data.price ?? null,
      stockFlag: data.stockFlag ?? null,
      timestamp: new Date(),
    };
    this.metricSnapshots.set(id, snapshot);
    return snapshot;
  }

  async getMetricHistory(owner: string, productKey: string, range = "30d"): Promise<MetricSnapshot[]> {
    // Validate product ownership
    const product = this.productTargets.get(productKey);
    if (!product || product.owner !== owner || !product.active) {
      throw new Error('Product not found or access denied');
    }

    const days = parseInt(range.replace('d', ''));
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    const snapshots = Array.from(this.metricSnapshots.values())
      .filter(snapshot => 
        snapshot.productKey === productKey &&
        snapshot.timestamp >= cutoffDate
      )
      .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    
    return snapshots;
  }

  // v6 Review State Implementation
  async getReviewState(owner: string, productKey: string): Promise<ReviewState | null> {
    // Validate product ownership
    const product = this.productTargets.get(productKey);
    if (!product || product.owner !== owner || !product.active) {
      return null;
    }
    
    return this.reviewStates.get(productKey) || null;
  }

  async updateReviewState(owner: string, data: InsertReviewState): Promise<ReviewState> {
    // Validate product ownership
    const product = this.productTargets.get(data.productKey);
    if (!product || product.owner !== owner || !product.active) {
      throw new Error('Product not found or access denied');
    }
    
    const state: ReviewState = {
      ...data,
      lastReviewId: data.lastReviewId ?? null,
      lastCheckedAt: new Date()
    };
    this.reviewStates.set(data.productKey, state);
    return state;
  }

  // v7 Group CRUD Implementation - Owner-aware for security
  async getGroups(owner: string): Promise<Group[]> {
    return Array.from(this.groups.values())
      .filter(group => group.owner === owner)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async getGroupById(owner: string, id: string): Promise<Group | null> {
    const group = this.groups.get(id);
    if (!group || group.owner !== owner) {
      return null;
    }
    return group;
  }

  async createGroup(data: InsertGroup): Promise<Group> {
    const id = randomUUID();
    const group: Group = {
      id,
      ...data,
      active: data.active ?? null,
      description: data.description ?? null,
      color: data.color ?? null,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    this.groups.set(id, group);
    return group;
  }

  async updateGroupByOwner(owner: string, id: string, updates: Partial<Group>): Promise<Group | null> {
    const group = this.groups.get(id);
    if (!group || group.owner !== owner) {
      return null;
    }
    
    const updated: Group = {
      ...group,
      ...updates,
      id, // Ensure ID doesn't change
      owner, // Ensure owner doesn't change
      updatedAt: new Date()
    };
    this.groups.set(id, updated);
    return updated;
  }

  async deleteGroupByOwner(owner: string, id: string): Promise<boolean> {
    const group = this.groups.get(id);
    if (!group || group.owner !== owner) {
      return false;
    }
    return this.groups.delete(id);
  }

  // v7 Group Keywords Implementation
  async getGroupKeywords(groupId: string): Promise<GroupKeyword[]> {
    return Array.from(this.groupKeywords.values())
      .filter(gk => gk.groupId === groupId)
      .sort((a, b) => b.addedAt.getTime() - a.addedAt.getTime());
  }

  async addGroupKeyword(data: InsertGroupKeyword): Promise<GroupKeyword> {
    const id = randomUUID();
    const groupKeyword: GroupKeyword = {
      id,
      ...data,
      addedAt: new Date()
    };
    this.groupKeywords.set(id, groupKeyword);
    return groupKeyword;
  }

  async removeGroupKeyword(groupId: string, keyword: string): Promise<boolean> {
    const keywordEntry = Array.from(this.groupKeywords.entries())
      .find(([, gk]) => gk.groupId === groupId && gk.keyword === keyword);
    
    if (keywordEntry) {
      return this.groupKeywords.delete(keywordEntry[0]);
    }
    return false;
  }

  // v7 Group Index Implementation
  async getGroupIndexDaily(groupId: string, range = "30d"): Promise<GroupIndexDaily[]> {
    const days = parseInt(range.replace('d', ''));
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    return Array.from(this.groupIndexDaily.values())
      .filter(index => index.groupId === groupId && index.date >= cutoffDate)
      .sort((a, b) => b.date.getTime() - a.date.getTime());
  }

  // v7 Rank Aggregation Daily Implementation
  async getRankAggDay(targetId: string, keyword: string, range = "30d"): Promise<RankAggDay[]> {
    const days = parseInt(range.replace('d', ''));
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    return Array.from(this.rankAggDay.values())
      .filter(agg => 
        agg.targetId === targetId &&
        agg.keyword === keyword &&
        agg.date >= cutoffDate
      )
      .sort((a, b) => b.date.getTime() - a.date.getTime());
  }

  async insertRankAggDay(data: InsertRankAggDay): Promise<RankAggDay> {
    const id = randomUUID();
    const aggDay: RankAggDay = {
      id,
      ...data,
      avgRank: data.avgRank ?? null,
      minRank: data.minRank ?? null,
      maxRank: data.maxRank ?? null,
      deltaDaily: data.deltaDaily ?? null,
      deltaWeekly: data.deltaWeekly ?? null,
      checkCount: data.checkCount ?? null,
      volatility: data.volatility ?? null
    };
    this.rankAggDay.set(id, aggDay);
    return aggDay;
  }

  async insertGroupIndexDaily(data: InsertGroupIndexDaily): Promise<GroupIndexDaily> {
    const id = randomUUID();
    const groupIndex: GroupIndexDaily = {
      id,
      ...data
    };
    this.groupIndexDaily.set(id, groupIndex);
    return groupIndex;
  }

  // v7 Collection Rules and State Implementation - Owner-aware for security
  async getCollectionRules(owner: string): Promise<CollectionRule[]> {
    return Array.from(this.collectionRules.values())
      .filter(rule => rule.owner === owner)
      .sort((a, b) => {
        // Sort by priority first (higher priority first), then by creation date
        if (a.priority !== b.priority) {
          return (b.priority ?? 0) - (a.priority ?? 0);
        }
        return b.createdAt.getTime() - a.createdAt.getTime();
      });
  }

  async getCollectionState(owner: string, targetId: string, keyword: string): Promise<CollectionState | null> {
    const state = Array.from(this.collectionState.values())
      .find(cs => 
        cs.owner === owner &&
        cs.targetId === targetId &&
        cs.keyword === keyword
      );
    return state || null;
  }

  // v7 Database Page APIs Implementation
  async createCollectionRule(data: InsertCollectionRule): Promise<CollectionRule> {
    const id = randomUUID();
    const rule: CollectionRule = {
      id,
      ...data,
      active: data.active ?? true,
      priority: data.priority ?? 5,
      lastTriggered: null,
      createdAt: new Date()
    };
    this.collectionRules.set(id, rule);
    return rule;
  }

  async updateCollectionRuleByOwner(owner: string, id: string, updates: Partial<CollectionRule>): Promise<CollectionRule | null> {
    const existing = this.collectionRules.get(id);
    if (!existing || existing.owner !== owner) {
      return null;
    }
    const updated: CollectionRule = { ...existing, ...updates };
    this.collectionRules.set(id, updated);
    return updated;
  }

  async deleteCollectionRuleByOwner(owner: string, id: string): Promise<boolean> {
    const existing = this.collectionRules.get(id);
    if (!existing || existing.owner !== owner) {
      return false;
    }
    this.collectionRules.delete(id);
    return true;
  }

  async updateCollectionState(owner: string, data: InsertCollectionState): Promise<CollectionState> {
    // Find existing by composite key
    const existing = Array.from(this.collectionState.values())
      .find(cs => 
        cs.owner === owner &&
        cs.targetId === data.targetId &&
        cs.keyword === data.keyword
      );

    if (existing) {
      const updated: CollectionState = {
        ...existing,
        ...data,
        owner, // ensure owner consistency
        lastRank: data.lastRank ?? existing.lastRank,
        consecutiveFailures: data.consecutiveFailures ?? existing.consecutiveFailures,
        checkInterval: data.checkInterval ?? existing.checkInterval,
        nextCheckAt: data.nextCheckAt ?? existing.nextCheckAt,
        costScore: data.costScore ?? existing.costScore,
        autoStopped: data.autoStopped ?? existing.autoStopped,
        lastCheckAt: new Date()
      };
      this.collectionState.set(existing.id, updated);
      return updated;
    } else {
      const id = randomUUID();
      const newState: CollectionState = {
        id,
        ...data,
        owner,
        lastRank: data.lastRank ?? null,
        consecutiveFailures: data.consecutiveFailures ?? 0,
        checkInterval: data.checkInterval ?? "1h",
        nextCheckAt: data.nextCheckAt ?? null,
        costScore: data.costScore ?? null,
        autoStopped: data.autoStopped ?? false,
        lastCheckAt: new Date(),
        autoStoppedAt: null
      };
      this.collectionState.set(id, newState);
      return newState;
    }
  }

  async getKeywordRepository(owner: string): Promise<any[]> {
    // Get keywords from groups owned by user
    const ownerGroups = Array.from(this.groups.values())
      .filter(group => group.owner === owner);
    
    const keywordMap = new Map();
    
    // Aggregate keywords from all owner's groups
    for (const group of ownerGroups) {
      const keywords = Array.from(this.groupKeywords.values())
        .filter(gk => gk.groupId === group.id);
      
      for (const gk of keywords) {
        if (!keywordMap.has(gk.keyword)) {
          keywordMap.set(gk.keyword, {
            id: `kw-${gk.keyword}`,
            keyword: gk.keyword,
            volume: Math.floor(Math.random() * 2000) + 500,
            score: Math.floor(Math.random() * 30) + 70,
            status: "active",
            lastChecked: "5분 전",
            groupCount: 0,
            rankHistory: []
          });
        }
        keywordMap.get(gk.keyword).groupCount++;
      }
    }

    // Get status from collection rules
    const statusRules = Array.from(this.collectionRules.values())
      .filter(rule => 
        rule.owner === owner && 
        (rule.conditions as any)?.ruleType === 'keyword_status'
      );

    for (const rule of statusRules) {
      const keyword = (rule.conditions as any)?.keyword;
      const status = (rule.actions as any)?.status || "active";
      if (keywordMap.has(keyword)) {
        keywordMap.get(keyword).status = status;
      }
    }

    return Array.from(keywordMap.values());
  }

  async updateKeywordStatus(owner: string, keyword: string, status: string): Promise<boolean> {
    // Find existing keyword status rule
    const existing = Array.from(this.collectionRules.values())
      .find(rule => 
        rule.owner === owner &&
        (rule.conditions as any)?.ruleType === 'keyword_status' &&
        (rule.conditions as any)?.keyword === keyword
      );

    const ruleData = {
      owner,
      name: `키워드 상태: ${keyword}`,
      conditions: { ruleType: "keyword_status", keyword },
      actions: { status },
      priority: 5,
      active: true
    };

    if (existing) {
      const updated: CollectionRule = {
        ...existing,
        ...ruleData,
        id: existing.id,
        createdAt: existing.createdAt
      };
      this.collectionRules.set(existing.id, updated);
    } else {
      const id = randomUUID();
      const newRule: CollectionRule = {
        id,
        ...ruleData,
        lastTriggered: null,
        createdAt: new Date()
      };
      this.collectionRules.set(id, newRule);
    }

    return true;
  }

  async getTargetManagement(owner: string): Promise<any[]> {
    const targets = Array.from(this.targets.values())
      .filter(target => target.owner === owner);

    return targets.map((target, index) => ({
      ...target,
      statusDetail: target.enabled ? 
        (["running", "paused", "error", "idle"][index % 4] as any) : "paused",
      lastRun: ["5분 전", "10분 전", "1시간 전", "3시간 전"][index % 4] || "5분 전",
      nextRun: ["10분 후", "20분 후", "1시간 후", "중지됨"][index % 4] || "10분 후",
      successRate: [98.5, 95.2, 87.3, 92.1][index % 4] || 95.0,
      keywordCount: target.query ? target.query.split(' ').length : Math.floor(Math.random() * 10) + 1
    }));
  }

  async updateTargetSchedule(owner: string, targetId: string, schedule: any): Promise<boolean> {
    const target = this.targets.get(targetId);
    if (!target || target.owner !== owner) {
      return false;
    }
    const updated: TrackedTarget = {
      ...target,
      schedule: schedule.interval || schedule
    };
    this.targets.set(targetId, updated);
    return true;
  }

  async getSnapshotAggregation(owner: string, range = "7d"): Promise<any[]> {
    const days = parseInt(range.replace('d', ''));
    
    // Get owner's targets
    const ownerTargets = Array.from(this.targets.values())
      .filter(target => target.owner === owner);

    if (ownerTargets.length === 0) {
      return Array.from({ length: days }, (_, i) => {
        const date = new Date();
        date.setDate(date.getDate() - i);
        return {
          date: date.toLocaleDateString('ko-KR'),
          totalChecks: 0,
          successfulChecks: 0,
          avgRank: 0,
          topKeywords: 0,
          dataSize: "0MB"
        };
      });
    }

    // Generate mock aggregation data
    return Array.from({ length: days }, (_, i) => {
      const date = new Date();
      date.setDate(date.getDate() - i);
      return {
        date: date.toLocaleDateString('ko-KR'),
        totalChecks: Math.floor(Math.random() * 500) + 200,
        successfulChecks: Math.floor(Math.random() * 450) + 150,
        avgRank: Math.floor(Math.random() * 10) + 8,
        topKeywords: Math.floor(Math.random() * 50) + 20,
        dataSize: `${(Math.random() * 50 + 10).toFixed(1)}MB`
      };
    });
  }

  async getTokenUsageStats(owner: string): Promise<any> {
    // Mock token usage stats
    return {
      today: Math.floor(Math.random() * 5000) + 1000,
      dailyLimit: 10000,
      usagePercent: Math.floor(Math.random() * 80) + 20,
      cacheHitRate: Math.floor(Math.random() * 20) + 80,
      errorRate: Math.floor(Math.random() * 20) / 10,
      avgResponseTime: Math.floor(Math.random() * 20) / 10 + 0.5
    };
  }

  // v7 Dashboard APIs Implementation (MemStorage)
  async getRollingAlerts(owner: string, isActive = true): Promise<RollingAlert[]> {
    // Mock rolling alerts data for Top Ticker
    const mockAlerts: RollingAlert[] = [
      {
        id: "alert-1",
        owner,
        type: "alert",
        icon: "TrendingDown",
        message: "홍삼스틱 키워드 8위 → 15위 급락 (-7) - 경쟁사 신규 포스팅 영향",
        time: "30분 전",
        priority: 1,
        isActive: true,
        targetId: "target-1",
        createdAt: new Date(),
      },
      {
        id: "alert-2", 
        owner,
        type: "success",
        icon: "TrendingUp",
        message: "홍삼 추천 키워드 Top 5 진입! 7위 → 4위 (+3) - 목표 달성",
        time: "1시간 전",
        priority: 2,
        isActive: true,
        targetId: "target-2",
        createdAt: new Date(),
      },
      {
        id: "alert-3",
        owner,
        type: "warning",
        icon: "AlertTriangle",
        message: "신규 경쟁사 5개 포스팅 감지 - 홍삼 관련 키워드 모니터링 강화 필요",
        time: "2시간 전",
        priority: 3,
        isActive: true,
        targetId: null,
        createdAt: new Date(),
      }
    ];

    return mockAlerts.filter(alert => isActive === undefined || alert.isActive === isActive);
  }

  async createRollingAlert(data: InsertRollingAlert): Promise<RollingAlert> {
    const newAlert: RollingAlert = {
      id: randomUUID(),
      createdAt: new Date(),
      ...data,
      targetId: data.targetId ?? null,
      isActive: data.isActive ?? true,
      priority: data.priority ?? 5,
      icon: data.icon ?? null,
    };
    return newAlert;
  }

  async updateRollingAlertStatus(owner: string, alertId: string, isActive: boolean): Promise<boolean> {
    // Mock update - always return success for demo
    return true;
  }

  async getDashboardSettings(owner: string): Promise<DashboardSettings[]> {
    // Mock dashboard settings
    const mockSettings: DashboardSettings[] = [
      {
        id: "setting-1",
        owner,
        cardId: "kpi-overview",
        visible: true,
        order: 1,
        size: "medium",
        position: { x: 0, y: 0 },
        config: {},
        updatedAt: new Date(),
      },
      {
        id: "setting-2",
        owner,
        cardId: "trend-chart",
        visible: true,
        order: 2,
        size: "large",
        position: { x: 1, y: 0 },
        config: {},
        updatedAt: new Date(),
      },
      {
        id: "setting-3",
        owner,
        cardId: "rank-distribution",
        visible: true,
        order: 3,
        size: "medium",
        position: { x: 0, y: 1 },
        config: {},
        updatedAt: new Date(),
      }
    ];

    return mockSettings;
  }

  async updateDashboardSettings(owner: string, cardId: string, settings: Partial<InsertDashboardSettings>): Promise<DashboardSettings> {
    // Mock update - return updated settings
    const updatedSettings: DashboardSettings = {
      id: randomUUID(),
      owner,
      cardId,
      visible: settings.visible ?? true,
      order: settings.order ?? 1,
      size: settings.size ?? "medium",
      position: settings.position ?? { x: 0, y: 0 },
      config: settings.config ?? {},
      updatedAt: new Date(),
    };
    return updatedSettings;
  }

  // v7 Target Keywords operations implementation (Mock)
  async getTargetKeywords(targetId: string): Promise<TargetKeyword[]> {
    const results: TargetKeyword[] = [];
    // Map iteration을 Array.from()으로 안전하게 처리
    const allKeywords = Array.from(this.targetKeywords.values());
    for (const keyword of allKeywords) {
      if (keyword.targetId === targetId && keyword.active) {
        results.push(keyword);
      }
    }
    return results.sort((a, b) => a.keywordText.localeCompare(b.keywordText));
  }

  async addTargetKeywords(owner: string, targetId: string, keywords: string[], addedBy: string): Promise<TargetKeyword[]> {
    // Mock owner validation (중요한 데이터베이스 안전 규칙)
    const target = Array.from(this.blogTargets.values()).find(t => t.id === targetId && t.owner === owner);
    if (!target) {
      throw new Error(`Unauthorized: Target ${targetId} does not belong to owner ${owner}`);
    }

    // 키워드 정규화 및 추가 (소문자 트림)
    const normalizedKeywords = keywords.map(kw => kw.trim().toLowerCase()).filter(kw => kw.length > 0);
    
    for (const keywordText of normalizedKeywords) {
      const key = `${targetId}-${keywordText}`;
      if (!this.targetKeywords.has(key)) {
        const newKeyword: TargetKeyword = {
          targetId,
          keywordText,
          active: true,
          addedBy,
          ts: new Date(),
        };
        this.targetKeywords.set(key, newKeyword);
      }
    }

    return await this.getTargetKeywords(targetId);
  }

  async removeTargetKeywords(owner: string, targetId: string, keywords: string[]): Promise<void> {
    // Mock owner validation (중요한 데이터베이스 안전 규칙)  
    const target = Array.from(this.blogTargets.values()).find(t => t.id === targetId && t.owner === owner);
    if (!target) {
      throw new Error(`Unauthorized: Target ${targetId} does not belong to owner ${owner}`);
    }

    // 키워드 정규화 및 제거 (소문자 트림)
    const normalizedKeywords = keywords.map(kw => kw.trim().toLowerCase()).filter(kw => kw.length > 0);
    
    for (const keywordText of normalizedKeywords) {
      const key = `${targetId}-${keywordText}`;
      this.targetKeywords.delete(key);
    }
  }

  async getBlogTargetsWithKeywords(owner: string): Promise<(BlogTarget & { keywords: string[] })[]> {
    // v7.12 임시 수정: owner 필터링 완화하여 디버깅
    console.log(`[DEBUG] getBlogTargetsWithKeywords called with owner: ${owner}`);
    console.log(`[DEBUG] Total blogTargets count: ${this.blogTargets.size}`);
    
    // 일단 owner 필터링 없이 active만 확인 (디버깅용)
    const allTargets = Array.from(this.blogTargets.values());
    console.log(`[DEBUG] All targets:`, allTargets.map(t => ({ id: t.id, owner: t.owner, active: t.active })));
    
    const targets = allTargets.filter(t => t.active);
    
    const result = [];
    for (const target of targets) {
      const keywords = await this.getTargetKeywords(target.id);
      result.push({
        ...target,
        // 키워드가 없으면 빈 배열 또는 기존 queries를 fallback으로 사용
        keywords: keywords.length > 0 ? keywords.map(tk => tk.keywordText) : (target.queries || [])
      });
    }

    return result;
  }
}

export const storage = new MemStorage();
