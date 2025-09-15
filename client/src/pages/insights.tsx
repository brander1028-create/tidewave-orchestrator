import * as React from "react";
import { KPICard } from "@/components/ui/kpi-card";
import { RankTrendChart } from "@/components/charts/rank-trend-chart";
import { RankDistributionChart } from "@/components/charts/rank-distribution-chart";
import { CalendarHeatmap } from "@/components/charts/calendar-heatmap";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  TrendingUp, 
  TrendingDown, 
  Target, 
  Activity,
  Calendar,
  BarChart3,
  Zap,
  Calculator,
  Award,
  Search
} from "lucide-react";

export default function Insights() {
  const [selectedPeriod, setSelectedPeriod] = React.useState("30d");

  // KPI data based on selected period
  const kpiData = [
    {
      title: "평균 순위",
      value: "8.3위",
      change: { value: -2.1, label: "전일 대비", trend: "up" as const },
      icon: <Target className="w-4 h-4" />,
    },
    {
      title: "주간 변화율",
      value: "+12.5%",
      change: { value: 3.2, label: "지난주 대비", trend: "up" as const },
      icon: <Activity className="w-4 h-4" />,
    },
    {
      title: "7일 변동성",
      value: "2.1",
      change: { value: -0.5, label: "안정화", trend: "down" as const },
      icon: <Zap className="w-4 h-4" />,
    },
    {
      title: "SOV (점유율)",
      value: "15.3%",
      change: { value: 1.8, label: "Top 10 내", trend: "up" as const },
      icon: <Award className="w-4 h-4" />,
    },
  ];

  // Mock trend data for comparison
  const trendData = Array.from({ length: 30 }, (_, i) => {
    const date = new Date();
    date.setDate(date.getDate() - (29 - i));
    return {
      date: date.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' }),
      rank: 8 + Math.floor(Math.random() * 6) - 3,
      score: 93 + Math.floor(Math.random() * 6) - 3,
      events: Math.random() > 0.8 ? [{ type: 'rank_change', message: '순위 변동' }] : [],
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

  const topMovers = [
    { keyword: "홍삼 추천", prevRank: 7, currRank: 4, change: 3, trend: "up" },
    { keyword: "홍삼 가격", prevRank: 12, currRank: 9, change: 3, trend: "up" },
    { keyword: "홍삼 효과", prevRank: 18, currRank: 16, change: 2, trend: "up" },
  ];

  const topDroppers = [
    { keyword: "홍삼스틱", prevRank: 8, currRank: 15, change: -7, trend: "down" },
    { keyword: "홍삼 복용법", prevRank: 25, currRank: 32, change: -7, trend: "down" },
    { keyword: "홍삼 부작용", prevRank: 45, currRank: null, change: null, trend: "down" },
  ];

  const competitorData = [
    { name: "우리", value: 15.3, color: "#3b82f6" },
    { name: "경쟁사 A", value: 22.1, color: "#ef4444" },
    { name: "경쟁사 B", value: 18.7, color: "#f59e0b" },
    { name: "경쟁사 C", value: 12.4, color: "#8b5cf6" },
    { name: "기타", value: 31.5, color: "#6b7280" },
  ];

  return (
    <div className="space-y-6">
      {/* Period Selection */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-foreground">데이터 인사이트</h3>
          <p className="text-sm text-muted-foreground">키워드 성과와 트렌드를 분석합니다</p>
        </div>
        <Tabs value={selectedPeriod} onValueChange={setSelectedPeriod}>
          <TabsList>
            <TabsTrigger value="7d" data-testid="period-7d">7일</TabsTrigger>
            <TabsTrigger value="30d" data-testid="period-30d">30일</TabsTrigger>
            <TabsTrigger value="90d" data-testid="period-90d">90일</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {kpiData.map((kpi, index) => (
          <KPICard key={index} {...kpi} />
        ))}
      </div>

      {/* Main Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <RankTrendChart 
          data={trendData} 
          title="순위 점수 추이 (30일)" 
          showEvents 
        />
        <RankDistributionChart 
          data={distributionData}
          title="순위 분포 현황"
        />
      </div>

      {/* Secondary Analysis Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Top Movers */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-green-500" />
              상승 랭더보드
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {topMovers.map((item, index) => (
              <div key={index} className="flex items-center justify-between p-3 bg-green-500/10 rounded-lg">
                <div>
                  <div className="font-medium text-foreground text-sm">{item.keyword}</div>
                  <div className="text-sm text-muted-foreground">
                    {item.prevRank}위 → {item.currRank}위
                  </div>
                </div>
                <div className="text-right">
                  <Badge variant="outline" className="text-green-500 border-green-500">
                    +{item.change}
                  </Badge>
                  <div className="text-xs text-muted-foreground mt-1">
                    {selectedPeriod === "7d" ? "이번 주" : "이번 달"}
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Top Droppers */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingDown className="w-5 h-5 text-red-500" />
              하락 랭더보드
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {topDroppers.map((item, index) => (
              <div key={index} className="flex items-center justify-between p-3 bg-red-500/10 rounded-lg">
                <div>
                  <div className="font-medium text-foreground text-sm">{item.keyword}</div>
                  <div className="text-sm text-muted-foreground">
                    {item.prevRank}위 → {item.currRank ? `${item.currRank}위` : "순위 없음"}
                  </div>
                </div>
                <div className="text-right">
                  <Badge variant="outline" className="text-red-500 border-red-500">
                    {item.change ? item.change : "OUT"}
                  </Badge>
                  <div className="text-xs text-muted-foreground mt-1">
                    {item.currRank ? "순위 하락" : "순위 밖"}
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Market Share (SOV) */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-primary" />
              Top 10 점유율 (SOV)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {competitorData.map((competitor, index) => (
                <div key={index} className="space-y-2">
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <div 
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: competitor.color }}
                      />
                      <span className={`text-sm font-medium ${
                        competitor.name === "우리" ? "text-primary" : "text-foreground"
                      }`}>
                        {competitor.name}
                      </span>
                    </div>
                    <span className="text-sm font-semibold text-foreground">
                      {competitor.value}%
                    </span>
                  </div>
                  <div className="w-full bg-secondary rounded-full h-2">
                    <div 
                      className="h-2 rounded-full"
                      style={{ 
                        width: `${competitor.value}%`,
                        backgroundColor: competitor.color 
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Calendar Heatmap */}
      <CalendarHeatmap 
        data={heatmapData} 
        title="순위 변동 패턴 (최근 3개월)"
      />

      {/* Advanced Analytics Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Profitability Calculator Placeholder */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calculator className="w-5 h-5 text-primary" />
              수익성 계산기
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-center py-8">
              <Calculator className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <h4 className="text-lg font-semibold text-foreground mb-2">수익성 분석</h4>
              <p className="text-muted-foreground text-sm mb-4">
                원가/배송/수수료/광고비를 입력하여 마진과 목표 ROAS를 계산합니다.
              </p>
              <Button variant="outline" data-testid="button-open-calculator">
                계산기 열기
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Listing Optimization Score Placeholder */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Search className="w-5 h-5 text-primary" />
              리스팅 최적화 점수
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-center py-8">
              <Award className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <h4 className="text-lg font-semibold text-foreground mb-2">최적화 점수</h4>
              <p className="text-muted-foreground text-sm mb-4">
                체크리스트 기반으로 0~100점 평가와 개선 팁을 제공합니다.
              </p>
              <Button variant="outline" data-testid="button-view-optimization">
                점수 확인
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Performance Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-primary" />
            성과 요약
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className="text-center">
              <div className="text-2xl font-bold text-green-500 mb-1">67%</div>
              <div className="text-sm text-muted-foreground">상위 20위 내</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-primary mb-1">35%</div>
              <div className="text-sm text-muted-foreground">상위 10위 내</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-chart-3 mb-1">15.3%</div>
              <div className="text-sm text-muted-foreground">시장 점유율</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-foreground mb-1">2.1</div>
              <div className="text-sm text-muted-foreground">평균 변동성</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
