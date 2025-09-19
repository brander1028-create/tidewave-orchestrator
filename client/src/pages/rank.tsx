import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage, FormDescription } from "@/components/ui/form";
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
  Edit3
} from "lucide-react";
import { ColumnDef } from "@tanstack/react-table";
import { targetsApi, scrapingApi, rankApi, blogKeywordPairsApi, http } from "@/lib/api";
import type { TrackedTarget, InsertTrackedTarget, BlogKeywordTarget } from "@shared/schema";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

interface RankingData {
  id: string;
  keyword: string;
  rank: number | null; // v7.19: null 허용 ("미노출" 대응)
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

// v7.16: 편집 폼 스키마
const editBlogKeywordPairSchema = z.object({
  keywordText: z.string().min(1, "키워드를 입력해주세요"),
  blogUrl: z.string().url("올바른 블로그 URL을 입력해주세요"),
  title: z.string().optional(),
  nickname: z.string().optional(),
  brand: z.string().optional(),
  groupName: z.string().optional(),
  active: z.boolean().default(true),
});

type AddBlogKeywordPairForm = z.infer<typeof addBlogKeywordPairSchema>;
type EditBlogKeywordPairForm = z.infer<typeof editBlogKeywordPairSchema>;

export default function Rank() {
  const [selectedTab, setSelectedTab] = React.useState("blog");
  const [selectedRankingDetail, setSelectedRankingDetail] = React.useState<RankingData | null>(null);
  const [isAddBlogOpen, setIsAddBlogOpen] = React.useState(false);
  const [metadataLoading, setMetadataLoading] = React.useState(false);
  // v7.13.2: 진행표시 상태들
  const [isRunning, setIsRunning] = React.useState(false);
  const [prog, setProg] = React.useState({done:0,total:0,percent:0,now:''});
  const [rowLoading, setRowLoading] = React.useState<Record<string,boolean>>({});
  const CONCURRENCY = 3;
  const queryClient = useQueryClient();
  
  // v7.16: 편집 기능 상태들
  const [editingPair, setEditingPair] = React.useState<BlogKeywordTarget | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = React.useState(false);
  
  // v7.13.1: Fetch blog-keyword pairs from API with proper auth
  const { data: blogKeywordPairs = [], isLoading: pairsLoading } = useQuery<BlogKeywordTarget[]>({
    queryKey: ['/api/pairs'],
    queryFn: async () => {
      const response = await http('/api/pairs');
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
  
  // v7.16: 편집 폼
  const editForm = useForm<EditBlogKeywordPairForm>({
    resolver: zodResolver(editBlogKeywordPairSchema),
    defaultValues: {
      keywordText: "",
      blogUrl: "",
      title: "",
      nickname: "",
      brand: "",
      groupName: "",
      active: true,
    },
  });
  
  // Add blog-keyword pair mutation  
  // v7.13.1: 낙관적 업데이트로 즉시 UI 반영
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
      
      const response = await http('/api/pairs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'API 호출 실패');
      }
      
      return response.json();
    },
    onMutate: async (newPair) => {
      // 진행 중인 쿼리 취소하여 낙관적 업데이트 충돌 방지
      await queryClient.cancelQueries({ queryKey: ['/api/pairs'] });
      
      // 이전 데이터 백업 (롤백용)
      const previousPairs = queryClient.getQueryData(['/api/pairs']);
      
      // 임시 ID와 함께 새 페어를 즉시 캐시에 추가
      const optimisticPair = {
        id: `temp-${Date.now()}`, // 임시 ID
        keywordText: newPair.keywordText,
        blogUrl: newPair.blogUrl,
        title: newPair.title || '',
        brand: newPair.brand || '',
        groupName: newPair.group || '',
        active: newPair.active,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      
      // 캐시에 즉시 추가 (UI에 바로 반영)
      queryClient.setQueryData(['/api/pairs'], (old: any) => 
        old ? [...old, optimisticPair] : [optimisticPair]
      );
      
      console.log('[v7.13.1] 낙관적 업데이트 적용:', optimisticPair);
      
      return { previousPairs };
    },
    onError: (error, newPair, context) => {
      // 실패시 이전 상태로 롤백
      if (context?.previousPairs) {
        queryClient.setQueryData(['/api/pairs'], context.previousPairs);
        console.log('[v7.13.1] 낙관적 업데이트 롤백');
      }
      
      toast({
        title: "등록 실패",
        description: `페어 등록 중 오류가 발생했습니다: ${error.message}`,
        variant: "destructive",
      });
    },
    onSuccess: (data) => {
      toast({
        title: "페어 등록 완료",
        description: "블로그-키워드 페어가 성공적으로 등록되었습니다.",
      });
      
      console.log('[v7.13.1] 서버 응답으로 실제 데이터 업데이트:', data);
      
      setIsAddBlogOpen(false);
      form.reset();
    },
    onSettled: () => {
      // 성공/실패 상관없이 최신 데이터로 동기화
      queryClient.invalidateQueries({ queryKey: ['/api/pairs'] });
      console.log('[v7.13.1] 쿼리 무효화로 최신 데이터 동기화');
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

  // v7.16: 편집 pair mutation (강화된 캐시 관리)
  const editPairMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: EditBlogKeywordPairForm }) => {
      console.log('편집 요청 시작:', { id, data });
      const response = await http(`/api/pairs/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });
      console.log('편집 응답:', response.status, response.ok);
      if (!response.ok) throw new Error('편집 실패');
      const result = await response.json();
      console.log('편집 결과:', result);
      return result;
    },
    onMutate: async ({ id, data }) => {
      // 낙관적 업데이트: UI를 즉시 업데이트
      console.log('낙관적 업데이트 시작');
      await queryClient.cancelQueries({ queryKey: ['/api/pairs'] });
      
      const previousPairs = queryClient.getQueryData(['/api/pairs']);
      
      queryClient.setQueryData(['/api/pairs'], (old: any[]) => {
        if (!old) return old;
        return old.map((pair: any) => 
          pair.id === id ? { ...pair, ...data } : pair
        );
      });
      
      return { previousPairs };
    },
    onSuccess: async (updatedPair, { id, data }) => {
      console.log('편집 성공, 캐시 새로고침 시작');
      
      // 모든 관련 쿼리 무효화
      await queryClient.invalidateQueries({ queryKey: ['/api/pairs'] });
      await queryClient.invalidateQueries({ queryKey: ['/api/rank'] });
      
      // 강제 리페치
      await queryClient.refetchQueries({ queryKey: ['/api/pairs'] });
      
      toast({
        title: "편집 완료",
        description: "블로그-키워드 페어가 성공적으로 수정되었습니다.",
      });
      
      // 모든 모달 닫기
      setIsEditModalOpen(false);
      setEditingPair(null);
      setSelectedRankingDetail(null);
      
      console.log('편집 완료, UI 상태 초기화');
    },
    onError: (error, variables, context) => {
      console.error('편집 실패:', error);
      
      // 낙관적 업데이트 롤백
      if (context?.previousPairs) {
        queryClient.setQueryData(['/api/pairs'], context.previousPairs);
      }
      
      toast({
        title: "편집 실패",
        description: "페어 수정 중 오류가 발생했습니다.",
        variant: "destructive",
      });
    },
    onSettled: () => {
      // 항상 최종적으로 쿼리 무효화
      queryClient.invalidateQueries({ queryKey: ['/api/pairs'] });
    },
  });

  // v7.16: 편집 시작 함수
  const handleEditPair = (rankingData: RankingData) => {
    const pair = blogKeywordPairs.find(p => p.id === rankingData.id);
    if (pair) {
      setEditingPair(pair);
      editForm.reset({
        keywordText: pair.keywordText,
        blogUrl: pair.blogUrl,
        title: pair.title || "",
        nickname: pair.nickname || "",
        brand: pair.brand || "",
        groupName: pair.groupName || "",
        active: pair.active,
      });
      setIsEditModalOpen(true);
    }
  };

  // v7.16: 메타데이터 자동 수집 함수
  const handleMetadataCollection = async (url: string) => {
    if (!url || !url.startsWith('http')) return;
    
    setMetadataLoading(true);
    try {
      const response = await http(`/api/metadata?url=${encodeURIComponent(url)}`);
      if (response.ok) {
        const metadata = await response.json();
        if (metadata.title) {
          editForm.setValue('title', metadata.title);
        }
        if (metadata.nickname) {
          editForm.setValue('nickname', metadata.nickname);
        }
      }
    } catch (error) {
      console.error('메타데이터 수집 실패:', error);
    } finally {
      setMetadataLoading(false);
    }
  };

  // v7.17: Blog 작업 계획 조회 함수 (pairs 기반)
  async function planBlogTasks(pairs: BlogKeywordTarget[]) {
    try {
      const pairIds = pairs.map(p => p.id).join(',');
      const r = await http(`/api/rank/plan?pair_ids=${encodeURIComponent(pairIds)}`);
      if (r.ok) return await r.json(); // {total,tasks:[{pair_id,keyword,nickname}]}
    } catch (e) {
      console.error('Plan 조회 실패:', e);
    }
    return { total: pairs.length, tasks: pairs.map(p => ({pair_id:p.id, keyword:p.keywordText, nickname:p.title || p.blogUrl})) };
  }

  // v7.13.2: 전체 순위 체크 실행 함수 (Blog-only + 진행표시)
  async function runAllChecks() {
    const selected = blogKeywordPairs.filter(p => p.active);
    setIsRunning(true); 
    setProg({done:0,total:0,percent:0,now:'준비중…'});

    const plan = await planBlogTasks(selected);
    if (!plan.total) { 
      toast({title: '체크할 대상 없음', description: '활성화된 블로그-키워드 페어가 없습니다.'});
      setIsRunning(false); 
      return; 
    }

    setProg(p => ({...p,total:plan.total,now:'시작합니다'}));
    let i=0, done=0, cancelled=false;
    const tasks = [...plan.tasks];

    async function worker(){
      while(!cancelled && i<tasks.length){
        const t = tasks[i++]; 
        setRowLoading(s=>({...s,[t.pair_id]:true}));
        setProg(p=>({...p,now:`${t.keyword} · ${t.nickname}`}));
        try { 
          // v7.17: Blog-only 배치 체크 API 호출 (pair_id 사용)
          const response = await http('/api/scraping/batch-rank-check', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              targets: [{
                targetId: t.pair_id, // v7.17: pair_id를 targetId로 사용
                pairId: t.pair_id, // v7.18: 스냅샷 삽입을 위한 pairId 추가
                query: t.keyword,
                kind: 'blog',
                device: 'mobile'
              }]
            })
          });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
        } catch(e){ 
          console.error(`체크 실패 ${t.keyword}:`, e);
        } finally{
          setRowLoading(s=>({...s,[t.pair_id]:false}));
          done++; 
          setProg({done,total:plan.total,percent:Math.round(done*100/plan.total),now:t.nickname});
        }
      }
    }
    
    await Promise.all(Array.from({length: Math.min(CONCURRENCY, plan.total)}).map(()=>worker()));
    
    toast({
      title: `완료: ${done}/${plan.total}`,
      description: '블로그 순위 체크가 완료되었습니다.'
    }); 
    setIsRunning(false);
    
    // v7.19: 실행 후 랭크 리스트 refetch 강제 (no-cache)
    queryClient.invalidateQueries({ queryKey: ['/api/pairs'] });
    queryClient.invalidateQueries({ queryKey: ['/api/rank-snapshots', 'blog'] });
    
    // 강제 새로고침을 위한 추가 fetch (타임스탬프 기반)
    queryClient.refetchQueries({ 
      queryKey: ['/api/pairs'], 
      type: 'active',
      exact: false 
    });
    queryClient.refetchQueries({ 
      queryKey: ['/api/rank-snapshots'], 
      type: 'active',
      exact: false 
    });
  }

  // Fetch rank snapshots for blog-keyword pairs
  const { data: rankSnapshots = [], isLoading: rankLoading } = useQuery({
    queryKey: ['/api/rank-snapshots', 'blog'],
    queryFn: async () => {
      const response = await http('/api/rank-snapshots?kind=blog');
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
          rank: rank, // v7.19: null 값 유지 (999 제거)
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

  // v7.19: 노출 필터 상태 관리
  const [exposureFilter, setExposureFilter] = useState<"all" | "exposed" | "hidden">("all");

  // v7.13: Current ranking data using new function
  const allRankingData = convertPairsToRankingData(blogKeywordPairs);
  
  // v7.19: 노출 필터에 따른 데이터 필터링
  const currentRankingData = allRankingData.filter(item => {
    if (exposureFilter === "all") return true;
    if (exposureFilter === "exposed") return item.rank !== null && item.rank !== 999;
    if (exposureFilter === "hidden") return item.rank === null || item.rank === 999;
    return true;
  });

  // v7.13.1: 키워드 메타정보 API 연동
  const keywordTexts = blogKeywordPairs?.map(pair => pair.keywordText).filter(Boolean).join(',') || '';
  
  const { data: keywordMetadata, isLoading: keywordMetadataLoading } = useQuery({
    queryKey: ['/api/keywords/lookup', keywordTexts],
    enabled: !!keywordTexts && keywordTexts.length > 0,
    staleTime: 1000 * 60 * 60, // 1시간 캐시
    refetchOnWindowFocus: false,
  });

  // 키워드별 메타데이터 매핑 헬퍼 함수
  const getKeywordMetadata = (keyword: string) => {
    if (!keywordMetadata || keywordMetadataLoading || !Array.isArray(keywordMetadata)) {
      return { volume: 0, score: 0, trend: 'stable' as const };
    }
    
    const metadata = keywordMetadata.find((item: any) => item.keyword === keyword);
    if (metadata) {
      return {
        volume: metadata.volume || 0,
        score: metadata.score || 0,
        trend: metadata.trend || 'stable' as const
      };
    }
    
    return { volume: 0, score: 0, trend: 'stable' as const };
  };

  // Handle form submission
  // v7.13.1: 메타데이터 자동 수집 함수
  const handleUrlBlur = async (url: string) => {
    if (!url.trim() || metadataLoading) return;
    
    setMetadataLoading(true);
    try {
      const response = await http(`/api/metadata?url=${encodeURIComponent(url.trim())}`);
      if (response.ok) {
        const metadata = await response.json();
        console.log('[v7.13.1] 메타데이터 수집 성공:', metadata);
        
        // 제목이 수집되었고 현재 제목 필드가 비어있으면 자동 채움
        if (metadata.title && !form.getValues('title')) {
          form.setValue('title', metadata.title);
        }
      } else {
        const error = await response.json();
        console.log('[v7.13.1] 메타데이터 수집 실패:', error.message);
      }
    } catch (error) {
      console.log('[v7.13.1] 메타데이터 수집 오류:', error);
    } finally {
      setMetadataLoading(false);
    }
  };

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
        // v7.13.1: 실제 키워드 메타데이터 사용
        const keywordData = getKeywordMetadata(row.original.keyword);
        
        return (
          <div className="space-y-2">
            <KeywordChip 
              keyword={row.original.keyword}
              volume={keywordData.volume}
              score={keywordData.score}
            />
            {keywordMetadataLoading && (
              <div className="text-xs text-muted-foreground flex items-center gap-1">
                <RefreshCw className="w-3 h-3 animate-spin" />
                키워드 정보 로딩 중...
              </div>
            )}
          </div>
        );
      },
    },
    {
      accessorKey: "rank",
      header: "현재 순위",
      cell: ({ row }) => {
        const rank = row.original.rank;
        const isUnranked = rank === null || rank === 999;
        const lastCheck = row.original.lastCheck;
        
        return (
          <div className="space-y-2">
            <div className="text-sm">
              {isUnranked ? (
                <div className="space-y-1">
                  <span className="text-lg font-medium text-muted-foreground">미노출</span>
                  <div className="text-xs text-red-500">검색 결과 없음</div>
                </div>
              ) : (
                <div className="space-y-1">
                  <div>
                    <span className="text-2xl font-bold text-foreground">{rank}</span>
                    <span className="text-muted-foreground text-sm ml-1">위</span>
                  </div>
                  {rank && rank >= 30 && (
                    <div className="text-xs text-amber-600">순위 개선 필요</div>
                  )}
                  {rank && rank <= 10 && (
                    <div className="text-xs text-green-600">상위 랭킹</div>
                  )}
                </div>
              )}
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
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" disabled={rowLoading[row.original.id]}>
            <RefreshCw className={`h-4 w-4 ${rowLoading[row.original.id] ? 'animate-spin' : ''}`} />
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
      const response = await http(`/api/rank-snapshots/history?pair_id=${selectedRankingDetail.id}`);
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
            <div className="flex flex-wrap gap-3 items-center">
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-3">
                  <StartAllChecksButton
                    onClick={runAllChecks}
                    isRunning={isRunning}
                    disabled={isRunning || pairsLoading}
                    progressText={isRunning ? `체크 중… (${prog.done}/${prog.total})` : '전체 체크 시작'}
                  />
                  {/* v7.13.2: 진행바 */}
                  {isRunning && (
                    <div className="flex-1 min-w-32 bg-gray-200 rounded-full h-2 overflow-hidden">
                      <div 
                        className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${prog.percent}%` }}
                      />
                    </div>
                  )}
                </div>
                {/* v7.13.2: 현재 작업 텍스트 */}
                {isRunning && prog.now && (
                  <div className="text-xs text-muted-foreground">
                    지금: {prog.now}
                  </div>
                )}
              </div>
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
                  value={exposureFilter}
                  onChange={(value) => {
                    console.log("Filter changed:", value);
                    setExposureFilter(value);
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
            <div className="flex items-center justify-between">
              <DialogTitle>
                순위 상세 분석 - {selectedRankingDetail?.keyword}
              </DialogTitle>
              <Button
                variant="outline"
                size="sm"
                className="flex items-center gap-2"
                onClick={() => selectedRankingDetail && handleEditPair(selectedRankingDetail)}
                data-testid="button-edit-pair"
              >
                <Edit3 className="w-4 h-4" />
                편집
              </Button>
            </div>
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
                        {selectedRankingDetail.rank ? (101 - selectedRankingDetail.rank) : 0}
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
                    <FormLabel className="flex items-center gap-2">
                      블로그 URL
                      {metadataLoading && (
                        <RefreshCw className="w-4 h-4 animate-spin text-primary" />
                      )}
                    </FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="https://blog.naver.com/..." 
                        {...field}
                        onBlur={(e) => {
                          field.onBlur();
                          handleUrlBlur(e.target.value);
                        }}
                        data-testid="input-blog-url"
                        disabled={metadataLoading}
                      />
                    </FormControl>
                    <div className="text-xs text-muted-foreground">
                      URL 입력 후 포커스를 다른 곳으로 이동하면 제목이 자동으로 채워집니다
                    </div>
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

      {/* v7.16: 편집 모달 */}
      <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>블로그-키워드 페어 편집</DialogTitle>
            <DialogDescription>
              페어 정보를 수정할 수 있습니다.
            </DialogDescription>
          </DialogHeader>
          <Form {...editForm}>
            <form onSubmit={editForm.handleSubmit((data) => {
              if (editingPair) {
                editPairMutation.mutate({ id: editingPair.id, data });
              }
            })} className="space-y-4">
              <FormField
                control={editForm.control}
                name="keywordText"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>키워드 *</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="검색할 키워드를 입력하세요" 
                        {...field}
                        data-testid="input-edit-keyword"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={editForm.control}
                name="blogUrl"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>블로그 URL *</FormLabel>
                    <FormControl>
                      <div className="flex gap-2">
                        <Input 
                          placeholder="https://blog.naver.com/example" 
                          {...field}
                          onBlur={() => handleMetadataCollection(field.value)}
                          data-testid="input-edit-blog-url"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => handleMetadataCollection(field.value)}
                          disabled={metadataLoading}
                          data-testid="button-edit-metadata"
                        >
                          {metadataLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : "메타데이터"}
                        </Button>
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={editForm.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>제목 (선택)</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="블로그 제목이 자동으로 입력됩니다" 
                        {...field}
                        data-testid="input-edit-title"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={editForm.control}
                name="nickname"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>별명 (선택)</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="별명을 입력하세요" 
                        {...field}
                        data-testid="input-edit-nickname"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={editForm.control}
                name="brand"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>브랜드 (선택)</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="브랜드명을 입력하세요 (예: 네이버, 카카오)" 
                        {...field}
                        data-testid="input-edit-brand"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={editForm.control}
                name="groupName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>그룹 (선택)</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="그룹명을 입력하세요 (예: 브랜딩)" 
                        {...field}
                        data-testid="input-edit-group"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={editForm.control}
                name="active"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">활성 상태</FormLabel>
                      <FormDescription>
                        이 페어를 순위 체크에 포함할지 선택하세요
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        data-testid="switch-edit-active"
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
              
              <div className="flex gap-2 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setIsEditModalOpen(false);
                    setEditingPair(null);
                  }}
                  className="flex-1"
                  data-testid="button-cancel-edit"
                >
                  취소
                </Button>
                <Button 
                  type="submit" 
                  className="flex-1"
                  disabled={editPairMutation.isPending}
                  data-testid="button-submit-edit"
                >
                  {editPairMutation.isPending ? "수정 중..." : "수정"}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
