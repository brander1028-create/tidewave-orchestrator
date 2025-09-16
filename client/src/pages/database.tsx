import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DataTable } from "@/components/ui/data-table";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { toast } from "@/hooks/use-toast";
import { 
  Database, 
  Hash, 
  Target, 
  Archive, 
  Settings,
  Plus,
  Search,
  Play,
  Pause,
  Trash2,
  RefreshCw,
  Eye,
  Calendar,
  Clock,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  DollarSign,
  Zap,
  HardDrive,
  Activity
} from "lucide-react";
import { ColumnDef } from "@tanstack/react-table";
import type { TrackedTarget, Group, GroupKeyword } from "@shared/schema";

// 키워드 데이터 인터페이스
interface KeywordData {
  id: string;
  keyword: string;
  volume: number;
  score: number;
  status: "active" | "paused" | "disabled";
  lastChecked: string;
  groupCount: number;
  rankHistory: number[];
}

// 타겟 데이터 인터페이스
interface TargetData extends TrackedTarget {
  statusDetail: "running" | "paused" | "error" | "idle";
  lastRun: string;
  nextRun: string;
  successRate: number;
  keywordCount: number;
}

// 스냅샷 데이터 인터페이스
interface SnapshotData {
  date: string;
  totalChecks: number;
  successfulChecks: number;
  avgRank: number;
  topKeywords: number;
  dataSize: string;
}

export default function DatabasePage() {
  const [selectedTab, setSelectedTab] = React.useState("keywords");
  const [isAddKeywordOpen, setIsAddKeywordOpen] = React.useState(false);
  const [selectedKeywords, setSelectedKeywords] = React.useState<string[]>([]);
  const queryClient = useQueryClient();

  // v7 그룹 데이터 조회
  const { data: groups = [], isLoading: groupsLoading } = useQuery<Group[]>({
    queryKey: ['/api/groups'],
    staleTime: 5 * 60 * 1000,
  });

  // 추적 타겟 데이터 조회
  const { data: trackedTargets = [], isLoading: targetsLoading } = useQuery<TrackedTarget[]>({
    queryKey: ['/api/tracked-targets'],
    staleTime: 5 * 60 * 1000,
  });

  // 키워드 데이터 API 조회
  const { data: keywordData = [], isLoading: keywordsLoading } = useQuery<KeywordData[]>({
    queryKey: ['/api/db/keywords'],
    staleTime: 5 * 60 * 1000,
  });

  // 타겟 관리 데이터 API 조회
  const { data: targetData = [], isLoading: dbTargetsLoading } = useQuery<TargetData[]>({
    queryKey: ['/api/db/targets'],
    staleTime: 5 * 60 * 1000,
  });

  // 스냅샷 집계 데이터 API 조회
  const { data: snapshotData = [], isLoading: snapshotsLoading } = useQuery<SnapshotData[]>({
    queryKey: ['/api/db/snapshots/agg'],
    staleTime: 5 * 60 * 1000,
  });

  // 토큰 사용량 통계 API 조회
  const { data: tokenStats, isLoading: tokenStatsLoading } = useQuery({
    queryKey: ['/api/db/token-usage'],
    staleTime: 2 * 60 * 1000, // 2분 캐시
  });

  // 키워드 테이블 컬럼
  const keywordColumns: ColumnDef<KeywordData>[] = [
    {
      id: "select",
      header: ({ table }) => (
        <input
          type="checkbox"
          checked={table.getIsAllPageRowsSelected()}
          onChange={(e) => table.toggleAllPageRowsSelected(!!e.target.checked)}
          className="rounded border border-input"
          data-testid="checkbox-select-all"
        />
      ),
      cell: ({ row }) => (
        <input
          type="checkbox"
          checked={row.getIsSelected()}
          onChange={(e) => row.toggleSelected(!!e.target.checked)}
          className="rounded border border-input"
          data-testid={`checkbox-select-${row.original.id}`}
        />
      ),
    },
    {
      accessorKey: "keyword",
      header: "키워드",
      cell: ({ row }) => (
        <div className="space-y-1">
          <div className="font-medium text-foreground">{row.original.keyword}</div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>조회량: {row.original.volume.toLocaleString()}</span>
            <span>•</span>
            <span>점수: {row.original.score}</span>
          </div>
        </div>
      ),
    },
    {
      accessorKey: "status",
      header: "상태",
      cell: ({ row }) => {
        const status = row.original.status;
        return (
          <Badge 
            variant={status === "active" ? "default" : status === "paused" ? "secondary" : "destructive"}
            data-testid={`status-${row.original.id}`}
          >
            {status === "active" ? "활성" : status === "paused" ? "일시정지" : "비활성"}
          </Badge>
        );
      },
    },
    {
      accessorKey: "groupCount",
      header: "그룹 수",
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">{row.original.groupCount}개</span>
      ),
    },
    {
      accessorKey: "lastChecked",
      header: "마지막 체크",
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">{row.original.lastChecked}</span>
      ),
    },
    {
      id: "actions",
      header: "액션",
      cell: ({ row }) => (
        <div className="flex gap-1">
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" data-testid={`button-view-${row.original.id}`}>
            <Eye className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" data-testid={`button-refresh-${row.original.id}`}>
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" data-testid={`button-delete-${row.original.id}`}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ),
    },
  ];

  // 타겟 테이블 컬럼
  const targetColumns: ColumnDef<TargetData>[] = [
    {
      accessorKey: "query",
      header: "타겟명",
      cell: ({ row }) => {
        const target = row.original;
        const displayName = target.query || target.url || `${target.kind} 타겟`;
        return (
          <div className="space-y-1">
            <div className="font-medium text-foreground">{displayName}</div>
            <div className="text-xs text-muted-foreground">{target.kind} • {target.keywordCount}개 키워드</div>
          </div>
        );
      },
    },
    {
      accessorKey: "statusDetail",
      header: "상태",
      cell: ({ row }) => {
        const status = row.original.statusDetail;
        const variants = {
          running: { variant: "default" as const, text: "실행중", color: "text-green-500" },
          paused: { variant: "secondary" as const, text: "일시정지", color: "text-yellow-500" },
          error: { variant: "destructive" as const, text: "오류", color: "text-red-500" },
          idle: { variant: "outline" as const, text: "대기", color: "text-gray-500" }
        };
        const config = variants[status];
        return (
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${config.color.replace('text-', 'bg-')}`} />
            <Badge variant={config.variant}>{config.text}</Badge>
          </div>
        );
      },
    },
    {
      accessorKey: "successRate",
      header: "성공률",
      cell: ({ row }) => (
        <div className="space-y-1">
          <div className="text-sm font-medium">{row.original.successRate}%</div>
          <Progress value={row.original.successRate} className="w-16 h-1" />
        </div>
      ),
    },
    {
      accessorKey: "lastRun",
      header: "마지막 실행",
      cell: ({ row }) => (
        <div className="space-y-1">
          <div className="text-sm text-foreground">{row.original.lastRun}</div>
          <div className="text-xs text-muted-foreground">다음: {row.original.nextRun}</div>
        </div>
      ),
    },
    {
      id: "actions",
      header: "액션",
      cell: ({ row }) => (
        <div className="flex gap-1">
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" data-testid={`button-play-${row.original.id}`}>
            <Play className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" data-testid={`button-pause-${row.original.id}`}>
            <Pause className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" data-testid={`button-settings-${row.original.id}`}>
            <Settings className="h-4 w-4" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">데이터베이스</h1>
          <p className="text-muted-foreground mt-1">키워드, 타겟, 스냅샷 관리 및 수집 규칙 설정</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-purple-600">
            <Database className="w-4 h-4 mr-1" />
            DB 관리
          </Badge>
          <Badge variant="outline" className="text-blue-600">
            {groups.length}개 그룹
          </Badge>
        </div>
      </div>

      <Tabs value={selectedTab} onValueChange={setSelectedTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="keywords" className="flex items-center gap-2" data-testid="tab-keywords">
            <Hash className="w-4 h-4" />
            키워드 보관소
          </TabsTrigger>
          <TabsTrigger value="targets" className="flex items-center gap-2" data-testid="tab-targets">
            <Target className="w-4 h-4" />
            타겟 관리
          </TabsTrigger>
          <TabsTrigger value="snapshots" className="flex items-center gap-2" data-testid="tab-snapshots">
            <Archive className="w-4 h-4" />
            스냅샷 요약
          </TabsTrigger>
          <TabsTrigger value="rules" className="flex items-center gap-2" data-testid="tab-rules">
            <Settings className="w-4 h-4" />
            수집 규칙
          </TabsTrigger>
        </TabsList>

        {/* 키워드 보관소 탭 */}
        <TabsContent value="keywords" className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold text-foreground">키워드 보관소</h2>
              <p className="text-sm text-muted-foreground">수집된 키워드의 조회량, 점수, 상태를 관리하고 그룹에 추가할 수 있습니다</p>
            </div>
            <div className="flex gap-2">
              <Button 
                onClick={() => setIsAddKeywordOpen(true)}
                className="flex items-center gap-2"
                data-testid="button-add-keyword"
              >
                <Plus className="w-4 h-4" />
                키워드 추가
              </Button>
              {selectedKeywords.length > 0 && (
                <Button variant="outline" className="flex items-center gap-2" data-testid="button-add-to-group">
                  <Target className="w-4 h-4" />
                  그룹에 추가 ({selectedKeywords.length})
                </Button>
              )}
            </div>
          </div>

          {/* 키워드 필터 */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Search className="w-4 h-4 text-muted-foreground" />
              <Input placeholder="키워드 검색..." className="w-64" data-testid="input-search-keywords" />
            </div>
            <Select defaultValue="all">
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체</SelectItem>
                <SelectItem value="active">활성</SelectItem>
                <SelectItem value="paused">일시정지</SelectItem>
                <SelectItem value="disabled">비활성</SelectItem>
              </SelectContent>
            </Select>
            <Select defaultValue="recent">
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="recent">최근 업데이트순</SelectItem>
                <SelectItem value="volume">조회량순</SelectItem>
                <SelectItem value="score">점수순</SelectItem>
                <SelectItem value="groups">그룹 수순</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* 키워드 테이블 */}
          <DataTable
            columns={keywordColumns}
            data={keywordData}
            title={`총 ${keywordData.length}개 키워드`}
            description="키워드별 상태 및 성과 관리"
          />
        </TabsContent>

        {/* 타겟 관리 탭 */}
        <TabsContent value="targets" className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold text-foreground">타겟 관리</h2>
              <p className="text-sm text-muted-foreground">블로그/상품 타겟의 스케줄 및 상태를 모니터링하고 제어할 수 있습니다</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex items-center gap-2" data-testid="button-refresh-all">
                <RefreshCw className="w-4 h-4" />
                전체 새로고침
              </Button>
              <Button className="flex items-center gap-2" data-testid="button-start-all">
                <Play className="w-4 h-4" />
                전체 시작
              </Button>
            </div>
          </div>

          {/* 타겟 상태 요약 */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-green-500" />
                  <span className="text-sm font-medium">실행중</span>
                </div>
                <div className="text-2xl font-bold text-green-500 mt-2">
                  {targetData.filter(t => t.statusDetail === "running").length}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-yellow-500" />
                  <span className="text-sm font-medium">일시정지</span>
                </div>
                <div className="text-2xl font-bold text-yellow-500 mt-2">
                  {targetData.filter(t => t.statusDetail === "paused").length}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-red-500" />
                  <span className="text-sm font-medium">오류</span>
                </div>
                <div className="text-2xl font-bold text-red-500 mt-2">
                  {targetData.filter(t => t.statusDetail === "error").length}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-gray-500" />
                  <span className="text-sm font-medium">대기</span>
                </div>
                <div className="text-2xl font-bold text-gray-500 mt-2">
                  {targetData.filter(t => t.statusDetail === "idle").length}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* 타겟 테이블 */}
          <DataTable
            columns={targetColumns}
            data={targetData}
            title={`총 ${targetData.length}개 타겟`}
            description="타겟별 실행 상태 및 스케줄 관리"
          />
        </TabsContent>

        {/* 스냅샷 요약 탭 */}
        <TabsContent value="snapshots" className="space-y-6">
          <div>
            <h2 className="text-xl font-semibold text-foreground">스냅샷 요약</h2>
            <p className="text-sm text-muted-foreground">일별 집계 데이터 및 보관 정책을 관리합니다 (최근 180일)</p>
          </div>

          {/* 스냅샷 통계 */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">총 데이터 크기</CardTitle>
                <HardDrive className="w-4 h-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">2.4GB</div>
                <div className="flex items-center gap-1 text-sm text-muted-foreground">
                  <TrendingUp className="w-3 h-3 text-green-500" />
                  <span>+12.5%</span>
                  <span>지난주 대비</span>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">일평균 체크 수</CardTitle>
                <Activity className="w-4 h-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">347</div>
                <div className="flex items-center gap-1 text-sm text-muted-foreground">
                  <span>성공률</span>
                  <span className="text-green-500 font-medium">94.2%</span>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">보관 기간</CardTitle>
                <Calendar className="w-4 h-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">180일</div>
                <div className="text-sm text-muted-foreground">
                  자동 정리 활성화
                </div>
              </CardContent>
            </Card>
          </div>

          {/* 일별 스냅샷 테이블 */}
          <Card>
            <CardHeader>
              <CardTitle>최근 7일 스냅샷</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {snapshotData.map((snapshot, index) => (
                  <div key={index} className="flex items-center justify-between p-3 bg-secondary/20 rounded-lg">
                    <div className="flex items-center gap-4">
                      <div className="text-sm font-medium">{snapshot.date}</div>
                      <div className="flex items-center gap-6 text-sm text-muted-foreground">
                        <span>체크: {snapshot.totalChecks}</span>
                        <span>성공: {snapshot.successfulChecks}</span>
                        <span>평균 순위: {snapshot.avgRank}위</span>
                        <span>Top 키워드: {snapshot.topKeywords}개</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{snapshot.dataSize}</Badge>
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0" data-testid={`button-download-${index}`}>
                        <Archive className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* 수집 규칙 탭 */}
        <TabsContent value="rules" className="space-y-6">
          <div>
            <h2 className="text-xl font-semibold text-foreground">수집 규칙 & 비용 가드</h2>
            <p className="text-sm text-muted-foreground">자동 중지 규칙, 토큰 사용량 추정, 캐시 히트율을 관리합니다</p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* 비용 가드 설정 */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <DollarSign className="w-5 h-5 text-green-500" />
                  비용 가드 설정
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="p-4 bg-yellow-50 dark:bg-yellow-950 rounded-lg border border-yellow-200 dark:border-yellow-800">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-medium text-yellow-800 dark:text-yellow-200">💰 자동 중지 활성화</h4>
                    <Switch defaultChecked data-testid="switch-auto-stop" />
                  </div>
                  <p className="text-sm text-yellow-700 dark:text-yellow-300">
                    키워드×타겟이 최근 30일간 Top 페이지 미진입 시 자동 수집 중지
                  </p>
                </div>
                
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm">Top 페이지 기준</Label>
                    <Select defaultValue="30">
                      <SelectTrigger className="w-24">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="10">Top 10</SelectItem>
                        <SelectItem value="20">Top 20</SelectItem>
                        <SelectItem value="30">Top 30</SelectItem>
                        <SelectItem value="50">Top 50</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <Label className="text-sm">확인 기간</Label>
                    <Select defaultValue="30">
                      <SelectTrigger className="w-24">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="7">7일</SelectItem>
                        <SelectItem value="14">14일</SelectItem>
                        <SelectItem value="30">30일</SelectItem>
                        <SelectItem value="60">60일</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* 토큰 사용량 모니터링 */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Zap className="w-5 h-5 text-blue-500" />
                  토큰 사용량 모니터링
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">오늘 사용량</span>
                    <span className="text-sm font-medium">2,847 토큰</span>
                  </div>
                  <Progress value={28} className="h-2" />
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>일일 한도: 10,000 토큰</span>
                    <span>28% 사용</span>
                  </div>
                </div>

                <Separator />

                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span>캐시 히트율</span>
                    <span className="text-green-500 font-medium">87.3%</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span>429 에러율</span>
                    <span className="text-red-500 font-medium">0.8%</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span>평균 응답시간</span>
                    <span className="font-medium">1.2초</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* 수집 스케줄 설정 */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="w-5 h-5 text-purple-500" />
                  글로벌 수집 스케줄
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm">기본 체크 주기</Label>
                    <Select defaultValue="30m">
                      <SelectTrigger className="w-32">
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
                    <Label className="text-sm">야간 모드 (23:00-07:00)</Label>
                    <Switch defaultChecked data-testid="switch-night-mode" />
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <Label className="text-sm">주말 감소 (체크 간격 2배)</Label>
                    <Switch data-testid="switch-weekend-mode" />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* 알림 설정 */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-orange-500" />
                  알림 설정
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm">토큰 한도 경고 (80%)</Label>
                    <Switch defaultChecked data-testid="switch-token-alert" />
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <Label className="text-sm">429 에러 증가 알림</Label>
                    <Switch defaultChecked data-testid="switch-error-alert" />
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <Label className="text-sm">타겟 중지 알림</Label>
                    <Switch defaultChecked data-testid="switch-stop-alert" />
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <Label className="text-sm">일일 요약 리포트</Label>
                    <Switch data-testid="switch-daily-report" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* 키워드 추가 모달 */}
      <Dialog open={isAddKeywordOpen} onOpenChange={setIsAddKeywordOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>새 키워드 추가</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div>
              <Label>키워드</Label>
              <Input placeholder="예: 홍삼 추천" className="mt-1" data-testid="input-new-keyword" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>예상 조회량</Label>
                <Input type="number" placeholder="1000" className="mt-1" data-testid="input-volume" />
              </div>
              <div>
                <Label>초기 점수</Label>
                <Input type="number" placeholder="70" className="mt-1" data-testid="input-score" />
              </div>
            </div>
            <div>
              <Label>그룹 추가 (선택사항)</Label>
              <Select>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="그룹 선택" />
                </SelectTrigger>
                <SelectContent>
                  {groups.map((group) => (
                    <SelectItem key={group.id} value={group.id}>
                      {group.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2 pt-4">
              <Button 
                variant="outline" 
                onClick={() => setIsAddKeywordOpen(false)}
                className="flex-1"
                data-testid="button-cancel-add"
              >
                취소
              </Button>
              <Button className="flex-1" data-testid="button-confirm-add">
                추가
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}