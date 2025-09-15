import { 
  type RankTimeSeries, type InsertRankTimeSeries,
  type RankAggregated, type MetricTimeSeries, 
  type Event, type Alert,
  type Submission, type InsertSubmission,
  type TrackedTarget, type InsertTrackedTarget,
  type Settings, type InsertSettings
} from "@shared/schema";
import { randomUUID } from "crypto";

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

  constructor() {
    this.rankSeries = new Map();
    this.events = new Map();
    this.alerts = new Map();
    this.submissions = new Map();
    this.targets = new Map();
    this.settings = new Map();
    this.reviewMetrics = new Map();
    this.exportJobs = new Map();
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
      config
    };
    
    this.exportJobs.set(id, job);
    return job;
  }

  async getExportJobs(): Promise<any[]> {
    return Array.from(this.exportJobs.values())
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async getExportDownload(jobId: string): Promise<any> {
    const job = this.exportJobs.get(jobId);
    if (!job || job.status !== "completed") {
      throw new Error("Export job not found or not completed");
    }
    
    return {
      filename: `export-${jobId}.${job.format}`,
      data: "mock export data",
      mimeType: job.format === 'csv' ? 'text/csv' : 'application/json'
    };
  }
}

export const storage = new MemStorage();
