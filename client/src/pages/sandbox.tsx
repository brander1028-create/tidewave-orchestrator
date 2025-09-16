import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { 
  ArrowLeft, 
  Play, 
  Pause,
  RotateCcw,
  TestTube,
  Zap,
  TrendingUp,
  Settings,
  AlertTriangle,
  CheckCircle2,
  GitBranch,
  BarChart3
} from "lucide-react";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";

interface TestJob {
  id: string;
  keyword: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  configName: string;
  progress: number;
  startTime?: string;
  endTime?: string;
  results?: {
    totalScore: number;
    keywords: number;
    blogs: number;
    posts: number;
  };
}

interface TestConfig {
  name: string;
  description: string;
  config: any;
}

export default function SandboxPage() {
  const { toast } = useToast();
  
  // State management
  const [testKeyword, setTestKeyword] = useState("코엔자임Q10");
  const [selectedConfig, setSelectedConfig] = useState<string>("");
  const [canaryEnabled, setCanaryEnabled] = useState(false);
  const [canaryRatio, setCanaryRatio] = useState(0.2);
  const [canaryKeywords, setCanaryKeywords] = useState<string[]>([]);
  const [newCanaryKeyword, setNewCanaryKeyword] = useState("");
  
  // Mock test configurations
  const [testConfigs] = useState<TestConfig[]>([
    {
      name: "Current Production",
      description: "현재 운영 중인 설정",
      config: {}
    },
    {
      name: "High Precision",
      description: "높은 정확도 우선 설정",
      config: {
        weights: { volume: 0.4, content: 0.6, adscore: 0.2 },
        phase2: { engine: "hybrid", tiersPerPost: 5 }
      }
    },
    {
      name: "Volume Focused",
      description: "검색량 중심 설정",
      config: {
        weights: { volume: 0.7, content: 0.2, adscore: 0.1 },
        phase2: { engine: "lk", tiersPerPost: 4 }
      }
    }
  ]);

  // Fetch test jobs from backend
  const { data: testJobs = [], isLoading: testJobsLoading, refetch: refetchTestJobs } = useQuery({
    queryKey: ['test-jobs'],
    queryFn: async () => {
      const response = await fetch('/api/serp/test/jobs');
      if (!response.ok) {
        throw new Error('Failed to fetch test jobs');
      }
      const jobs = await response.json();
      
      // Transform backend jobs to UI format
      return jobs.map((job: any) => ({
        id: job.id,
        keyword: job.keywords?.[0] || 'Unknown',
        status: job.status,
        configName: job.results?.configName || 'Unknown Config',
        progress: job.progress || 0,
        startTime: job.createdAt,
        endTime: job.status === 'completed' ? job.updatedAt : undefined,
        results: job.status === 'completed' ? {
          totalScore: Math.random() * 20 + 10, // Mock for now
          keywords: Math.floor(Math.random() * 50 + 20),
          blogs: Math.floor(Math.random() * 10 + 3),
          posts: Math.floor(Math.random() * 30 + 15)
        } : undefined
      }));
    },
    refetchInterval: 3000, // Poll every 3 seconds for updates
  });

  // Fetch current algo config
  const { data: currentConfig } = useQuery({
    queryKey: ['algo-settings'],
    queryFn: async () => {
      const response = await fetch('/api/settings/algo');
      if (!response.ok) {
        throw new Error('Failed to fetch algo config');
      }
      return response.json();
    }
  });

  // Run test mutation
  const runTestMutation = useMutation({
    mutationFn: async ({ keyword, configName }: { keyword: string, configName: string }) => {
      // Mock API call - in real implementation, this would start a SERP job with test config
      const response = await fetch('/api/serp/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyword, configName, testMode: true }),
      });
      if (!response.ok) {
        throw new Error('Failed to start test');
      }
      return response.json();
    },
    onSuccess: (data) => {
      // Invalidate and refetch test jobs to get fresh data from backend
      queryClient.invalidateQueries({ queryKey: ['test-jobs'] });
      refetchTestJobs();
      
      toast({
        title: "테스트 시작됨",
        description: `"${testKeyword}" 키워드로 테스트가 시작되었습니다.`,
      });
    },
    onError: (error) => {
      toast({
        title: "테스트 시작 실패",
        description: "테스트 실행 중 오류가 발생했습니다.",
        variant: "destructive"
      });
    }
  });

  // Toggle canary system
  const toggleCanaryMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      const response = await fetch('/api/settings/algo', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          json: {
            ...currentConfig,
            features: {
              ...currentConfig?.features,
              canary: {
                enabled,
                ratio: canaryRatio,
                keywords: canaryKeywords
              }
            }
          },
          updatedBy: 'admin',
          note: `Canary system ${enabled ? 'enabled' : 'disabled'}`
        }),
      });
      if (!response.ok) {
        throw new Error('Failed to update canary settings');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['algo-settings'] });
      toast({
        title: "Canary 설정 업데이트",
        description: `Canary 시스템이 ${canaryEnabled ? '활성화' : '비활성화'}되었습니다.`,
      });
    }
  });

  const handleRunTest = () => {
    if (!testKeyword.trim() || !selectedConfig) {
      toast({
        title: "입력 확인",
        description: "키워드와 테스트 설정을 선택해주세요.",
        variant: "destructive"
      });
      return;
    }
    
    runTestMutation.mutate({ keyword: testKeyword, configName: selectedConfig });
  };

  const addCanaryKeyword = () => {
    if (newCanaryKeyword.trim() && !canaryKeywords.includes(newCanaryKeyword.trim())) {
      setCanaryKeywords(prev => [...prev, newCanaryKeyword.trim()]);
      setNewCanaryKeyword("");
    }
  };

  const removeCanaryKeyword = (keyword: string) => {
    setCanaryKeywords(prev => prev.filter(k => k !== keyword));
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <Link href="/" className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors">
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <div>
              <h1 className="text-3xl font-bold flex items-center gap-3">
                <TestTube className="h-8 w-8 text-blue-600" />
                알고리즘 샌드박스
              </h1>
              <p className="text-muted-foreground mt-1">
                안전한 환경에서 설정을 테스트하고 A/B 테스트를 실행하세요
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <Badge variant={canaryEnabled ? "default" : "secondary"} className="px-3 py-1">
              <GitBranch className="h-3 w-3 mr-1" />
              Canary {canaryEnabled ? "ON" : "OFF"}
            </Badge>
          </div>
        </div>

        <Tabs defaultValue="testing" className="space-y-6">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="testing" className="flex items-center gap-2">
              <Play className="h-4 w-4" />
              알고리즘 테스트
            </TabsTrigger>
            <TabsTrigger value="canary" className="flex items-center gap-2">
              <GitBranch className="h-4 w-4" />
              Canary 시스템
            </TabsTrigger>
            <TabsTrigger value="results" className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              결과 비교
            </TabsTrigger>
          </TabsList>

          {/* Algorithm Testing Tab */}
          <TabsContent value="testing" className="space-y-6">
            <div className="grid gap-6 md:grid-cols-2">
              {/* Test Configuration */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Settings className="h-5 w-5" />
                    테스트 설정
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="test-keyword">테스트 키워드</Label>
                    <Input
                      id="test-keyword"
                      value={testKeyword}
                      onChange={(e) => setTestKeyword(e.target.value)}
                      placeholder="키워드를 입력하세요"
                      data-testid="input-test-keyword"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label>테스트 설정 선택</Label>
                    <div className="space-y-2">
                      {testConfigs.map((config, index) => (
                        <div key={index} className="flex items-center space-x-2">
                          <input
                            type="radio"
                            id={`config-${index}`}
                            name="testConfig"
                            value={config.name}
                            checked={selectedConfig === config.name}
                            onChange={(e) => setSelectedConfig(e.target.value)}
                            className="w-4 h-4"
                            data-testid={`radio-config-${index}`}
                          />
                          <div className="flex-1">
                            <Label htmlFor={`config-${index}`} className="font-medium">
                              {config.name}
                            </Label>
                            <p className="text-sm text-muted-foreground">
                              {config.description}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  
                  <Button 
                    onClick={handleRunTest}
                    disabled={runTestMutation.isPending}
                    className="w-full"
                    data-testid="button-run-test"
                  >
                    {runTestMutation.isPending ? (
                      <div className="flex items-center gap-2">
                        <div className="animate-spin rounded-full h-4 w-4 border-b border-white"></div>
                        테스트 실행 중...
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <Play className="h-4 w-4" />
                        테스트 실행
                      </div>
                    )}
                  </Button>
                </CardContent>
              </Card>

              {/* Test Status */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <TrendingUp className="h-5 w-5" />
                    실행 중인 테스트
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {testJobsLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
                      <span className="ml-2 text-sm text-muted-foreground">테스트 작업 로딩 중...</span>
                    </div>
                  ) : testJobs.filter((job: TestJob) => job.status === 'running').length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <TestTube className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p>실행 중인 테스트가 없습니다</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {testJobs.filter((job: TestJob) => job.status === 'running').map((job: TestJob) => (
                        <div key={job.id} className="p-3 border rounded-lg">
                          <div className="flex items-center justify-between mb-2">
                            <div>
                              <p className="font-medium">{job.keyword}</p>
                              <p className="text-sm text-muted-foreground">{job.configName}</p>
                            </div>
                            <Badge variant="outline">
                              {job.progress}%
                            </Badge>
                          </div>
                          <Progress value={job.progress} className="w-full" />
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Canary System Tab */}
          <TabsContent value="canary" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <GitBranch className="h-5 w-5" />
                  Canary 배포 시스템
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  새로운 알고리즘 설정을 일부 트래픽에만 적용하여 안전하게 테스트하세요
                </p>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Canary Enable/Disable */}
                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div>
                    <h4 className="font-medium">Canary 시스템 활성화</h4>
                    <p className="text-sm text-muted-foreground">
                      새로운 설정을 일부 요청에만 적용합니다
                    </p>
                  </div>
                  <Switch
                    checked={canaryEnabled}
                    onCheckedChange={(checked) => {
                      setCanaryEnabled(checked);
                      toggleCanaryMutation.mutate(checked);
                    }}
                    data-testid="switch-canary-enabled"
                  />
                </div>

                {canaryEnabled && (
                  <>
                    {/* Canary Ratio */}
                    <div className="space-y-2">
                      <Label htmlFor="canary-ratio">
                        Canary 비율: {Math.round(canaryRatio * 100)}%
                      </Label>
                      <input
                        type="range"
                        id="canary-ratio"
                        min="0.01"
                        max="1"
                        step="0.01"
                        value={canaryRatio}
                        onChange={(e) => setCanaryRatio(parseFloat(e.target.value))}
                        className="w-full"
                        data-testid="range-canary-ratio"
                      />
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>1%</span>
                        <span>50%</span>
                        <span>100%</span>
                      </div>
                    </div>

                    {/* Canary Keywords */}
                    <div className="space-y-2">
                      <Label>특정 키워드에만 Canary 적용</Label>
                      <div className="flex gap-2">
                        <Input
                          value={newCanaryKeyword}
                          onChange={(e) => setNewCanaryKeyword(e.target.value)}
                          placeholder="키워드 입력"
                          onKeyPress={(e) => e.key === 'Enter' && addCanaryKeyword()}
                          data-testid="input-canary-keyword"
                        />
                        <Button onClick={addCanaryKeyword} variant="outline" data-testid="button-add-canary-keyword">
                          추가
                        </Button>
                      </div>
                      <div className="flex flex-wrap gap-2 mt-2">
                        {canaryKeywords.map((keyword, index) => (
                          <Badge key={index} variant="secondary" className="cursor-pointer" onClick={() => removeCanaryKeyword(keyword)}>
                            {keyword} ×
                          </Badge>
                        ))}
                      </div>
                      {canaryKeywords.length === 0 && (
                        <p className="text-sm text-muted-foreground">
                          키워드를 지정하지 않으면 모든 요청에 비율 적용
                        </p>
                      )}
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Results Comparison Tab */}
          <TabsContent value="results" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5" />
                  테스트 결과 비교
                </CardTitle>
              </CardHeader>
              <CardContent>
                {testJobs.filter((job: TestJob) => job.status === 'completed').length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <BarChart3 className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p className="text-lg font-medium mb-2">아직 완료된 테스트가 없습니다</p>
                    <p>알고리즘 테스트 탭에서 테스트를 실행해보세요</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {testJobs.filter((job: TestJob) => job.status === 'completed').map((job: TestJob) => (
                      <div key={job.id} className="p-4 border rounded-lg">
                        <div className="flex items-center justify-between mb-3">
                          <div>
                            <h4 className="font-medium">{job.keyword}</h4>
                            <p className="text-sm text-muted-foreground">
                              {job.configName} • {job.startTime && new Date(job.startTime).toLocaleString('ko-KR')}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <CheckCircle2 className="h-4 w-4 text-green-600" />
                            <span className="text-sm text-green-600 font-medium">완료</span>
                          </div>
                        </div>
                        
                        {job.results && (
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                            <div className="p-2 bg-gray-50 dark:bg-gray-800 rounded">
                              <p className="text-2xl font-bold text-blue-600">{job.results.totalScore}</p>
                              <p className="text-xs text-muted-foreground">총 점수</p>
                            </div>
                            <div className="p-2 bg-gray-50 dark:bg-gray-800 rounded">
                              <p className="text-2xl font-bold text-green-600">{job.results.keywords}</p>
                              <p className="text-xs text-muted-foreground">키워드 수</p>
                            </div>
                            <div className="p-2 bg-gray-50 dark:bg-gray-800 rounded">
                              <p className="text-2xl font-bold text-purple-600">{job.results.blogs}</p>
                              <p className="text-xs text-muted-foreground">블로그 수</p>
                            </div>
                            <div className="p-2 bg-gray-50 dark:bg-gray-800 rounded">
                              <p className="text-2xl font-bold text-orange-600">{job.results.posts}</p>
                              <p className="text-xs text-muted-foreground">포스트 수</p>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}