import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { RefreshCw, Search, AlertTriangle, CheckCircle, Filter, TrendingUp, Database, ArrowLeft, Download, Upload, FileText, ChevronUp, ChevronDown, ArrowUpDown } from "lucide-react";
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
  // 5-metrics fields
  comp_idx?: string;
  ad_depth?: number;
  est_cpc_krw?: number;
  score?: number;
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
  active: number;
  excluded: number;
  lastUpdated: string;
  volumes_mode: 'fallback' | 'partial' | 'searchads';
};

export default function KeywordsPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [refreshBase, setRefreshBase] = useState("");
  const [refreshLimit, setRefreshLimit] = useState(300);
  const [orderBy, setOrderBy] = useState<'score' | 'raw_volume' | 'comp_idx' | 'ad_depth' | 'est_cpc_krw' | 'text' | 'keyword_length'>('score');
  const [orderDir, setOrderDir] = useState<'asc' | 'desc'>('desc');
  const [activeTab, setActiveTab] = useState("manage");
  const [lastRefreshStats, setLastRefreshStats] = useState<RefreshResponse | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ loading: boolean; result?: any }>({ loading: false });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  
  // New seed input and job management state
  const [seedsText, setSeedsText] = useState('');
  const [jobId, setJobId] = useState<string | null>(null);
  const [crawlProgress, setCrawlProgress] = useState<any>(null);
  
  // File upload state
  const [seedSource, setSeedSource] = useState<'manual' | 'file' | 'builtin'>('manual');
  const [uploadedFile, setUploadedFile] = useState<{
    id: string;
    name: string;
    rows: number;
  } | null>(null);
  
  // Parse seeds from text input (comma/newline separated)
  const seeds = seedsText.split(/[,\n]/).map(s => s.trim()).filter(Boolean);
  
  // Expand Keywords Handler (single operation)
  const onExpand = async () => {
    if (seeds.length === 0) {
      toast({
        title: "시드 키워드 필요",
        description: "연관 키워드를 추가할 시드를 입력해주세요.",
        variant: "destructive"
      });
      return;
    }

    try {
      const body = { seeds, minVolume: 1000, hasAdsOnly: true, chunkSize: 10 };
      const response = await fetch('/api/keywords/expand', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      if (!response.ok) {
        const errorText = await response.text();
        toast({
          title: "연관 키워드 추가 실패",
          description: errorText,
          variant: "destructive"
        });
        return;
      }

      const result = await response.json();
      toast({
        title: "연관 키워드 추가 완료",
        description: `추가: ${result.inserted}, 갱신: ${result.updated}, 중복: ${result.duplicates}개`
      });
      
      // Refresh keywords data
      queryClient.invalidateQueries({ queryKey: ['/api/keywords'] });
      queryClient.invalidateQueries({ queryKey: ['/api/keywords', 'stats'] });
    } catch (error) {
      console.error('연관 키워드 추가 오류:', error);
      toast({
        title: "연관 키워드 추가 실패",
        description: "네트워크 오류가 발생했습니다.",
        variant: "destructive"
      });
    }
  };

  // BFS Crawl Handler (long operation)
  const onCrawl = async () => {
    try {
      // Validate seed source
      if (seedSource === 'manual' && seeds.length === 0) {
        toast({
          title: "시드 키워드 입력 필요",
          description: "수동 입력 모드에서는 최소 1개 이상의 시드 키워드가 필요합니다.",
          variant: "destructive"
        });
        return;
      }
      
      if (seedSource === 'file' && !uploadedFile) {
        toast({
          title: "파일 업로드 필요",
          description: "파일 모드에서는 CSV/XLSX 파일을 먼저 업로드해야 합니다.",
          variant: "destructive"
        });
        return;
      }
      
      const body: any = {
        mode: 'exhaustive',
        source: seedSource,
        target: 20000,
        minVolume: 1000,
        hasAdsOnly: true,
        chunkSize: 10,
        concurrency: 1,
        maxHops: 3,
        stopIfNoNewPct: 0.5,
        dailyCallBudget: 2000
      };
      
      // Add source-specific parameters
      if (seedSource === 'manual') {
        body.seeds = seeds;
      } else if (seedSource === 'file') {
        body.seedsFileId = uploadedFile!.id;
      }
      // For 'builtin', no additional parameters needed

      const response = await fetch('/api/keywords/crawl', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      if (response.status === 412) {
        toast({
          title: "시스템 상태 확인",
          description: "헬스체크 실패(오픈API/서치애즈). 엄격모드 해제 또는 키 확인이 필요합니다.",
          variant: "destructive"
        });
        return;
      }

      if (!response.ok) {
        const errorText = await response.text();
        toast({
          title: "BFS 크롤링 시작 실패",
          description: errorText,
          variant: "destructive"
        });
        return;
      }

      const result = await response.json();
      setJobId(result.jobId);
      
      const sourceDesc = seedSource === 'manual' ? '수동 입력' : 
                       seedSource === 'file' ? `파일 (${uploadedFile?.name})` : 
                       '내장 CSV';
      
      toast({
        title: "BFS 크롤링 시작",
        description: `${sourceDesc} 시드 ${result.seedsLoaded}개로 최대 ${result.config.target}개 키워드 수집 시작`
      });
      
      // Refresh keywords data
      queryClient.invalidateQueries({ queryKey: ['/api/keywords'] });
      queryClient.invalidateQueries({ queryKey: ['/api/keywords', 'stats'] });
    } catch (error) {
      console.error('BFS 크롤링 시작 오류:', error);
      toast({
        title: "BFS 크롤링 시작 실패",
        description: "네트워크 오류가 발생했습니다.",
        variant: "destructive"
      });
    }
  };

  // Job status polling effect
  useEffect(() => {
    if (!jobId) return;

    const interval = setInterval(async () => {
      try {
        const response = await fetch(`/api/keywords/crawl/${jobId}/status`);
        if (!response.ok) return;

        const status = await response.json();
        setCrawlProgress(status);

        // Stop polling if job is done or has error
        if (status.state === 'done' || status.state === 'error') {
          clearInterval(interval);
          if (status.state === 'done') {
            toast({
              title: "BFS 크롤링 완료",
              description: `총 ${status.progress.collected}개 키워드 수집 완료`
            });
          }
          // Refresh keywords data
          queryClient.invalidateQueries({ queryKey: ['/api/keywords'] });
          queryClient.invalidateQueries({ queryKey: ['/api/keywords', 'stats'] });
        }
      } catch (error) {
        console.error('상태 폴링 오류:', error);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [jobId, queryClient, toast]);

  // Fetch system health status (optimized)
  const { data: health } = useQuery({
    queryKey: ['/api/health'],
    refetchInterval: 300000, // Poll every 5 minutes (was 30 seconds)
    refetchOnWindowFocus: false, // Disable auto-refresh on focus to save tokens
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
        orderBy: orderBy === 'comp_idx' ? 'comp_score' : orderBy, // Map comp_idx to comp_score for backend
        dir: orderDir
      });
      const response = await fetch(`/api/keywords?${params}`);
      if (!response.ok) throw new Error('Failed to fetch active keywords');
      return response.json();
    },
    enabled: activeTab === "manage",
  });

  // Fetch excluded keywords (정렬 추가)
  const { data: excludedKeywords, isLoading: excludedLoading } = useQuery({
    queryKey: ['/api/keywords', 'excluded', true, 'orderBy', orderBy, 'dir', orderDir],
    queryFn: async () => {
      const params = new URLSearchParams({
        excluded: 'true',
        orderBy: orderBy === 'comp_idx' ? 'comp_score' : orderBy, // Map comp_idx to comp_score for backend
        dir: orderDir
      });
      const response = await fetch(`/api/keywords?${params}`);
      if (!response.ok) throw new Error('Failed to fetch excluded keywords');
      return response.json();
    },
    enabled: activeTab === "excluded",
  });

  // Keywords refresh mutation (기존 유지)
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

  // 새로운 전체 키워드 가져오기 mutation (요구사항)
  const refreshAllMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', '/api/keywords/refresh-all', {
        minVolume: 1000,
        hasAdsOnly: true,
        mode: 'merge'
      });
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
      handleFileUpload(files[0]);
    }
  };

  const handleFileUpload = async (file: File) => {
    if (!file.name.toLowerCase().match(/\.(csv|xlsx)$/)) {
      toast({
        title: "지원하지 않는 파일 형식",
        description: "CSV 또는 XLSX 파일만 업로드 가능합니다.",
        variant: "destructive"
      });
      return;
    }
    
    setUploadProgress({ loading: true });
    
    try {
      const formData = new FormData();
      formData.append('file', file);
      
      const response = await fetch('/api/uploads', {
        method: 'POST',
        body: formData
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Upload failed');
      }
      
      const result = await response.json();
      setUploadedFile({
        id: result.fileId,
        name: file.name,
        rows: result.rowCount
      });
      setSeedSource('file');
      
      toast({
        title: "파일 업로드 완료",
        description: `${result.rowCount}개 시드 키워드가 로드되었습니다.`
      });
      
    } catch (error) {
      console.error('File upload error:', error);
      toast({
        title: "파일 업로드 실패",
        description: error instanceof Error ? error.message : "파일 업로드 중 오류가 발생했습니다.",
        variant: "destructive"
      });
    } finally {
      setUploadProgress({ loading: false });
    }
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    handleFileUpload(file);
    
    // Reset file input
    event.target.value = '';
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

  // 헤더 클릭 정렬 함수
  const handleSort = (column: 'score' | 'raw_volume' | 'comp_idx' | 'ad_depth' | 'est_cpc_krw' | 'text' | 'keyword_length') => {
    if (orderBy === column) {
      // 같은 컬럼 클릭 시 방향 변경
      setOrderDir(orderDir === 'asc' ? 'desc' : 'asc');
    } else {
      // 다른 컬럼 클릭 시 해당 컬럼으로 변경하고 desc로 시작
      setOrderBy(column);
      setOrderDir('desc');
    }
  };

  // 정렬 아이콘 렌더링
  const renderSortIcon = (column: string) => {
    if (orderBy !== column) {
      return <ArrowUpDown className="h-4 w-4 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity" />;
    }
    return orderDir === 'asc' ? 
      <ChevronUp className="h-4 w-4 text-blue-600" /> : 
      <ChevronDown className="h-4 w-4 text-blue-600" />;
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
              <Select value={orderBy} onValueChange={(value: 'score' | 'raw_volume' | 'comp_idx' | 'ad_depth' | 'est_cpc_krw' | 'text' | 'keyword_length') => setOrderBy(value)}>
                <SelectTrigger className="w-36" data-testid="kw-sort-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="score">종합점수순</SelectItem>
                  <SelectItem value="raw_volume">조회량순</SelectItem>
                  <SelectItem value="comp_idx">경쟁도순</SelectItem>
                  <SelectItem value="ad_depth">광고깊이순</SelectItem>
                  <SelectItem value="est_cpc_krw">CPC순</SelectItem>
                  <SelectItem value="text">이름순</SelectItem>
                  <SelectItem value="keyword_length">글자수순</SelectItem>
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
              <TableRow data-testid="kw-table-header">
                <TableHead className="w-[200px]">
                  <button
                    className="group flex items-center space-x-1 hover:bg-gray-100 dark:hover:bg-gray-800 p-1 rounded transition-colors"
                    onClick={() => handleSort('text')}
                    data-testid="header-keyword"
                  >
                    <span>키워드</span>
                    {renderSortIcon('text')}
                  </button>
                </TableHead>
                <TableHead className="text-right w-[120px]">
                  <button
                    className="group flex items-center space-x-1 hover:bg-gray-100 dark:hover:bg-gray-800 p-1 rounded transition-colors ml-auto"
                    onClick={() => handleSort('raw_volume')}
                    data-testid="header-volume"
                  >
                    <span>조회량</span>
                    {renderSortIcon('raw_volume')}
                  </button>
                </TableHead>
                <TableHead className="text-center w-[100px]">
                  <button
                    className="group flex items-center space-x-1 hover:bg-gray-100 dark:hover:bg-gray-800 p-1 rounded transition-colors mx-auto"
                    onClick={() => handleSort('comp_idx')}
                    data-testid="header-competition"
                  >
                    <span>경쟁도</span>
                    {renderSortIcon('comp_idx')}
                  </button>
                </TableHead>
                <TableHead className="text-center w-[100px]">
                  <button
                    className="group flex items-center space-x-1 hover:bg-gray-100 dark:hover:bg-gray-800 p-1 rounded transition-colors mx-auto"
                    onClick={() => handleSort('ad_depth')}
                    data-testid="header-ad-depth"
                  >
                    <span>광고깊이</span>
                    {renderSortIcon('ad_depth')}
                  </button>
                </TableHead>
                <TableHead className="text-right w-[120px]">
                  <button
                    className="group flex items-center space-x-1 hover:bg-gray-100 dark:hover:bg-gray-800 p-1 rounded transition-colors ml-auto"
                    onClick={() => handleSort('est_cpc_krw')}
                    data-testid="header-cpc"
                  >
                    <span>예상CPC</span>
                    {renderSortIcon('est_cpc_krw')}
                  </button>
                </TableHead>
                <TableHead className="text-center w-[100px] font-semibold">
                  <button
                    className="group flex items-center space-x-1 hover:bg-gray-100 dark:hover:bg-gray-800 p-1 rounded transition-colors mx-auto font-semibold"
                    onClick={() => handleSort('score')}
                    data-testid="header-score"
                  >
                    <span>종합점수</span>
                    {renderSortIcon('score')}
                  </button>
                </TableHead>
                {showToggle && <TableHead className="text-center w-[80px]">액션</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody data-testid="kw-table">
              {filteredKeywords.map((keyword) => (
                <TableRow key={keyword.id} data-testid={`kw-row-${keyword.id}`}>
                  {/* 키워드 */}
                  <TableCell className="font-medium" data-testid={`kw-text-${keyword.id}`}>
                    {keyword.text}
                  </TableCell>
                  
                  {/* 조회량 */}
                  <TableCell className={`text-right font-mono ${getVolumeColor(keyword.raw_volume)}`} data-testid={`kw-volume-${keyword.id}`}>
                    {keyword.raw_volume.toLocaleString()}
                  </TableCell>
                  
                  {/* 경쟁도 (낮음/중간/높음) */}
                  <TableCell className="text-center" data-testid={`kw-competition-${keyword.id}`}>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      keyword.comp_idx === '낮음' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' :
                      keyword.comp_idx === '중간' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200' :
                      'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                    }`}>
                      {keyword.comp_idx || '-'}
                    </span>
                  </TableCell>
                  
                  {/* 광고깊이 */}
                  <TableCell className="text-center font-mono" data-testid={`kw-ads-${keyword.id}`}>
                    {keyword.ad_depth || '-'}
                  </TableCell>
                  
                  {/* 예상CPC */}
                  <TableCell className="text-right font-mono text-sm" data-testid={`kw-cpc-${keyword.id}`}>
                    {keyword.est_cpc_krw ? `₩${keyword.est_cpc_krw.toLocaleString()}` : '-'}
                  </TableCell>
                  
                  {/* 종합점수 */}
                  <TableCell className="text-center" data-testid={`kw-score-${keyword.id}`}>
                    <span className={`px-3 py-1 rounded-full text-sm font-bold ${
                      (keyword.score || 0) >= 80 ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' :
                      (keyword.score || 0) >= 60 ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200' :
                      (keyword.score || 0) >= 40 ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200' :
                      'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                    }`}>
                      {keyword.score || 0}
                    </span>
                  </TableCell>
                  
                  {/* 액션: [X] 제거 / [↩] 복원 버튼 (요구사항) */}
                  {showToggle && (
                    <TableCell className="text-center">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleToggleExcluded(keyword.id, keyword.excluded)}
                        disabled={toggleMutation.isPending}
                        className="h-8 w-8 p-0 hover:bg-red-50 dark:hover:bg-red-900/20"
                        data-testid={keyword.excluded ? `kw-restore-${keyword.id}` : `kw-remove-${keyword.id}`}
                        title={keyword.excluded ? "복원" : "제거"}
                      >
                        {keyword.excluded ? (
                          <span className="text-blue-600 dark:text-blue-400 font-bold">↩</span>
                        ) : (
                          <span className="text-red-600 dark:text-red-500 font-bold">✕</span>
                        )}
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
              {filteredKeywords.length === 0 && (
                <TableRow>
                  <TableCell colSpan={showToggle ? 7 : 6} className="text-center py-8 text-muted-foreground">
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
                        <span className="text-sm text-muted-foreground">키워드 현황</span>
                        <span className="font-mono text-lg" data-testid="kw-counts">
                          전체 {(keywordsStats as KeywordsStatsResponse).total.toLocaleString()} (활성 {(keywordsStats as KeywordsStatsResponse).active.toLocaleString()} | 제외 {(keywordsStats as KeywordsStatsResponse).excluded.toLocaleString()})
                        </span>
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

          {/* 새로운 시드 입력 기반 키워드 수집 시스템 */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Search className="h-5 w-5" />
                <span>키워드 수집</span>
              </CardTitle>
              <CardDescription>
                시드 키워드를 입력하여 연관 키워드를 추가하거나 BFS 크롤링을 시작하세요
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* 시드 소스 선택 */}
              <div className="space-y-3">
                <label className="text-sm font-medium">시드 키워드 소스</label>
                <div className="flex flex-col space-y-2">
                  <label className="flex items-center space-x-2">
                    <input
                      type="radio"
                      value="manual"
                      checked={seedSource === 'manual'}
                      onChange={(e) => setSeedSource(e.target.value as 'manual')}
                      className="w-4 h-4"
                      data-testid="radio-source-manual"
                    />
                    <span>수동 입력</span>
                  </label>
                  <label className="flex items-center space-x-2">
                    <input
                      type="radio"
                      value="file"
                      checked={seedSource === 'file'}
                      onChange={(e) => setSeedSource(e.target.value as 'file')}
                      className="w-4 h-4"
                      data-testid="radio-source-file"
                    />
                    <span>파일 업로드 (CSV/XLSX)</span>
                  </label>
                  <label className="flex items-center space-x-2">
                    <input
                      type="radio"
                      value="builtin"
                      checked={seedSource === 'builtin'}
                      onChange={(e) => setSeedSource(e.target.value as 'builtin')}
                      className="w-4 h-4"
                      data-testid="radio-source-builtin"
                    />
                    <span>내장 CSV (2K 키워드)</span>
                  </label>
                </div>
              </div>

              {/* 수동 입력 모드 */}
              {seedSource === 'manual' && (
                <div className="space-y-2">
                  <label htmlFor="seeds-input" className="text-sm font-medium">
                    시드 키워드 입력 (쉼표 또는 줄바꿈으로 구분)
                  </label>
                  <Textarea
                    id="seeds-input"
                    placeholder="홍삼, 면역력 강화&#10;탈모 샴푸&#10;비타민 D"
                    value={seedsText}
                    onChange={(e) => setSeedsText(e.target.value)}
                    className="min-h-[100px] resize-vertical"
                    data-testid="input-seeds"
                  />
                  {seeds.length > 0 && (
                    <div className="text-xs text-muted-foreground">
                      {seeds.length}개 시드: {seeds.slice(0, 3).join(', ')}{seeds.length > 3 ? '...' : ''}
                    </div>
                  )}
                </div>
              )}

              {/* 파일 업로드 모드 */}
              {seedSource === 'file' && (
                <div className="space-y-3">
                  {!uploadedFile ? (
                    <div
                      className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
                        isDragOver ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400'
                      }`}
                      onDragOver={handleDragOver}
                      onDragLeave={handleDragLeave}
                      onDrop={handleDrop}
                      data-testid="dropzone-seeds"
                    >
                      <Upload className="mx-auto h-8 w-8 text-gray-400 mb-2" />
                      <div className="text-sm text-gray-600 mb-2">
                        CSV/XLSX 파일을 드래그하거나 클릭하여 업로드
                      </div>
                      <div className="text-xs text-gray-500 mb-3">
                        첫 번째 열: seed, 두 번째 열: category (선택)
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploadProgress.loading}
                        data-testid="button-upload-seeds"
                      >
                        {uploadProgress.loading ? (
                          <>
                            <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                            업로드 중...
                          </>
                        ) : (
                          <>
                            <FileText className="mr-2 h-4 w-4" />
                            파일 선택
                          </>
                        )}
                      </Button>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".csv,.xlsx"
                        onChange={handleFileChange}
                        className="hidden"
                        data-testid="input-upload-seeds"
                      />
                    </div>
                  ) : (
                    <div className="border rounded-lg p-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="text-sm font-medium" data-testid="text-uploaded-file">업로드된 파일</div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setUploadedFile(null);
                            setSeedSource('manual');
                          }}
                          data-testid="button-remove-file"
                        >
                          제거
                        </Button>
                      </div>
                      <div className="text-sm text-gray-600">
                        <div>파일명: {uploadedFile.name}</div>
                        <div>시드 개수: {uploadedFile.rows.toLocaleString()}개</div>
                        <div className="text-xs text-green-600 mt-1">✓ 업로드 완료</div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* 내장 CSV 모드 정보 */}
              {seedSource === 'builtin' && (
                <div className="border rounded-lg p-4 space-y-2">
                  <div className="text-sm font-medium">내장 시드 데이터</div>
                  <div className="text-sm text-gray-600">
                    <div>파일: seed_keywords_v2_ko.csv</div>
                    <div>시드 개수: 약 2,000개</div>
                    <div className="text-xs text-blue-600 mt-1">ℹ️ 미리 준비된 한국어 키워드</div>
                  </div>
                </div>
              )}

              {/* 두 개 버튼 */}
              <div className="flex gap-3 justify-center">
                <Button
                  onClick={onExpand}
                  disabled={seedSource !== 'manual' || seeds.length === 0 || uploadProgress.loading}
                  className="px-6 py-2"
                  variant="outline"
                  data-testid="btn-expand-keywords"
                >
                  <Search className="mr-2 h-4 w-4" />
                  연관 키워드 추가
                  {seedSource !== 'manual' && (
                    <span className="ml-1 text-xs opacity-60">(수동입력만)</span>
                  )}
                </Button>
                
                <Button
                  onClick={onCrawl}
                  disabled={Boolean(
                    uploadProgress.loading ||
                    jobId ||
                    (seedSource === 'manual' && seeds.length === 0) ||
                    (seedSource === 'file' && !uploadedFile)
                  )}
                  className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white"
                  data-testid="btn-crawl-bfs"
                >
                  <TrendingUp className="mr-2 h-4 w-4" />
                  BFS 크롤 시작
                  {seedSource === 'manual' && seeds.length === 0 && (
                    <span className="ml-1 text-xs opacity-80">(시드 입력 필요)</span>
                  )}
                  {seedSource === 'file' && !uploadedFile && (
                    <span className="ml-1 text-xs opacity-80">(파일 업로드 필요)</span>
                  )}
                  {seedSource === 'builtin' && (
                    <span className="ml-1 text-xs opacity-80">(2K시드)</span>
                  )}
                  {seedSource === 'file' && uploadedFile && (
                    <span className="ml-1 text-xs opacity-80">({uploadedFile.rows}개 시드)</span>
                  )}
                  {jobId && (
                    <span className="ml-1 text-xs opacity-80">(진행중)</span>
                  )}
                </Button>
              </div>

              {/* 진행률 표시 */}
              {crawlProgress && (
                <div className="rounded-lg border bg-card p-4 space-y-4" data-testid="crawl-progress">
                  <div className="flex items-center justify-between">
                    <h4 className="font-medium text-sm flex items-center space-x-2">
                      <RefreshCw className="h-4 w-4 animate-spin text-blue-600" />
                      <span>BFS 크롤링 진행 중</span>
                      <Badge variant="secondary">{crawlProgress.state}</Badge>
                    </h4>
                    <div className="flex items-center gap-4">
                      {/* 실시간 진행 카운터 */}
                      <div className="flex items-center gap-3 text-xs">
                        <div className="flex items-center gap-1">
                          <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                          <span data-testid="counter-success">성공: {crawlProgress.progress?.collected || 0}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="w-2 h-2 bg-orange-500 rounded-full"></span>
                          <span data-testid="counter-skipped">스킵: {crawlProgress.progress?.skipped || 0}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="w-2 h-2 bg-red-500 rounded-full"></span>
                          <span data-testid="counter-failed">실패: {crawlProgress.progress?.failed || 0}</span>
                        </div>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        홉 {crawlProgress.progress?.currentHop || 0} / {crawlProgress.config?.maxHops || 3}
                      </div>
                    </div>
                  </div>
                  
                  {/* 전체 진행률 바 */}
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">수집 진행률</span>
                      <span className="font-mono">
                        {(crawlProgress.progress?.collected || 0).toLocaleString()} / {(crawlProgress.config?.target || 20000).toLocaleString()}
                      </span>
                    </div>
                    <Progress 
                      value={Math.min(((crawlProgress.progress?.collected || 0) / (crawlProgress.config?.target || 20000)) * 100, 100)}
                      className="h-2"
                      data-testid="progress-collection"
                    />
                  </div>

                  {/* 성공률 진행률 바 */}
                  {crawlProgress.progress?.requested > 0 && (
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">API 성공률</span>
                        <span className="font-mono">
                          {Math.round((crawlProgress.progress.ok / crawlProgress.progress.requested) * 100)}%
                        </span>
                      </div>
                      <Progress 
                        value={Math.round((crawlProgress.progress.ok / crawlProgress.progress.requested) * 100)}
                        className="h-2"
                        data-testid="progress-success-rate"
                      />
                    </div>
                  )}
                  
                  {/* 청크 진행률과 호출 예산 정보 */}
                  {(crawlProgress.progress?.currentChunk > 0) && (
                    <div className="bg-blue-50 dark:bg-blue-950 p-3 rounded-lg border border-blue-200 dark:border-blue-800 text-sm">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-medium text-blue-900 dark:text-blue-100">진행 상황</span>
                        <span className="text-blue-700 dark:text-blue-300 font-mono">
                          청크 {crawlProgress.progress.currentChunk}/{crawlProgress.progress.totalChunks}
                        </span>
                      </div>
                      {crawlProgress.progress?.callBudget && (
                        <div className="text-xs text-blue-600 dark:text-blue-400 space-y-1">
                          <div>일일 한도: {crawlProgress.progress.callBudget.dailyRemaining}/{crawlProgress.progress.callBudget.dailyLimit}</div>
                          <div>분당 한도: {crawlProgress.progress.callBudget.perMinuteRemaining}/{crawlProgress.progress.callBudget.perMinuteLimit}</div>
                        </div>
                      )}
                    </div>
                  )}
                  
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div className="space-y-1">
                      <div className="text-muted-foreground">수집됨</div>
                      <div className="font-medium text-green-600 font-mono" data-testid="text-collected">
                        {(crawlProgress.progress?.collected || 0).toLocaleString()}
                      </div>
                    </div>
                    <div className="space-y-1">
                      <div className="text-muted-foreground">요청됨</div>
                      <div className="font-medium font-mono" data-testid="text-requested">
                        {(crawlProgress.progress?.totalProcessed || 0).toLocaleString()}
                      </div>
                    </div>
                    <div className="space-y-1">
                      <div className="text-muted-foreground">처리속도</div>
                      <div className="font-medium text-blue-600 font-mono" data-testid="text-processing-speed">
                        {crawlProgress.progress?.totalProcessed > 0 ? 
                          `${Math.round(crawlProgress.progress.totalProcessed / ((Date.now() - new Date(crawlProgress.startedAt).getTime()) / 1000 / 60))}/분` : 
                          '계산중...'}
                      </div>
                    </div>
                    <div className="space-y-1">
                      <div className="text-muted-foreground">프론티어</div>
                      <div className="text-xs font-mono" data-testid="text-frontier">
                        <div>큐: {(crawlProgress.progress?.frontierSize || 0).toLocaleString()}</div>
                        <div>방문: {(crawlProgress.progress?.visitedSize || 0).toLocaleString()}</div>
                      </div>
                    </div>
                  </div>

                  {/* 예상 완료 시간 */}
                  {crawlProgress.progress?.collected > 0 && crawlProgress.config?.target && (
                    <div className="text-xs text-muted-foreground border-t pt-2">
                      <div className="flex justify-between">
                        <span>예상 완료 시간:</span>
                        <span className="font-mono">
                          {(() => {
                            const elapsedMs = Date.now() - new Date(crawlProgress.startedAt).getTime();
                            const elapsedMin = elapsedMs / 1000 / 60;
                            const rate = crawlProgress.progress.collected / elapsedMin;
                            const remaining = crawlProgress.config.target - crawlProgress.progress.collected;
                            const etaMin = remaining / rate;
                            
                            if (etaMin < 60) {
                              return `약 ${Math.round(etaMin)}분`;
                            } else {
                              const hours = Math.floor(etaMin / 60);
                              const mins = Math.round(etaMin % 60);
                              return `약 ${hours}시간 ${mins}분`;
                            }
                          })()}
                        </span>
                      </div>
                    </div>
                  )}
                  {jobId && (
                    <Button
                      onClick={async () => {
                        try {
                          const response = await fetch(`/api/keywords/crawl/${jobId}/cancel`, {
                            method: 'POST'
                          });
                          if (response.ok) {
                            setJobId(null);
                            setCrawlProgress(null);
                            toast({ title: "크롤링 중단됨" });
                          }
                        } catch (error) {
                          console.error('크롤링 중단 오류:', error);
                        }
                      }}
                      variant="destructive"
                      size="sm"
                      data-testid="btn-cancel-crawl"
                    >
                      크롤링 중단
                    </Button>
                  )}
                </div>
              )}

              {/* volumes_mode 배지 */}
              {(health as HealthResponse)?.searchads?.mode && (
                <div className="flex justify-center">
                  <Badge variant={(health as HealthResponse)?.searchads?.mode === 'searchads' ? 'default' : 'secondary'}>
                    {((health as HealthResponse)?.searchads?.mode || 'fallback').toUpperCase()} MODE
                  </Badge>
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
                  <CardTitle className="flex items-center gap-2">
                    활성 키워드 관리
                    {keywordsStats && (
                      <Badge variant="outline" className="text-xs">
                        {((keywordsStats as KeywordsStatsResponse)?.active || 0).toLocaleString()}개
                      </Badge>
                    )}
                  </CardTitle>
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