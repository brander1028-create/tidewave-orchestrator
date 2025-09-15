import { KPICard } from "@/components/ui/kpi-card";
import { RankTrendChart } from "@/components/charts/rank-trend-chart";
import { RankDistributionChart } from "@/components/charts/rank-distribution-chart";
import { CalendarHeatmap } from "@/components/charts/calendar-heatmap";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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

export default function Dashboard() {
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

      {/* Calendar Heatmap */}
      <CalendarHeatmap data={heatmapData} title="순위 변동 패턴 (최근 3개월)" />

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              블로그 모니터링
            </CardTitle>
            <MessageSquare className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">127개</div>
            <div className="flex items-center gap-1 text-sm text-muted-foreground">
              <span>키워드</span>
              <Badge variant="outline" className="text-green-500">+5</Badge>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              쇼핑몰 순위
            </CardTitle>
            <ShoppingCart className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">23개</div>
            <div className="flex items-center gap-1 text-sm text-muted-foreground">
              <span>상품</span>
              <Badge variant="outline" className="text-blue-500">정상</Badge>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              리뷰 모니터링
            </CardTitle>
            <Star className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">156개</div>
            <div className="flex items-center gap-1 text-sm text-muted-foreground">
              <span>리뷰 추적</span>
              <Badge variant="outline" className="text-yellow-500">12 신규</Badge>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
