import { useState, useCallback, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { KPICard } from "@/components/ui/kpi-card";
import { RankTrendChart } from "@/components/charts/rank-trend-chart";
import { RankDistributionChart } from "@/components/charts/rank-distribution-chart";
import { CalendarHeatmap } from "@/components/charts/calendar-heatmap";
import { EditableCardGrid, type DashboardCardConfig } from "@/components/ui/editable-card-grid";
import { TopTicker } from "@/components/ui/top-ticker";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  TrendingUp, 
  TrendingDown, 
  Target, 
  AlertTriangle,
  Star,
  ShoppingCart,
  MessageSquare,
  Activity
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";

// 대시보드 설정 타입 정의
interface DashboardSettings {
  id: string;
  cardId: string;
  visible: boolean;
  order: number;
  size: "small" | "medium" | "large";
  position: { x: number; y: number };
  config: any;
}

export default function Dashboard() {
  const [editMode, setEditMode] = useState(false);
  const [activeTab, setActiveTab] = useState("blog");

  // 대시보드 설정 로드
  const { data: dashboardSettings } = useQuery<DashboardSettings[]>({
    queryKey: ['/api/dashboard/settings'],
    queryFn: async () => {
      const response = await fetch('/api/dashboard/settings', {
        headers: { 'x-role': 'system' }
      });
      if (!response.ok) {
        throw new Error('Failed to fetch dashboard settings');
      }
      return await response.json();
    },
  });

  // 대시보드 설정 저장
  const saveDashboardSettings = useMutation({
    mutationFn: async (cardSettings: { cardId: string; [key: string]: any }) => {
      const response = await fetch('/api/dashboard/settings', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-role': 'system'
        },
        body: JSON.stringify(cardSettings)
      });
      if (!response.ok) {
        throw new Error('Failed to save dashboard settings');
      }
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/dashboard/settings'] });
    },
  });

  // Mock data for demonstration
  const kpiData = [
    {
      title: "평균 순위",
      value: "8.3위",
      change: { value: -2.1, label: "전일 대비", trend: "up" as const },
      icon: <Target className="w-4 h-4" />,
    },
    {
      title: "추적 키워드",
      value: "127개",
      change: { value: 5, label: "이번 주", trend: "up" as const },
      icon: <Activity className="w-4 h-4" />,
    },
    {
      title: "상위 10위 키워드",
      value: "45개",
      change: { value: 3, label: "어제", trend: "up" as const },
      icon: <TrendingUp className="w-4 h-4" />,
    },
    {
      title: "주의 필요",
      value: "12개",
      change: { value: -2, label: "개선됨", trend: "down" as const },
      icon: <AlertTriangle className="w-4 h-4" />,
    },
  ];

  const trendData = Array.from({ length: 30 }, (_, i) => {
    const date = new Date();
    date.setDate(date.getDate() - (29 - i));
    return {
      date: date.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' }),
      rank: 8 + Math.floor(Math.random() * 6) - 3,
      score: 93 + Math.floor(Math.random() * 6) - 3,
    };
  });

  const distributionData = [
    { name: "1-10위", value: 45, color: "#10b981" },
    { name: "11-30위", value: 52, color: "#f59e0b" },
    { name: "31위 이하", value: 30, color: "#ef4444" },
  ];

  const heatmapData = Array.from({ length: 90 }, (_, i) => {
    const date = new Date();
    date.setDate(date.getDate() - (89 - i));
    return {
      date: date.toISOString().split('T')[0],
      value: Math.floor(Math.random() * 15),
    };
  });

  const recentAlerts = [
    {
      id: "1",
      title: "홍삼스틱 순위 급락",
      description: "8위 → 15위 (-7)",
      severity: "high",
      time: "30분 전",
      trend: "down"
    },
    {
      id: "2", 
      title: "홍삼 추천 Top 5 진입",
      description: "7위 → 4위 (+3)",
      severity: "medium",
      time: "1시간 전",
      trend: "up"
    },
    {
      id: "3",
      title: "신규 경쟁사 포스팅 감지",
      description: "홍삼 관련 5개 신규글",
      severity: "low", 
      time: "2시간 전",
      trend: "stable"
    },
  ];

  const topPerformers = [
    { keyword: "홍삼 추천", rank: 4, change: 3, trend: "up" },
    { keyword: "홍삼 효능", rank: 6, change: 1, trend: "up" },
    { keyword: "홍삼 가격", rank: 9, change: 2, trend: "up" },
  ];

  const needsAttention = [
    { keyword: "홍삼스틱", rank: 15, change: -7, trend: "down" },
    { keyword: "홍삼 부작용", rank: null, change: null, trend: "stable" },
    { keyword: "홍삼 복용법", rank: 32, change: -7, trend: "down" },
  ];

  // 카드 설정 변경 핸들러 - useCallback로 무한 루프 방지
  const handleCardsChange = useCallback((cards: DashboardCardConfig[]) => {
    // 편집 모드일 때만 실행하여 불필요한 API 호출 방지
    if (!editMode) return;
    
    // 디바운스를 위해 setTimeout 사용
    const timeoutId = setTimeout(() => {
      cards.forEach(card => {
        saveDashboardSettings.mutate({
          cardId: card.id,
          visible: card.visible,
          order: card.order,
          size: card.size,
          position: { x: 0, y: 0 }, // 기본값
          config: {}
        });
      });
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [editMode, saveDashboardSettings]);

  // 대시보드 카드 구성 (useMemo로 최적화 및 API 설정 결합)
  const dashboardCards = useMemo((): DashboardCardConfig[] => {
    const defaultCards: DashboardCardConfig[] = [
      {
        id: "kpi-overview",
        title: "KPI 개요",
        type: "kpi",
        icon: <Target className="w-4 h-4" />,
        visible: true,
        order: 1,
        size: "large",
        content: (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {kpiData.map((kpi, index) => (
              <KPICard key={index} {...kpi} />
            ))}
          </div>
        )
      },
      {
        id: "trend-chart",
        title: "순위 트렌드",
        type: "chart",
        icon: <TrendingUp className="w-4 h-4" />,
        visible: true,
        order: 2,
        size: "large",
        content: <RankTrendChart data={trendData} />
      },
      {
        id: "rank-distribution",
        title: "순위 분포",
        type: "chart",
        icon: <Target className="w-4 h-4" />,
        visible: true,
        order: 3,
        size: "medium",
        content: <RankDistributionChart data={distributionData} />
      },
      {
        id: "calendar-heatmap",
        title: "활동 히트맵",
        type: "chart",
        icon: <Activity className="w-4 h-4" />,
        visible: true,
        order: 4,
        size: "large",
        content: <CalendarHeatmap data={heatmapData} title="순위 변동 패턴 (최근 3개월)" />
      }
    ];

    // API 설정이 있으면 기본값과 병합
    if (dashboardSettings && dashboardSettings.length > 0) {
      return defaultCards.map(card => {
        const apiSetting = dashboardSettings.find(setting => setting.cardId === card.id);
        return apiSetting ? { ...card, visible: apiSetting.visible, order: apiSetting.order, size: apiSetting.size } : card;
      });
    }

    return defaultCards;
  }, [dashboardSettings, kpiData, trendData, distributionData, heatmapData]);

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {kpiData.map((kpi, index) => (
          <KPICard key={index} {...kpi} />
        ))}
      </div>

      {/* Main Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <RankTrendChart data={trendData} title="순위 추이 (30일)" showEvents />
        <RankDistributionChart data={distributionData} />
      </div>

      {/* Secondary Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Alerts */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-lg font-semibold">최근 알림</CardTitle>
            <Button variant="outline" size="sm" data-testid="button-view-all-alerts">
              전체 보기
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {recentAlerts.map((alert) => (
              <div key={alert.id} className="flex items-start gap-3 p-3 bg-secondary/20 rounded-lg">
                <div className={`w-2 h-2 rounded-full mt-2 ${
                  alert.severity === 'high' ? 'bg-red-500' :
                  alert.severity === 'medium' ? 'bg-yellow-500' : 'bg-blue-500'
                }`} />
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-foreground text-sm">{alert.title}</div>
                  <div className="text-sm text-muted-foreground">{alert.description}</div>
                  <div className="text-xs text-muted-foreground mt-1">{alert.time}</div>
                </div>
                <div className={`${
                  alert.trend === 'up' ? 'text-green-500' :
                  alert.trend === 'down' ? 'text-red-500' : 'text-gray-500'
                }`}>
                  {alert.trend === 'up' ? <TrendingUp className="w-4 h-4" /> :
                   alert.trend === 'down' ? <TrendingDown className="w-4 h-4" /> :
                   <Activity className="w-4 h-4" />}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Top Performers */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-semibold flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-green-500" />
              상승 키워드
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {topPerformers.map((item, index) => (
              <div key={index} className="flex items-center justify-between p-3 bg-green-500/10 rounded-lg">
                <div>
                  <div className="font-medium text-foreground text-sm">{item.keyword}</div>
                  <div className="text-sm text-muted-foreground">{item.rank}위</div>
                </div>
                <div className="text-right">
                  <div className="text-green-500 font-semibold text-sm">+{item.change}</div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Needs Attention */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-semibold flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-500" />
              주의 키워드
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {needsAttention.map((item, index) => (
              <div key={index} className="flex items-center justify-between p-3 bg-red-500/10 rounded-lg">
                <div>
                  <div className="font-medium text-foreground text-sm">{item.keyword}</div>
                  <div className="text-sm text-muted-foreground">
                    {item.rank ? `${item.rank}위` : '순위 없음'}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-red-500 font-semibold text-sm">
                    {item.change ? `${item.change}` : '-'}
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Top Ticker */}
      <div className="mb-6">
        <TopTicker data-testid="top-ticker" />
      </div>

      {/* 탭 구조: 블로그 순위 / 인사이트 */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="blog" data-testid="tab-blog">블로그 순위</TabsTrigger>
          <TabsTrigger value="insights" data-testid="tab-insights">인사이트</TabsTrigger>
        </TabsList>

        <TabsContent value="blog" className="space-y-6 mt-6">
          {/* 블로그 순위 대시보드 */}
          <EditableCardGrid
            cards={dashboardCards}
            onCardsChange={handleCardsChange}
            editMode={editMode}
            onEditModeChange={setEditMode}
          />
        </TabsContent>

        <TabsContent value="insights" className="space-y-6 mt-6">
          {/* 인사이트 대시보드 - 다른 데이터 소스 */}
          <div className="text-center py-12 text-muted-foreground">
            <MessageSquare className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <h3 className="text-lg font-medium mb-2">인사이트 대시보드</h3>
            <p>고급 분석 및 인사이트 기능이 곧 추가됩니다.</p>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
