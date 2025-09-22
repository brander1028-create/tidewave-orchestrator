import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Search, RefreshCw, TrendingUp, AlertCircle, StopCircle } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { SerpJob } from "@shared/schema";

interface SerpProgressProps {
  jobId: string;
}

const stepConfig = [
  {
    key: "discovering_blogs",
    label: "블로그 발견",
    description: "키워드별 상위 블로그 검색 중",
    icon: Search,
  },
  {
    key: "analyzing_posts", 
    label: "포스트 분석",
    description: "각 블로그의 최근 포스트 수집 및 키워드 추출",
    icon: RefreshCw,
  },
  {
    key: "checking_rankings",
    label: "순위 확인", 
    description: "추출된 키워드들의 네이버 검색 순위 체크",
    icon: TrendingUp,
  },
];

export default function SerpProgress({ jobId }: SerpProgressProps) {
  const { data: job, isLoading } = useQuery<SerpJob>({
    queryKey: ["/api/serp/jobs", jobId],
    refetchInterval: (query) => {
      // Only refetch when job is running
      const status = query.state.data?.status;
      return status === "running" ? 2000 : false;
    },
  });

  const cancelMutation = useMutation({
    mutationFn: () => apiRequest(`/api/serp/jobs/${jobId}/cancel`, "POST"),
    onSuccess: () => {
      // Invalidate job query to refresh status
      queryClient.invalidateQueries({ queryKey: ["/api/serp/jobs", jobId] });
    },
  });

  if (isLoading || !job) {
    return (
      <Card className="mb-8 shadow-sm">
        <CardContent className="pt-6">
          <div className="animate-pulse space-y-4">
            <div className="h-4 bg-muted rounded w-1/4"></div>
            <div className="space-y-3">
              <div className="h-12 bg-muted rounded"></div>
              <div className="h-12 bg-muted rounded"></div>
              <div className="h-12 bg-muted rounded"></div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const isRunning = job.status === "running";
  const isFailed = job.status === "failed";

  return (
    <Card className="mb-8 shadow-sm">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>분석 진행 상황</CardTitle>
          <div className="flex items-center space-x-3">
            <div className="flex items-center space-x-2 text-sm text-muted-foreground">
              {isRunning && (
                <>
                  <div className="w-2 h-2 bg-primary rounded-full animate-pulse"></div>
                  <span>실시간 분석 중</span>
                </>
              )}
              {isFailed && (
                <>
                  <AlertCircle className="w-4 h-4 text-destructive" />
                  <span className="text-destructive">분석 실패</span>
                </>
              )}
              {job.status === "cancelled" && (
                <>
                  <StopCircle className="w-4 h-4 text-orange-500" />
                  <span className="text-orange-600">분석 중단됨</span>
                </>
              )}
              {job.status === "completed" && (
                <>
                  <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                  <span className="text-green-600">분석 완료</span>
                </>
              )}
            </div>
            {/* 정지 버튼 */}
            {isRunning && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => cancelMutation.mutate()}
                disabled={cancelMutation.isPending}
                className="text-destructive hover:text-destructive hover:bg-destructive/10"
                data-testid="button-cancel-analysis"
              >
                <StopCircle className="w-4 h-4 mr-1" />
                {cancelMutation.isPending ? "중단 중..." : "분석 중단"}
              </Button>
            )}
          </div>
        </div>
        <div className="text-sm text-muted-foreground">
          키워드 {job.keywords.length}개 • 순위 범위 {job.minRank}-{job.maxRank}위
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {stepConfig.map((step, index) => {
            const isCompleted = (job.completedSteps || 0) > index;
            const isCurrent = job.currentStep === step.key;
            const IconComponent = step.icon;

            return (
              <div 
                key={step.key}
                className="flex items-start justify-between"
                data-testid={`progress-step-${step.key}`}
              >
                <div className="flex items-start space-x-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                    isCompleted 
                      ? "bg-primary text-primary-foreground" 
                      : isCurrent
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground"
                  }`}>
                    <IconComponent className={`w-4 h-4 ${isCurrent && isRunning ? "animate-spin" : ""}`} />
                  </div>
                  <div className="flex-1">
                    <div className={`text-sm font-medium ${
                      isCompleted || isCurrent ? "text-foreground" : "text-muted-foreground"
                    }`}>
                      {step.label}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {step.description}
                    </div>
                    {/* 상세한 현재 작업 내용 표시 */}
                    {isCurrent && job.currentStepDetail && (
                      <div className="text-xs text-blue-600 dark:text-blue-400 mt-2 p-2 bg-blue-50 dark:bg-blue-900/20 rounded">
                        <div className="flex items-center space-x-1">
                          <div className="w-1.5 h-1.5 bg-blue-600 dark:bg-blue-400 rounded-full animate-pulse"></div>
                          <span className="font-medium">실시간:</span>
                          <span>{job.currentStepDetail}</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                <span className="text-sm text-muted-foreground">
                  {isCompleted && "완료"}
                  {isCurrent && isRunning && "진행 중"}
                  {!isCompleted && !isCurrent && "대기 중"}
                </span>
              </div>
            );
          })}
        </div>
        
        <div className="mt-6">
          <div className="flex items-center justify-between text-sm mb-2">
            <span className="text-muted-foreground">전체 진행률</span>
            <span className="font-medium">{job.progress}%</span>
          </div>
          <Progress value={job.progress || 0} className="h-2" />
        </div>

        {job.errorMessage && (
          <div className="mt-4 p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
            <p className="text-sm text-destructive">
              <AlertCircle className="w-4 h-4 inline mr-2" />
              {job.errorMessage}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}