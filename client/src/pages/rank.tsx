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
import { Progress } from "@/components/ui/progress";
import { RankTrendChart } from "@/components/charts/rank-trend-chart";
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
  ArrowUpDown,
  Signal,
  ExternalLink,
  TrendingUp,
  TrendingDown,
  Minus,
  Users,
  FolderPlus,
  ChevronUp,
  ChevronDown,
  Trash2,
  Loader2
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
  page: number;
  position: number;
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

// Format functions
const formatNumber = (num: number): string => {
  return new Intl.NumberFormat('ko-KR').format(num);
};

const formatChange = (change: number): string => {
  const sign = change > 0 ? '+' : '';
  return `${sign}${change}`;
};

// 토스 스타일 미니 트렌드 차트 컴포넌트
const TossTrendChart = ({ data, change }: { data: number[], change: number }) => {
  const width = 60;
  const height = 24;
  const padding = 2;
  
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  
  // 데이터를 SVG 좌표로 변환
  const points = data.map((value, index) => {
    const x = padding + (index * (width - padding * 2)) / (data.length - 1);
    const y = height - padding - ((value - min) / range) * (height - padding * 2);
    return `${x},${y}`;
  }).join(' ');
  
  // 변동에 따른 색상 결정
  const color = change > 0 ? '#ef4444' : change < 0 ? '#3b82f6' : '#6b7280';
  
  return (
    <div className="flex items-center">
      <svg width={width} height={height} className="mr-2">
        {/* 점선 배경 */}
        <defs>
          <pattern id="dots" patternUnits="userSpaceOnUse" width="4" height="4">
            <circle cx="2" cy="2" r="0.5" fill="currentColor" className="text-muted-foreground" opacity="0.2" />
          </pattern>
        </defs>
        <rect width={width} height={height} fill="url(#dots)" />
        
        {/* 라인 차트 */}
        <polyline
          points={points}
          fill="none"
          stroke={color}
          strokeWidth="1.5"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        
        {/* 시작점과 끝점 */}
        {data.length > 1 && (
          <>
            <circle
              cx={padding}
              cy={height - padding - ((data[0] - min) / range) * (height - padding * 2)}
              r="1"
              fill={color}
              opacity="0.8"
            />
            <circle
              cx={width - padding}
              cy={height - padding - ((data[data.length - 1] - min) / range) * (height - padding * 2)}
              r="1.5"
              fill={color}
            />
          </>
        )}
      </svg>
    </div>
  );
};

export default function Rank() {
  const [selectedTab, setSelectedTab] = React.useState("blog");
  const [selectedRankingDetail, setSelectedRankingDetail] = React.useState<RankingData | null>(null);
  const [isAddBlogOpen, setIsAddBlogOpen] = React.useState(false);
  const [keywordSearchTerm, setKeywordSearchTerm] = React.useState("");
  const [selectedBrand, setSelectedBrand] = React.useState("전체");
  const [viewMode, setViewMode] = React.useState<"all" | "on" | "off">("all");
  const [sortBy, setSortBy] = React.useState("recent");
  const [isRunning, setIsRunning] = React.useState(false);
  const [progress, setProgress] = React.useState({ done: 0, total: 0, text: "" });
  const [abortController, setAbortController] = React.useState<AbortController | null>(null);
  const cancelledRef = React.useRef(false);
  const queryClient = useQueryClient();
  
  // Fetch tracked targets from API
  const { data: trackedTargets = [], isLoading: targetsLoading } = useQuery<TrackedTarget[]>({
    queryKey: ['/api/tracked-targets'],
    staleTime: 5 * 60 * 1000, // 5 minutes
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

  // Convert tracked targets to ranking data
  const convertTargetsToRankingData = (targets: TrackedTarget[]): RankingData[] => {
    return targets
      .filter(target => target.kind === selectedTab)
      .map((target, index) => {
        // Use stable data based on target ID to avoid re-rendering
        const idNum = parseInt(target.id?.slice(-1) || '0') || index;
        const baseRank = [8, 15, 12, 20, 7, 25, 11][idNum % 7] || (idNum % 30) + 1;
        const baseChange = [3, -7, 0, -5, 8, -2, 1][idNum % 7] || ((idNum % 21) - 10);
        
        return {
          id: target.id || (index + 1).toString(),
          keyword: target.query || `키워드 ${index + 1}`,
          rank: baseRank,
          change: baseChange,
          page: Math.floor((baseRank - 1) / 10) + 1,
          position: ((baseRank - 1) % 10) + 1,
          url: target.url || `blog.naver.com/user${index + 1}/post${(index + 1) * 123}`,
          trend: Array.from({ length: 10 }, (_, i) => baseRank + (i % 5) - 2),
          status: target.enabled ? (baseRank <= 10 ? "active" : baseRank <= 20 ? "warning" : "error") as any : "error" as any,
          lastCheck: "5분 전",
          exposed: baseRank <= 15, // 15위까지만 노출
          streakDays: [4, 12, 1, 8, 0, 15, 6][idNum % 7] || 3
        };
      });
  };

  // Convert tracked targets to ranking data with enhanced data
  const generateMockData = (targets: TrackedTarget[]) => {
    return targets.map((target, index) => {
      const idNum = parseInt(target.id?.slice(-1) || '0') || index;
      const rank = [15, 3, 25, 12, 7, 20, 8][idNum % 7] || (idNum % 30) + 1;
      const change = [3, -7, 0, -5, 8, -2, 1][idNum % 7] || ((idNum % 21) - 10);
      const volume = [18500, 45600, 12300, 28900, 33200, 19800, 24100][idNum % 7] || Math.floor(Math.random() * 50000) + 10000;
      const score = [72, 91, 68, 88, 85, 74, 82][idNum % 7] || Math.floor(Math.random() * 40) + 60;
      const brands = ["브랜드A", "브랜드B", "브랜드C"];
      const groups = ["그룹1", "그룹2", "그룹3"];
      
      return {
        id: target.id || (index + 1).toString(),
        active: true,
        keyword: target.query || `키워드 ${index + 1}`,
        volume,
        score,
        rank,
        change,
        maintainDays: [7, 28, 3, 21, 35, 14, 42][idNum % 7] || Math.floor(Math.random() * 50) + 1,
        blogId: `blog${index + 1}`,
        blogUrl: target.url || `blog.naver.com/user${index + 1}/post${(index + 1) * 123}`,
        trend: Array.from({ length: 10 }, (_, i) => rank + (i % 5) - 2),
        postDate: `9월 ${17 + (idNum % 14)}일`,
        lastCheck: new Date().toISOString(),
        brand: brands[idNum % brands.length],
        group: groups[idNum % groups.length]
      };
    });
  };

  const mockData = React.useMemo(() => generateMockData(trackedTargets), [trackedTargets]);
  
  // 브랜드 목록
  const brands = ["전체", ...Array.from(new Set(mockData.map(item => item.brand)))];

  // Filtering and sorting logic
  const filteredData = React.useMemo(() => {
    let filtered = mockData;
    
    // 키워드 검색 필터
    if (keywordSearchTerm.trim()) {
      filtered = filtered.filter(item => 
        item.keyword.toLowerCase().includes(keywordSearchTerm.toLowerCase()) ||
        item.group.toLowerCase().includes(keywordSearchTerm.toLowerCase())
      );
    }
    
    // 브랜드 필터
    if (selectedBrand !== "전체") {
      filtered = filtered.filter(item => item.brand === selectedBrand);
    }
    
    // ON/OFF 필터
    if (viewMode === "on") {
      filtered = filtered.filter(item => item.active);
    } else if (viewMode === "off") {
      filtered = filtered.filter(item => !item.active);
    }
    
    // 정렬
    const sorted = [...filtered].sort((a, b) => {
      switch (sortBy) {
        case "volume":
          return b.volume - a.volume;
        case "score":
          return b.score - a.score;
        case "rank":
          return a.rank - b.rank;
        case "change":
          return Math.abs(b.change) - Math.abs(a.change);
        case "maintain":
          return b.maintainDays - a.maintainDays;
        case "keyword":
          return a.keyword.localeCompare(b.keyword);
        case "recent":
        default:
          return new Date(b.lastCheck).getTime() - new Date(a.lastCheck).getTime();
      }
    });
    
    return sorted;
  }, [mockData, keywordSearchTerm, selectedBrand, viewMode, sortBy]);

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

  const columns: ColumnDef<RankingData>[] = [
    {
      accessorKey: "keyword",
      header: "키워드",
      cell: ({ row }) => {
        const idNum = parseInt(row.original.id?.slice(-1) || '0');
        // Mock data: 키워드별 조회량과 점수
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

  // These functions are now handled by mutations above

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
      {/* Tab Navigation */}
      <Tabs value={selectedTab} onValueChange={setSelectedTab}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="blog" data-testid="tab-blog">블로그 순위</TabsTrigger>
          <TabsTrigger value="shopping" data-testid="tab-shopping">쇼핑몰 순위</TabsTrigger>
          <TabsTrigger value="reviews" data-testid="tab-reviews">리뷰 랭킹</TabsTrigger>
        </TabsList>

        <TabsContent value="blog" className="space-y-6">
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
                  {mockData.map((item) => (
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
                <div>
                  <Label className="text-xs text-muted-foreground">페이지 범위</Label>
                  <div className="flex gap-2 mt-1">
                    <Input type="number" placeholder="1" defaultValue="1" className="flex-1" />
                    <span className="self-center text-muted-foreground">~</span>
                    <Input type="number" placeholder="10" defaultValue="10" className="flex-1" />
                  </div>
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
                  <span className="text-sm font-medium text-foreground">{mockData.length}개</span>
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
                    description: "블로그 → 쇼핑 순으로 체크를 진행합니다.",
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
            <div className="flex gap-4 items-center">
              <div className="flex items-center gap-3">
                <Label className="text-sm text-muted-foreground">노출 필터:</Label>
                <ExposureFilter
                  value="all"
                  onChange={(value) => {
                    console.log("Filter changed:", value);
                  }}
                />
              </div>
              <div className="flex items-center gap-2">
                <Label className="text-sm text-muted-foreground">정렬:</Label>
                <Select defaultValue="recent">
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="recent">최근 업데이트순</SelectItem>
                    <SelectItem value="volume">조회량순</SelectItem>
                    <SelectItem value="score">점수순</SelectItem>
                    <SelectItem value="rank-asc">순위 높은순</SelectItem>
                    <SelectItem value="rank-desc">순위 낮은순</SelectItem>
                    <SelectItem value="change">변동 큰순</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Blog Rank Grid */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-foreground">블로그 순위 현황</h3>
              <div className="text-sm text-muted-foreground">
                총 {filteredData.length}개 키워드
              </div>
            </div>
            
            {filteredData.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-muted-foreground">조건에 맞는 데이터가 없습니다.</p>
              </div>
            ) : (
              <div className="grid gap-2">
                {filteredData.map((item) => (
                  <div key={item.id} className="bg-card border border-border rounded-lg p-4 hover:bg-accent/50 transition-colors">
                    <div className="grid grid-cols-12 gap-4 items-center">
                      {/* 키워드 정보 */}
                      <div className="col-span-3">
                        <div className="space-y-1">
                          <button 
                            className="font-medium text-foreground hover:text-primary transition-colors text-left"
                            onClick={() => setSelectedRankingDetail(item)}
                            data-testid={`button-keyword-${item.id}`}
                          >
                            {item.keyword}
                          </button>
                          <div className="text-xs text-muted-foreground">
                            {item.brand} · {item.group}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            블로그ID: {item.blogId}
                          </div>
                        </div>
                      </div>
                      
                      {/* 조회량/점수 */}
                      <div className="col-span-2">
                        <div className="space-y-1">
                          <button 
                            className="text-sm font-medium hover:text-primary transition-colors"
                            onClick={() => setSelectedRankingDetail(item)}
                            data-testid={`button-volume-${item.id}`}
                          >
                            {formatNumber(item.volume)}
                          </button>
                          <div className="text-xs text-muted-foreground">
                            점수: {item.score}
                          </div>
                        </div>
                      </div>
                      
                      {/* 순위 */}
                      <div className="col-span-1 text-center">
                        <div className="text-lg font-bold text-foreground">
                          {item.rank}위
                        </div>
                      </div>
                      
                      {/* 변동 */}
                      <div className="col-span-1 text-center">
                        <div className={`text-sm font-medium ${
                          item.change > 0 ? "text-red-500" : 
                          item.change < 0 ? "text-blue-500" : "text-gray-500"
                        }`}>
                          {formatChange(item.change)}
                        </div>
                      </div>
                      
                      {/* 유지일 */}
                      <div className="col-span-1 text-center">
                        <div className="text-sm font-medium text-foreground">
                          {item.maintainDays}일
                        </div>
                      </div>
                      
                      {/* 트렌드 차트 */}
                      <div className="col-span-2">
                        <TossTrendChart data={item.trend} change={item.change} />
                      </div>
                      
                      {/* 상태 및 액션 */}
                      <div className="col-span-2 flex items-center justify-end gap-2">
                        <Switch
                          checked={item.active}
                          size="sm"
                          data-testid={`switch-active-${item.id}`}
                        />
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setSelectedRankingDetail(item)}
                          data-testid={`button-detail-${item.id}`}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="shopping" className="space-y-6">
          <div className="text-center py-12">
            <h3 className="text-lg font-semibold text-foreground mb-2">쇼핑몰 순위 체크</h3>
            <p className="text-muted-foreground">쇼핑몰 순위 모니터링 기능이 곧 제공됩니다.</p>
          </div>
        </TabsContent>

        <TabsContent value="reviews" className="space-y-6">
          <div className="text-center py-12">
            <h3 className="text-lg font-semibold text-foreground mb-2">리뷰 랭킹 보드</h3>
            <p className="text-muted-foreground">리뷰 순위 분석 기능이 곧 제공됩니다.</p>
          </div>
        </TabsContent>
      </Tabs>

      {/* Detail Modal */}
      <Dialog open={!!selectedRankingDetail} onOpenChange={() => setSelectedRankingDetail(null)}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              순위 상세 분석 - {selectedRankingDetail?.keyword}
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

              {/* Additional Details */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Event Timeline */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg font-semibold flex items-center gap-2">
                      <History className="w-5 h-5 text-primary" />
                      이벤트 타임라인
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3 max-h-48 overflow-y-auto custom-scrollbar">
                      <div className="flex items-start gap-3 p-3 bg-green-500/10 rounded-lg">
                        <div className="w-2 h-2 bg-green-500 rounded-full mt-2"></div>
                        <div className="flex-1">
                          <div className="text-sm font-medium text-foreground">순위 상승</div>
                          <div className="text-xs text-muted-foreground">11위 → 8위 (+3)</div>
                          <div className="text-xs text-muted-foreground">2시간 전</div>
                        </div>
                      </div>
                      <div className="flex items-start gap-3 p-3 bg-blue-500/10 rounded-lg">
                        <div className="w-2 h-2 bg-blue-500 rounded-full mt-2"></div>
                        <div className="flex-1">
                          <div className="text-sm font-medium text-foreground">신규 블로그 감지</div>
                          <div className="text-xs text-muted-foreground">경쟁사 포스팅 증가</div>
                          <div className="text-xs text-muted-foreground">6시간 전</div>
                        </div>
                      </div>
                      <div className="flex items-start gap-3 p-3 bg-yellow-500/10 rounded-lg">
                        <div className="w-2 h-2 bg-yellow-500 rounded-full mt-2"></div>
                        <div className="flex-1">
                          <div className="text-sm font-medium text-foreground">알림 발송</div>
                          <div className="text-xs text-muted-foreground">Top 10 진입 알림</div>
                          <div className="text-xs text-muted-foreground">1일 전</div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Competitor Comparison */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg font-semibold flex items-center gap-2">
                      <BarChart3 className="w-5 h-5 text-primary" />
                      경쟁사 현황
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between p-3 bg-card rounded-lg">
                        <div>
                          <div className="font-medium text-green-400">우리</div>
                          <div className="text-xs text-muted-foreground">blog.naver.com/user123</div>
                        </div>
                        <div className="text-right">
                          <div className="font-semibold text-foreground">{selectedRankingDetail.rank}위</div>
                          <div className="text-green-500 text-xs">+{selectedRankingDetail.change}</div>
                        </div>
                      </div>
                      <div className="flex items-center justify-between p-3 bg-card rounded-lg">
                        <div>
                          <div className="font-medium text-foreground">경쟁사 A</div>
                          <div className="text-xs text-muted-foreground">blog.naver.com/competitor1</div>
                        </div>
                        <div className="text-right">
                          <div className="font-semibold text-foreground">3위</div>
                          <div className="text-gray-500 text-xs">-</div>
                        </div>
                      </div>
                      <div className="flex items-center justify-between p-3 bg-card rounded-lg">
                        <div>
                          <div className="font-medium text-foreground">경쟁사 B</div>
                          <div className="text-xs text-muted-foreground">blog.naver.com/competitor2</div>
                        </div>
                        <div className="text-right">
                          <div className="font-semibold text-foreground">12위</div>
                          <div className="text-red-500 text-xs">-2</div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Add Manual Blog Entry Dialog */}
      <Dialog open={isAddBlogOpen} onOpenChange={setIsAddBlogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>수동 블로그 입력</DialogTitle>
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
                      <Input 
                        placeholder="키워드를 입력하세요" 
                        {...field}
                        data-testid="input-keyword"
                      />
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
                      <Input 
                        placeholder="https://blog.naver.com/..." 
                        {...field}
                        data-testid="input-url"
                      />
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
                      <Input 
                        placeholder="블로그 제목을 입력하세요" 
                        {...field}
                        data-testid="input-title"
                      />
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
                    <FormLabel>순위 (선택)</FormLabel>
                    <FormControl>
                      <Input 
                        type="number" 
                        placeholder="1-100" 
                        {...field}
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
                    <FormLabel>특이사항 (선택)</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="참고 사항을 입력하세요" 
                        {...field}
                        data-testid="input-notes"
                      />
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
                  data-testid="button-cancel-target"
                >
                  취소
                </Button>
                <Button 
                  type="submit" 
                  className="flex-1"
                  disabled={addBlogMutation.isPending}
                  data-testid="button-submit-target"
                >
                  {addBlogMutation.isPending ? "추가 중..." : "추가"}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
