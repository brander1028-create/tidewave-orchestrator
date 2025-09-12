import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ExternalLink, Download, TrendingUp, AlertTriangle } from "lucide-react";
import type { SerpJob, DiscoveredBlog, ExtractedKeyword } from "@shared/schema";

interface SerpResultsProps {
  jobId: string;
}

interface BlogResult {
  blog: DiscoveredBlog;
  posts: any[];
  topKeywords: ExtractedKeyword[];
}

interface SerpResultsData {
  job: SerpJob;
  results: BlogResult[];
  meta?: {
    isComplete: boolean;
    discoveredBlogsCount: number;
    totalPostsCount: number;
    totalKeywordsCount: number;
    isRealSearch: boolean;
  };
}

export default function SerpResults({ jobId }: SerpResultsProps) {
  // Get job status to know when to stop refetching
  const { data: jobStatus } = useQuery<SerpJob>({
    queryKey: ["/api/serp/jobs", jobId],
    enabled: !!jobId,
    refetchInterval: 2000, // Poll every 2 seconds
  });

  const isJobRunning = jobStatus?.status === 'running' || jobStatus?.status === 'pending';
  
  const { data, isLoading, refetch } = useQuery<SerpResultsData>({
    queryKey: ["/api/serp/jobs", jobId, "results"],
    enabled: !!jobId,
    refetchInterval: isJobRunning ? 2000 : false, // Only refetch while job is running
    retry: 3, // Retry failed requests
    retryDelay: 1000,
  });

  const handleExportCSV = () => {
    const link = document.createElement('a');
    link.href = `/api/serp/jobs/${jobId}/export/csv`;
    link.download = 'serp-analysis.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (isLoading) {
    return (
      <Card className="shadow-sm">
        <CardContent className="pt-6">
          <div className="animate-pulse space-y-4">
            <div className="h-4 bg-muted rounded w-1/4"></div>
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="p-4 border rounded-lg space-y-3">
                  <div className="h-4 bg-muted rounded w-1/3"></div>
                  <div className="h-3 bg-muted rounded w-1/2"></div>
                  <div className="flex gap-2">
                    <div className="h-6 bg-muted rounded w-16"></div>
                    <div className="h-6 bg-muted rounded w-16"></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!data) return null;

  const { job, results } = data;
  const blogsWithKeywords = results.filter(r => r.topKeywords.length > 0);
  const blogsWithoutKeywords = results.filter(r => r.topKeywords.length === 0);

  // Show collecting state if job is running and no results yet
  if (isJobRunning && results.length === 0) {
    return (
      <Card className="shadow-sm">
        <CardContent className="pt-6">
          <div className="flex items-center justify-center py-8">
            <div className="text-center space-y-4">
              <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full mx-auto"></div>
              <div className="text-lg font-medium">블로그 데이터 수집 중...</div>
              <p className="text-muted-foreground">
                실제 네이버 검색 결과에서 블로그들을 분석하고 있습니다. (가짜 데이터 사용 안함)
              </p>
              {data?.meta && (
                <div className="text-sm text-muted-foreground">
                  현재까지: {data.meta.discoveredBlogsCount}개 블로그, {data.meta.totalPostsCount}개 포스트 발견
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="shadow-sm">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>분석 결과</CardTitle>
            <div className="text-sm text-muted-foreground mt-1">
              총 {results.length}개 블로그 발견 • {blogsWithKeywords.length}개 블로그에서 상위 키워드 노출
              {data?.meta?.isRealSearch && (
                <div className="text-xs text-green-600 font-medium mt-1">
                  ✓ 실제 네이버 검색 결과 사용 (가짜 데이터 없음)
                </div>
              )}
            </div>
          </div>
          <Button 
            variant="outline" 
            onClick={handleExportCSV}
            data-testid="button-export-csv"
          >
            <Download className="h-4 w-4 mr-2" />
            CSV 내보내기
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {results.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <TrendingUp className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <h3 className="text-lg font-medium mb-2">분석 결과가 없습니다</h3>
            <p>지정한 키워드와 순위 범위에서 블로그를 찾을 수 없습니다.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* 키워드 노출 블로그들 */}
            {blogsWithKeywords.length > 0 && (
              <div>
                <h3 className="text-lg font-medium mb-4 flex items-center">
                  <TrendingUp className="w-5 h-5 mr-2 text-chart-1" />
                  키워드 노출 블로그 ({blogsWithKeywords.length}개)
                </h3>
                <div className="space-y-4">
                  {blogsWithKeywords.map((result, index) => (
                    <div
                      key={result.blog.id}
                      className="p-4 border border-border rounded-lg hover:bg-muted/50 transition-colors"
                      data-testid={`blog-result-${index}`}
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1">
                          <h4 className="font-medium text-foreground">
                            {result.blog.blogName}
                          </h4>
                          <p className="text-sm text-muted-foreground">
                            "{result.blog.seedKeyword}" 검색 시 {result.blog.rank}위
                          </p>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => window.open(result.blog.blogUrl, '_blank')}
                          data-testid={`button-visit-blog-${index}`}
                        >
                          <ExternalLink className="h-4 w-4" />
                        </Button>
                      </div>
                      
                      <div className="space-y-2">
                        <div className="text-sm font-medium text-foreground">
                          노출된 키워드들:
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {result.topKeywords.map((keyword, keywordIndex) => {
                            const tierNum = keywordIndex + 1;
                            const tierClass = 
                              keywordIndex === 0 ? "bg-blue-100 text-blue-800 border-blue-200" :
                              keywordIndex === 1 ? "bg-green-100 text-green-800 border-green-200" : 
                              "bg-orange-100 text-orange-800 border-orange-200";
                            
                            return (
                              <Badge
                                key={keyword.id}
                                className={`flex items-center gap-2 ${tierClass} font-medium`}
                                data-testid={`keyword-${result.blog.id}-${keywordIndex}`}
                              >
                                <span className="font-bold">TIER{tierNum}</span>
                                <span>{keyword.keyword}</span>
                                <span className="text-xs font-normal">
                                  ({keyword.searchVolume ? keyword.searchVolume.toLocaleString() : '0'})
                                </span>
                                {keyword.serpRank && (
                                  <span className="text-xs font-normal">
                                    • {keyword.serpRank}위
                                  </span>
                                )}
                              </Badge>
                            );
                          })}
                        </div>
                      </div>

                      <div className="text-xs text-muted-foreground mt-2">
                        {result.posts.length}개 포스트 분석 완료
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 키워드 노출 없는 블로그들 */}
            {blogsWithoutKeywords.length > 0 && (
              <div>
                <h3 className="text-lg font-medium mb-4 flex items-center">
                  <AlertTriangle className="w-5 h-5 mr-2 text-muted-foreground" />
                  추가 키워드 노출 없음 ({blogsWithoutKeywords.length}개)
                </h3>
                <div className="space-y-2">
                  {blogsWithoutKeywords.map((result, index) => (
                    <div
                      key={result.blog.id}
                      className="p-3 border border-border rounded-lg bg-muted/20"
                      data-testid={`blog-no-keywords-${index}`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <span className="font-medium text-foreground">
                            {result.blog.blogName}
                          </span>
                          <span className="text-sm text-muted-foreground ml-2">
                            ("{result.blog.seedKeyword}" {result.blog.rank}위)
                          </span>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => window.open(result.blog.blogUrl, '_blank')}
                        >
                          <ExternalLink className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}