import type { 
  RankTimeSeries, 
  Alert, 
  Event, 
  Submission, 
  TrackedTarget,
  MetricTimeSeries 
} from "@shared/schema";

// Generate mock rank time series data
export const generateMockRankSeries = (targetId: string, days = 30): RankTimeSeries[] => {
  const data: RankTimeSeries[] = [];
  const baseRank = Math.floor(Math.random() * 20) + 5; // Random base rank between 5-25
  
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    
    // Add some realistic variation
    const variation = Math.floor(Math.random() * 6) - 3; // -3 to +3
    const rank = Math.max(1, Math.min(50, baseRank + variation));
    const page = Math.ceil(rank / 10);
    const position = rank % 10 || 10;
    
    data.push({
      id: `${targetId}-${i}`,
      targetId,
      kind: 'blog',
      query: targetId.includes('shopping') ? '홍삼스틱' : '홍삼',
      sort: targetId.includes('shopping') ? 'popularity' : null,
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
  
  return data;
};

// Generate mock alerts
export const generateMockAlerts = (): Alert[] => {
  const alertTypes = [
    { rule: 'top_10_entry', reason: 'Top 10 진입', severity: 'medium' as const },
    { rule: 'top_10_exit', reason: 'Top 10 이탈', severity: 'high' as const },
    { rule: 'rank_drop_5', reason: '5위 이상 하락', severity: 'high' as const },
    { rule: 'consecutive_drop_3', reason: '연속 3일 하락', severity: 'critical' as const },
    { rule: 'new_post', reason: '신규 포스팅 감지', severity: 'low' as const },
    { rule: 'abuse_review', reason: '악성 리뷰 감지', severity: 'medium' as const }
  ];

  const alerts: Alert[] = [];
  
  for (let i = 0; i < 15; i++) {
    const alertType = alertTypes[Math.floor(Math.random() * alertTypes.length)];
    const hoursAgo = Math.floor(Math.random() * 72); // Last 3 days
    const timestamp = new Date(Date.now() - hoursAgo * 60 * 60 * 1000);
    
    const prevRank = Math.floor(Math.random() * 20) + 5;
    const currRank = alertType.rule.includes('drop') ? 
      prevRank + Math.floor(Math.random() * 10) + 1 : 
      Math.max(1, prevRank - Math.floor(Math.random() * 5));
    
    alerts.push({
      id: `alert-${i}`,
      targetId: `target-${Math.floor(Math.random() * 5) + 1}`,
      rule: alertType.rule,
      timestamp,
      prevRank,
      currRank,
      delta: currRank - prevRank,
      reason: alertType.reason,
      cooldownUntil: new Date(timestamp.getTime() + 6 * 60 * 60 * 1000), // 6 hours cooldown
      seen: Math.random() > 0.3 // 70% unseen
    });
  }
  
  return alerts.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
};

// Generate mock events
export const generateMockEvents = (): Event[] => {
  const eventTypes = [
    { type: 'NewPost', actor: 'system', severity: 'low' as const },
    { type: 'NewReview', actor: 'system', severity: 'low' as const },
    { type: 'AbuseReview', actor: 'detector', severity: 'medium' as const },
    { type: 'StaffSubmit', actor: 'staff', severity: 'low' as const },
    { type: 'PriceChange', actor: 'monitor', severity: 'medium' as const },
    { type: 'StockOut', actor: 'monitor', severity: 'high' as const }
  ];

  const events: Event[] = [];
  
  for (let i = 0; i < 25; i++) {
    const eventType = eventTypes[Math.floor(Math.random() * eventTypes.length)];
    const hoursAgo = Math.floor(Math.random() * 168); // Last week
    
    events.push({
      id: `event-${i}`,
      targetId: `target-${Math.floor(Math.random() * 5) + 1}`,
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
  
  return events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
};

// Generate mock submissions
export const generateMockSubmissions = (): Submission[] => {
  const submissionTypes = ['blog', 'product', 'keyword'] as const;
  const statuses = ['pending', 'approved', 'rejected'] as const;
  const owners = ['김철수', '이영희', '박민수', '정지훈', '최서연'];
  
  const submissions: Submission[] = [];
  
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
    
    submissions.push({
      id: `submission-${i}`,
      owner,
      type,
      payload,
      status,
      timestamp: new Date(Date.now() - hoursAgo * 60 * 60 * 1000),
      comment: status === 'rejected' ? '추가 정보가 필요합니다' : null
    });
  }
  
  return submissions.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
};

// Generate mock tracked targets
export const generateMockTrackedTargets = (): TrackedTarget[] => {
  const keywords = ['홍삼', '홍삼스틱', '홍삼 효능', '홍삼 가격', '홍삼 추천'];
  const owners = ['system', 'admin', 'manager'];
  
  const targets: TrackedTarget[] = [];
  
  keywords.forEach((keyword, index) => {
    targets.push({
      id: `target-${index + 1}`,
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
      enabled: Math.random() > 0.2, // 80% enabled
      tags: ['홍삼', '건강식품', 'SEO'],
      createdAt: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000) // Last 30 days
    });
  });
  
  // Add some shopping targets
  const shoppingProducts = [
    { name: '진생가 홍삼스틱', key: 'ginseng_stick_001' },
    { name: '정관장 홍삼정', key: 'ginseng_extract_002' },
    { name: '고려홍삼 프리미엄', key: 'korea_ginseng_003' }
  ];
  
  shoppingProducts.forEach((product, index) => {
    targets.push({
      id: `shop-target-${index + 1}`,
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
      createdAt: new Date(Date.now() - Math.random() * 15 * 24 * 60 * 60 * 1000) // Last 15 days
    });
  });
  
  return targets.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
};

// Generate mock review metrics
export const generateMockReviewMetrics = (): MetricTimeSeries[] => {
  const productKeys = ['ginseng_stick_001', 'ginseng_extract_002', 'korea_ginseng_003'];
  const metrics: MetricTimeSeries[] = [];
  
  productKeys.forEach(productKey => {
    for (let i = 29; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      
      metrics.push({
        id: `metric-${productKey}-${i}`,
        productKey,
        timestamp: date,
        starAvg: (4.2 + Math.random() * 0.6).toFixed(1), // 4.2 - 4.8 stars
        reviewCount: Math.floor(Math.random() * 50) + 100, // 100-150 reviews
        photoRatio: (Math.random() * 0.3 + 0.4).toFixed(2), // 40-70% photo ratio
        newReviews7d: Math.floor(Math.random() * 20) + 5, // 5-25 new reviews
        newReviews30d: Math.floor(Math.random() * 80) + 20, // 20-100 new reviews
        qaCount: Math.floor(Math.random() * 10) + 2, // 2-12 Q&As
        price: Math.floor(Math.random() * 20000) + 30000, // 30,000-50,000 KRW
        stockFlag: Math.random() > 0.1 // 90% in stock
      });
    }
  });
  
  return metrics.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
};

// Generate analytics data for insights
export const generateMockAnalytics = () => {
  return {
    kpis: {
      averageRank: 8.3,
      dailyChange: -2.1,
      weeklyChange: 12.5,
      monthlyChange: -5.2,
      volatility7d: 2.1,
      sovPercentage: 15.3,
      topTenCount: 45,
      needsAttentionCount: 12
    },
    
    distribution: [
      { name: "1-10위", value: 45, color: "#10b981" },
      { name: "11-30위", value: 52, color: "#f59e0b" },
      { name: "31위 이하", value: 30, color: "#ef4444" }
    ],
    
    topMovers: {
      up: [
        { keyword: "홍삼 추천", prevRank: 7, currRank: 4, change: 3 },
        { keyword: "홍삼 가격", prevRank: 12, currRank: 9, change: 3 },
        { keyword: "홍삼 효과", prevRank: 18, currRank: 16, change: 2 }
      ],
      down: [
        { keyword: "홍삼스틱", prevRank: 8, currRank: 15, change: -7 },
        { keyword: "홍삼 복용법", prevRank: 25, currRank: 32, change: -7 },
        { keyword: "홍삼 부작용", prevRank: 45, currRank: null, change: null }
      ]
    },
    
    competitors: [
      { name: "우리", value: 15.3, color: "#3b82f6" },
      { name: "경쟁사 A", value: 22.1, color: "#ef4444" },
      { name: "경쟁사 B", value: 18.7, color: "#f59e0b" },
      { name: "경쟁사 C", value: 12.4, color: "#8b5cf6" },
      { name: "기타", value: 31.5, color: "#6b7280" }
    ],
    
    heatmap: Array.from({ length: 90 }, (_, i) => {
      const date = new Date();
      date.setDate(date.getDate() - (89 - i));
      return {
        date: date.toISOString().split('T')[0],
        value: Math.floor(Math.random() * 15)
      };
    })
  };
};

// Default export with all mock data generators
export const mockData = {
  generateRankSeries: generateMockRankSeries,
  generateAlerts: generateMockAlerts,
  generateEvents: generateMockEvents,
  generateSubmissions: generateMockSubmissions,
  generateTrackedTargets: generateMockTrackedTargets,
  generateReviewMetrics: generateMockReviewMetrics,
  generateAnalytics: generateMockAnalytics
};

export default mockData;
