import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Clock, TrendingUp, Activity, Server } from "lucide-react";
import type { HistoryResponse } from "../../../shared/schema";

export default function HistoryPage() {
  const [, setLocation] = useLocation();

  const { data: history, isLoading, error } = useQuery<HistoryResponse>({
    queryKey: ['/api/jobs/history?limit=50']
  });

  // Query for BFS crawl progress (for logs tab)
  const { data: crawlProgress, isLoading: crawlLoading, error: crawlError } = useQuery({
    queryKey: ['/api/keywords/crawl/progress'],
    refetchInterval: 5000, // Refresh every 5 seconds
    enabled: true
  });

  // Query for system health (for logs tab)
  const { data: systemHealth, isLoading: healthLoading, error: healthError } = useQuery({
    queryKey: ['/api/health'],
    refetchInterval: 5000, // Refresh every 5 seconds
    enabled: true
  });

  const handleRowClick = (jobId: string) => {
    setLocation(`/results/${jobId}`);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('ko-KR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    }).format(date);
  };

  const getVolumesBadge = (mode: string) => {
    switch (mode) {
      case 'searchads':
        return <Badge variant="default" className="bg-green-100 text-green-700 text-xs">SearchAds</Badge>;
      case 'partial':
        return <Badge variant="secondary" className="bg-amber-100 text-amber-700 text-xs">Partial</Badge>;
      case 'fallback':
        return <Badge variant="outline" className="bg-gray-100 text-gray-600 text-xs">Fallback</Badge>;
      default:
        return <Badge variant="outline" className="text-xs">{mode}</Badge>;
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center gap-4 mb-6">
            <Link href="/">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="h-4 w-4 mr-2" />
                대시보드로
              </Button>
            </Link>
          </div>
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-4"></div>
              <p className="text-gray-600 dark:text-gray-400">히스토리를 불러오는 중...</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error || !history) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center gap-4 mb-6">
            <Link href="/">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="h-4 w-4 mr-2" />
                대시보드로
              </Button>
            </Link>
          </div>
          <Card>
            <CardContent className="pt-6">
              <p className="text-red-600 dark:text-red-400">히스토리를 불러올 수 없습니다.</p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // Helper component for History Table
  const HistoryTable = () => (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5" />
          최근 분석 작업 ({history?.items.length || 0}건)
        </CardTitle>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          행을 클릭하면 해당 분석 결과로 이동합니다.
        </p>
      </CardHeader>
      <CardContent>
        {!history || history.items.length === 0 ? (
          <div className="text-center py-8">
            <Clock className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600 dark:text-gray-400">아직 분석 기록이 없습니다.</p>
            <Link href="/">
              <Button className="mt-4" variant="outline">
                첫 분석 시작하기
              </Button>
            </Link>
          </div>
        ) : (
          <Table data-testid="history-table">
            <TableHeader>
              <TableRow>
                <TableHead>시각</TableHead>
                <TableHead>기준키워드</TableHead>
                <TableHead className="text-center">통과블로그</TableHead>
                <TableHead className="text-center">요청/실제</TableHead>
                <TableHead className="text-center">모드</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {history.items.map((item) => (
                <TableRow
                  key={item.jobId}
                  className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800"
                  onClick={() => handleRowClick(item.jobId)}
                  data-testid={`history-row-${item.jobId}`}
                >
                  <TableCell className="font-medium">
                    {formatDate(item.createdAt)}
                  </TableCell>
                  <TableCell>
                    <div className="max-w-[200px] truncate">
                      {item.baseKeyword}
                    </div>
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge variant="secondary" className="text-xs">
                      {item.counters.hit_blogs}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-center">
                    <span className="text-sm text-gray-600 dark:text-gray-400">
                      {item.counters.selected_keywords}/{item.counters.searched_keywords}
                    </span>
                  </TableCell>
                  <TableCell className="text-center">
                    {getVolumesBadge(item.counters.volumes_mode)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );

  // Helper component for Logs display
  const LogsDisplay = () => (
    <div className="space-y-4">
      {/* BFS Crawl Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            키워드 크롤러 상태
          </CardTitle>
        </CardHeader>
        <CardContent>
          {crawlProgress ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">상태:</span>
                <Badge variant={crawlProgress.status === 'running' ? 'default' : 'secondary'}>
                  {crawlProgress.status === 'running' ? '실행 중' : 
                   crawlProgress.status === 'completed' ? '완료' : 
                   crawlProgress.status === 'error' ? '오류' : '대기 중'}
                </Badge>
              </div>
              
              {crawlProgress.progress && (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">수집된 키워드:</span>
                    <span className="text-sm">{crawlProgress.progress.collected || 0}개</span>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">처리된 요청:</span>
                    <span className="text-sm">{crawlProgress.progress.requested || 0}개</span>
                  </div>
                  
                  {crawlProgress.progress.frontierSize > 0 && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">대기열:</span>
                      <span className="text-sm">{crawlProgress.progress.frontierSize}개</span>
                    </div>
                  )}
                  
                  {crawlProgress.progress.currentHop && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">현재 Hop:</span>
                      <span className="text-sm">{crawlProgress.progress.currentHop}</span>
                    </div>
                  )}
                </>
              )}
              
              {crawlProgress.callBudget && (
                <div className="mt-4 p-3 bg-muted rounded-lg">
                  <h4 className="text-sm font-semibold mb-2">API 호출 예산</h4>
                  <div className="space-y-1 text-xs">
                    <div className="flex justify-between">
                      <span>일일 잔여:</span>
                      <span>{crawlProgress.callBudget.dailyRemaining}/{crawlProgress.callBudget.dailyLimit}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>분당 잔여:</span>
                      <span>{crawlProgress.callBudget.perMinuteRemaining}/{crawlProgress.callBudget.perMinuteLimit}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">크롤러 상태를 불러오는 중...</p>
          )}
        </CardContent>
      </Card>

      {/* System Health */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Server className="h-5 w-5" />
            시스템 상태
          </CardTitle>
        </CardHeader>
        <CardContent>
          {healthLoading ? (
            <p className="text-muted-foreground text-sm">시스템 상태를 확인하는 중...</p>
          ) : healthError ? (
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span>애플리케이션:</span>
                <Badge variant="destructive">
                  연결 실패
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                헬스 체크 API에 연결할 수 없습니다.
              </p>
            </div>
          ) : systemHealth ? (
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span>OpenAPI:</span>
                <Badge variant={systemHealth.openapi?.ok ? "default" : "destructive"} 
                       className={systemHealth.openapi?.ok ? "bg-green-100 text-green-700" : ""}>
                  {systemHealth.openapi?.ok ? '정상' : '오류'}
                </Badge>
              </div>
              
              <div className="flex items-center justify-between">
                <span>SearchAds API:</span>
                <Badge variant={systemHealth.searchads?.ok ? "default" : "secondary"}
                       className={systemHealth.searchads?.ok ? "bg-green-100 text-green-700" : 
                                  systemHealth.searchads?.ok === false ? "bg-red-100 text-red-700" : 
                                  "bg-amber-100 text-amber-700"}>
                  {systemHealth.searchads?.ok ? 'SearchAds 연결됨' : 
                   systemHealth.searchads?.ok === false ? '연결 실패' : '부분 연결'}
                </Badge>
              </div>
              
              <div className="flex items-center justify-between">
                <span>키워드 DB:</span>
                <Badge variant={systemHealth.keywordsdb?.ok ? "default" : "destructive"}
                       className={systemHealth.keywordsdb?.ok ? "bg-green-100 text-green-700" : ""}>
                  {systemHealth.keywordsdb?.ok ? `${(systemHealth.keywordsdb as any)?.keywords || 0}개 키워드` : '연결 실패'}
                </Badge>
              </div>
              
              {systemHealth._meta && (
                <div className="mt-4 p-3 bg-muted rounded-lg">
                  <h4 className="text-sm font-semibold mb-2">상태 정보</h4>
                  <div className="space-y-1 text-xs">
                    <div className="flex justify-between">
                      <span>모드:</span>
                      <span>{systemHealth._meta.mode || 'unknown'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>캐시 수명:</span>
                      <span>{systemHealth._meta.cache_age_seconds || 0}초</span>
                    </div>
                    <div className="flex justify-between">
                      <span>성능 저하:</span>
                      <span>{systemHealth._meta.degraded ? 'Yes' : 'No'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>마지막 업데이트:</span>
                      <span className="text-muted-foreground">
                        {new Date().toLocaleString('ko-KR')}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">시스템 상태를 불러올 수 없습니다.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <Link href="/">
            <Button variant="ghost" size="sm" data-testid="back-to-dashboard">
              <ArrowLeft className="h-4 w-4 mr-2" />
              대시보드로
            </Button>
          </Link>
          <div className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-gray-600 dark:text-gray-400" />
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              히스토리 & 로그
            </h1>
          </div>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="history" className="space-y-4">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="history" data-testid="history-tab">
              <TrendingUp className="h-4 w-4 mr-2" />
              History
            </TabsTrigger>
            <TabsTrigger value="logs" data-testid="logs-tab">
              <Activity className="h-4 w-4 mr-2" />
              Logs
            </TabsTrigger>
          </TabsList>

          <TabsContent value="history" className="space-y-4">
            <HistoryTable />
            
            {/* Bottom Info for History */}
            {history && history.items.length > 0 && (
              <div className="text-center">
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  최근 {history.items.length}건의 분석 기록을 표시하고 있습니다.
                </p>
              </div>
            )}
          </TabsContent>

          <TabsContent value="logs" className="space-y-4">
            <LogsDisplay />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}