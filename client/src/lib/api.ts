import { apiRequest } from "./queryClient";
import type { 
  RankTimeSeries, 
  Alert, 
  Event, 
  Submission, 
  TrackedTarget, 
  Settings,
  InsertSubmission,
  InsertTrackedTarget
} from "@shared/schema";

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
  }>) => {
    const response = await apiRequest("POST", "/api/scraping/batch-rank-check", { targets });
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

  // Start rank check for specific targets
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

// Tracked targets API
export const targetsApi = {
  // Get all tracked targets
  getAll: async (owner?: string): Promise<TrackedTarget[]> => {
    const params = owner ? `?owner=${owner}` : '';
    const response = await apiRequest("GET", `/api/mock/targets${params}`);
    return response.json();
  },

  // Create new tracked target
  create: async (target: InsertTrackedTarget): Promise<TrackedTarget> => {
    const response = await apiRequest("POST", "/api/mock/targets", target);
    return response.json();
  },

  // Delete tracked target
  remove: async (id: string): Promise<void> => {
    await apiRequest("DELETE", `/api/mock/targets/${id}`);
  },

  // Update tracked target
  update: async (id: string, updates: Partial<TrackedTarget>): Promise<TrackedTarget> => {
    const response = await apiRequest("PATCH", `/api/mock/targets/${id}`, updates);
    return response.json();
  }
};

// Settings API
export const settingsApi = {
  // Get all settings
  getAll: async (): Promise<Settings[]> => {
    const response = await apiRequest("GET", "/api/mock/settings");
    return response.json();
  },

  // Update specific setting
  update: async (key: string, value: any): Promise<Settings> => {
    const response = await apiRequest("POST", "/api/mock/settings", { key, value });
    return response.json();
  },

  // Get specific setting by key
  get: async (key: string): Promise<Settings | null> => {
    const settings = await settingsApi.getAll();
    return settings.find(s => s.key === key) || null;
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
