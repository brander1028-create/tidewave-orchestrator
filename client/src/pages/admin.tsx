import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { 
  ArrowLeft, 
  Save, 
  RotateCcw,
  Settings,
  AlertTriangle,
  CheckCircle,
  Database,
  Zap,
  Filter
} from "lucide-react";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";

// v17 Algorithm configuration schema
const AlgoConfigSchema = z.object({
  weights: z.object({
    volume: z.number().min(0).max(1),
    content: z.number().min(0).max(1)
  }).refine(data => Math.abs((data.volume + data.content) - 1.0) < 0.001, {
    message: "Volume and content weights must sum to 1.0",
  }),
  contentWeights: z.object({
    freq: z.number().min(0).max(1),
    pos: z.number().min(0).max(1),
    len: z.number().min(0).max(1),
  }).refine(data => Math.abs((data.freq + data.pos + data.len) - 1.0) < 0.001, {
    message: "Content weights (freq + pos + len) must sum to 1.0",
  }),
  phase2: z.object({
    engine: z.enum(['lk', 'ngrams', 'hybrid']),
    tiersPerPost: z.number().int().min(1).max(10),
    preferCompound: z.boolean(),
    allowThreeGram: z.boolean(),
    VOL_MIN: z.number().int().min(0),
  }),
  features: z.object({
    preEnrich: z.boolean(),
    scoreFirstGate: z.boolean(),
    tierAutoFill: z.boolean(),
    log_calculations: z.boolean(),
  }),
  adscore: z.object({
    wVolume: z.number().min(0).max(1),
    wCompetition: z.number().min(0).max(1),
    wAdDepth: z.number().min(0).max(1),
    wCpc: z.number().min(0).max(1),
    SCORE_MIN: z.number().min(0).max(1),
    VOL_MIN: z.number().int().min(0),
    AD_DEPTH_MIN: z.number().min(0),
    CPC_MIN: z.number().min(0),
    mode: z.enum(['hard', 'soft']),
    forceFill: z.boolean(),
  }).refine(data => Math.abs((data.wVolume + data.wCompetition + data.wAdDepth + data.wCpc) - 1.0) < 0.001, {
    message: "AdScore weights must sum to 1.0",
  }),
});

type AlgoConfig = z.infer<typeof AlgoConfigSchema>;

const FormSchema = z.object({
  weights: z.object({
    volume: z.number().min(0).max(1),
    content: z.number().min(0).max(1)
  }),
  contentWeights: z.object({
    freq: z.number().min(0).max(1),
    pos: z.number().min(0).max(1),
    len: z.number().min(0).max(1),
  }),
  phase2: z.object({
    engine: z.enum(['lk', 'ngrams', 'hybrid']),
    tiersPerPost: z.number().int().min(1).max(10),
    preferCompound: z.boolean(),
    allowThreeGram: z.boolean(),
    VOL_MIN: z.number().int().min(0),
  }),
  features: z.object({
    preEnrich: z.boolean(),
    scoreFirstGate: z.boolean(),
    tierAutoFill: z.boolean(),
    log_calculations: z.boolean(),
  }),
  adscore: z.object({
    wVolume: z.number().min(0).max(1),
    wCompetition: z.number().min(0).max(1),
    wAdDepth: z.number().min(0).max(1),
    wCpc: z.number().min(0).max(1),
    SCORE_MIN: z.number().min(0).max(1),
    VOL_MIN: z.number().int().min(0),
    AD_DEPTH_MIN: z.number().min(0),
    CPC_MIN: z.number().min(0),
    mode: z.enum(['hard', 'soft']),
    forceFill: z.boolean(),
  }),
});

type FormData = z.infer<typeof FormSchema>;

export default function AdminPage() {
  const { toast } = useToast();
  
  // Fetch current algo config
  const { data: config, isLoading, error } = useQuery({
    queryKey: ['algo-settings'],
    queryFn: async () => {
      const response = await fetch('/api/settings/algo');
      if (!response.ok) {
        throw new Error('Failed to fetch algo config');
      }
      const data = await response.json();
      return AlgoConfigSchema.parse(data);
    }
  });

  // Form setup
  const form = useForm<FormData>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      weights: { volume: 0.70, content: 0.30 },
      contentWeights: { freq: 0.5, pos: 0.3, len: 0.2 },
      phase2: {
        engine: 'lk',
        tiersPerPost: 4,
        preferCompound: true,
        allowThreeGram: true,
        VOL_MIN: 600,
      },
      features: {
        preEnrich: true,
        scoreFirstGate: true,
        tierAutoFill: true,
        log_calculations: true,
      },
      adscore: {
        wVolume: 0.35,
        wCompetition: 0.35,
        wAdDepth: 0.20,
        wCpc: 0.10,
        SCORE_MIN: 0.55,
        VOL_MIN: 600,
        AD_DEPTH_MIN: 1,
        CPC_MIN: 0,
        mode: 'hard',
        forceFill: true,
      },
    }
  });

  // Update form when config loads
  useEffect(() => {
    if (config) {
      form.reset({
        weights: config.weights,
        contentWeights: config.contentWeights,
        phase2: config.phase2,
        features: config.features,
        adscore: config.adscore,
      });
    }
  }, [config, form]);

  // Update mutation  
  const updateConfigMutation = useMutation({
    mutationFn: async (updatedConfig: AlgoConfig) => {
      const response = await fetch('/api/settings/algo', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          json: updatedConfig,
          updatedBy: 'admin',
          note: 'Updated via admin panel'
        }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to update algo config');
      }
      
      return response.json();
    },
    onSuccess: () => {
      queryClient.setQueryData(['algo-settings'], (oldData: AlgoConfig) => oldData);
      toast({
        title: "설정 저장 완료",
        description: "v17 알고리즘 설정이 성공적으로 저장되었습니다.",
      });
    },
    onError: (error) => {
      console.error('Error updating config:', error);
      toast({
        title: "설정 저장 실패",
        description: "설정 저장 중 오류가 발생했습니다.",
        variant: "destructive"
      });
    }
  });

  const onSubmit = (formData: FormData) => {
    const updatedConfig: AlgoConfig = {
      ...formData,
    };

    updateConfigMutation.mutate(updatedConfig);
  };

  const resetToDefaults = () => {
    form.reset({
      weights: { volume: 0.70, content: 0.30 },
      contentWeights: { freq: 0.5, pos: 0.3, len: 0.2 },
      phase2: {
        engine: 'lk',
        tiersPerPost: 4,
        preferCompound: true,
        allowThreeGram: true,
        VOL_MIN: 600,
      },
      features: {
        preEnrich: true,
        scoreFirstGate: true,
        tierAutoFill: true,
        log_calculations: true,
      },
      adscore: {
        wVolume: 0.35,
        wCompetition: 0.35,
        wAdDepth: 0.20,
        wCpc: 0.10,
        SCORE_MIN: 0.55,
        VOL_MIN: 600,
        AD_DEPTH_MIN: 1,
        CPC_MIN: 0,
        mode: 'hard',
        forceFill: true,
      },
    });
  };

  // Calculate weight sums for validation feedback
  const currentWeights = form.watch('weights');
  const currentContentWeights = form.watch('contentWeights');
  const currentAdscoreWeights = form.watch('adscore');
  
  const weightSum = (currentWeights?.volume || 0) + (currentWeights?.content || 0);
  const contentWeightSum = (currentContentWeights?.freq || 0) + (currentContentWeights?.pos || 0) + (currentContentWeights?.len || 0);
  const adscoreWeightSum = (currentAdscoreWeights?.wVolume || 0) + (currentAdscoreWeights?.wCompetition || 0) + (currentAdscoreWeights?.wAdDepth || 0) + (currentAdscoreWeights?.wCpc || 0);
  
  const isValidWeightSum = Math.abs(weightSum - 1.0) < 0.01;
  const isValidContentWeightSum = Math.abs(contentWeightSum - 1.0) < 0.01;
  const isValidAdscoreWeightSum = Math.abs(adscoreWeightSum - 1.0) < 0.01;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-sm text-muted-foreground">설정을 불러오는 중...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600 mb-4">설정을 불러오는데 실패했습니다.</p>
          <Button onClick={() => window.location.reload()} data-testid="retry-button">
            다시 시도
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <Link href="/">
              <Button variant="ghost" size="sm" data-testid="back-to-dashboard">
                <ArrowLeft className="h-4 w-4 mr-2" />
                대시보드로
              </Button>
            </Link>
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="page-title">
                <Settings className="h-6 w-6" />
                관리자 설정
              </h1>
              <p className="text-sm text-muted-foreground">
                점수 계산 엔진과 로깅 설정을 관리합니다
              </p>
            </div>
          </div>
          <Badge variant="outline" className="bg-blue-50">
            v17.0
          </Badge>
        </div>

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          {/* Phase2 Engine Configuration */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="h-4 w-4" />
                Phase2 엔진 설정
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="engine">엔진 선택</Label>
                  <Select 
                    value={form.watch('phase2.engine')} 
                    onValueChange={(value: 'lk' | 'ngrams' | 'hybrid') => form.setValue('phase2.engine', value)}
                  >
                    <SelectTrigger data-testid="engine-select">
                      <SelectValue placeholder="엔진 선택" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="lk">LK (Local + Keyword)</SelectItem>
                      <SelectItem value="ngrams">NGrams</SelectItem>
                      <SelectItem value="hybrid">Hybrid (LK + NGrams)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="tiersPerPost">포스트당 티어 수</Label>
                  <Input
                    id="tiersPerPost"
                    type="number"
                    min="1"
                    max="10"
                    {...form.register("phase2.tiersPerPost", { valueAsNumber: true })}
                    data-testid="tiers-per-post"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="VOL_MIN">최소 검색량</Label>
                  <Input
                    id="VOL_MIN"
                    type="number"
                    min="0"
                    {...form.register("phase2.VOL_MIN", { valueAsNumber: true })}
                    data-testid="vol-min"
                  />
                </div>
              </div>

              <div className="flex gap-4">
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="preferCompound"
                    {...form.register("phase2.preferCompound")}
                    data-testid="prefer-compound"
                  />
                  <Label htmlFor="preferCompound">복합어 선호</Label>
                </div>
                
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="allowThreeGram"
                    {...form.register("phase2.allowThreeGram")}
                    data-testid="allow-three-gram"
                  />
                  <Label htmlFor="allowThreeGram">3그램 허용</Label>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Main Weights Configuration */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                메인 가중치 설정
                {isValidWeightSum ? (
                  <CheckCircle className="h-4 w-4 text-green-600" />
                ) : (
                  <AlertTriangle className="h-4 w-4 text-yellow-600" />
                )}
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                현재 합계: <span className={isValidWeightSum ? "text-green-600" : "text-red-600"}>
                  {weightSum.toFixed(3)}
                </span>
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="volume-weight">검색량 가중치</Label>
                  <Input
                    id="volume-weight"
                    type="number"
                    step="0.01"
                    min="0"
                    max="1"
                    {...form.register("weights.volume", { valueAsNumber: true })}
                    data-testid="weight-volume"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="content-weight">컨텐츠 가중치</Label>
                  <Input
                    id="content-weight"
                    type="number"
                    step="0.01"
                    min="0"
                    max="1"
                    {...form.register("weights.content", { valueAsNumber: true })}
                    data-testid="weight-content"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Content Weights Configuration */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                컨텐츠 가중치 설정
                {isValidContentWeightSum ? (
                  <CheckCircle className="h-4 w-4 text-green-600" />
                ) : (
                  <AlertTriangle className="h-4 w-4 text-yellow-600" />
                )}
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                현재 합계: <span className={isValidContentWeightSum ? "text-green-600" : "text-red-600"}>
                  {contentWeightSum.toFixed(3)}
                </span>
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="freq-weight">빈도 가중치</Label>
                  <Input
                    id="freq-weight"
                    type="number"
                    step="0.01"
                    min="0"
                    max="1"
                    {...form.register("contentWeights.freq", { valueAsNumber: true })}
                    data-testid="weight-freq"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="pos-weight">위치 가중치</Label>
                  <Input
                    id="pos-weight"
                    type="number"
                    step="0.01"
                    min="0"
                    max="1"
                    {...form.register("contentWeights.pos", { valueAsNumber: true })}
                    data-testid="weight-pos"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="len-weight">길이 가중치</Label>
                  <Input
                    id="len-weight"
                    type="number"
                    step="0.01"
                    min="0"
                    max="1"
                    {...form.register("contentWeights.len", { valueAsNumber: true })}
                    data-testid="weight-len"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* AdScore Gate Configuration */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Filter className="h-4 w-4" />
                Score-First Gate 설정
                {isValidAdscoreWeightSum ? (
                  <CheckCircle className="h-4 w-4 text-green-600" />
                ) : (
                  <AlertTriangle className="h-4 w-4 text-yellow-600" />
                )}
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                AdScore 가중치 합계: <span className={isValidAdscoreWeightSum ? "text-green-600" : "text-red-600"}>
                  {adscoreWeightSum.toFixed(3)}
                </span>
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="wVolume">검색량 가중치</Label>
                  <Input
                    id="wVolume"
                    type="number"
                    step="0.01"
                    min="0"
                    max="1"
                    {...form.register("adscore.wVolume", { valueAsNumber: true })}
                    data-testid="adscore-volume"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="wCompetition">경쟁도 가중치</Label>
                  <Input
                    id="wCompetition"
                    type="number"
                    step="0.01"
                    min="0"
                    max="1"
                    {...form.register("adscore.wCompetition", { valueAsNumber: true })}
                    data-testid="adscore-competition"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="wAdDepth">광고 깊이 가중치</Label>
                  <Input
                    id="wAdDepth"
                    type="number"
                    step="0.01"
                    min="0"
                    max="1"
                    {...form.register("adscore.wAdDepth", { valueAsNumber: true })}
                    data-testid="adscore-ad-depth"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="wCpc">CPC 가중치</Label>
                  <Input
                    id="wCpc"
                    type="number"
                    step="0.01"
                    min="0"
                    max="1"
                    {...form.register("adscore.wCpc", { valueAsNumber: true })}
                    data-testid="adscore-cpc"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="SCORE_MIN">최소 점수</Label>
                  <Input
                    id="SCORE_MIN"
                    type="number"
                    step="0.01"
                    min="0"
                    max="1"
                    {...form.register("adscore.SCORE_MIN", { valueAsNumber: true })}
                    data-testid="score-min"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="adscore-VOL_MIN">최소 검색량</Label>
                  <Input
                    id="adscore-VOL_MIN"
                    type="number"
                    min="0"
                    {...form.register("adscore.VOL_MIN", { valueAsNumber: true })}
                    data-testid="adscore-vol-min"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="AD_DEPTH_MIN">최소 광고 깊이</Label>
                  <Input
                    id="AD_DEPTH_MIN"
                    type="number"
                    step="0.1"
                    min="0"
                    {...form.register("adscore.AD_DEPTH_MIN", { valueAsNumber: true })}
                    data-testid="ad-depth-min"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="CPC_MIN">최소 CPC</Label>
                  <Input
                    id="CPC_MIN"
                    type="number"
                    step="1"
                    min="0"
                    {...form.register("adscore.CPC_MIN", { valueAsNumber: true })}
                    data-testid="cpc-min"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="adscore-mode">게이트 모드</Label>
                  <Select 
                    value={form.watch('adscore.mode')} 
                    onValueChange={(value: 'hard' | 'soft') => form.setValue('adscore.mode', value)}
                  >
                    <SelectTrigger data-testid="adscore-mode">
                      <SelectValue placeholder="모드 선택" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="hard">Hard (필터링)</SelectItem>
                      <SelectItem value="soft">Soft (표시만)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="forceFill"
                  {...form.register("adscore.forceFill")}
                  data-testid="force-fill"
                />
                <Label htmlFor="forceFill">Force Fill (완화 모드)</Label>
              </div>
            </CardContent>
          </Card>

          {/* Features Configuration */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Zap className="h-4 w-4" />
                기능 설정
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <Label htmlFor="preEnrich">Pre-enrich</Label>
                    <p className="text-xs text-muted-foreground">
                      키워드 사전 보강 활성화
                    </p>
                  </div>
                  <Switch
                    id="preEnrich"
                    checked={form.watch('features.preEnrich')}
                    onCheckedChange={(checked) => form.setValue('features.preEnrich', checked)}
                    data-testid="pre-enrich"
                  />
                </div>
                
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <Label htmlFor="scoreFirstGate">Score-First Gate</Label>
                    <p className="text-xs text-muted-foreground">
                      점수 우선 게이트 활성화
                    </p>
                  </div>
                  <Switch
                    id="scoreFirstGate"
                    checked={form.watch('features.scoreFirstGate')}
                    onCheckedChange={(checked) => form.setValue('features.scoreFirstGate', checked)}
                    data-testid="score-first-gate"
                  />
                </div>
                
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <Label htmlFor="tierAutoFill">티어 자동보강</Label>
                    <p className="text-xs text-muted-foreground">
                      티어 부족 시 자동 보강
                    </p>
                  </div>
                  <Switch
                    id="tierAutoFill"
                    checked={form.watch('features.tierAutoFill')}
                    onCheckedChange={(checked) => form.setValue('features.tierAutoFill', checked)}
                    data-testid="tier-auto-fill"
                  />
                </div>
                
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <Label htmlFor="log_calculations">계산 과정 로깅</Label>
                    <p className="text-xs text-muted-foreground">
                      점수 계산 과정 기록
                    </p>
                  </div>
                  <Switch
                    id="log_calculations"
                    checked={form.watch('features.log_calculations')}
                    onCheckedChange={(checked) => form.setValue('features.log_calculations', checked)}
                    data-testid="log-calculations"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Actions */}
          <div className="flex justify-between">
            <Button type="button" variant="outline" onClick={resetToDefaults} data-testid="reset-defaults">
              <RotateCcw className="h-4 w-4 mr-2" />
              기본값 복원
            </Button>
            
            <Button 
              type="submit" 
              disabled={!isValidWeightSum || !isValidContentWeightSum || !isValidAdscoreWeightSum || updateConfigMutation.isPending}
              data-testid="save-config"
            >
              {updateConfigMutation.isPending ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  저장 중...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  설정 저장
                </>
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}