import { useParams, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft, Clock, Download } from "lucide-react";
import KeywordSummaryCard, { type KeywordSummaryData } from "@/components/keyword-summary-card";
import type { SerpJob, SerpResultsData } from "../../../shared/schema";

export default function ResultsPage() {
  const { jobId } = useParams<{ jobId: string }>();

  // Get job status to show basic info
  const { data: job } = useQuery<SerpJob>({
    queryKey: ["/api/serp/jobs", jobId],
    enabled: !!jobId,
  });

  // Get analysis results
  const { data: results, isLoading, error } = useQuery<SerpResultsData>({
    queryKey: ["/api/serp/jobs", jobId, "results"],
    enabled: !!jobId,
  });

  if (isLoading || !jobId) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center gap-4 mb-6">
            <Link href="/">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="h-4 w-4 mr-2" />
                대시보드로
              </Button>
            </Link>
          </div>
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-4"></div>
              <p className="text-gray-600 dark:text-gray-400">결과를 불러오는 중...</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error || !results || !job) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center gap-4 mb-6">
            <Link href="/">
              <Button variant="ghost" size="sm" data-testid="back-to-dashboard">
                <ArrowLeft className="h-4 w-4 mr-2" />
                대시보드로
              </Button>
            </Link>
          </div>
          <Card>
            <CardContent className="pt-6">
              <p className="text-destructive">결과를 불러올 수 없습니다.</p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const handleExportCSV = async () => {
    try {
      const response = await fetch(`/api/serp/jobs/${jobId}/export`, {
        method: "GET",
      });
      
      if (!response.ok) {
        throw new Error("Export failed");
      }
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.style.display = "none";
      a.href = url;
      a.download = `serp-analysis-${jobId}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Export error:", error);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <Link href="/">
              <Button variant="ghost" size="sm" data-testid="back-to-dashboard">
                <ArrowLeft className="h-4 w-4 mr-2" />
                대시보드로
              </Button>
            </Link>
            <Link href="/history">
              <Button variant="outline" size="sm" data-testid="history-button">
                <Clock className="h-4 w-4 mr-2" />
                히스토리
              </Button>
            </Link>
          </div>
          
          <div className="flex items-center gap-2">
            <Button 
              variant="outline" 
              size="sm"
              onClick={handleExportCSV}
              data-testid="export-csv-button"
            >
              <Download className="h-4 w-4 mr-2" />
              CSV 내보내기
            </Button>
          </div>
        </div>

        {/* Job Info Header */}
        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold mb-2" data-testid="job-title">
                  검색값 보고서 ({job.keywords?.join(", ") || "Unknown Keywords"})
                </h1>
                <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                  <span data-testid="job-status">상태: {job.status === "completed" ? "완료" : "진행 중"}</span>
                  <span data-testid="job-date">
                    분석 날짜: {job.createdAt ? new Date(job.createdAt).toLocaleString("ko-KR") : "Unknown"}
                  </span>
                  {results.counters && (
                    <>
                      <span data-testid="total-blogs">
                        전체 블로그: {results.counters.discovered_blogs || results.counters.blogs || 0}개
                      </span>
                      <span data-testid="hit-blogs">
                        Phase2 노출: {results.counters.hit_blogs || 0}개
                      </span>
                      <span data-testid="unique-keywords">
                        분석 키워드: {results.counters.searched_keywords || 0}개
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Main Content: Keyword Summary Cards */}
        <div className="mb-6">
          <h2 className="text-xl font-semibold mb-4" data-testid="keyword-cards-title">
            키워드별 요약 분석
          </h2>
          
          {/* Render keyword summary cards */}
          <div className="space-y-4" data-testid="keyword-summary-list">
            {results.summaryByKeyword && results.summaryByKeyword.length > 0 ? (
              results.summaryByKeyword
                .sort((a, b) => {
                  // Sort by Phase2 exposure ratio descending, then by new blogs count descending
                  const ratioA = a.newBlogs > 0 ? a.phase2ExposedNew / a.newBlogs : 0;
                  const ratioB = b.newBlogs > 0 ? b.phase2ExposedNew / b.newBlogs : 0;
                  
                  if (ratioA !== ratioB) {
                    return ratioB - ratioA;  // Higher ratio first
                  }
                  
                  return b.newBlogs - a.newBlogs;  // More new blogs first if same ratio
                })
                .map((keywordData: KeywordSummaryData) => (
                  <KeywordSummaryCard
                    key={keywordData.keyword}
                    data={keywordData}
                  />
                ))
            ) : (
              <Card>
                <CardContent className="pt-6">
                  <p className="text-center text-gray-600 dark:text-gray-400" data-testid="no-keywords-message">
                    키워드 분석 데이터가 없습니다.
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="text-center text-sm text-muted-foreground py-8">
          <p>© 2024 SERP 분석 도구. 검색 결과 순위 및 키워드 분석을 통한 SEO 최적화를 지원합니다.</p>
        </div>
      </div>
    </div>
  );
}