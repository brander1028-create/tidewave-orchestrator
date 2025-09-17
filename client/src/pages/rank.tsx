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
  Bell
} from "lucide-react";
import { ColumnDef } from "@tanstack/react-table";
import { targetsApi, scrapingApi, rankApi, blogKeywordPairsApi } from "@/lib/api";
import type { TrackedTarget, InsertTrackedTarget, BlogKeywordTarget } from "@shared/schema";
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

// v7.13.1: Form schema for blog-keyword pair (제목 옵션화)
const addBlogKeywordPairSchema = z.object({
  keywordText: z.string().min(1, "키워드를 입력해주세요"),
  blogUrl: z.string().url("올바른 블로그 URL을 입력해주세요"),
  title: z.string().optional(), // v7.13.1: 제목 옵션화 (자동 채움)
  brand: z.string().optional(), // v7.13.1: 브랜드 옵션
  group: z.string().optional(), // v7.13.1: 그룹 옵션
  active: z.boolean().default(true),
});

type AddBlogKeywordPairForm = z.infer<typeof addBlogKeywordPairSchema>;

export default function Rank() {
  const [selectedTab, setSelectedTab] = React.useState("blog");
  const [selectedRankingDetail, setSelectedRankingDetail] = React.useState<RankingData | null>(null);
  const [isAddBlogOpen, setIsAddBlogOpen] = React.useState(false);
  const queryClient = useQueryClient();
  
  // v7.13.1: Fetch blog-keyword pairs from API with proper auth
  const { data: blogKeywordPairs = [], isLoading: pairsLoading } = useQuery<BlogKeywordTarget[]>({
    queryKey: ['/api/pairs'],
    queryFn: async () => {
      const response = await fetch('/api/pairs', {
        headers: { 'x-role': 'admin' }
      });
      if (!response.ok) {
        throw new Error('Failed to fetch pairs');
      }
      return response.json();
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
  
  // Form for adding new blog-keyword pairs
  const form = useForm<AddBlogKeywordPairForm>({
    resolver: zodResolver(addBlogKeywordPairSchema),
    defaultValues: {
      keywordText: "",
      blogUrl: "",
      title: "",
      brand: "",
      group: "",
      active: true,
    },
  });
  
  // Add blog-keyword pair mutation  
  const addPairMutation = useMutation({
    mutationFn: async (data: AddBlogKeywordPairForm) => {
      // v7.13.1: 정확한 필드 매핑으로 API 호출
      const payload = {
        keywordText: data.keywordText,
        blogUrl: data.blogUrl,
        title: data.title || undefined, // 빈 문자열을 undefined로 변환
        brand: data.brand || undefined,
        groupName: data.group || undefined, // group -> groupName 매핑
        active: data.active,
        owner: "admin", // 헤더에서 처리됨
      };
      
      const response = await fetch('/api/pairs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-role': 'admin',
        },
        body: JSON.stringify(payload),
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'API 호출 실패');
      }
      
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "페어 등록 완료",
        description: "블로그-키워드 페어가 성공적으로 등록되었습니다.",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/pairs'] });
      setIsAddBlogOpen(false);
      form.reset();
    },
    onError: (error) => {
      toast({
        title: "등록 실패",
        description: `페어 등록 중 오류가 발생했습니다: ${error.message}`,
        variant: "destructive",
      });
    },
  });
  
  // Delete blog-keyword pair mutation  
  const deletePairMutation = useMutation({
    mutationFn: async (id: string) => {
      return await blogKeywordPairsApi.remove(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/pairs'] });
      toast({
        title: "페어 삭제 완료",
        description: "블로그-키워드 페어가 삭제되었습니다.",
      });
    },
    onError: (error) => {
      toast({
        title: "삭제 실패",
        description: "페어 삭제 중 오류가 발생했습니다.",
        variant: "destructive",
      });
    },
  });

  // Fetch rank snapshots for blog-keyword pairs
  const { data: rankSnapshots = [], isLoading: rankLoading } = useQuery({
    queryKey: ['/api/rank-snapshots', 'blog'],
    queryFn: async () => {
      const response = await fetch('/api/rank-snapshots?kind=blog', {
        headers: { 'x-role': 'admin', 'x-owner': 'admin' }
      });
      if (!response.ok) return [];
      return response.json();
    },
    staleTime: 2 * 60 * 1000, // 2 minutes
  });

  // v7.13: Convert blog-keyword pairs to ranking data using real rank snapshots
  const convertPairsToRankingData = (pairs: BlogKeywordTarget[]): RankingData[] => {
    return pairs
      .filter(pair => pair.active) // Only show active pairs for blog tab
      .map((pair, index) => {
        // Try to find real rank snapshot for this pair
        const snapshot = rankSnapshots.find((s: any) => 
          s.targetId === pair.id || 
          s.query === pair.keywordText
        );
        
        const rank = snapshot?.rank || null;
        const prevRank = snapshot?.prevRank || rank;
        const change = (rank && prevRank) ? (prevRank - rank) : 0;
        
        return {
          id: pair.id || (index + 1).toString(),
          keyword: pair.keywordText || `키워드 ${index + 1}`,
          rank: rank || 999, // Default to unranked if no data
          change: change,
          page: rank ? Math.floor((rank - 1) / 10) + 1 : 99,
          position: rank ? ((rank - 1) % 10) + 1 : 9,
          url: pair.blogUrl || '',
          trend: [], // Will be populated by separate trend API call
          status: pair.active ? 
            (rank && rank <= 10 ? "active" : rank && rank <= 20 ? "warning" : "error") as any : 
            "error" as any,
          lastCheck: snapshot?.updatedAt ? 
            new Date(snapshot.updatedAt).toLocaleString('ko-KR') : 
            "데이터 없음",
          exposed: rank ? rank <= 15 : false,
          streakDays: 0 // TODO: Calculate from historical data
        };
      });
  };

  // v7.13: Current ranking data using new function
  const currentRankingData = convertPairsToRankingData(blogKeywordPairs);

  // Handle form submission
  const onSubmit = (data: AddBlogKeywordPairForm) => {
    addPairMutation.mutate(data);
  };
  
  // Handle pair deletion
  const handleDeletePair = (pairId: string) => {
    if (confirm("정말로 이 블로그-키워드 페어를 삭제하시겠습니까?")) {
      deletePairMutation.mutate(pairId);
    }
  };

  const columns: ColumnDef<RankingData>[] = [
    {
      accessorKey: "keyword",
      header: "키워드",
      cell: ({ row }) => {
        // Use real keyword data or defaults
        const volume = 0; // TODO: Integrate with keyword API
        const score = 0; // TODO: Calculate from rank position
        
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

  // Fetch real trend data for selected ranking
  const { data: detailTrendData = [] } = useQuery({
    queryKey: ['/api/rank-snapshots/history', selectedRankingDetail?.id],
    queryFn: async () => {
      if (!selectedRankingDetail?.id) return [];
      const response = await fetch(`/api/rank-snapshots/history?targetId=${selectedRankingDetail.id}`, {
        headers: { 'x-role': 'admin', 'x-owner': 'admin' }
      });
      if (!response.ok) return [];
      const history = await response.json();
      return history.map((item: any) => ({
        date: new Date(item.timestamp).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' }),
        rank: item.rank,
        score: 101 - item.rank,
        events: item.rank !== item.prevRank ? [{ type: 'rank_change', message: '순위 변동' }] : [],
      }));
    },
    enabled: !!selectedRankingDetail?.id,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

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
                        onClick={() => handleDeletePair(item.id)}
                        data-testid={`button-remove-keyword-${item.id}`}
                        disabled={deletePairMutation.isPending}
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

          {/* Ranking Table */}
          <DataTable
            columns={columns}
            data={currentRankingData}
            title="블로그 순위 현황"
            description={`총 ${currentRankingData.length}개 키워드`}
            onRowClick={(row) => setSelectedRankingDetail(row)}
          />
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
            <DialogTitle>블로그-키워드 페어 등록</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="keywordText"
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
                name="blogUrl"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>블로그 URL</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="https://blog.naver.com/..." 
                        {...field}
                        data-testid="input-blog-url"
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
                    <FormLabel>제목 (선택사항, 자동 채움)</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="블로그 제목을 입력하세요" 
                        {...field}
                        data-testid="input-blog-title"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="active"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
                    <div className="space-y-0.5">
                      <FormLabel>활성화</FormLabel>
                      <div className="text-sm text-muted-foreground">
                        전역 크론 스케줄에 포함하여 자동 순위 체크
                      </div>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        data-testid="switch-active"
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="brand"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>브랜드 (선택)</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="브랜드명을 입력하세요 (예: 진생가)" 
                        {...field}
                        data-testid="input-brand"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="group"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>그룹 (선택)</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="그룹명을 입력하세요 (예: 브랜딩)" 
                        {...field}
                        data-testid="input-group"
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
                  disabled={addPairMutation.isPending}
                  data-testid="button-submit-target"
                >
                  {addPairMutation.isPending ? "추가 중..." : "추가"}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
