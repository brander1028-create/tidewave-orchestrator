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
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
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
  ChevronUp,
  ChevronDown,
  Loader2,
  Database,
  FolderPlus,
  Trash2
} from "lucide-react";
import { targetsApi, scrapingApi, rankApi } from "@/lib/api";
import type { TrackedTarget, InsertTrackedTarget } from "@shared/schema";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Link } from "wouter";

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
  volume: number;
  score: number;
  brand: string;
  active: boolean;
}

// Form schema for tracked target
const addTargetSchema = z.object({
  query: z.string().min(1, "키워드를 입력해주세요"),
  url: z.string().url("올바른 URL을 입력해주세요"),
  windowMin: z.number().min(1).default(1),
  windowMax: z.number().min(1).default(10),
  kind: z.enum(["blog", "shop"]).default("blog"),
  owner: z.string().default("admin"),
});

type AddTargetForm = z.infer<typeof addTargetSchema>;

// Format functions
const formatNumber = (num: number): string => {
  return new Intl.NumberFormat('ko-KR').format(num);
};

const formatChange = (change: number): string => {
  if (change === 0) return "0";
  return change > 0 ? `+${change}` : change.toString();
};

export default function Rank() {
  const [selectedTab, setSelectedTab] = React.useState("blog");
  const [selectedRankingDetail, setSelectedRankingDetail] = React.useState<RankingData | null>(null);
  const [isAddBlogOpen, setIsAddBlogOpen] = React.useState(false);
  const [isSettingsSectionExpanded, setIsSettingsSectionExpanded] = React.useState(false);
  const [keywordSearchTerm, setKeywordSearchTerm] = React.useState("");
  const [selectedBrand, setSelectedBrand] = React.useState("전체");
  const [viewMode, setViewMode] = React.useState<"all" | "on" | "off">("all");
  const [sortBy, setSortBy] = React.useState("recent");
  const [isRunning, setIsRunning] = React.useState(false);
  const [progress, setProgress] = React.useState({ done: 0, total: 0, text: "" });
  const [abortController, setAbortController] = React.useState<AbortController | null>(null);

  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  // Fetch tracked targets from API
  const { data: trackedTargets = [], isLoading: targetsLoading } = useQuery<TrackedTarget[]>({
    queryKey: ['/api/tracked-targets'],
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
  
  // Form for adding new targets
  const form = useForm<AddTargetForm>({
    resolver: zodResolver(addTargetSchema),
    defaultValues: {
      query: "",
      url: "",
      windowMin: 1,
      windowMax: 10,
      kind: selectedTab as "blog" | "shop",
      owner: "admin",
    },
  });
  
  // Add tracked target mutation  
  const addTargetMutation = useMutation({
    mutationFn: async (data: AddTargetForm) => {
      return await targetsApi.create({
        query: data.query,
        url: data.url,
        windowMin: data.windowMin,
        windowMax: data.windowMax,
        kind: data.kind,
        owner: data.owner,
        enabled: true,
      });
    },
    onSuccess: () => {
      toast({
        title: "키워드 추가 완료",
        description: "새 키워드 추적이 성공적으로 시작되었습니다.",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/tracked-targets'] });
      setIsAddBlogOpen(false);
      form.reset();
    },
    onError: (error) => {
      toast({
        title: "추가 실패",
        description: `키워드 추가 중 오류가 발생했습니다: ${error.message}`,
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
        const volume = [1200, 850, 2400, 560, 1800, 920, 1500][idNum % 7] || 1000;
        const score = [85, 72, 91, 68, 88, 74, 82][idNum % 7] || 75;
        const brands = ["브랜드A", "브랜드B", "브랜드C", "브랜드D"];
        
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
          streakDays: [4, 12, 1, 8, 0, 15, 6][idNum % 7] || 3,
          volume: volume,
          score: score,
          brand: brands[idNum % 4] || "브랜드A",
          active: target.enabled || false
        };
      });
  };

  // Current ranking data based on tracked targets
  const currentRankingData = convertTargetsToRankingData(trackedTargets);

  // Brands for filtering
  const brands = ["전체", ...Array.from(new Set(currentRankingData.map(item => item.brand)))];

  // Filtered data based on search and filters
  const filteredData = React.useMemo(() => {
    let filtered = currentRankingData;
    
    // 키워드 검색 필터
    if (keywordSearchTerm.trim()) {
      filtered = filtered.filter(item => 
        item.keyword.toLowerCase().includes(keywordSearchTerm.toLowerCase())
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
    filtered.sort((a, b) => {
      switch (sortBy) {
        case "volume":
          return b.volume - a.volume;
        case "score":
          return b.score - a.score;
        case "rank":
          return a.rank - b.rank;
        case "change":
          return b.change - a.change;
        case "keyword":
          return a.keyword.localeCompare(b.keyword);
        default:
          return 0;
      }
    });
    
    return filtered;
  }, [currentRankingData, keywordSearchTerm, selectedBrand, viewMode, sortBy]);

  // Handle form submission
  const onSubmit = (data: AddTargetForm) => {
    addTargetMutation.mutate(data);
  };
  
  // Handle target deletion
  const handleDeleteTarget = (targetId: string) => {
    if (confirm("정말로 이 키워드 추적을 중단하시겠습니까?")) {
      deleteTargetMutation.mutate(targetId);
    }
  };

  // Toggle keyword active status
  const toggleKeywordActive = async (id: string) => {
    try {
      const item = trackedTargets.find(target => target.id === id);
      if (!item) {
        throw new Error('키워드를 찾을 수 없습니다.');
      }
      
      // Optimistic update
      queryClient.setQueryData(['/api/tracked-targets'], (old: TrackedTarget[] = []) => {
        return old.map(target => 
          target.id === id ? { ...target, enabled: !target.enabled } : target
        );
      });
      
      const response = await fetch(`/api/tracked-targets/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-role': 'admin'
        },
        body: JSON.stringify({ enabled: !item.enabled }),
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      toast({
        title: "상태 변경 완료",
        description: `키워드가 ${!item.enabled ? '활성화' : '비활성화'}되었습니다.`,
      });
    } catch (error: any) {
      // 오류 시 쿼리 캐시 무효화하여 실제 상태로 복원
      queryClient.invalidateQueries({ queryKey: ['/api/tracked-targets'] });
      
      toast({
        title: "상태 변경 실패",
        description: `오류: ${error.message}`,
        variant: "destructive",
      });
    }
  };

  // Run all checks function
  const runAllChecks = async () => {
    if (filteredData.length === 0) return;
    
    const controller = new AbortController();
    setAbortController(controller);
    setIsRunning(true);
    setProgress({ done: 0, total: 0, text: "순위 체크 계획을 가져오는 중..." });
    
    try {
      // Get plan first
      const targetIds = filteredData.map(item => item.id);
      const plan = await rankApi.plan({
        kind: selectedTab,
        target_ids: targetIds
      });
      
      if (plan.tasks.length === 0) {
        toast({
          title: "체크할 항목 없음",
          description: "현재 선택된 필터에서 체크할 키워드가 없습니다.",
        });
        return;
      }
      
      setProgress({ done: 0, total: plan.tasks.length, text: `${selectedTab === 'blog' ? '블로그' : '쇼핑'} 순위 체크를 시작합니다...` });
      
      // Convert plan tasks to scraping format
      const scrapingTargets = plan.tasks.map(task => ({
        targetId: task.target_id,
        query: task.query,
        kind: selectedTab as 'blog' | 'shop',
        device: 'mobile' as const,
        sort: undefined,
        target: undefined
      }));
      
      // Execute batch check with correct kind
      await scrapingApi.batchRankCheck(scrapingTargets, controller);
      
      // Invalidate cached data to refresh UI
      queryClient.invalidateQueries({ queryKey: ['/api/tracked-targets'] });
      
      toast({
        title: "순위 체크 완료",
        description: `${plan.tasks.length}개 작업의 순위 체크가 완료되었습니다.`,
      });
    } catch (error: any) {
      if (error.name === 'AbortError') {
        toast({
          title: "순위 체크 취소",
          description: "사용자에 의해 순위 체크가 취소되었습니다.",
        });
      } else {
        toast({
          title: "순위 체크 실패",
          description: `순위 체크 중 오류가 발생했습니다: ${error.message}`,
          variant: "destructive",
        });
      }
    } finally {
      setIsRunning(false);
      setAbortController(null);
    }
  };

  const handleCancel = () => {
    if (abortController) {
      abortController.abort();
    }
    setIsRunning(false);
    setProgress({ done: 0, total: 0, text: "" });
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-semibold text-foreground">순위 대시보드</h1>
              <p className="text-sm text-muted-foreground">네이버 블로그 & 쇼핑 SERP 순위 모니터링 및 인사이트 분석</p>
            </div>
            <div className="flex items-center gap-3">
              {/* 키워드 검색 */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="키워드 검색..."
                  value={keywordSearchTerm}
                  onChange={(e) => setKeywordSearchTerm(e.target.value)}
                  className="pl-10 w-48"
                  data-testid="input-keyword-search-header"
                />
              </div>
              
              {/* 데이터베이스 관리 */}
              <Link to="/database">
                <Button
                  variant="outline"
                  size="sm"
                  data-testid="button-manage-database"
                >
                  <Database className="h-4 w-4 mr-2" />
                  관리
                </Button>
              </Link>
              
              {/* 설정 아이콘 */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsSettingsSectionExpanded(!isSettingsSectionExpanded)}
                data-testid="button-toggle-settings"
              >
                <Settings className="h-4 w-4" />
              </Button>
              
              {/* 키워드 추가 */}
              <Button
                onClick={() => setIsAddBlogOpen(true)}
                size="sm"
                data-testid="button-add-keyword"
              >
                <Plus className="h-4 w-4 mr-2" />
                키워드 추가
              </Button>
              
            </div>
          </div>
        </div>
      </div>

      {/* 설정 섹션 */}
      {isSettingsSectionExpanded && (
        <div className="border-b border-border bg-muted/20">
          <div className="container mx-auto px-4 py-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              
              {/* 빠른 액션 카드 */}
              <div className="bg-card border border-border rounded-lg p-4">
                <div className="flex items-center gap-2 mb-4">
                  <Users className="h-5 w-5 text-primary" />
                  <h3 className="font-semibold text-foreground">빠른 액션</h3>
                </div>
                <div className="space-y-3">
                  {/* 전체 순위 업데이트 */}
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={runAllChecks}
                    disabled={isRunning}
                    data-testid="button-update-all-ranks"
                  >
                    <TrendingUp className="h-4 w-4 mr-2" />
                    전체 순위 업데이트
                  </Button>
                  
                  {/* 일괄 상태 관리 */}
                  <div className="flex gap-2">
                    <Button
                      variant="default"
                      size="sm"
                      className="flex-1"
                      data-testid="button-activate-all"
                    >
                      모두 활성화
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      data-testid="button-deactivate-all"
                    >
                      모두 비활성화
                    </Button>
                  </div>
                </div>
              </div>

              {/* 요약 통계 카드 */}
              <div className="bg-card border border-border rounded-lg p-4">
                <div className="flex items-center gap-2 mb-4">
                  <TrendingUp className="h-5 w-5 text-primary" />
                  <h3 className="font-semibold text-foreground">요약 통계</h3>
                </div>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <div className="text-muted-foreground">총 키워드</div>
                    <div className="text-2xl font-bold text-foreground">{filteredData.length}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">활성</div>
                    <div className="text-2xl font-bold text-green-500">{filteredData.filter(item => item.active).length}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">비활성</div>
                    <div className="text-2xl font-bold text-red-500">{filteredData.filter(item => !item.active).length}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">평균 순위</div>
                    <div className="text-2xl font-bold text-foreground">
                      {filteredData.length > 0 ? Math.round(filteredData.reduce((sum, item) => sum + item.rank, 0) / filteredData.length) : 0}
                    </div>
                  </div>
                </div>
              </div>
              
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="container mx-auto px-4 py-2">
        <Tabs value={selectedTab} onValueChange={setSelectedTab}>
          <TabsList className="grid w-48 grid-cols-2">
            <TabsTrigger value="blog" data-testid="tab-blog">블로그</TabsTrigger>
            <TabsTrigger value="shop" data-testid="tab-shop">쇼핑</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Controls */}
      <div className="container mx-auto px-4 py-4">
        <div className="flex items-center justify-between mb-4">
          {/* Brand Tabs */}
          <div className="flex gap-1">
            {brands.map(brand => (
              <button
                key={brand}
                onClick={() => setSelectedBrand(brand)}
                className={`px-3 py-1.5 text-sm font-medium rounded transition-colors ${
                  selectedBrand === brand
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                data-testid={`tab-brand-${brand}`}
              >
                {brand}
              </button>
            ))}
          </div>

          {/* Filter Controls */}
          <div className="flex items-center gap-4">
            {/* ON/OFF Filter */}
            <div className="flex items-center gap-2">
              <Signal className="h-4 w-4 text-muted-foreground" />
              <Select value={viewMode} onValueChange={(value: "all" | "on" | "off") => setViewMode(value)}>
                <SelectTrigger className="w-24 h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">다보기</SelectItem>
                  <SelectItem value="on">ON만</SelectItem>
                  <SelectItem value="off">OFF만</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Sort */}
            <div className="flex items-center gap-2">
              <ArrowUpDown className="h-4 w-4 text-muted-foreground" />
              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger className="w-32 h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="recent">최근순</SelectItem>
                  <SelectItem value="volume">조회량순</SelectItem>
                  <SelectItem value="score">점수순</SelectItem>
                  <SelectItem value="rank">순위순</SelectItem>
                  <SelectItem value="change">변동순</SelectItem>
                  <SelectItem value="keyword">키워드순</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Batch Controls */}
            {isRunning ? (
              <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-3 min-w-[280px]">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                    <span className="text-sm font-medium text-blue-900 dark:text-blue-100">
                      순위 체크 중...
                    </span>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCancel}
                    className="h-7 text-xs"
                    data-testid="button-cancel-checks"
                  >
                    취소
                  </Button>
                </div>
                
                <div className="space-y-2">
                  <Progress 
                    value={progress.total > 0 ? (progress.done / progress.total) * 100 : 0}
                    className="w-full h-2"
                  />
                  <div className="flex justify-between text-xs text-blue-700 dark:text-blue-300">
                    <span>{progress.text}</span>
                    <span>{progress.done}/{progress.total} ({progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0}%)</span>
                  </div>
                </div>
              </div>
            ) : (
              <Button
                onClick={runAllChecks}
                size="sm"
                disabled={filteredData.length === 0}
                data-testid="button-start-all-checks"
              >
                전체 체크 시작
              </Button>
            )}
          </div>
        </div>

        {/* Table */}
        <div className="border border-border rounded-lg overflow-hidden">
          {/* Table Header */}
          <div className="grid grid-cols-10 gap-4 p-4 bg-muted/50 border-b border-border text-sm font-medium text-muted-foreground">
            <div className="col-span-1">ON/OFF</div>
            <div className="col-span-2">키워드</div>
            <div className="col-span-1">조회량</div>
            <div className="col-span-1">점수</div>
            <div className="col-span-1">순위</div>
            <div className="col-span-1">변동</div>
            <div className="col-span-1">유지일</div>
            <div className="col-span-1">마지막체크</div>
            <div className="col-span-1">액션</div>
          </div>

          {/* Table Body */}
          <div className="divide-y divide-border">
            {filteredData.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">
                {targetsLoading ? "로딩 중..." : "표시할 데이터가 없습니다."}
              </div>
            ) : (
              filteredData.map((item, index) => (
                <div
                  key={item.id}
                  className={`grid grid-cols-10 gap-4 p-4 text-sm hover:bg-muted/50 transition-colors ${
                    index % 2 === 0 ? 'bg-background' : 'bg-muted/20'
                  }`}
                  data-testid={`row-keyword-${item.id}`}
                >
                  {/* ON/OFF */}
                  <div className="col-span-1 flex items-center">
                    <Switch
                      checked={item.active}
                      onCheckedChange={() => toggleKeywordActive(item.id)}
                      className="data-[state=checked]:bg-primary"
                      data-testid={`switch-${item.id}`}
                    />
                  </div>

                  {/* 키워드 */}
                  <div className="col-span-2">
                    <div className="font-medium text-foreground">{item.keyword}</div>
                    <div className="text-xs text-muted-foreground">{item.brand}</div>
                  </div>

                  {/* 조회량 */}
                  <div className="col-span-1">
                    <div className="text-sm text-muted-foreground">{formatNumber(item.volume)}</div>
                  </div>

                  {/* 점수 */}
                  <div className="col-span-1">
                    <div className="text-sm text-muted-foreground">{item.score}</div>
                  </div>

                  {/* 순위 */}
                  <div className="col-span-1">
                    <div className="font-bold text-lg text-foreground">{item.rank}</div>
                  </div>

                  {/* 변동 */}
                  <div className="col-span-1">
                    <div className={`flex items-center font-medium ${
                      item.change > 0 ? 'text-red-500' : 
                      item.change < 0 ? 'text-blue-500' : 
                      'text-muted-foreground'
                    }`}>
                      {item.change > 0 && <TrendingUp className="h-3 w-3 mr-1" />}
                      {item.change < 0 && <TrendingDown className="h-3 w-3 mr-1" />}
                      {item.change === 0 && <Minus className="h-3 w-3 mr-1" />}
                      {formatChange(item.change)}
                    </div>
                  </div>

                  {/* 유지일 */}
                  <div className="col-span-1">
                    <div className="text-sm text-muted-foreground">{item.streakDays}일</div>
                  </div>

                  {/* 마지막체크 */}
                  <div className="col-span-1">
                    <div className="text-sm text-muted-foreground">{item.lastCheck}</div>
                  </div>

                  {/* 액션 */}
                  <div className="col-span-1">
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => window.open(item.url, '_blank')}
                        data-testid={`button-visit-${item.id}`}
                      >
                        <ExternalLink className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDeleteTarget(item.id)}
                        data-testid={`button-delete-${item.id}`}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Add Tracked Target Dialog */}
      <Dialog open={isAddBlogOpen} onOpenChange={setIsAddBlogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>키워드 추가</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="query"
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
                    <FormLabel>대상 URL</FormLabel>
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
                name="windowMin"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>최소 순위</FormLabel>
                    <FormControl>
                      <Input 
                        type="number" 
                        placeholder="1" 
                        {...field}
                        onChange={(e) => field.onChange(parseInt(e.target.value) || 1)}
                        data-testid="input-window-min"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="windowMax"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>최대 순위</FormLabel>
                    <FormControl>
                      <Input 
                        type="number" 
                        placeholder="10" 
                        {...field}
                        onChange={(e) => field.onChange(parseInt(e.target.value) || 10)}
                        data-testid="input-window-max"
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
                  disabled={addTargetMutation.isPending}
                  data-testid="button-submit-target"
                >
                  {addTargetMutation.isPending ? "추가 중..." : "추가"}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}