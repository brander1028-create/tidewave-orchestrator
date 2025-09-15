import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import KeywordInput from "@/components/keyword-input";
import SerpProgress from "@/components/serp-progress";
import type { SerpJob } from "@shared/schema";

export default function Dashboard() {
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);
  const [, setLocation] = useLocation();

  // Monitor job status to redirect when completed
  const { data: job } = useQuery<SerpJob>({
    queryKey: ["/api/serp/jobs", currentJobId],
    enabled: !!currentJobId,
    refetchInterval: (query) => {
      // Keep polling while job is running
      return query.state.data?.status === "running" ? 2000 : false;
    },
  });

  // Redirect to keyword-centric results page when job completes
  useEffect(() => {
    if (job?.status === "completed" && currentJobId) {
      setLocation(`/results/${currentJobId}`);
    }
  }, [job?.status, currentJobId, setLocation]);

  const handleAnalysisStarted = (jobId: string) => {
    setCurrentJobId(jobId);
  };

  return (
    <div className="min-h-screen bg-background">
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 pt-16 lg:pt-8">
        {/* Page Title */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-2">SERP 키워드 분석</h1>
          <p className="text-muted-foreground">네이버 블로그 검색 순위를 분석하고 키워드를 발견하세요</p>
        </div>

        {/* Keyword Input Section */}
        <KeywordInput onAnalysisStarted={handleAnalysisStarted} />

        {/* Analysis Progress - only show while running */}
        {currentJobId && (
          <SerpProgress jobId={currentJobId} />
        )}
      </main>
    </div>
  );
}
