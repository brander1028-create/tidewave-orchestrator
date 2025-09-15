import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface AlertRule {
  id: string;
  name: string;
  type: 'rank_change' | 'top_entry' | 'top_exit' | 'consecutive_drop' | 'new_content' | 'abuse_detection';
  enabled: boolean;
  conditions: {
    threshold?: number;
    direction?: 'up' | 'down';
    consecutive_days?: number;
    rank_limit?: number;
  };
  cooldown: number; // in hours
  severity: 'low' | 'medium' | 'high' | 'critical';
}

export interface RateLimits {
  perMin: number;
  perDay: number;
  perHour?: number;
}

export interface SystemSettings {
  // Check settings
  checkInterval?: { interval: string };
  defaultDevice?: 'mobile' | 'pc';
  autoCheck?: boolean;
  
  // Data settings
  dataRetention?: string;
  cacheTTL?: { ttl: string };
  
  // Alert settings
  alertCooldown?: { cooldown: string };
  dailySummaryTime?: string;
  
  // Performance settings
  rateLimits?: RateLimits;
  
  // Other settings
  [key: string]: any;
}

export type UserRole = 'admin' | 'manager' | 'analyst' | 'contributor' | 'viewer';

interface SettingsStore {
  // System settings
  settings: SystemSettings;
  
  // Alert rules
  alertRules: AlertRule[];
  
  // User settings
  userRole: UserRole;
  preferences: {
    theme: 'light' | 'dark' | 'system';
    language: 'ko' | 'en';
    timezone: string;
    dateFormat: string;
    numberFormat: string;
  };
  
  // Dashboard customization
  dashboardLayout: {
    widgets: Array<{
      id: string;
      type: string;
      position: { x: number; y: number; w: number; h: number };
      visible: boolean;
      config?: any;
    }>;
  };
  
  // Actions - System settings
  updateSetting: (key: string, value: any) => void;
  resetSettings: () => void;
  
  // Actions - Alert rules
  addAlertRule: (rule: Omit<AlertRule, 'id'>) => void;
  updateAlertRule: (id: string, updates: Partial<AlertRule>) => void;
  removeAlertRule: (id: string) => void;
  toggleAlertRule: (id: string) => void;
  
  // Actions - User settings
  setUserRole: (role: UserRole) => void;
  updatePreferences: (preferences: Partial<SettingsStore['preferences']>) => void;
  
  // Actions - Dashboard layout
  updateDashboardLayout: (layout: SettingsStore['dashboardLayout']) => void;
  addWidget: (widget: SettingsStore['dashboardLayout']['widgets'][0]) => void;
  removeWidget: (widgetId: string) => void;
  updateWidget: (widgetId: string, updates: Partial<SettingsStore['dashboardLayout']['widgets'][0]>) => void;
  
  // Getters
  getPermissions: () => {
    canView: boolean;
    canEdit: boolean;
    canApprove: boolean;
    canManageSettings: boolean;
    canManageUsers: boolean;
  };
  
  isFeatureEnabled: (feature: string) => boolean;
}

const defaultAlertRules: AlertRule[] = [
  {
    id: 'top_10_entry',
    name: 'Top 10 진입',
    type: 'top_entry',
    enabled: true,
    conditions: { rank_limit: 10 },
    cooldown: 6,
    severity: 'medium',
  },
  {
    id: 'top_10_exit',
    name: 'Top 10 이탈',
    type: 'top_exit',
    enabled: true,
    conditions: { rank_limit: 10 },
    cooldown: 6,
    severity: 'high',
  },
  {
    id: 'rank_drop_5',
    name: '5위 이상 하락',
    type: 'rank_change',
    enabled: true,
    conditions: { threshold: 5, direction: 'down' },
    cooldown: 3,
    severity: 'high',
  },
  {
    id: 'consecutive_drop_3',
    name: '연속 3일 하락',
    type: 'consecutive_drop',
    enabled: true,
    conditions: { consecutive_days: 3, direction: 'down' },
    cooldown: 12,
    severity: 'critical',
  },
];

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set, get) => ({
      // Initial state
      settings: {
        checkInterval: { interval: '1h' },
        defaultDevice: 'mobile',
        autoCheck: true,
        dataRetention: '90d',
        cacheTTL: { ttl: '10m' },
        alertCooldown: { cooldown: '6h' },
        dailySummaryTime: '09:00',
        rateLimits: { perMin: 60, perDay: 10000 },
      },
      
      alertRules: defaultAlertRules,
      
      userRole: 'admin',
      
      preferences: {
        theme: 'dark',
        language: 'ko',
        timezone: 'Asia/Seoul',
        dateFormat: 'YYYY-MM-DD',
        numberFormat: 'ko-KR',
      },
      
      dashboardLayout: {
        widgets: [
          {
            id: 'kpi-cards',
            type: 'kpi-grid',
            position: { x: 0, y: 0, w: 12, h: 4 },
            visible: true,
          },
          {
            id: 'rank-trend',
            type: 'rank-trend-chart',
            position: { x: 0, y: 4, w: 6, h: 6 },
            visible: true,
          },
          {
            id: 'rank-distribution',
            type: 'rank-distribution-chart',
            position: { x: 6, y: 4, w: 6, h: 6 },
            visible: true,
          },
          {
            id: 'recent-alerts',
            type: 'alert-feed',
            position: { x: 0, y: 10, w: 4, h: 6 },
            visible: true,
          },
          {
            id: 'top-performers',
            type: 'top-performers',
            position: { x: 4, y: 10, w: 4, h: 6 },
            visible: true,
          },
          {
            id: 'needs-attention',
            type: 'needs-attention',
            position: { x: 8, y: 10, w: 4, h: 6 },
            visible: true,
          },
        ],
      },
      
      // System settings actions
      updateSetting: (key, value) => set((state) => ({
        settings: { ...state.settings, [key]: value },
      })),
      
      resetSettings: () => set((state) => ({
        settings: {
          checkInterval: { interval: '1h' },
          defaultDevice: 'mobile',
          autoCheck: true,
          dataRetention: '90d',
          cacheTTL: { ttl: '10m' },
          alertCooldown: { cooldown: '6h' },
          dailySummaryTime: '09:00',
          rateLimits: { perMin: 60, perDay: 10000 },
        },
      })),
      
      // Alert rules actions
      addAlertRule: (rule) => set((state) => ({
        alertRules: [...state.alertRules, { ...rule, id: Date.now().toString() }],
      })),
      
      updateAlertRule: (id, updates) => set((state) => ({
        alertRules: state.alertRules.map((rule) =>
          rule.id === id ? { ...rule, ...updates } : rule
        ),
      })),
      
      removeAlertRule: (id) => set((state) => ({
        alertRules: state.alertRules.filter((rule) => rule.id !== id),
      })),
      
      toggleAlertRule: (id) => set((state) => ({
        alertRules: state.alertRules.map((rule) =>
          rule.id === id ? { ...rule, enabled: !rule.enabled } : rule
        ),
      })),
      
      // User settings actions
      setUserRole: (role) => set({ userRole: role }),
      
      updatePreferences: (preferences) => set((state) => ({
        preferences: { ...state.preferences, ...preferences },
      })),
      
      // Dashboard layout actions
      updateDashboardLayout: (layout) => set({ dashboardLayout: layout }),
      
      addWidget: (widget) => set((state) => ({
        dashboardLayout: {
          ...state.dashboardLayout,
          widgets: [...state.dashboardLayout.widgets, widget],
        },
      })),
      
      removeWidget: (widgetId) => set((state) => ({
        dashboardLayout: {
          ...state.dashboardLayout,
          widgets: state.dashboardLayout.widgets.filter((w) => w.id !== widgetId),
        },
      })),
      
      updateWidget: (widgetId, updates) => set((state) => ({
        dashboardLayout: {
          ...state.dashboardLayout,
          widgets: state.dashboardLayout.widgets.map((widget) =>
            widget.id === widgetId ? { ...widget, ...updates } : widget
          ),
        },
      })),
      
      // Getters
      getPermissions: () => {
        const { userRole } = get();
        
        switch (userRole) {
          case 'admin':
            return {
              canView: true,
              canEdit: true,
              canApprove: true,
              canManageSettings: true,
              canManageUsers: true,
            };
          case 'manager':
            return {
              canView: true,
              canEdit: true,
              canApprove: true,
              canManageSettings: false,
              canManageUsers: false,
            };
          case 'analyst':
            return {
              canView: true,
              canEdit: true,
              canApprove: false,
              canManageSettings: false,
              canManageUsers: false,
            };
          case 'contributor':
            return {
              canView: true,
              canEdit: true,
              canApprove: false,
              canManageSettings: false,
              canManageUsers: false,
            };
          case 'viewer':
          default:
            return {
              canView: true,
              canEdit: false,
              canApprove: false,
              canManageSettings: false,
              canManageUsers: false,
            };
        }
      },
      
      isFeatureEnabled: (feature) => {
        const permissions = get().getPermissions();
        const { userRole } = get();
        
        switch (feature) {
          case 'rank_check':
            return userRole !== 'viewer';
          case 'submission_approval':
            return permissions.canApprove;
          case 'system_settings':
            return permissions.canManageSettings;
          case 'user_management':
            return permissions.canManageUsers;
          case 'data_export':
            return userRole !== 'viewer';
          default:
            return permissions.canView;
        }
      },
    }),
    {
      name: 'settings-store',
      // Persist everything except temporary UI state
      partialize: (state) => ({
        settings: state.settings,
        alertRules: state.alertRules,
        userRole: state.userRole,
        preferences: state.preferences,
        dashboardLayout: state.dashboardLayout,
      }),
    }
  )
);
