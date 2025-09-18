import { apiRequest } from "./queryClient";
import type { 
  RankTimeSeries, 
  Alert, 
  Event, 
  Submission, 
  TrackedTarget, 
  Settings,
  ManualBlogEntry,
  InsertSubmission,
  InsertTrackedTarget,
  InsertManualBlogEntry
} from "@shared/schema";

// v7.18: API 클라이언트 인터셉터 - 권한 헤더 강제 주입 + 디버깅
export const http = (path: string, init: RequestInit = {}) => {
  const h = new Headers(init.headers || {});
  
  // v7.18: 헤더 강제 설정 (localStorage 무시)
  const role = 'admin';
  const owner = 'system';
  
  h.set('x-role', role);
  h.set('x-owner', owner);
  
  // localStorage도 동기화
  localStorage.setItem('role', role);
  localStorage.setItem('owner', owner);
  
  // 디버깅: 헤더 확인
  console.log(`[http] ${path} - 헤더 설정: x-role=${role}, x-owner=${owner}`);
  
  return fetch(path, { ...init, headers: h, credentials: 'include' });
};

// React Query용 래퍼 (안전한 헤더 주입)
export const apiGet = (url: string) => http(url);
export const apiPost = (url: string, data?: any) => http(url, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: data ? JSON.stringify(data) : undefined
});
export const apiPatch = (url: string, data?: any) => http(url, {
  method: 'PATCH', 
  headers: { 'Content-Type': 'application/json' },
  body: data ? JSON.stringify(data) : undefined
});

// v7.17: 키워드 메타 호출 단일화 (새 훅/로컬 fetch 금지)
export async function lookupKeywordMeta(texts: string[]) {
  const q = encodeURIComponent(texts.join(','));
  const r = await http(`/api/keywords/lookup?texts=${q}`);
  if (!r.ok) throw new Error(`kw lookup ${r.status}`);
  return r.json(); // [{text, volume, score}]
}

// Real-time scraping API
export const scrapingApi = {
  // Health check for scraping service
  healthCheck: async () => {
    const response = await apiRequest("GET", "/api/scraping/health");
    return response.json();
  },

  // Start live rank check with real scraping
  rankCheck: async (config: {
    targetId: string;
    query: string;
    kind: 'blog' | 'shop';
    device: 'mobile' | 'pc';
    sort?: string;
    target?: string;
  }) => {
    const response = await apiRequest("POST", "/api/scraping/rank-check", config);
    return response.json();
  },

  // Batch rank check for multiple targets
  batchRankCheck: async (targets: Array<{
    targetId: string;
    query: string;
    kind: 'blog' | 'shop';
    device: 'mobile' | 'pc';
    sort?: string;
    target?: string;
  }>, abortController?: AbortController) => {
    const response = await apiRequest("POST", "/api/scraping/batch-rank-check", { targets }, abortController);
    return response.json();
  }
};

// Rank monitoring API (mock fallback)
export const rankApi = {
  // Get rank series data for a specific target
  getSeries: async (targetId: string, range = "30d"): Promise<RankTimeSeries[]> => {
    const response = await apiRequest("GET", `/api/mock/rank/series?target_id=${targetId}&range=${range}`);
    return response.json();
  },

  // Get rank comparison data for multiple targets
  getCompare: async (targetIds: string[], range = "30d"): Promise<RankTimeSeries[]> => {
    const params = targetIds.map(id => `targets[]=${id}`).join('&');
    const response = await apiRequest("GET", `/api/mock/rank/compare?${params}&range=${range}`);
    return response.json();
  },

  // Get events for a target
  getEvents: async (targetId?: string, range = "30d"): Promise<Event[]> => {
    const params = new URLSearchParams();
    if (targetId) params.append('target_id', targetId);
    params.append('range', range);
    
    const response = await apiRequest("GET", `/api/mock/rank/events?${params.toString()}`);
    return response.json();
  },

  // v7.12.2: Get rank check plan (계획 조회) - 배열 직렬화 수정
  plan: async (params: { 
    kind?: string; 
    target_ids?: string[]; 
    query_override?: string[]; 
  }) => {
    const searchParams = new URLSearchParams();
    if (params.kind) searchParams.append('kind', params.kind);
    if (params.target_ids && params.target_ids.length > 0) {
      // 배열을 JSON 문자열로 직렬화하거나 쉼표로 구분된 문자열로 전송
      searchParams.append('target_ids', params.target_ids.join(','));
    }
    if (params.query_override && params.query_override.length > 0) {
      // 배열을 JSON 문자열로 직렬화하거나 쉼표로 구분된 문자열로 전송
      searchParams.append('query_override', params.query_override.join(','));
    }
    
    console.log('[DEBUG] rankApi.plan sending params:', searchParams.toString());
    
    const response = await apiRequest("GET", `/api/rank/plan?${searchParams.toString()}`);
    const result = await response.json();
    
    console.log('[DEBUG] rankApi.plan received result:', result);
    
    return result;
  },

  // v7.12.2: Blog rank check (개별 실행)
  blogCheck: async (params: { 
    target_ids: string[]; 
    query_override: string[]; 
  }) => {
    if (params.target_ids.length !== 1 || params.query_override.length !== 1) {
      throw new Error('blogCheck는 단일 타겟과 키워드만 지원합니다');
    }
    
    const response = await apiRequest("POST", "/api/rank/blog/check", {
      targetId: params.target_ids[0],
      query: params.query_override[0],
      device: 'mobile',
      maxPages: 3
    });
    return response.json();
  },

  // v7.12.2: Blog batch check (배치 실행) - 올바른 스키마 사용
  batchBlogCheck: async (tasks: Array<{ target_id: string; query: string; nickname: string }>, abortController?: AbortController) => {
    // 배치 스크래핑 API 형식으로 변환
    const targets = tasks.map(task => ({
      targetId: task.target_id,
      query: task.query,
      kind: 'blog' as const,
      device: 'mobile' as const,
      sort: undefined,
      target: undefined
    }));

    const response = await apiRequest("POST", "/api/scraping/batch-rank-check", {
      targets
    }, abortController);
    return response.json();
  },

  // Start rank check for specific targets (legacy)
  startCheck: async (targetIds: string[]) => {
    return await apiRequest("POST", "/api/mock/rank/check", { targetIds });
  },

  // Get historical data for insights
  getHistory: async (targetId: string, period: "7d" | "30d" | "90d" = "30d") => {
    const response = await apiRequest("GET", `/api/mock/rank/history?target_id=${targetId}&period=${period}`);
    return response.json();
  }
};

// Alerts API
export const alertsApi = {
  // Get all alerts
  getAll: async (seen?: boolean): Promise<Alert[]> => {
    const params = seen !== undefined ? `?seen=${seen}` : '';
    const response = await apiRequest("GET", `/api/mock/alerts${params}`);
    return response.json();
  },

  // Mark alert as seen
  markSeen: async (alertId: string): Promise<void> => {
    await apiRequest("POST", `/api/mock/alerts/${alertId}/seen`);
  },

  // Get unread count
  getUnreadCount: async (): Promise<number> => {
    const alerts = await alertsApi.getAll(false);
    return alerts.length;
  }
};

// Submissions API
export const submissionsApi = {
  // Get submissions by status
  getByStatus: async (status?: string): Promise<Submission[]> => {
    const params = status ? `?status=${status}` : '';
    const response = await apiRequest("GET", `/api/mock/submissions${params}`);
    return response.json();
  },

  // Create new submission
  create: async (submission: InsertSubmission): Promise<Submission> => {
    const response = await apiRequest("POST", "/api/mock/submissions", submission);
    return response.json();
  },

  // Approve submission
  approve: async (id: string, comment?: string): Promise<Submission> => {
    const response = await apiRequest("POST", `/api/mock/submissions/${id}/approve`, { comment });
    return response.json();
  },

  // Reject submission
  reject: async (id: string, comment?: string): Promise<Submission> => {
    const response = await apiRequest("POST", `/api/mock/submissions/${id}/reject`, { comment });
    return response.json();
  },

  // Get new submissions (last 24h)
  getNew: async (): Promise<Submission[]> => {
    const allSubmissions = await submissionsApi.getByStatus();
    const now = new Date();
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    
    return allSubmissions.filter(sub => 
      new Date(sub.timestamp) >= twentyFourHoursAgo
    );
  }
};

// Tracked targets API (Real endpoints)
export const targetsApi = {
  // Get all tracked targets
  getAll: async (owner?: string): Promise<TrackedTarget[]> => {
    const params = owner ? `?owner=${owner}` : '';
    const response = await apiRequest("GET", `/api/tracked-targets${params}`);
    return response.json();
  },

  // Create new tracked target
  create: async (target: InsertTrackedTarget): Promise<TrackedTarget> => {
    const response = await apiRequest("POST", "/api/tracked-targets", target);
    return response.json();
  },

  // Delete tracked target
  remove: async (id: string): Promise<void> => {
    await apiRequest("DELETE", `/api/tracked-targets/${id}`);
  },

  // Update tracked target
  update: async (id: string, updates: Partial<TrackedTarget>): Promise<TrackedTarget> => {
    const response = await apiRequest("PATCH", `/api/tracked-targets/${id}`, updates);
    return response.json();
  }
};

// Settings API (Real endpoints)
export const settingsApi = {
  // Get all settings
  getAll: async (): Promise<Settings[]> => {
    const response = await apiRequest("GET", "/api/settings");
    return response.json();
  },

  // Update specific setting
  update: async (key: string, value: any): Promise<Settings> => {
    const response = await apiRequest("POST", "/api/settings", { key, value });
    return response.json();
  },

  // Get specific setting by key
  get: async (key: string): Promise<Settings | null> => {
    const settings = await settingsApi.getAll();
    return settings.find(s => s.key === key) || null;
  }
};

// v7.12 표준: Blog Targets API (통합된 블로그 타겟 관리)
export const manualBlogApi = {
  // Get all blog targets with keywords
  getAll: async (): Promise<any[]> => {
    const response = await apiRequest("GET", "/api/targets/blog?expand=keywords");
    return response.json();
  },

  // Create new blog target (표준 경로 사용)
  create: async (entry: InsertManualBlogEntry): Promise<any> => {
    // InsertManualBlogEntry를 blog target 형식으로 변환
    const blogTarget = {
      title: entry.title || entry.keyword, // 제목이 없으면 키워드 사용
      url: entry.url,
      queries: [entry.keyword], // 키워드 배열로 변환
      windowMin: 1,
      windowMax: 20,
      scheduleCron: "0 * * * *", // 1시간마다
      owner: entry.submittedBy || "admin",
      active: true
    };
    const response = await apiRequest("POST", "/api/targets/blog", blogTarget);
    return response.json();
  },

  // Update blog target
  update: async (id: string, updates: Partial<ManualBlogEntry>): Promise<any> => {
    const response = await apiRequest("PATCH", `/api/targets/blog/${id}`, updates);
    return response.json();
  },

  // Delete blog target
  remove: async (id: string): Promise<void> => {
    await apiRequest("DELETE", `/api/targets/blog/${id}`);
  }
};

// Analytics API for insights
export const analyticsApi = {
  // Get KPI data
  getKPIs: async (period: "7d" | "30d" | "90d" = "30d") => {
    const response = await apiRequest("GET", `/api/mock/analytics/kpis?period=${period}`);
    return response.json();
  },

  // Get rank distribution
  getRankDistribution: async () => {
    const response = await apiRequest("GET", "/api/mock/analytics/distribution");
    return response.json();
  },

  // Get top movers (up/down)
  getTopMovers: async (direction: "up" | "down", limit = 10) => {
    const response = await apiRequest("GET", `/api/mock/analytics/movers?direction=${direction}&limit=${limit}`);
    return response.json();
  },

  // Get calendar heatmap data
  getHeatmapData: async (period = "90d") => {
    const response = await apiRequest("GET", `/api/mock/analytics/heatmap?period=${period}`);
    return response.json();
  },

  // Get competitor analysis
  getCompetitorAnalysis: async (targetId: string) => {
    const response = await apiRequest("GET", `/api/mock/analytics/competitors?target_id=${targetId}`);
    return response.json();
  }
};

// Reviews API
export const reviewsApi = {
  // Get review rankings for a product
  getRankings: async (productKey: string): Promise<any[]> => {
    const response = await apiRequest("GET", `/api/mock/reviews/rankings?product_key=${productKey}`);
    return response.json();
  },

  // Get review health metrics
  getHealth: async (productKey: string) => {
    const response = await apiRequest("GET", `/api/mock/reviews/health?product_key=${productKey}`);
    return response.json();
  },

  // Detect abusive reviews
  getAbuseDetection: async (productKey: string) => {
    const response = await apiRequest("GET", `/api/mock/reviews/abuse?product_key=${productKey}`);
    return response.json();
  }
};

// Export data API
export const exportApi = {
  // Start export job
  startExport: async (config: {
    dataTypes: string[];
    format: string;
    dateRange: { from: Date; to: Date };
    compress?: boolean;
  }) => {
    const response = await apiRequest("POST", "/api/mock/exports", config);
    return response.json();
  },

  // Get export jobs
  getJobs: async () => {
    const response = await apiRequest("GET", "/api/mock/exports");
    return response.json();
  },

  // Download export
  download: async (jobId: string) => {
    const response = await apiRequest("GET", `/api/mock/exports/${jobId}/download`);
    return response.blob();
  }
};

// v7.13 Blog-Keyword Pairs API - 1:1 매핑 통합 관리
export const blogKeywordPairsApi = {
  // Get all blog-keyword pairs
  getAll: async (owner?: string): Promise<any[]> => {
    const params = owner ? `?owner=${owner}` : '';
    const response = await apiRequest("GET", `/api/pairs${params}`);
    return response.json();
  },

  // Get single pair by ID
  getById: async (id: string): Promise<any> => {
    const response = await apiRequest("GET", `/api/pairs/${id}`);
    return response.json();
  },

  // Create new blog-keyword pair
  create: async (pair: any): Promise<any> => {
    const response = await apiRequest("POST", "/api/pairs", pair);
    return response.json();
  },

  // Update existing pair
  update: async (id: string, updates: any): Promise<any> => {
    const response = await apiRequest("PATCH", `/api/pairs/${id}`, updates);
    return response.json();
  },

  // Delete pair
  remove: async (id: string): Promise<void> => {
    await apiRequest("DELETE", `/api/pairs/${id}`);
  }
};
