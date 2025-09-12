import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Check, RefreshCw, Search, AlertCircle } from "lucide-react";
import type { AnalysisJob } from "@shared/schema";

interface AnalysisProgressProps {
  jobId: string;
}

const stepConfig = [
  {
    key: "collecting_posts",
    label: "블로그 포스트 수집",
    icon: Check,
  },
  {
    key: "extracting_keywords", 
    label: "키워드 추출 및 분석",
    icon: RefreshCw,
  },
  {
    key: "checking_rankings",
    label: "검색 순위 확인", 
    icon: Search,
  },
];

export default function AnalysisProgress({ jobId }: AnalysisProgressProps) {
  const { data: job, isLoading } = useQuery<AnalysisJob>({
    queryKey: ["/api/jobs", jobId],
    refetchInterval: job => {
      // Stop refetching when completed or failed
      return job?.status === "running" ? 2000 : false;
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
            {job.status === "completed" && (
              <>
                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                <span className="text-green-600">분석 완료</span>
              </>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {stepConfig.map((step, index) => {
            const isCompleted = job.completedSteps > index;
            const isCurrent = job.currentStep === step.key;
            const IconComponent = step.icon;

            return (
              <div 
                key={step.key}
                className="flex items-center justify-between"
                data-testid={`progress-step-${step.key}`}
              >
                <div className="flex items-center space-x-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                    isCompleted 
                      ? "bg-primary text-primary-foreground" 
                      : isCurrent
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground"
                  }`}>
                    <IconComponent className={`w-4 h-4 ${isCurrent && isRunning ? "animate-spin" : ""}`} />
                  </div>
                  <span className={`text-sm font-medium ${
                    isCompleted || isCurrent ? "text-foreground" : "text-muted-foreground"
                  }`}>
                    {step.label}
                  </span>
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
        
        <div className="mt-4">
          <div className="flex items-center justify-between text-sm mb-2">
            <span className="text-muted-foreground">전체 진행률</span>
            <span className="font-medium">{job.progress}%</span>
          </div>
          <Progress value={job.progress} className="h-2" />
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
