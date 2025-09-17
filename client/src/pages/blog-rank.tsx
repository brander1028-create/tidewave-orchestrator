import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import { Progress } from "@/components/ui/progress";
import { toast } from "@/hooks/use-toast";
import { 
  Plus,
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
  Search,
  Trash2,
  Settings,
  Loader2
} from "lucide-react";
import { targetsApi, manualBlogApi, rankApi } from "@/lib/api";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

// Types
interface BlogKeywordData {
  id: string;
  active: boolean;
  keyword: string;
  volume: number;
  score: number;
  rank: number;
  change: number;
  maintainDays: number;
  blogId: string;
  blogUrl: string;
  trend: number[];
  postDate: string;
  lastCheck: string;
  brand: string;
  group: string;
}

interface Task {
  target_id: string;
  nickname: string;
  query: string;
}

interface Plan {
  total: number;
  tasks: Task[];
}

// Form schemas
const addBlogSchema = z.object({
  keyword: z.string().min(1, "키워드를 입력해주세요"),
  url: z.string().url("올바른 URL을 입력해주세요"),
  title: z.string().optional(),
  brand: z.string().default("브랜드A"),
});

const createGroupSchema = z.object({
  name: z.string().min(1, "그룹명을 입력해주세요"),
});

type AddBlogForm = z.infer<typeof addBlogSchema>;
type CreateGroupForm = z.infer<typeof createGroupSchema>;

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

// Mock data generator
const generateMockData = (targets: any[]): BlogKeywordData[] => {
  return targets.map((target, index) => {
    const idNum = parseInt(target.id?.slice(-1) || '0') || index;
    const volumes = [32000, 18500, 45600, 12300, 28900, 15700, 39200];
    const scores = [85, 72, 91, 68, 88, 74, 82];
    const ranks = [8, 15, 3, 25, 12, 18, 6];
    const changes = [3, -7, 1, -12, 5, -2, 8];
    const maintainDays = [14, 7, 28, 3, 21, 12, 35];
    const brands = ["브랜드A", "브랜드B", "브랜드A", "브랜드C", "브랜드A", "브랜드B", "브랜드A"];
    const groups = ["그룹1", "그룹2", "그룹1", "그룹3", "그룹2", "그룹1", "그룹3"];
    
    const keyword = target.keywords?.[0] || target.queries?.[0] || target.query || target.title || `키워드 ${index + 1}`;
    
    // 고정된 timestamp 생성 (실제로는 API에서 받아야 함)
    const baseTime = Date.now() - (index * 60 * 1000); // 1분씩 차이
    const lastCheckTime = new Date(baseTime);
    
    // 10일간 트렌드 데이터 생성 (순위 기반)
    const baseRank = ranks[idNum % 7] || 15;
    const trendData = Array.from({ length: 10 }, (_, i) => {
      const variation = (Math.sin(i * 0.5) + Math.random() * 0.5 - 0.25) * 5;
      return Math.max(1, Math.min(50, baseRank + variation));
    });
    
    return {
      id: target.id || (index + 1).toString(),
      active: target.active !== undefined ? target.active : true, // 실제 상태 사용
      keyword: keyword,
      volume: volumes[idNum % 7] || 15000,
      score: scores[idNum % 7] || 75,
      rank: ranks[idNum % 7] || (idNum % 30) + 1,
      change: changes[idNum % 7] || 0,
      maintainDays: maintainDays[idNum % 7] || 7,
      blogId: `blog${index + 1}`,
      blogUrl: target.url || `blog.naver.com/user${index + 1}/post${(index + 1) * 123}`,
      trend: trendData, // 10일간 데이터
      postDate: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000).toLocaleDateString('ko-KR'),
      lastCheck: lastCheckTime.toISOString(), // ISO 문자열로 저장
      brand: brands[idNum % 7] || "브랜드A",
      group: groups[idNum % 7] || "그룹1"
    };
  });
};

export default function BlogRank() {
  // State
  const [isAddBlogOpen, setIsAddBlogOpen] = React.useState(false);
  const [isCreateGroupOpen, setIsCreateGroupOpen] = React.useState(false);
  const [selectedBrand, setSelectedBrand] = React.useState("전체");
  const [viewMode, setViewMode] = React.useState<"all" | "on" | "off">("all");
  const [sortBy, setSortBy] = React.useState("recent");
  const [groups, setGroups] = React.useState(["그룹1", "그룹2", "그룹3"]);
  
  // 설정 섹션 확장/축소 상태
  const [isSettingsSectionExpanded, setIsSettingsSectionExpanded] = React.useState(false);
  const [keywordSearchTerm, setKeywordSearchTerm] = React.useState("");
  
  // 배치 실행 상태
  const [isRunning, setIsRunning] = React.useState(false);
  const [progress, setProgress] = React.useState({ done: 0, total: 0, text: '준비 중...' });
  const cancelledRef = React.useRef(false);
  const [abortController, setAbortController] = React.useState<AbortController | null>(null);

  const queryClient = useQueryClient();

  // API calls
  const { data: trackedTargets = [], isLoading } = useQuery<any[]>({
    queryKey: ['/api/targets/blog'],
    queryFn: () => manualBlogApi.getAll(),
    staleTime: 5 * 60 * 1000,
  });

  // Forms
  const blogForm = useForm<AddBlogForm>({
    resolver: zodResolver(addBlogSchema),
    defaultValues: {
      keyword: "",
      url: "",
      title: "",
      brand: "브랜드A",
    },
  });

  const groupForm = useForm<CreateGroupForm>({
    resolver: zodResolver(createGroupSchema),
    defaultValues: {
      name: "",
    },
  });

  // Mutations
  const addBlogMutation = useMutation({
    mutationFn: async (data: AddBlogForm) => {
      return await manualBlogApi.create({
        keyword: data.keyword,
        url: data.url,
        title: data.title ?? "",
        rank: null,
        notes: null,
        submittedBy: "admin",
      });
    },
    onSuccess: () => {
      toast({
        title: "키워드 추가 완료",
        description: "새로운 키워드가 추가되었습니다.",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/targets/blog'] });
      setIsAddBlogOpen(false);
      blogForm.reset();
    },
    onError: (error: any) => {
      toast({
        title: "추가 실패",
        description: `키워드 추가 중 오류가 발생했습니다: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  // Data processing
  const mockData = generateMockData(trackedTargets);
  
  // 브랜드 목록
  const brands = ["전체", ...Array.from(new Set(mockData.map(item => item.brand)))];

  // Filtering
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
          return new Date(b.lastCheck).getTime() - new Date(a.lastCheck).getTime();
        default:
          return 0;
      }
    });
    
    return sorted;
  }, [mockData, selectedBrand, viewMode, sortBy, keywordSearchTerm]);

  // 배치 실행 로직
  const runAllChecks = React.useCallback(async () => {
    const controller = new AbortController();
    setAbortController(controller);
    
    setIsRunning(true);
    cancelledRef.current = false;
    setProgress({ done: 0, total: 0, text: '준비중...' });

    try {
      const selectedBlogIds = trackedTargets.map(t => t.id);
      const selectedKeywords = trackedTargets.flatMap(t => t.keywords || t.queries || [t.title]).filter(Boolean);
      
      const plan: Plan = await rankApi.plan({ 
        kind: 'blog',
        target_ids: selectedBlogIds.length > 0 ? selectedBlogIds : undefined,
        query_override: selectedKeywords.length > 0 ? selectedKeywords : undefined
      });

      if (!plan.total || plan.tasks.length === 0) {
        toast({
          title: "체크할 대상 없음",
          description: "체크할 키워드/타겟이 없습니다.",
          variant: "destructive"
        });
        setIsRunning(false);
        setAbortController(null);
        return;
      }

      const tasks = plan.tasks;
      setProgress({ done: 0, total: tasks.length, text: '배치 실행 시작...' });

      // 10개씩 청킹
      const CHUNK_SIZE = 10;
      const chunks: Task[][] = [];
      for (let i = 0; i < tasks.length; i += CHUNK_SIZE) {
        chunks.push(tasks.slice(i, i + CHUNK_SIZE));
      }

      let totalSuccessCount = 0;
      let totalFailureCount = 0;
      let processedCount = 0;

      for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
        if (cancelledRef.current || controller.signal.aborted) {
          break;
        }

        const chunk = chunks[chunkIndex];
        setProgress({ 
          done: processedCount, 
          total: tasks.length, 
          text: `청크 ${chunkIndex + 1}/${chunks.length} 처리 중...` 
        });

        try {
          const chunkResult = await rankApi.batchBlogCheck(chunk, controller);
          
          let chunkSuccessCount = 0;
          let chunkFailureCount = 0;
          
          if (chunkResult.results) {
            chunkResult.results.forEach((r: any) => {
              if (r.success) {
                chunkSuccessCount++;
              } else {
                chunkFailureCount++;
              }
            });
          } else {
            chunkFailureCount = chunk.length;
          }

          totalSuccessCount += chunkSuccessCount;
          totalFailureCount += chunkFailureCount;
          processedCount += chunk.length;

          setProgress({ 
            done: processedCount, 
            total: tasks.length, 
            text: `청크 ${chunkIndex + 1} 완료: 성공 ${chunkSuccessCount}, 실패 ${chunkFailureCount}` 
          });

          await new Promise(resolve => setTimeout(resolve, 100));

        } catch (error: unknown) {
          if (error && typeof error === 'object' && 'name' in error && error.name === 'AbortError') {
            break;
          }
          
          totalFailureCount += chunk.length;
          processedCount += chunk.length;

          setProgress({ 
            done: processedCount, 
            total: tasks.length, 
            text: `청크 ${chunkIndex + 1} 실패: ${String(error)}` 
          });
        }
      }

      setIsRunning(false);
      setAbortController(null);
      
      const finalText = cancelledRef.current || controller.signal.aborted 
        ? `취소됨: ${totalSuccessCount}개 완료, ${totalFailureCount}개 실패`
        : `완료: ${totalSuccessCount}개 성공, ${totalFailureCount}개 실패`;
      
      setProgress({ 
        done: processedCount, 
        total: tasks.length, 
        text: finalText 
      });

      toast({
        title: cancelledRef.current || controller.signal.aborted ? "체크 취소됨" : "체크 완료",
        description: finalText,
        variant: totalFailureCount > 0 ? "destructive" : "default"
      });
      
      queryClient.invalidateQueries({ queryKey: ['/api/targets/blog'] });

    } catch (error: unknown) {
      setIsRunning(false);
      setAbortController(null);
      toast({
        title: "체크 실패",
        description: `오류: ${String(error)}`,
        variant: "destructive"
      });
    }
  }, [trackedTargets, queryClient]);

  // 취소 처리
  const handleCancel = () => {
    cancelledRef.current = true;
    
    if (abortController) {
      abortController.abort();
    }
    
    setIsRunning(false);
    setAbortController(null);
    
    toast({
      title: "체크 취소됨",
      description: "진행 중인 요청이 중단되었습니다."
    });
  };

  // Form handlers
  const onSubmitBlog = (data: AddBlogForm) => {
    addBlogMutation.mutate(data);
  };

  const onSubmitGroup = async (data: CreateGroupForm) => {
    try {
      // TODO: 실제 API 호출로 그룹 저장
      // await groupApi.create({ name: data.name });
      
      setGroups(prev => [...prev, data.name]);
      setIsCreateGroupOpen(false);
      groupForm.reset();
      
      toast({
        title: "그룹 생성 완료",
        description: `"${data.name}" 그룹이 생성되었습니다.`,
      });
    } catch (error: any) {
      toast({
        title: "그룹 생성 실패",
        description: `오류: ${error.message}`,
        variant: "destructive",
      });
    }
  };

  // 대시보드에서 키워드 삭제 (데이터는 유지)
  const removeKeywordFromDashboard = async (id: string) => {
    try {
      // 내부 상태에서만 제거 (데이터베이스는 유지)
      queryClient.setQueryData(['/api/targets/blog'], (oldData: any[] | undefined) => {
        if (!oldData) return oldData;
        return oldData.filter(target => target.id !== id);
      });
      
      toast({
        title: "대시보드에서 제거",
        description: "키워드가 대시보드에서 숨겨졌습니다. 데이터는 안전하게 보관됩니다.",
      });
      
    } catch (error: any) {
      // 실패 시 되돌리기
      queryClient.invalidateQueries({ queryKey: ['/api/targets/blog'] });
      
      toast({
        title: "제거 실패",
        description: `오류: ${error.message}`,
        variant: "destructive",
      });
    }
  };

  const toggleKeywordActive = async (id: string) => {
    try {
      // 낙관적 업데이트: 즉시 UI 반영
      queryClient.setQueryData(['/api/targets/blog'], (oldData: any[] | undefined) => {
        if (!oldData) return oldData;
        return oldData.map(target => 
          target.id === id ? { ...target, active: !target.active } : target
        );
      });
      
      // TODO: 실제 API 호출 구현
      // await manualBlogApi.update(id, { active: !currentActive });
      
      toast({
        title: "상태 변경",
        description: "키워드 상태가 변경되었습니다.",
      });
      
    } catch (error: any) {
      // 실패 시 되돌리기
      queryClient.invalidateQueries({ queryKey: ['/api/targets/blog'] });
      
      toast({
        title: "상태 변경 실패",
        description: `오류: ${error.message}`,
        variant: "destructive",
      });
    }
  };

  return (
    <div className="min-h-screen bg-background relative">
      {/* 전체 체크 로딩 오버레이 */}
      {isRunning && (
        <div className="fixed inset-0 bg-blue-600/20 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="bg-card border border-border rounded-xl p-8 shadow-2xl min-w-[400px] max-w-md w-full mx-4">
            <div className="text-center space-y-6">
              <div className="flex items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
              </div>
              
              <div className="space-y-2">
                <h3 className="text-lg font-semibold text-foreground">순위 체크 진행중</h3>
                <p className="text-sm text-muted-foreground">{progress.text}</p>
                
                <div className="space-y-2 pt-2">
                  <Progress 
                    value={progress.total > 0 ? (progress.done / progress.total) * 100 : 0}
                    className="w-full h-3"
                  />
                  <p className="text-xs text-muted-foreground text-center">
                    {progress.done} / {progress.total} ({progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0}%)
                  </p>
                </div>
              </div>
              
              <Button
                variant="outline"
                onClick={handleCancel}
                className="w-full"
                data-testid="button-cancel-overlay"
              >
                취소
              </Button>
            </div>
          </div>
        </div>
      )}
      
      {/* Header */}
      <div className="border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-semibold text-foreground">블로그 순위 대시보드</h1>
              <p className="text-sm text-muted-foreground">네이버 블로그 SERP 순위 모니터링 및 인사이트 분석</p>
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
              
              {/* 그룹만들기 버튼 */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsCreateGroupOpen(true)}
                data-testid="button-create-group-header"
              >
                <FolderPlus className="h-4 w-4 mr-2" />
                그룹만들기
              </Button>
              
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
                    data-testid="button-update-all-ranks"
                  >
                    <TrendingUp className="h-4 w-4 mr-2" />
                    전체 순위 업데이트
                  </Button>
                  
                  {/* 일괄 상태 관리 */}
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
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

              {/* 체크 설정 카드 */}
              <div className="bg-card border border-border rounded-lg p-4">
                <div className="flex items-center gap-2 mb-4">
                  <Signal className="h-5 w-5 text-primary" />
                  <h3 className="font-semibold text-foreground">체크 설정</h3>
                </div>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm">자동 체크</Label>
                    <Switch defaultChecked data-testid="switch-auto-check" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm">체크 간격</Label>
                    <Select defaultValue="10">
                      <SelectTrigger className="h-8">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="5">5분</SelectItem>
                        <SelectItem value="10">10분</SelectItem>
                        <SelectItem value="30">30분</SelectItem>
                        <SelectItem value="60">1시간</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              {/* 체크 스케줄 카드 */}
              <div className="bg-card border border-border rounded-lg p-4">
                <div className="flex items-center gap-2 mb-4">
                  <ArrowUpDown className="h-5 w-5 text-primary" />
                  <h3 className="font-semibold text-foreground">체크 스케줄</h3>
                </div>
                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label className="text-sm">시작 시간</Label>
                    <Select defaultValue="09">
                      <SelectTrigger className="h-8">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="09">09:00</SelectItem>
                        <SelectItem value="12">12:00</SelectItem>
                        <SelectItem value="15">15:00</SelectItem>
                        <SelectItem value="18">18:00</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm">종료 시간</Label>
                    <Select defaultValue="18">
                      <SelectTrigger className="h-8">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="15">15:00</SelectItem>
                        <SelectItem value="18">18:00</SelectItem>
                        <SelectItem value="21">21:00</SelectItem>
                        <SelectItem value="24">24:00</SelectItem>
                      </SelectContent>
                    </Select>
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
                  <SelectItem value="maintain">유지일순</SelectItem>
                  <SelectItem value="keyword">키워드순</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Batch Controls */}
            {isRunning ? (
              <div className="flex items-center gap-2">
                <div className="text-sm text-muted-foreground">
                  {progress.text} ({progress.done}/{progress.total})
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCancel}
                  data-testid="button-cancel-checks"
                >
                  취소
                </Button>
              </div>
            ) : (
              <Button
                onClick={runAllChecks}
                size="sm"
                disabled={trackedTargets.length === 0}
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
          <div className="grid grid-cols-13 gap-4 p-4 bg-muted/50 border-b border-border text-sm font-medium text-muted-foreground">
            <div className="col-span-1">ON/OFF</div>
            <div className="col-span-1">키워드</div>
            <div className="col-span-1">브랜드</div>
            <div className="col-span-1">조회량</div>
            <div className="col-span-1">점수</div>
            <div className="col-span-1">순위</div>
            <div className="col-span-1">변동</div>
            <div className="col-span-1">유지일</div>
            <div className="col-span-1">블로그ID</div>
            <div className="col-span-1">트렌드</div>
            <div className="col-span-1">글쓴날짜</div>
            <div className="col-span-1">마지막체크</div>
            <div className="col-span-1">액션</div>
          </div>

          {/* Table Body */}
          <div className="divide-y divide-border">
            {filteredData.map((item, index) => (
              <div
                key={item.id}
                className={`grid grid-cols-13 gap-4 p-4 text-sm hover:bg-muted/50 transition-colors ${
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
                <div className="col-span-1">
                  <div className="font-medium text-foreground">{item.keyword}</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {item.group}
                  </div>
                </div>

                {/* 브랜드 */}
                <div className="col-span-1">
                  <div className="text-sm text-muted-foreground">{item.brand}</div>
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
                  <div className="text-sm text-muted-foreground">{item.maintainDays}일</div>
                </div>

                {/* 블로그ID */}
                <div className="col-span-1">
                  <button
                    onClick={() => {
                      const url = item.blogUrl.startsWith('http') ? item.blogUrl : `https://${item.blogUrl}`;
                      window.open(url, '_blank');
                    }}
                    className="flex items-center gap-1 text-primary hover:text-primary/80 transition-colors"
                    data-testid={`link-blog-${item.id}`}
                  >
                    <span className="font-medium">{item.blogId}</span>
                    <ExternalLink className="h-3 w-3" />
                  </button>
                </div>

                {/* 트렌드 */}
                <div className="col-span-1">
                  <TossTrendChart data={item.trend} change={item.change} />
                </div>

                {/* 글쓴날짜 */}
                <div className="col-span-1">
                  <div className="text-muted-foreground">{item.postDate}</div>
                </div>

                {/* 마지막체크 */}
                <div className="col-span-1">
                  <div className="text-muted-foreground">
                    {new Date(item.lastCheck).toLocaleString('ko-KR', {
                      month: 'short',
                      day: 'numeric', 
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </div>
                </div>

                {/* 액션 */}
                <div className="col-span-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeKeywordFromDashboard(item.id)}
                    className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                    data-testid={`button-remove-${item.id}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>

          {/* Empty State */}
          {filteredData.length === 0 && (
            <div className="p-8 text-center">
              <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-foreground mb-2">키워드가 없습니다</h3>
              <p className="text-muted-foreground mb-4">
                {selectedBrand !== "전체" || viewMode !== "all" 
                  ? "선택한 필터 조건에 해당하는 키워드가 없습니다."
                  : "첫 번째 키워드를 추가해보세요."
                }
              </p>
              <Button onClick={() => setIsAddBlogOpen(true)} data-testid="button-add-first-keyword">
                <Plus className="h-4 w-4 mr-2" />
                키워드 추가
              </Button>
            </div>
          )}
        </div>

        {/* Summary */}
        {filteredData.length > 0 && (
          <div className="mt-4 text-sm text-muted-foreground">
            총 {filteredData.length}개 키워드 • 활성 {filteredData.filter(item => item.active).length}개 • 
            비활성 {filteredData.filter(item => !item.active).length}개
          </div>
        )}
      </div>

      {/* Add Blog Modal */}
      <Dialog open={isAddBlogOpen} onOpenChange={setIsAddBlogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>키워드 추가</DialogTitle>
          </DialogHeader>
          <Form {...blogForm}>
            <form onSubmit={blogForm.handleSubmit(onSubmitBlog)} className="space-y-4">
              <FormField
                control={blogForm.control}
                name="keyword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>키워드</FormLabel>
                    <FormControl>
                      <Input placeholder="예: 홍삼스틱" {...field} data-testid="input-keyword" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={blogForm.control}
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
                control={blogForm.control}
                name="brand"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>브랜드</FormLabel>
                    <FormControl>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <SelectTrigger data-testid="select-brand">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="브랜드A">브랜드A</SelectItem>
                          <SelectItem value="브랜드B">브랜드B</SelectItem>
                          <SelectItem value="브랜드C">브랜드C</SelectItem>
                        </SelectContent>
                      </Select>
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

      {/* Create Group Modal */}
      <Dialog open={isCreateGroupOpen} onOpenChange={setIsCreateGroupOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>그룹 만들기</DialogTitle>
          </DialogHeader>
          <Form {...groupForm}>
            <form onSubmit={groupForm.handleSubmit(onSubmitGroup)} className="space-y-4">
              <FormField
                control={groupForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>그룹명</FormLabel>
                    <FormControl>
                      <Input placeholder="예: 마케팅 키워드" {...field} data-testid="input-group-name" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="flex gap-2 pt-4">
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => setIsCreateGroupOpen(false)}
                  className="flex-1"
                  data-testid="button-cancel-group"
                >
                  취소
                </Button>
                <Button 
                  type="submit" 
                  className="flex-1"
                  data-testid="button-submit-group"
                >
                  생성
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}