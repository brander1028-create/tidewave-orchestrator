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
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { 
  ArrowLeft, 
  Save, 
  RotateCcw,
  Settings,
  AlertTriangle,
  CheckCircle
} from "lucide-react";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";

// Scoring configuration schema
const ScoringConfigSchema = z.object({
  version: z.string(),
  description: z.string(),
  scoring: z.object({
    weights: z.object({
      volume: z.number().min(0).max(1),
      competition: z.number().min(0).max(1),
      ad_depth: z.number().min(0).max(1),
      cpc: z.number().min(0).max(1)
    }),
    normalization: z.object({
      volume: z.object({
        type: z.enum(['logarithmic', 'linear']),
        base: z.number().optional(),
        max_raw: z.number(),
        scale_factor: z.number().optional()
      }),
      competition: z.object({
        type: z.enum(['direct', 'linear']),
        scale: z.number()
      }),
      ad_depth: z.object({
        type: z.literal('linear'),
        max: z.number()
      }),
      cpc: z.object({
        type: z.literal('linear'),
        max: z.number()
      })
    }),
    competition_mapping: z.record(z.number())
  }),
  logging: z.object({
    enabled: z.boolean(),
    detailed: z.boolean(),
    log_calculations: z.boolean()
  }),
  metadata: z.object({
    last_modified: z.string(),
    modified_by: z.string(),
    change_log: z.array(z.object({
      date: z.string(),
      changes: z.string(),
      author: z.string()
    }))
  })
});

type ScoringConfig = z.infer<typeof ScoringConfigSchema>;

const WeightsFormSchema = z.object({
  volume: z.number().min(0).max(1),
  competition: z.number().min(0).max(1),
  ad_depth: z.number().min(0).max(1),
  cpc: z.number().min(0).max(1)
}).refine(
  (data) => Math.abs((data.volume + data.competition + data.ad_depth + data.cpc) - 1.0) < 0.01,
  {
    message: "가중치의 합은 1.0이어야 합니다",
    path: ["volume"]
  }
);

type WeightsForm = z.infer<typeof WeightsFormSchema>;

export default function AdminPage() {
  const { toast } = useToast();
  
  // Fetch current scoring config
  const { data: config, isLoading, error } = useQuery({
    queryKey: ['/api/scoring-config'],
    queryFn: async () => {
      const response = await fetch('/api/scoring-config');
      if (!response.ok) {
        throw new Error('Failed to fetch scoring config');
      }
      const data = await response.json();
      return ScoringConfigSchema.parse(data);
    }
  });

  // Form setup
  const form = useForm<WeightsForm>({
    resolver: zodResolver(WeightsFormSchema),
    defaultValues: {
      volume: config?.scoring.weights.volume || 0.35,
      competition: config?.scoring.weights.competition || 0.35,
      ad_depth: config?.scoring.weights.ad_depth || 0.20,
      cpc: config?.scoring.weights.cpc || 0.10
    }
  });

  // Update form when config loads
  useEffect(() => {
    if (config) {
      form.reset({
        volume: config.scoring.weights.volume,
        competition: config.scoring.weights.competition,
        ad_depth: config.scoring.weights.ad_depth,
        cpc: config.scoring.weights.cpc
      });
      setLoggingEnabled(config.logging.enabled);
      setDetailedLogging(config.logging.detailed);
      setLogCalculations(config.logging.log_calculations);
    }
  }, [config, form]);

  // Logging states
  const [loggingEnabled, setLoggingEnabled] = useState(config?.logging.enabled || false);
  const [detailedLogging, setDetailedLogging] = useState(config?.logging.detailed || false);
  const [logCalculations, setLogCalculations] = useState(config?.logging.log_calculations || false);

  // Update mutation
  const updateConfigMutation = useMutation({
    mutationFn: async (updatedConfig: ScoringConfig) => {
      const response = await fetch('/api/scoring-config', {
        method: 'PUT',
        body: JSON.stringify(updatedConfig),
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        throw new Error('Failed to update scoring config');
      }
      
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/scoring-config'] });
      toast({
        title: "설정 저장 완료",
        description: "점수 계산 엔진 설정이 성공적으로 저장되었습니다.",
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

  const onSubmit = (weights: WeightsForm) => {
    if (!config) return;

    const updatedConfig: ScoringConfig = {
      ...config,
      scoring: {
        ...config.scoring,
        weights: {
          volume: weights.volume,
          competition: weights.competition,
          ad_depth: weights.ad_depth,
          cpc: weights.cpc
        }
      },
      logging: {
        enabled: loggingEnabled,
        detailed: detailedLogging,
        log_calculations: logCalculations
      }
    };

    updateConfigMutation.mutate(updatedConfig);
  };

  const resetToDefaults = () => {
    form.reset({
      volume: 0.35,
      competition: 0.35,
      ad_depth: 0.20,
      cpc: 0.10
    });
    setLoggingEnabled(true);
    setDetailedLogging(false);
    setLogCalculations(false);
  };

  // Calculate current weight sum for validation feedback
  const currentWeights = form.watch();
  const weightSum = Object.values(currentWeights).reduce((sum, val) => sum + (val || 0), 0);
  const isValidSum = Math.abs(weightSum - 1.0) < 0.01;

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
            {config?.version || 'v10.0'}
          </Badge>
        </div>

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          {/* Weights Configuration */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                가중치 설정
                {isValidSum ? (
                  <CheckCircle className="h-4 w-4 text-green-600" />
                ) : (
                  <AlertTriangle className="h-4 w-4 text-yellow-600" />
                )}
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                키워드 점수 계산에 사용되는 각 요소의 가중치를 설정합니다. 총합은 1.0이어야 합니다.
              </p>
              <div className="text-sm">
                <span className="font-medium">현재 합계: </span>
                <span className={isValidSum ? "text-green-600" : "text-red-600"}>
                  {weightSum.toFixed(3)}
                </span>
                {!isValidSum && (
                  <span className="text-red-600 ml-2">
                    (1.0과의 차이: {Math.abs(weightSum - 1.0).toFixed(3)})
                  </span>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="volume">검색량 가중치 (Volume)</Label>
                  <Input
                    id="volume"
                    type="number"
                    step="0.01"
                    min="0"
                    max="1"
                    {...form.register("volume", { valueAsNumber: true })}
                    data-testid="weight-volume"
                  />
                  {form.formState.errors.volume && (
                    <p className="text-sm text-red-600">{form.formState.errors.volume.message}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="competition">경쟁도 가중치 (Competition)</Label>
                  <Input
                    id="competition"
                    type="number"
                    step="0.01"
                    min="0"
                    max="1"
                    {...form.register("competition", { valueAsNumber: true })}
                    data-testid="weight-competition"
                  />
                  {form.formState.errors.competition && (
                    <p className="text-sm text-red-600">{form.formState.errors.competition.message}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="ad_depth">광고 깊이 가중치 (AD Depth)</Label>
                  <Input
                    id="ad_depth"
                    type="number"
                    step="0.01"
                    min="0"
                    max="1"
                    {...form.register("ad_depth", { valueAsNumber: true })}
                    data-testid="weight-ad-depth"
                  />
                  {form.formState.errors.ad_depth && (
                    <p className="text-sm text-red-600">{form.formState.errors.ad_depth.message}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="cpc">CPC 가중치</Label>
                  <Input
                    id="cpc"
                    type="number"
                    step="0.01"
                    min="0"
                    max="1"
                    {...form.register("cpc", { valueAsNumber: true })}
                    data-testid="weight-cpc"
                  />
                  {form.formState.errors.cpc && (
                    <p className="text-sm text-red-600">{form.formState.errors.cpc.message}</p>
                  )}
                </div>
              </div>

              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={resetToDefaults} data-testid="reset-defaults">
                  <RotateCcw className="h-4 w-4 mr-2" />
                  기본값 복원
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Logging Configuration */}
          <Card>
            <CardHeader>
              <CardTitle>로깅 설정</CardTitle>
              <p className="text-sm text-muted-foreground">
                점수 계산 과정의 로깅 옵션을 설정합니다
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <Label htmlFor="logging-enabled">로깅 활성화</Label>
                  <p className="text-xs text-muted-foreground">
                    점수 계산 엔진의 기본 로깅을 활성화합니다
                  </p>
                </div>
                <Switch
                  id="logging-enabled"
                  checked={loggingEnabled}
                  onCheckedChange={setLoggingEnabled}
                  data-testid="logging-enabled"
                />
              </div>

              <Separator />

              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <Label htmlFor="detailed-logging">상세 로깅</Label>
                  <p className="text-xs text-muted-foreground">
                    더 자세한 디버깅 정보를 포함합니다
                  </p>
                </div>
                <Switch
                  id="detailed-logging"
                  checked={detailedLogging}
                  onCheckedChange={setDetailedLogging}
                  disabled={!loggingEnabled}
                  data-testid="detailed-logging"
                />
              </div>

              <Separator />

              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <Label htmlFor="log-calculations">계산 과정 로깅</Label>
                  <p className="text-xs text-muted-foreground">
                    점수 계산의 각 단계별 결과를 기록합니다
                  </p>
                </div>
                <Switch
                  id="log-calculations"
                  checked={logCalculations}
                  onCheckedChange={setLogCalculations}
                  disabled={!loggingEnabled}
                  data-testid="log-calculations"
                />
              </div>
            </CardContent>
          </Card>

          {/* Config Info */}
          {config && (
            <Card>
              <CardHeader>
                <CardTitle>설정 정보</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                  <div>
                    <Label className="font-medium">버전:</Label>
                    <p className="text-muted-foreground">{config.version}</p>
                  </div>
                  <div>
                    <Label className="font-medium">마지막 수정:</Label>
                    <p className="text-muted-foreground">
                      {new Date(config.metadata.last_modified).toLocaleString('ko-KR')}
                    </p>
                  </div>
                  <div className="md:col-span-2">
                    <Label className="font-medium">설명:</Label>
                    <p className="text-muted-foreground">{config.description}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Save Button */}
          <div className="flex justify-end">
            <Button 
              type="submit" 
              disabled={!isValidSum || updateConfigMutation.isPending}
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