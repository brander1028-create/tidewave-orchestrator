import * as React from "react";
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
import { RankTrendChart } from "@/components/charts/rank-trend-chart";
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
  Minus
} from "lucide-react";
import { ColumnDef } from "@tanstack/react-table";

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
}

export default function Rank() {
  const [selectedTab, setSelectedTab] = React.useState("blog");
  const [keywords, setKeywords] = React.useState(["홍삼", "홍삼스틱"]);
  const [newKeyword, setNewKeyword] = React.useState("");
  const [selectedRankingDetail, setSelectedRankingDetail] = React.useState<RankingData | null>(null);

  // Mock data
  const mockRankingData: RankingData[] = [
    {
      id: "1",
      keyword: "홍삼",
      rank: 8,
      change: 3,
      page: 1,
      position: 8,
      url: "blog.naver.com/user123/post456",
      trend: [5, 8, 6, 9, 12, 15, 18, 16, 19, 22],
      status: "active",
      lastCheck: "2분 전"
    },
    {
      id: "2", 
      keyword: "홍삼스틱",
      rank: 15,
      change: -7,
      page: 2,
      position: 5,
      url: "blog.naver.com/healthstore/789",
      trend: [22, 19, 21, 18, 15, 12, 9, 11, 8, 5],
      status: "warning",
      lastCheck: "5분 전"
    },
    {
      id: "3",
      keyword: "홍삼 효능", 
      rank: 12,
      change: 0,
      page: 2,
      position: 2,
      url: "blog.naver.com/wellness/112",
      trend: [12, 13, 11, 12, 14, 12, 13, 11, 12, 13],
      status: "active",
      lastCheck: "1분 전"
    }
  ];

  const columns: ColumnDef<RankingData>[] = [
    {
      accessorKey: "keyword",
      header: "키워드",
      cell: ({ row }) => {
        const status = row.original.status;
        const statusColor = status === "active" ? "bg-green-500" : 
                          status === "warning" ? "bg-yellow-500" : "bg-red-500";
        const statusText = status === "active" ? "정상" :
                         status === "warning" ? "주의" : "오류";
        const statusTextColor = status === "active" ? "text-green-400" :
                               status === "warning" ? "text-yellow-400" : "text-red-400";
        
        return (
          <div className="flex items-center gap-3">
            <div className={`w-2 h-2 ${statusColor} rounded-full`}></div>
            <span className="text-sm font-medium text-foreground">{row.original.keyword}</span>
            <Badge variant="outline" className={statusTextColor}>
              {statusText}
            </Badge>
          </div>
        );
      },
    },
    {
      accessorKey: "rank",
      header: "현재 순위",
      cell: ({ row }) => (
        <div className="text-sm">
          <span className="text-2xl font-bold text-foreground">{row.original.rank}</span>
          <span className="text-muted-foreground text-sm ml-1">위</span>
        </div>
      ),
    },
    {
      accessorKey: "change",
      header: "변동",
      cell: ({ row }) => {
        const change = row.original.change;
        const isPositive = change > 0;
        const isNegative = change < 0;
        
        return (
          <div className="flex items-center gap-2">
            {isPositive && <TrendingUp className="w-4 h-4 text-green-500" />}
            {isNegative && <TrendingDown className="w-4 h-4 text-red-500" />}
            {change === 0 && <Minus className="w-4 h-4 text-gray-500" />}
            <span className={`font-medium ${
              isPositive ? "text-green-500" : 
              isNegative ? "text-red-500" : "text-gray-500"
            }`}>
              {change > 0 ? "+" : ""}{change}
            </span>
          </div>
        );
      },
    },
    {
      accessorKey: "page",
      header: "페이지",
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">{row.original.page}페이지</span>
      ),
    },
    {
      accessorKey: "url",
      header: "블로그 URL",
      cell: ({ row }) => (
        <a 
          href="#" 
          className="text-primary hover:text-primary/80 text-sm truncate max-w-xs block"
          onClick={(e) => e.preventDefault()}
        >
          {row.original.url}
        </a>
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

  const addKeyword = () => {
    if (newKeyword.trim() && !keywords.includes(newKeyword.trim())) {
      setKeywords([...keywords, newKeyword.trim()]);
      setNewKeyword("");
    }
  };

  const removeKeyword = (keyword: string) => {
    setKeywords(keywords.filter(k => k !== keyword));
  };

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
                <div className="flex gap-2">
                  <Input
                    placeholder="키워드 입력..."
                    value={newKeyword}
                    onChange={(e) => setNewKeyword(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && addKeyword()}
                    className="flex-1"
                    data-testid="input-keyword"
                  />
                  <Button 
                    onClick={addKeyword} 
                    size="sm"
                    data-testid="button-add-keyword"
                  >
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
                
                <div className="flex flex-wrap gap-2 max-h-20 overflow-y-auto custom-scrollbar">
                  {keywords.map((keyword, index) => (
                    <Badge 
                      key={index} 
                      variant="secondary" 
                      className="flex items-center gap-1"
                    >
                      {keyword}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-4 w-4 p-0 hover:text-destructive"
                        onClick={() => removeKeyword(keyword)}
                        data-testid={`button-remove-keyword-${index}`}
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
                  <span className="text-sm font-medium text-foreground">{mockRankingData.length}개</span>
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
          <div className="flex flex-wrap gap-3 items-center justify-between">
            <div className="flex flex-wrap gap-3">
              <Button className="flex items-center gap-2" data-testid="button-start-check">
                <Play className="w-4 h-4" />
                전체 체크 시작
              </Button>
              <Button variant="secondary" className="flex items-center gap-2">
                <Download className="w-4 h-4" />
                결과 내보내기
              </Button>
              <Button variant="secondary" className="flex items-center gap-2">
                <History className="w-4 h-4" />
                히스토리 보기
              </Button>
            </div>
            <div className="flex gap-3 items-center">
              <div className="flex items-center gap-2">
                <Label className="text-sm text-muted-foreground">필터:</Label>
                <Select defaultValue="all">
                  <SelectTrigger className="w-24">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">전체</SelectItem>
                    <SelectItem value="up">상승</SelectItem>
                    <SelectItem value="down">하락</SelectItem>
                    <SelectItem value="new">신규</SelectItem>
                    <SelectItem value="stable">변동없음</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2">
                <Label className="text-sm text-muted-foreground">정렬:</Label>
                <Select defaultValue="recent">
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="recent">최근 업데이트순</SelectItem>
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
            data={mockRankingData}
            title="블로그 순위 현황"
            description={`총 ${mockRankingData.length}개 키워드`}
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
                        {selectedRankingDetail.change > 0 && <TrendingUp className="w-4 h-4 text-green-500" />}
                        {selectedRankingDetail.change < 0 && <TrendingDown className="w-4 h-4 text-red-500" />}
                        {selectedRankingDetail.change === 0 && <Minus className="w-4 h-4 text-gray-500" />}
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
    </div>
  );
}
