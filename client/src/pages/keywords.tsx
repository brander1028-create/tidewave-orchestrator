import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { RefreshCw, Search, AlertTriangle, CheckCircle, Filter, TrendingUp, Database, ArrowLeft } from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import HealthStatus from "@/components/health-status";

// Types for keywords API
type ManagedKeyword = {
  id: string;
  text: string;
  raw_volume: number;
  excluded: boolean;
  created_at: string;
  updated_at: string;
};

type KeywordsResponse = {
  items: ManagedKeyword[];
};

type RefreshResponse = {
  ok: boolean;
  volumes_mode: 'fallback' | 'partial' | 'searchads';
  stats: {
    requested: number;
    ok: number;
    fail: number;
    http: Record<string, number>;
  };
  inserted: number;
};

type HealthResponse = {
  openapi: { ok: boolean; reason?: string };
  searchads: { ok: boolean; mode?: string };
  keywordsdb: { ok: boolean };
};

export default function KeywordsPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [refreshBase, setRefreshBase] = useState("");
  const [refreshLimit, setRefreshLimit] = useState(300);
  const [orderBy, setOrderBy] = useState<'raw_volume' | 'text'>('raw_volume');
  const [orderDir, setOrderDir] = useState<'asc' | 'desc'>('desc');
  const [activeTab, setActiveTab] = useState("manage");
  const [lastRefreshStats, setLastRefreshStats] = useState<RefreshResponse | null>(null);
  const { toast } = useToast();

  // Fetch system health status
  const { data: health } = useQuery({
    queryKey: ['/api/health'],
    refetchInterval: 30000,
  });

  // Fetch active keywords
  const { data: activeKeywords, isLoading: activeLoading, error: activeError } = useQuery({
    queryKey: [`/api/keywords?excluded=false&orderBy=${orderBy}&dir=${orderDir}`],
    enabled: activeTab === "manage",
  });

  // Fetch excluded keywords  
  const { data: excludedKeywords, isLoading: excludedLoading } = useQuery({
    queryKey: ['/api/keywords/excluded'],
    enabled: activeTab === "excluded",
  });

  // Keywords refresh mutation
  const refreshMutation = useMutation({
    mutationFn: async (params: { base: string; limit: number; strict: boolean }) => {
      const response = await apiRequest('POST', '/api/keywords/refresh', params);
      return response.json() as Promise<RefreshResponse>;
    },
    onSuccess: (data) => {
      setLastRefreshStats(data);
      toast({
        title: "키워드 새로고침 완료",
        description: `${data.inserted}개 키워드가 ${data.volumes_mode} 모드로 추가되었습니다`,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/keywords'] });
    },
    onError: (error: any) => {
      const message = error?.health ? "엄격 모드: 모든 서비스가 정상이어야 합니다" : "키워드 새로고침 실패";
      toast({
        title: "오류",
        description: message,
        variant: "destructive",
      });
    },
  });

  // Toggle keyword excluded status
  const toggleMutation = useMutation({
    mutationFn: async (params: { id: string; excluded: boolean }) => {
      const response = await apiRequest('PATCH', `/api/keywords/${params.id}`, { excluded: params.excluded });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/keywords'] });
      queryClient.invalidateQueries({ queryKey: ['/api/keywords/excluded'] });
    },
    onError: () => {
      toast({
        title: "오류",
        description: "키워드 상태 변경에 실패했습니다",
        variant: "destructive",
      });
    },
  });

  const handleRefresh = () => {
    if (!refreshBase.trim()) {
      toast({
        title: "오류", 
        description: "기준 키워드를 입력해주세요",
        variant: "destructive",
      });
      return;
    }

    // Check system health before proceeding
    const healthData = health as HealthResponse;
    const isSystemHealthy = healthData?.openapi?.ok && 
                           healthData?.searchads?.ok && 
                           healthData?.keywordsdb?.ok;
    
    if (!isSystemHealthy) {
      toast({
        title: "시스템 상태 불량", 
        description: "모든 서비스가 정상이어야 키워드를 새로고침할 수 있습니다",
        variant: "destructive",
      });
      return;
    }

    refreshMutation.mutate({ 
      base: refreshBase, 
      limit: refreshLimit, 
      strict: true 
    });
  };

  const handleToggleExcluded = (id: string, currentExcluded: boolean) => {
    toggleMutation.mutate({ id, excluded: !currentExcluded });
  };

  // Filter keywords based on search term
  const filterKeywords = (keywords: ManagedKeyword[]) => {
    if (!searchTerm) return keywords;
    return keywords.filter(k => 
      k.text.toLowerCase().includes(searchTerm.toLowerCase())
    );
  };

  const getVolumeColor = (volume: number) => {
    if (volume >= 10000) return "text-green-600 dark:text-green-400";
    if (volume >= 1000) return "text-blue-600 dark:text-blue-400";
    if (volume >= 100) return "text-yellow-600 dark:text-yellow-400";
    return "text-gray-600 dark:text-gray-400";
  };

  const renderKeywordsTable = (keywords: ManagedKeyword[], showToggle: boolean) => {
    const filteredKeywords = filterKeywords(keywords);
    
    return (
      <div className="space-y-4">
        {/* Search and Controls */}
        <div className="flex items-center space-x-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="키워드 검색..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8"
              data-testid="input-search-keywords"
            />
          </div>
          
          {showToggle && (
            <div className="flex items-center space-x-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <Select value={orderBy} onValueChange={(value: 'raw_volume' | 'text') => setOrderBy(value)}>
                <SelectTrigger className="w-32" data-testid="select-order">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="raw_volume">조회량순</SelectItem>
                  <SelectItem value="text">이름순</SelectItem>
                </SelectContent>
              </Select>
              
              <Select value={orderDir} onValueChange={(value: 'asc' | 'desc') => setOrderDir(value)}>
                <SelectTrigger className="w-24" data-testid="select-direction">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="desc">내림차순</SelectItem>
                  <SelectItem value="asc">오름차순</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        {/* Results Count */}
        <div className="text-sm text-muted-foreground">
          총 {filteredKeywords.length}개 키워드 {searchTerm && `(${keywords.length}개 중 검색됨)`}
        </div>

        {/* Keywords Table */}
        <div className="border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>키워드</TableHead>
                <TableHead className="text-right">월간 조회량</TableHead>
                <TableHead className="text-center">등록일</TableHead>
                {showToggle && <TableHead className="text-center">상태 변경</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredKeywords.map((keyword) => (
                <TableRow key={keyword.id} data-testid={`row-keyword-${keyword.id}`}>
                  <TableCell className="font-medium">{keyword.text}</TableCell>
                  <TableCell className={`text-right font-mono ${getVolumeColor(keyword.raw_volume)}`}>
                    {keyword.raw_volume.toLocaleString()}
                  </TableCell>
                  <TableCell className="text-center text-sm text-muted-foreground">
                    {new Date(keyword.created_at).toLocaleDateString()}
                  </TableCell>
                  {showToggle && (
                    <TableCell className="text-center">
                      <Switch
                        checked={!keyword.excluded}
                        onCheckedChange={() => handleToggleExcluded(keyword.id, keyword.excluded)}
                        disabled={toggleMutation.isPending}
                        data-testid={`switch-keyword-${keyword.id}`}
                      />
                    </TableCell>
                  )}
                </TableRow>
              ))}
              {filteredKeywords.length === 0 && (
                <TableRow>
                  <TableCell colSpan={showToggle ? 4 : 3} className="text-center py-8 text-muted-foreground">
                    {searchTerm ? "검색 결과가 없습니다" : "키워드가 없습니다"}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-card border-b border-border sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-3">
              <Link href="/">
                <Button variant="ghost" size="sm" data-testid="link-dashboard">
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  대시보드
                </Button>
              </Link>
              <div className="h-6 w-px bg-border" />
              <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
                <Database className="text-primary-foreground h-4 w-4" />
              </div>
              <h1 className="text-xl font-bold text-foreground">키워드 관리</h1>
            </div>
            <HealthStatus />
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="space-y-6">
          {/* Keywords Refresh Section */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <RefreshCw className="h-5 w-5" />
                <span>키워드 새로고침</span>
              </CardTitle>
              <CardDescription>
                SearchAds API에서 새로운 키워드와 조회량 데이터를 가져옵니다
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">기준 키워드</label>
                  <Input
                    placeholder="예: 홍삼"
                    value={refreshBase}
                    onChange={(e) => setRefreshBase(e.target.value)}
                    data-testid="input-refresh-base"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">최대 키워드 수</label>
                  <Input
                    type="number"
                    min="50"
                    max="1000"
                    value={refreshLimit}
                    onChange={(e) => setRefreshLimit(Number(e.target.value))}
                    data-testid="input-refresh-limit"
                  />
                </div>
                <div className="flex items-end">
                  <Button
                    onClick={handleRefresh}
                    disabled={refreshMutation.isPending || !((health as HealthResponse)?.openapi?.ok && (health as HealthResponse)?.searchads?.ok && (health as HealthResponse)?.keywordsdb?.ok)}
                    className="w-full"
                    data-testid="button-refresh-keywords"
                  >
                    {refreshMutation.isPending ? (
                      <>
                        <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                        새로고침 중...
                      </>
                    ) : (
                      <>
                        <RefreshCw className="mr-2 h-4 w-4" />
                        새로고침
                      </>
                    )}
                  </Button>
                </div>
              </div>

              {refreshMutation.isError && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    키워드 새로고침에 실패했습니다. 시스템 상태를 확인해주세요.
                  </AlertDescription>
                </Alert>
              )}
              
              {lastRefreshStats && (
                <div className="rounded-lg border bg-card p-4 space-y-3">
                  <h4 className="font-medium text-sm flex items-center space-x-2">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    <span>마지막 새로고침 결과</span>
                  </h4>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div className="space-y-1">
                      <div className="text-muted-foreground">모드</div>
                      <Badge variant={lastRefreshStats.volumes_mode === 'searchads' ? 'default' : 'secondary'}>
                        {lastRefreshStats.volumes_mode.toUpperCase()}
                      </Badge>
                    </div>
                    <div className="space-y-1">
                      <div className="text-muted-foreground">추가된 키워드</div>
                      <div className="font-medium">{lastRefreshStats.inserted}개</div>
                    </div>
                    <div className="space-y-1">
                      <div className="text-muted-foreground">요청 성공률</div>
                      <div className="font-medium text-green-600">
                        {lastRefreshStats.stats.requested > 0 ? 
                          Math.round((lastRefreshStats.stats.ok / lastRefreshStats.stats.requested) * 100) : 0}%
                      </div>
                    </div>
                    <div className="space-y-1">
                      <div className="text-muted-foreground">HTTP 상태</div>
                      <div className="text-xs">
                        {Object.entries(lastRefreshStats.stats.http).map(([code, count]) => (
                          <div key={code} className="font-mono">{code}: {count}</div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Keywords Management Tabs */}
          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
            <TabsList>
              <TabsTrigger value="manage" data-testid="tab-manage">
                <TrendingUp className="mr-2 h-4 w-4" />
                활성 키워드
              </TabsTrigger>
              <TabsTrigger value="excluded" data-testid="tab-excluded">
                <AlertTriangle className="mr-2 h-4 w-4" />
                제외된 키워드
              </TabsTrigger>
            </TabsList>

            <TabsContent value="manage" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>활성 키워드 관리</CardTitle>
                  <CardDescription>
                    SERP 분석에 사용될 키워드들을 관리합니다
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {activeLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                  ) : activeError ? (
                    <Alert variant="destructive">
                      <AlertTriangle className="h-4 w-4" />
                      <AlertDescription>키워드 목록을 불러오는데 실패했습니다</AlertDescription>
                    </Alert>
                  ) : (
                    renderKeywordsTable((activeKeywords as KeywordsResponse)?.items || [], true)
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="excluded" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>제외된 키워드</CardTitle>
                  <CardDescription>
                    SERP 분석에서 제외된 키워드들입니다
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {excludedLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                  ) : (
                    renderKeywordsTable((excludedKeywords as KeywordsResponse)?.items || [], false)
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </main>
    </div>
  );
}