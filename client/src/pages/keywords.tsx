import { useState, useRef } from "react";
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
import { RefreshCw, Search, AlertTriangle, CheckCircle, Filter, TrendingUp, Database, ArrowLeft, Download, Upload, FileText } from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Navigation } from "@/components/navigation";

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

type KeywordsStatsResponse = {
  total: number;
  lastUpdated: string;
  volumes_mode: 'fallback' | 'partial' | 'searchads';
};

export default function KeywordsPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [refreshBase, setRefreshBase] = useState("");
  const [refreshLimit, setRefreshLimit] = useState(300);
  const [orderBy, setOrderBy] = useState<'raw_volume' | 'text'>('raw_volume');
  const [orderDir, setOrderDir] = useState<'asc' | 'desc'>('desc');
  const [activeTab, setActiveTab] = useState("manage");
  const [lastRefreshStats, setLastRefreshStats] = useState<RefreshResponse | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ loading: boolean; result?: any }>({ loading: false });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  // Fetch system health status
  const { data: health } = useQuery({
    queryKey: ['/api/health'],
    refetchInterval: 30000,
  });

  // Fetch keywords statistics
  const { data: keywordsStats } = useQuery({
    queryKey: ['/api/keywords', 'stats'],
    refetchInterval: 30000,
  });

  // Fetch active keywords
  const { data: activeKeywords, isLoading: activeLoading, error: activeError } = useQuery({
    queryKey: ['/api/keywords', 'excluded', false, 'orderBy', orderBy, 'dir', orderDir],
    queryFn: async () => {
      const params = new URLSearchParams({
        excluded: 'false',
        orderBy,
        dir: orderDir
      });
      const response = await fetch(`/api/keywords?${params}`);
      if (!response.ok) throw new Error('Failed to fetch active keywords');
      return response.json();
    },
    enabled: activeTab === "manage",
  });

  // Fetch excluded keywords  
  const { data: excludedKeywords, isLoading: excludedLoading } = useQuery({
    queryKey: ['/api/keywords', 'excluded', true],
    queryFn: async () => {
      const params = new URLSearchParams({
        excluded: 'true'
      });
      const response = await fetch(`/api/keywords?${params}`);
      if (!response.ok) throw new Error('Failed to fetch excluded keywords');
      return response.json();
    },
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
      queryClient.invalidateQueries({ queryKey: ['/api/keywords', 'stats'] });
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
      queryClient.invalidateQueries({ queryKey: ['/api/keywords', 'stats'] });
    },
    onError: () => {
      toast({
        title: "오류",
        description: "키워드 상태 변경에 실패했습니다",
        variant: "destructive",
      });
    },
  });

  // CSV Download
  const handleCSVDownload = async () => {
    try {
      const response = await fetch('/api/keywords/export.csv');
      if (!response.ok) throw new Error('CSV 다운로드 실패');
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = 'keywords-export.csv';
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      toast({
        title: "다운로드 완료",
        description: "키워드 데이터가 CSV 파일로 다운로드되었습니다",
      });
    } catch (error) {
      toast({
        title: "오류",
        description: "CSV 다운로드에 실패했습니다",
        variant: "destructive",
      });
    }
  };

  // CSV Upload (placeholder)
  const handleCSVUpload = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  // Drag and drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      const file = files[0];
      if (file.type === 'text/csv' || file.name.endsWith('.csv')) {
        handleFileUpload(file);
      } else {
        toast({
          title: "파일 형식 오류",
          description: "CSV 파일만 업로드할 수 있습니다",
          variant: "destructive",
        });
      }
    }
  };

  const handleFileUpload = async (file: File) => {
    setUploadProgress({ loading: true });
    
    try {
      // Create FormData for multipart form upload
      const formData = new FormData();
      formData.append('file', file);

      // Upload to backend API
      const response = await fetch('/api/keywords/import', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`Upload failed: ${response.status} ${response.statusText}`);
      }

      const result = await response.json();
      
      setUploadProgress({ loading: false, result });
      
      toast({
        title: "업로드 완료",
        description: `파일 "${file.name}"이 성공적으로 업로드되었습니다`,
      });
      
      // Invalidate queries to refresh data
      queryClient.invalidateQueries({ queryKey: ['/api/keywords'] });
      queryClient.invalidateQueries({ queryKey: ['/api/keywords', 'stats'] });
      
    } catch (error) {
      setUploadProgress({ loading: false });
      const errorMessage = error instanceof Error ? error.message : "파일 업로드 중 오류가 발생했습니다";
      toast({
        title: "업로드 실패",
        description: errorMessage,
        variant: "destructive",
      });
    }
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    handleFileUpload(file);
    
    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

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
      <Navigation />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="space-y-6">
          {/* Keywords DB Statistics */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Database className="h-5 w-5" />
                <span>키워드 DB 현황</span>
              </CardTitle>
              <CardDescription>
                현재 키워드 데이터베이스 통계 및 데이터 관리
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Statistics */}
                <div className="space-y-4">
                  <h4 className="font-medium text-sm">통계 정보</h4>
                  {keywordsStats ? (
                    <div className="space-y-3">
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-muted-foreground">총 키워드 수</span>
                        <span className="font-mono text-lg">{(keywordsStats as KeywordsStatsResponse).total.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-muted-foreground">조회량 모드</span>
                        <Badge variant={(keywordsStats as KeywordsStatsResponse).volumes_mode === 'searchads' ? 'default' : 'secondary'}>
                          {(keywordsStats as KeywordsStatsResponse).volumes_mode.toUpperCase()}
                        </Badge>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-muted-foreground">마지막 업데이트</span>
                        <span className="text-sm font-mono">
                          {new Date((keywordsStats as KeywordsStatsResponse).lastUpdated).toLocaleString()}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center py-4">
                      <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground mr-2" />
                      <span className="text-sm text-muted-foreground">통계 로딩 중...</span>
                    </div>
                  )}
                </div>

                {/* CSV Export */}
                <div className="space-y-4">
                  <h4 className="font-medium text-sm">데이터 내보내기</h4>
                  <div className="space-y-2">
                    <Button 
                      onClick={handleCSVDownload}
                      className="w-full"
                      variant="outline"
                      data-testid="button-csv-download"
                    >
                      <Download className="mr-2 h-4 w-4" />
                      CSV 다운로드
                    </Button>
                    <p className="text-xs text-muted-foreground">
                      모든 키워드를 CSV 파일로 내보냅니다
                    </p>
                  </div>
                </div>

                {/* CSV Import */}
                <div className="space-y-4">
                  <h4 className="font-medium text-sm">데이터 가져오기</h4>
                  <div className="space-y-3">
                    {/* Drag and Drop Area */}
                    <div
                      className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
                        isDragOver
                          ? 'border-primary bg-primary/5'
                          : 'border-muted-foreground/25 hover:border-muted-foreground/50'
                      }`}
                      onDragOver={handleDragOver}
                      onDragLeave={handleDragLeave}
                      onDrop={handleDrop}
                      data-testid="dropzone-csv"
                    >
                      <Upload className={`mx-auto h-8 w-8 mb-2 ${
                        isDragOver ? 'text-primary' : 'text-muted-foreground'
                      }`} />
                      <p className="text-sm font-medium mb-1">
                        {isDragOver ? 'CSV 파일을 놓아주세요' : 'CSV 파일을 드래그하거나 클릭하여 업로드'}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        .csv 파일만 지원됩니다
                      </p>
                      <Button 
                        onClick={handleCSVUpload}
                        className="mt-3"
                        variant="outline"
                        size="sm"
                        disabled={uploadProgress.loading}
                        data-testid="button-csv-upload"
                      >
                        {uploadProgress.loading ? (
                          <>
                            <RefreshCw className="mr-2 h-3 w-3 animate-spin" />
                            업로드 중...
                          </>
                        ) : (
                          <>
                            <FileText className="mr-2 h-3 w-3" />
                            파일 선택
                          </>
                        )}
                      </Button>
                    </div>

                    {/* Upload Result */}
                    {uploadProgress.result && (
                      <div className="rounded-lg border bg-card p-3 space-y-2">
                        <h5 className="font-medium text-sm flex items-center space-x-2">
                          <CheckCircle className="h-4 w-4 text-green-600" />
                          <span>업로드 결과</span>
                        </h5>
                        <div className="grid grid-cols-3 gap-3 text-xs">
                          <div className="space-y-1">
                            <div className="text-muted-foreground">추가됨</div>
                            <div className="font-medium text-green-600">{uploadProgress.result.inserted}</div>
                          </div>
                          <div className="space-y-1">
                            <div className="text-muted-foreground">업데이트됨</div>
                            <div className="font-medium text-blue-600">{uploadProgress.result.updated}</div>
                          </div>
                          <div className="space-y-1">
                            <div className="text-muted-foreground">삭제됨</div>
                            <div className="font-medium text-red-600">{uploadProgress.result.deleted}</div>
                          </div>
                        </div>
                        {uploadProgress.result.warnings && uploadProgress.result.warnings.length > 0 && (
                          <div className="space-y-1">
                            <div className="text-muted-foreground text-xs">경고</div>
                            <div className="text-xs text-yellow-600">
                              {uploadProgress.result.warnings.map((warning: string, index: number) => (
                                <div key={index}>{warning}</div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".csv"
                      onChange={handleFileChange}
                      style={{ display: 'none' }}
                      data-testid="input-csv-file"
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

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