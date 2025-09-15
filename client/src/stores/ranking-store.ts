import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface RankingData {
  id: string;
  keyword: string;
  rank: number;
  change: number;
  page: number;
  position: number;
  url: string;
  trend: number[];
  status: "active" | "warning" | "error";
  lastCheck: string;
  device: "mobile" | "pc";
  targetId?: string;
}

export interface RankingFilters {
  status?: "all" | "up" | "down" | "new" | "stable";
  device?: "mobile" | "pc" | "all";
  sortBy?: "recent" | "rank-asc" | "rank-desc" | "change";
}

interface RankingStore {
  // Data
  rankings: RankingData[];
  selectedRanking: RankingData | null;
  
  // Filters and pagination
  filters: RankingFilters;
  searchQuery: string;
  currentPage: number;
  pageSize: number;
  
  // Settings
  autoRefresh: boolean;
  refreshInterval: number; // in minutes
  
  // Keywords management
  keywords: string[];
  
  // Actions
  setRankings: (rankings: RankingData[]) => void;
  addRanking: (ranking: RankingData) => void;
  updateRanking: (id: string, updates: Partial<RankingData>) => void;
  removeRanking: (id: string) => void;
  setSelectedRanking: (ranking: RankingData | null) => void;
  
  // Filter actions
  setFilters: (filters: Partial<RankingFilters>) => void;
  setSearchQuery: (query: string) => void;
  setCurrentPage: (page: number) => void;
  setPageSize: (size: number) => void;
  
  // Settings actions
  setAutoRefresh: (enabled: boolean) => void;
  setRefreshInterval: (minutes: number) => void;
  
  // Keywords actions
  addKeyword: (keyword: string) => void;
  removeKeyword: (keyword: string) => void;
  setKeywords: (keywords: string[]) => void;
  
  // Computed getters
  getFilteredRankings: () => RankingData[];
  getTopPerformers: () => RankingData[];
  getNeedsAttention: () => RankingData[];
  getAverageRank: () => number;
  getTotalChange: () => number;
}

export const useRankingStore = create<RankingStore>()(
  persist(
    (set, get) => ({
      // Initial state
      rankings: [],
      selectedRanking: null,
      filters: {},
      searchQuery: "",
      currentPage: 1,
      pageSize: 25,
      autoRefresh: true,
      refreshInterval: 60, // 1 hour
      keywords: ["홍삼", "홍삼스틱"],
      
      // Data actions
      setRankings: (rankings) => set({ rankings }),
      
      addRanking: (ranking) => set((state) => ({
        rankings: [...state.rankings, ranking],
      })),
      
      updateRanking: (id, updates) => set((state) => ({
        rankings: state.rankings.map((ranking) =>
          ranking.id === id ? { ...ranking, ...updates } : ranking
        ),
      })),
      
      removeRanking: (id) => set((state) => ({
        rankings: state.rankings.filter((ranking) => ranking.id !== id),
        selectedRanking: state.selectedRanking?.id === id ? null : state.selectedRanking,
      })),
      
      setSelectedRanking: (ranking) => set({ selectedRanking: ranking }),
      
      // Filter actions
      setFilters: (filters) => set((state) => ({
        filters: { ...state.filters, ...filters },
        currentPage: 1, // Reset to first page when filters change
      })),
      
      setSearchQuery: (query) => set({ 
        searchQuery: query,
        currentPage: 1, // Reset to first page when search changes
      }),
      
      setCurrentPage: (page) => set({ currentPage: page }),
      setPageSize: (size) => set({ pageSize: size, currentPage: 1 }),
      
      // Settings actions
      setAutoRefresh: (enabled) => set({ autoRefresh: enabled }),
      setRefreshInterval: (minutes) => set({ refreshInterval: minutes }),
      
      // Keywords actions
      addKeyword: (keyword) => set((state) => ({
        keywords: state.keywords.includes(keyword) 
          ? state.keywords 
          : [...state.keywords, keyword],
      })),
      
      removeKeyword: (keyword) => set((state) => ({
        keywords: state.keywords.filter((k) => k !== keyword),
      })),
      
      setKeywords: (keywords) => set({ keywords }),
      
      // Computed getters
      getFilteredRankings: () => {
        const { rankings, filters, searchQuery } = get();
        
        let filtered = rankings;
        
        // Apply status filter
        if (filters.status && filters.status !== "all") {
          filtered = filtered.filter((ranking) => {
            switch (filters.status) {
              case "up":
                return ranking.change > 0;
              case "down":
                return ranking.change < 0;
              case "stable":
                return ranking.change === 0;
              case "new":
                // Assuming rankings added in last 24h are "new"
                return new Date(ranking.lastCheck).getTime() > Date.now() - 24 * 60 * 60 * 1000;
              default:
                return true;
            }
          });
        }
        
        // Apply device filter
        if (filters.device && filters.device !== "all") {
          filtered = filtered.filter((ranking) => ranking.device === filters.device);
        }
        
        // Apply search query
        if (searchQuery) {
          const query = searchQuery.toLowerCase();
          filtered = filtered.filter((ranking) =>
            ranking.keyword.toLowerCase().includes(query) ||
            ranking.url.toLowerCase().includes(query)
          );
        }
        
        // Apply sorting
        if (filters.sortBy) {
          filtered = filtered.sort((a, b) => {
            switch (filters.sortBy) {
              case "rank-asc":
                return a.rank - b.rank;
              case "rank-desc":
                return b.rank - a.rank;
              case "change":
                return Math.abs(b.change) - Math.abs(a.change);
              case "recent":
              default:
                return new Date(b.lastCheck).getTime() - new Date(a.lastCheck).getTime();
            }
          });
        }
        
        return filtered;
      },
      
      getTopPerformers: () => {
        const { rankings } = get();
        return rankings
          .filter((ranking) => ranking.change > 0)
          .sort((a, b) => b.change - a.change)
          .slice(0, 5);
      },
      
      getNeedsAttention: () => {
        const { rankings } = get();
        return rankings
          .filter((ranking) => ranking.change < -3 || ranking.status === "error")
          .sort((a, b) => a.change - b.change)
          .slice(0, 5);
      },
      
      getAverageRank: () => {
        const { rankings } = get();
        if (rankings.length === 0) return 0;
        const total = rankings.reduce((sum, ranking) => sum + ranking.rank, 0);
        return Math.round((total / rankings.length) * 10) / 10;
      },
      
      getTotalChange: () => {
        const { rankings } = get();
        return rankings.reduce((sum, ranking) => sum + ranking.change, 0);
      },
    }),
    {
      name: 'ranking-store',
      // Only persist certain fields
      partialize: (state) => ({
        filters: state.filters,
        pageSize: state.pageSize,
        autoRefresh: state.autoRefresh,
        refreshInterval: state.refreshInterval,
        keywords: state.keywords,
      }),
    }
  )
);
