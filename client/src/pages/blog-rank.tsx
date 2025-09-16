import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { DataTable } from "@/components/ui/data-table";
import { Sparkline } from "@/components/ui/sparkline";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import { RankTrendChart } from "@/components/charts/rank-trend-chart";
import { RankDistributionChart } from "@/components/charts/rank-distribution-chart";
import { CalendarHeatmap } from "@/components/charts/calendar-heatmap";
import { KPICard } from "@/components/ui/kpi-card";
import { TopTicker } from "@/components/ui/top-ticker";
import { 
  KeywordChip, 
  StreakBadge, 
  GoToLinkButton, 
  ExposureFilter, 
  StartAllChecksButton,
  RankChangeBadge
} from "@/components/ui/ranking-badges";
import { toast } from "@/hooks/use-toast";
import { 
  Search, 
  Settings, 
  Clock, 
  BarChart3, 
  Play, 
  Download, 
  History,
  Plus,
  X,
  Eye,
  RefreshCw,
  Bell,
  TrendingUp,
  TrendingDown,
  Target,
  Activity,
  AlertTriangle,
  Award,
  Calculator,
  Zap
} from "lucide-react";
import { ColumnDef } from "@tanstack/react-table";
import { targetsApi, scrapingApi, rankApi, manualBlogApi } from "@/lib/api";
import type { TrackedTarget, InsertTrackedTarget } from "@shared/schema";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

interface RankingData {
  id: string;
  keyword: string;
  rank: number;
  change: number;
  url: string;
  trend: number[];
  status: "active" | "warning" | "error";
  lastCheck: string;
  exposed: boolean;
  streakDays: number;
}

// Form schema for manual blog entry
const addManualBlogSchema = z.object({
  keyword: z.string().min(1, "키워드를 입력해주세요"),
  url: z.string().url("올바른 URL을 입력해주세요"),
  title: z.string().min(1, "블로그 제목을 입력해주세요"),
  rank: z.number().min(1, "순위는 1 이상이어야 합니다").optional(),
  notes: z.string().optional(),
  submittedBy: z.string().default("admin"),
});

type AddManualBlogForm = z.infer<typeof addManualBlogSchema>;

export default function BlogRank() {
  const [selectedMainTab, setSelectedMainTab] = React.useState("ranking");
  const [selectedRankingDetail, setSelectedRankingDetail] = React.useState<RankingData | null>(null);
  const [isAddBlogOpen, setIsAddBlogOpen] = React.useState(false);
  const [selectedPeriod, setSelectedPeriod] = React.useState("30d");
  
  // 고급 검색/필터 상태
  const [searchKeyword, setSearchKeyword] = React.useState("");
  const [rankRangeFilter, setRankRangeFilter] = React.useState("all");
  const [statusFilter, setStatusFilter] = React.useState("all");
  const [sortOption, setSortOption] = React.useState("recent");
  const [exposureFilter, setExposureFilter] = React.useState("all");
  
  const queryClient = useQueryClient();
  
  // Fetch tracked targets from API (블로그만 필터링)
  const { data: trackedTargets = [], isLoading: targetsLoading } = useQuery<TrackedTarget[]>({
    queryKey: ['/api/tracked-targets'],
    staleTime: 5 * 60 * 1000,
  });
  
  // Form for adding new targets
  const form = useForm<AddManualBlogForm>({
    resolver: zodResolver(addManualBlogSchema),
    defaultValues: {
      keyword: "",
      url: "",
      title: "",
      rank: undefined,
      notes: "",
      submittedBy: "admin",
    },
  });
  
  // Add manual blog entry mutation  
  const addBlogMutation = useMutation({
    mutationFn: async (data: AddManualBlogForm) => {
      return await manualBlogApi.create({
        keyword: data.keyword,
        url: data.url,
        title: data.title,
        rank: data.rank ?? null,
        notes: data.notes ?? null,
        submittedBy: data.submittedBy,
      });
    },
    onSuccess: () => {
      toast({
        title: "블로그 입력 완료",
        description: "수동 블로그 입력이 성공적으로 저장되었습니다.",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/manual-blogs'] });
      setIsAddBlogOpen(false);
      form.reset();
    },
    onError: (error) => {
      toast({
        title: "입력 실패",
        description: `블로그 입력 중 오류가 발생했습니다: ${error.message}`,
        variant: "destructive",
      });
    },
  });
  
  // Delete target mutation
  const deleteTargetMutation = useMutation({
    mutationFn: async (id: string) => {
      return await targetsApi.remove(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/tracked-targets'] });
      toast({
        title: "키워드 삭제 완료",
        description: "키워드 추적이 중단되었습니다.",
      });
    },
    onError: (error) => {
      toast({
        title: "삭제 실패",
        description: "키워드 삭제 중 오류가 발생했습니다.",
        variant: "destructive",
      });
    },
  });

  // Convert tracked targets to ranking data (블로그만)
  const convertTargetsToRankingData = (targets: TrackedTarget[]): RankingData[] => {
    return targets
      .filter(target => target.kind === "blog") // 블로그만
      .map((target, index) => {
        const idNum = parseInt(target.id?.slice(-1) || '0') || index;
        const baseRank = [8, 15, 12, 20, 7, 25, 11][idNum % 7] || (idNum % 30) + 1;
        const baseChange = [3, -7, 0, -5, 8, -2, 1][idNum % 7] || ((idNum % 21) - 10);
        
        return {
          id: target.id || (index + 1).toString(),
          keyword: target.query || `키워드 ${index + 1}`,
          rank: baseRank,
          change: baseChange,
          url: target.url || `blog.naver.com/user${index + 1}/post${(index + 1) * 123}`,
          trend: Array.from({ length: 10 }, (_, i) => baseRank + (i % 5) - 2),
          status: target.enabled ? (baseRank <= 10 ? "active" : baseRank <= 20 ? "warning" : "error") as any : "error" as any,
          lastCheck: "5분 전",
          exposed: baseRank <= 15,
          streakDays: [4, 12, 1, 8, 0, 15, 6][idNum % 7] || 3
        };
      });
  };

  // Current ranking data (블로그만)
  const currentRankingData = convertTargetsToRankingData(trackedTargets);

  // 고급 필터링/정렬 로직
  const filteredAndSortedData = React.useMemo(() => {
    let filtered = currentRankingData;

    // 키워드 검색 필터
    if (searchKeyword.trim()) {
      filtered = filtered.filter(item => 
        item.keyword.toLowerCase().includes(searchKeyword.toLowerCase())
      );
    }

    // 순위 범위 필터
    if (rankRangeFilter !== "all") {
      switch (rankRangeFilter) {
        case "1-10":
          filtered = filtered.filter(item => item.rank >= 1 && item.rank <= 10);
          break;
        case "11-20":
          filtered = filtered.filter(item => item.rank >= 11 && item.rank <= 20);
          break;
        case "21-50":
          filtered = filtered.filter(item => item.rank >= 21 && item.rank <= 50);
          break;
        case "51-100":
          filtered = filtered.filter(item => item.rank >= 51 && item.rank <= 100);
          break;
        case "100+":
          filtered = filtered.filter(item => item.rank > 100);
          break;
      }
    }

    // 상태 필터
    if (statusFilter !== "all") {
      filtered = filtered.filter(item => item.status === statusFilter);
    }

    // 노출 필터
    if (exposureFilter !== "all") {
      if (exposureFilter === "exposed") {
        filtered = filtered.filter(item => item.exposed);
      } else if (exposureFilter === "hidden") {
        filtered = filtered.filter(item => !item.exposed);
      }
    }

    // 정렬
    const sorted = [...filtered].sort((a, b) => {
      switch (sortOption) {
        case "recent":
          return 0; // 기본 순서 유지
        case "volume":
          return 0; // 조회량 데이터가 없으므로 기본 순서
        case "score":
          return 0; // 점수 데이터가 없으므로 기본 순서
        case "rank-asc":
          return a.rank - b.rank; // 순위 낮은 순 (1위가 먼저)
        case "rank-desc":
          return b.rank - a.rank; // 순위 높은 순 (100위가 먼저)
        case "change":
          return Math.abs(b.change) - Math.abs(a.change); // 변동 큰 순
        case "keyword":
          return a.keyword.localeCompare(b.keyword); // 키워드 가나다순
        default:
          return 0;
      }
    });

    return sorted;
  }, [currentRankingData, searchKeyword, rankRangeFilter, statusFilter, sortOption, exposureFilter]);

  // Handle form submission
  const onSubmit = (data: AddManualBlogForm) => {
    addBlogMutation.mutate(data);
  };
  
  // Handle target deletion
  const handleDeleteTarget = (targetId: string) => {
    if (confirm("정말로 이 키워드 추적을 중단하시겠습니까?")) {
      deleteTargetMutation.mutate(targetId);
    }
  };

  // 블로그 순위 테이블 컬럼
  const rankingColumns: ColumnDef<RankingData>[] = [
    {
      accessorKey: "keyword",
      header: "키워드",
      cell: ({ row }) => {
        const idNum = parseInt(row.original.id?.slice(-1) || '0');
        const volume = [1200, 850, 2400, 560, 1800, 920, 1500][idNum % 7] || 1000;
        const score = [85, 72, 91, 68, 88, 74, 82][idNum % 7] || 75;
        
        return (
          <div className="space-y-2">
            <KeywordChip 
              keyword={row.original.keyword}
              volume={volume}
              score={score}
            />
          </div>
        );
      },
    },
    {
      accessorKey: "rank",
      header: "현재 순위",
      cell: ({ row }) => {
        return (
          <div className="space-y-2">
            <div className="text-sm">
              <span className="text-2xl font-bold text-foreground">{row.original.rank}</span>
              <span className="text-muted-foreground text-sm ml-1">위</span>
            </div>
            <StreakBadge days={row.original.streakDays} exposed={row.original.exposed} />
          </div>
        );
      },
    },
    {
      accessorKey: "change",
      header: "변동",
      cell: ({ row }) => {
        return (
          <RankChangeBadge change={row.original.change} />
        );
      },
    },
    {
      accessorKey: "url",
      header: "바로가기",
      cell: ({ row }) => (
        <GoToLinkButton 
          url={`https://${row.original.url}`}
          title={`${row.original.keyword} 블로그로 이동`}
        />
      ),
    },
    {
      accessorKey: "trend",
      header: "트렌드",
      cell: ({ row }) => {
        const change = row.original.change;
        const trend = change > 0 ? "up" : change < 0 ? "down" : "stable";
        return <Sparkline data={row.original.trend} trend={trend} />;
      },
    },
    {
      accessorKey: "lastCheck",
      header: "마지막 체크",
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">{row.original.lastCheck}</span>
      ),
    },
    {
      id: "actions",
      header: "액션",
      cell: ({ row }) => (
        <div className="flex gap-2">
          <Button 
            variant="ghost" 
            size="sm" 
            className="h-8 w-8 p-0"
            onClick={() => setSelectedRankingDetail(row.original)}
            data-testid={`button-view-${row.original.id}`}
          >
            <Eye className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
            <Bell className="h-4 w-4" />
          </Button>
        </div>
      ),
    },
  ];

  // 인사이트 데이터
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

  // 상세 모달 데이터
  const detailTrendData = selectedRankingDetail ? Array.from({ length: 30 }, (_, i) => {
    const date = new Date();
    date.setDate(date.getDate() - (29 - i));
    return {
      date: date.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' }),
      rank: selectedRankingDetail.rank + Math.floor(Math.random() * 6) - 3,
      score: 101 - (selectedRankingDetail.rank + Math.floor(Math.random() * 6) - 3),
      events: Math.random() > 0.8 ? [{ type: 'rank_change', message: '순위 변동' }] : [],
    };
  }) : [];

  return (
    <div className="space-y-6">
      {/* 페이지 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">블로그 순위 대시보드</h1>
          <p className="text-muted-foreground mt-1">네이버 블로그 SERP 순위 모니터링 및 인사이트 분석</p>
        </div>
        <Badge variant="outline" className="text-blue-600">
          <TrendingUp className="w-4 h-4 mr-1" />
          블로그 전용
        </Badge>
      </div>

      {/* Top Ticker (실시간 알림 롤링) */}
      <TopTicker />

      {/* 메인 탭 */}
      <Tabs value={selectedMainTab} onValueChange={setSelectedMainTab}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="ranking" data-testid="tab-main-ranking">블로그 순위</TabsTrigger>
          <TabsTrigger value="insights" data-testid="tab-main-insights">인사이트</TabsTrigger>
        </TabsList>

        {/* 블로그 순위 탭 */}
        <TabsContent value="ranking" className="space-y-6">
          {/* Control Cards */}
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            {/* Keyword Management */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Search className="w-4 h-4 text-primary" />
                  키워드 관리
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button 
                  onClick={() => setIsAddBlogOpen(true)}
                  size="sm"
                  className="w-full"
                  data-testid="button-add-target"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  키워드 추가
                </Button>
                
                <div className="flex flex-wrap gap-2 max-h-20 overflow-y-auto custom-scrollbar">
                  {currentRankingData.map((item) => (
                    <Badge 
                      key={item.id} 
                      variant="secondary" 
                      className="flex items-center gap-1"
                    >
                      {item.keyword}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-4 w-4 p-0 hover:text-destructive"
                        onClick={() => handleDeleteTarget(item.id)}
                        data-testid={`button-remove-keyword-${item.id}`}
                        disabled={deleteTargetMutation.isPending}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Settings */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Settings className="w-4 h-4 text-primary" />
                  체크 설정
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <Label className="text-xs text-muted-foreground">디바이스</Label>
                  <Select defaultValue="mobile">
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="mobile">모바일</SelectItem>
                      <SelectItem value="pc">PC</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            {/* Schedule */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Clock className="w-4 h-4 text-primary" />
                  체크 스케줄
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <Label className="text-xs text-muted-foreground">체크 주기</Label>
                  <Select defaultValue="10m">
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="10m">10분</SelectItem>
                      <SelectItem value="30m">30분</SelectItem>
                      <SelectItem value="1h">1시간</SelectItem>
                      <SelectItem value="6h">6시간</SelectItem>
                      <SelectItem value="12h">12시간</SelectItem>
                      <SelectItem value="24h">24시간</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-muted-foreground">자동 체크</Label>
                  <Switch defaultChecked />
                </div>
              </CardContent>
            </Card>

            {/* Summary Stats */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-primary" />
                  요약 통계
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-muted-foreground">추적 키워드</span>
                  <span className="text-sm font-medium text-foreground">{currentRankingData.length}개</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-muted-foreground">평균 순위</span>
                  <span className="text-sm font-medium text-green-500">11.7위</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-muted-foreground">오늘 변동</span>
                  <span className="text-sm font-medium text-red-500">-1.3</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-muted-foreground">알림</span>
                  <span className="text-sm font-medium text-yellow-500">2건</span>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Quick Actions */}
          <div className="flex flex-wrap gap-4 items-center justify-between">
            <div className="flex flex-wrap gap-3">
              <StartAllChecksButton
                onClick={() => {
                  toast({
                    title: "순위 체크 시작",
                    description: "블로그 키워드 순위 체크를 진행합니다.",
                  });
                }}
              />
              <Button variant="outline" className="flex items-center gap-2">
                <Download className="w-4 h-4" />
                결과 내보내기
              </Button>
              <Button variant="outline" className="flex items-center gap-2">
                <History className="w-4 h-4" />
                히스토리 보기
              </Button>
            </div>
          </div>

          {/* 고급 검색/필터 패널 */}
          <Card className="bg-background/50">
            <CardContent className="p-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 items-end">
                
                {/* 키워드 검색 */}
                <div className="space-y-2">
                  <Label className="text-sm text-muted-foreground">키워드 검색</Label>
                  <div className="relative">
                    <Search className="w-4 h-4 absolute left-3 top-3 text-muted-foreground" />
                    <Input
                      placeholder="키워드 검색..."
                      value={searchKeyword}
                      onChange={(e) => setSearchKeyword(e.target.value)}
                      className="pl-10"
                      data-testid="input-search-keyword"
                    />
                  </div>
                </div>

                {/* 순위 범위 필터 */}
                <div className="space-y-2">
                  <Label className="text-sm text-muted-foreground">순위 범위</Label>
                  <Select value={rankRangeFilter} onValueChange={setRankRangeFilter}>
                    <SelectTrigger data-testid="select-rank-range">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">전체</SelectItem>
                      <SelectItem value="1-10">1-10위</SelectItem>
                      <SelectItem value="11-20">11-20위</SelectItem>
                      <SelectItem value="21-50">21-50위</SelectItem>
                      <SelectItem value="51-100">51-100위</SelectItem>
                      <SelectItem value="100+">100위+</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* 상태 필터 */}
                <div className="space-y-2">
                  <Label className="text-sm text-muted-foreground">상태</Label>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger data-testid="select-status">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">전체</SelectItem>
                      <SelectItem value="active">정상</SelectItem>
                      <SelectItem value="warning">주의</SelectItem>
                      <SelectItem value="error">오류</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* 노출 필터 */}
                <div className="space-y-2">
                  <Label className="text-sm text-muted-foreground">노출 상태</Label>
                  <Select value={exposureFilter} onValueChange={setExposureFilter}>
                    <SelectTrigger data-testid="select-exposure">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">전체</SelectItem>
                      <SelectItem value="exposed">노출됨</SelectItem>
                      <SelectItem value="hidden">숨겨짐</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* 정렬 */}
                <div className="space-y-2">
                  <Label className="text-sm text-muted-foreground">정렬</Label>
                  <Select value={sortOption} onValueChange={setSortOption}>
                    <SelectTrigger data-testid="select-sort">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="recent">최근 업데이트순</SelectItem>
                      <SelectItem value="keyword">키워드 가나다순</SelectItem>
                      <SelectItem value="rank-asc">순위 높은순 (1위부터)</SelectItem>
                      <SelectItem value="rank-desc">순위 낮은순 (100위부터)</SelectItem>
                      <SelectItem value="change">변동 큰순</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

              </div>
              
              {/* 필터 결과 요약 */}
              <div className="mt-4 pt-4 border-t border-border/50">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground" data-testid="text-filter-summary">
                    전체 {currentRankingData.length}개 중 {filteredAndSortedData.length}개 표시
                  </span>
                  {(searchKeyword || rankRangeFilter !== "all" || statusFilter !== "all" || exposureFilter !== "all") && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setSearchKeyword("");
                        setRankRangeFilter("all");
                        setStatusFilter("all");
                        setExposureFilter("all");
                        setSortOption("recent");
                      }}
                      data-testid="button-clear-filters"
                    >
                      필터 초기화
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Ranking Table */}
          <DataTable
            columns={rankingColumns}
            data={filteredAndSortedData}
            title="블로그 순위 현황"
            description={`총 ${filteredAndSortedData.length}개 키워드 표시 중`}
            onRowClick={(row) => setSelectedRankingDetail(row)}
          />
        </TabsContent>

        {/* 인사이트 탭 */}
        <TabsContent value="insights" className="space-y-6">
          {/* Period Selection */}
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-foreground">블로그 데이터 인사이트</h3>
              <p className="text-sm text-muted-foreground">블로그 키워드 성과와 트렌드를 분석합니다</p>
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
            title="블로그 순위 변동 패턴 (최근 3개월)"
          />

          {/* 블로그 전용 분석 카드 */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calculator className="w-5 h-5 text-primary" />
                  블로그 성과 계산기
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-center py-8">
                  <Calculator className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                  <h4 className="text-lg font-semibold text-foreground mb-2">성과 분석</h4>
                  <p className="text-muted-foreground text-sm mb-4">
                    블로그 트래픽과 키워드별 성과를 계산하여 ROI를 분석합니다.
                  </p>
                  <Button variant="outline" data-testid="button-open-blog-calculator">
                    계산기 열기
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Search className="w-5 h-5 text-primary" />
                  블로그 최적화 점수
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-center py-8">
                  <Award className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                  <h4 className="text-lg font-semibold text-foreground mb-2">최적화 점수</h4>
                  <p className="text-muted-foreground text-sm mb-4">
                    블로그 제목, 내용, 태그 등을 분석하여 SEO 최적화 점수를 제공합니다.
                  </p>
                  <Button variant="outline" data-testid="button-view-blog-optimization">
                    점수 확인
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* 블로그 성과 요약 */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="w-5 h-5 text-primary" />
                블로그 성과 요약
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
                  <div className="text-sm text-muted-foreground">블로그 점유율</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-foreground mb-1">2.1</div>
                  <div className="text-sm text-muted-foreground">평균 변동성</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* 블로그 키워드 추가 모달 */}
      <Dialog open={isAddBlogOpen} onOpenChange={setIsAddBlogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>블로그 키워드 추가</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="keyword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>키워드</FormLabel>
                    <FormControl>
                      <Input placeholder="예: 홍삼 추천" {...field} data-testid="input-keyword" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="url"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>블로그 URL</FormLabel>
                    <FormControl>
                      <Input placeholder="https://blog.naver.com/..." {...field} data-testid="input-url" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>블로그 제목</FormLabel>
                    <FormControl>
                      <Input placeholder="블로그 포스팅 제목" {...field} data-testid="input-title" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="rank"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>현재 순위 (선택사항)</FormLabel>
                    <FormControl>
                      <Input 
                        type="number" 
                        placeholder="예: 8" 
                        {...field} 
                        value={field.value || ""} 
                        onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : undefined)}
                        data-testid="input-rank"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>메모 (선택사항)</FormLabel>
                    <FormControl>
                      <Input placeholder="추가 메모사항" {...field} data-testid="input-notes" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="flex gap-2 pt-4">
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => setIsAddBlogOpen(false)}
                  className="flex-1"
                  data-testid="button-cancel"
                >
                  취소
                </Button>
                <Button 
                  type="submit" 
                  disabled={addBlogMutation.isPending}
                  className="flex-1"
                  data-testid="button-submit"
                >
                  {addBlogMutation.isPending ? "추가 중..." : "추가"}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* 순위 상세 모달 */}
      <Dialog open={!!selectedRankingDetail} onOpenChange={() => setSelectedRankingDetail(null)}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              블로그 순위 상세 분석 - {selectedRankingDetail?.keyword}
            </DialogTitle>
          </DialogHeader>
          
          {selectedRankingDetail && (
            <div className="space-y-6">
              {/* Current Status Cards */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <Card className="bg-secondary/50">
                  <CardContent className="pt-6">
                    <div className="text-center">
                      <div className="text-3xl font-bold text-foreground mb-2">
                        {selectedRankingDetail.rank}위
                      </div>
                      <div className="text-sm text-muted-foreground mb-3">현재 순위</div>
                      <div className="flex items-center justify-center gap-2">
                        <RankChangeBadge change={selectedRankingDetail.change} />
                        <span className={`font-medium ${
                          selectedRankingDetail.change > 0 ? "text-green-500" :
                          selectedRankingDetail.change < 0 ? "text-red-500" : "text-gray-500"
                        }`}>
                          {selectedRankingDetail.change > 0 ? "+" : ""}{selectedRankingDetail.change} (전일대비)
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-secondary/50">
                  <CardContent className="pt-6">
                    <div className="text-center">
                      <div className="text-3xl font-bold text-chart-1 mb-2">
                        {101 - selectedRankingDetail.rank}
                      </div>
                      <div className="text-sm text-muted-foreground mb-3">순위 점수</div>
                      <div className="text-xs text-muted-foreground">(101 - 순위)</div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-secondary/50">
                  <CardContent className="pt-6">
                    <div className="text-center">
                      <div className="text-3xl font-bold text-chart-3 mb-2">2.1</div>
                      <div className="text-sm text-muted-foreground mb-3">7일 변동성</div>
                      <div className="text-xs text-muted-foreground">평균 절대 변동</div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Trend Chart */}
              <RankTrendChart 
                data={detailTrendData} 
                title="30일 순위 추이" 
                showEvents 
              />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}