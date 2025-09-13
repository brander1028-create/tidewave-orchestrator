// Enhanced type definitions for Unified Health Gate + Keywords Page system

export type VolumeMode = 'pending' | 'fallback' | 'partial' | 'searchads';

export type Top3Item = { 
  text: string; 
  volume: number; 
  raw_volume: number; 
  rank: number; 
};

export type KeywordEntry = { 
  blog_id: string; 
  top3: Top3Item[]; 
};

export type BlogEntry = { 
  blog_id: string; 
  blog_url: string; 
  gathered_posts: number; 
  base_rank: number; 
};

export type Counters = {
  discovered_blogs: number; 
  blogs: number; 
  posts: number;
  selected_keywords: number; 
  searched_keywords: number; 
  hit_blogs: number;
  volumes_mode: VolumeMode;
  volumes_requested?: number; 
  volumes_ok?: number; 
  volumes_fail?: number; 
  volumes_http?: Record<number, number>; 
  volumes_reason?: string;
};

export type Results = { 
  blogs: BlogEntry[]; 
  keywords: KeywordEntry[]; 
  posts: any[]; 
  counters: Counters; 
  warnings: string[]; 
  errors: string[]; 
};

// Health check types
export type HealthOpen = { 
  ok: boolean; 
  http: Record<number, number>; 
  reason?: string; 
};

export type HealthSearchAds = { 
  mode: Exclude<VolumeMode, 'pending'>; 
  stats: { 
    requested: number; 
    ok: number; 
    fail: number; 
    http: Record<number, number>; 
  }; 
  reason?: string; 
};

export type HealthKeywordsDB = { 
  ok: boolean; 
  count?: number; 
  reason?: string; 
};

export type HealthResponse = { 
  openapi: HealthOpen; 
  searchads: HealthSearchAds; 
  keywordsdb: HealthKeywordsDB; 
};

// SearchAd API response with detailed stats
export type SearchAdResponse = {
  volumes: Record<string, { pc: number; mobile: number; total: number; compIdx?: number }>;
  mode: Exclude<VolumeMode, 'pending'>;
  stats: {
    requested: number;
    ok: number;
    fail: number;
    http: Record<number, number>;
  };
  reason?: string;
};

// Keywords management types
export type KeywordGrade = 'A' | 'B' | 'C';

export type ManagedKeyword = {
  id: string;
  text: string;
  raw_volume: number;
  volume: number;
  grade: KeywordGrade;
  commerciality: number;
  difficulty: number;
  excluded: boolean;
  updated_at: string;
  source: string;
};

export type KeywordRefreshRequest = {
  base: string;
  limit?: number;
  strict?: boolean;
};

export type KeywordRefreshResponse = {
  ok: boolean;
  volumes_mode: Exclude<VolumeMode, 'pending'>;
  stats: {
    requested: number;
    ok: number;
    fail: number;
    http: Record<number, number>;
  };
  inserted: number;
};