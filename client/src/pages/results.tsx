import { useParams, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Clock, Download, ChevronDown, ChevronUp, ExternalLink } from "lucide-react";
import { useState } from "react";
import type { SerpJob, SerpResultsData } from "../../../shared/schema";

// Format functions as specified in the requirements
const fmtVol = (v: number | null) => v === null ? "–" : v.toLocaleString();
const fmtRank = (r: number | null) => r === null ? "미확인" : (r <= 10 ? `모바일 1p #${r}` : "미노출");

// Color coding for volumes, scores, and rankings
const getVolumeColor = (volume: number | null) => {
  if (volume === null) return "bg-gray-100 text-gray-600";
  if (volume >= 10000) return "bg-emerald-100 text-emerald-800 font-medium";
  if (volume >= 1000) return "bg-blue-100 text-blue-800";
  return "bg-yellow-100 text-yellow-800";
};

const getScoreColor = (score: number) => {
  if (score >= 80) return "bg-emerald-100 text-emerald-800 font-medium";
  if (score >= 60) return "bg-blue-100 text-blue-800";
  if (score >= 40) return "bg-yellow-100 text-yellow-800";
  return "bg-red-100 text-red-800";
};

const getRankColor = (rank: number | null) => {
  if (rank === null) return "bg-gray-100 text-gray-600";
  if (rank <= 3) return "bg-emerald-100 text-emerald-800 font-medium";
  if (rank <= 10) return "bg-blue-100 text-blue-800";
  return "bg-red-100 text-red-800";
};

export default function ResultsPage() {
  const { jobId } = useParams<{ jobId: string }>();
  const [expandedKeywords, setExpandedKeywords] = useState<Set<string>>(new Set());
  const [expandedBlogs, setExpandedBlogs] = useState<Set<string>>(new Set());

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
        {/* Header with keyword chips as specified */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-4">
              <Link href="/">
                <Button variant="ghost" size="sm" data-testid="back-to-dashboard">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  대시보드로
                </Button>
              </Link>
            </div>
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
          
          {/* Keyword chips header as specified */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CardTitle className="text-xl font-bold">검색값 보고서</CardTitle>
                </div>
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <span data-testid="job-status">상태: {job.status === "completed" ? "완료" : "진행 중"}</span>
                  <span data-testid="job-date">
                    {job.createdAt ? new Date(job.createdAt).toLocaleString("ko-KR") : "Unknown"}
                  </span>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 mt-3">
                {job.keywords?.map((keyword) => (
                  <Badge key={keyword} variant="secondary" className="text-sm px-3 py-1">
                    {keyword}
                  </Badge>
                ))}
              </div>
            </CardHeader>
          </Card>
        </div>

        {/* Keyword Summary Cards - New Design as Specified */}
        <div className="space-y-4" data-testid="keyword-summary-list">
          {results.summaryByKeyword && results.summaryByKeyword.length > 0 ? (
            results.summaryByKeyword
              .sort((a: any, b: any) => 
                (b.phase2ExposedNew / b.newBlogs || 0) - (a.phase2ExposedNew / a.newBlogs || 0)
                || (b.newBlogs - a.newBlogs)
              )
              .map((keywordData: any) => {
                const isExpanded = expandedKeywords.has(keywordData.keyword);
                
                return (
                  <Card key={keywordData.keyword} className="border-2">
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <h3 className="text-lg font-semibold">{keywordData.keyword}</h3>
                          <Badge className={getVolumeColor(keywordData.searchVolume)}>
                            검색량 {fmtVol(keywordData.searchVolume)}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button variant="outline" size="sm" onClick={() => {
                            if (isExpanded) {
                              setExpandedKeywords(prev => {
                                const newSet = new Set(prev);
                                newSet.delete(keywordData.keyword);
                                return newSet;
                              });
                            } else {
                              setExpandedKeywords(prev => new Set(prev).add(keywordData.keyword));
                            }
                          }}>
                            {isExpanded ? <ChevronUp className="h-4 w-4 mr-1" /> : <ChevronDown className="h-4 w-4 mr-1" />}
                            {isExpanded ? "접기" : "자세히"}
                          </Button>
                          <Link href={`/blog-database?keyword=${encodeURIComponent(keywordData.keyword)}`}>
                            <Button variant="secondary" size="sm" data-testid={`navigate-blog-db-${keywordData.keyword}`}>
                              블로그DB 이동
                            </Button>
                          </Link>
                        </div>
                      </div>
                      <div className="flex items-center gap-4 text-sm">
                        <Badge variant="outline" className="bg-blue-50">
                          NEW {keywordData.newBlogs}/{keywordData.totalBlogs}
                        </Badge>
                        <Badge variant="outline" className="bg-emerald-50">
                          Phase2(신규) {keywordData.phase2ExposedNew}/{keywordData.newBlogs}
                        </Badge>
                      </div>
                    </CardHeader>
                    
                    {isExpanded && (
                      <CardContent>
                        {/* Blog List Table */}
                        <div className="mb-6">
                          <h4 className="text-md font-medium mb-3">블로그 리스트 (신규만)</h4>
                          <div className="border rounded-lg overflow-hidden">
                            <table className="w-full">
                              <thead className="bg-gray-50">
                                <tr>
                                  <th className="px-4 py-2 text-left">블로그명</th>
                                  <th className="px-4 py-2 text-left">총 노출 수</th>
                                  <th className="px-4 py-2 text-left">총합 점수</th>
                                  <th className="px-4 py-2 text-left">상태</th>
                                  <th className="px-4 py-2 text-left">액션</th>
                                </tr>
                              </thead>
                              <tbody>
                                {keywordData.items.filter((blog: any) => blog.isNew).map((blog: any, idx: number) => {
                                  const blogKey = `${keywordData.keyword}-${idx}`;
                                  const isBlogExpanded = expandedBlogs.has(blogKey);
                                  
                                  // Calculate totals as specified
                                  const totalExposed = blog.topKeywords.filter((k: any) => k.rank !== null && k.rank <= 10).length;
                                  const totalScore = blog.topKeywords
                                    .filter((k: any) => k.rank !== null && k.rank <= 10)
                                    .reduce((sum: number, k: any) => sum + k.score, 0);
                                  
                                  return (
                                    <>
                                      <tr key={idx} className="border-t hover:bg-gray-50">
                                        <td className="px-4 py-2">
                                          <div className="flex items-center gap-2">
                                            <a 
                                              href={blog.blogUrl} 
                                              target="_blank" 
                                              rel="noopener noreferrer"
                                              className="font-medium hover:text-blue-600"
                                            >
                                              {blog.blogName}
                                              <ExternalLink className="inline h-3 w-3 ml-1" />
                                            </a>
                                            <button
                                              onClick={() => {
                                                if (isBlogExpanded) {
                                                  setExpandedBlogs(prev => {
                                                    const newSet = new Set(prev);
                                                    newSet.delete(blogKey);
                                                    return newSet;
                                                  });
                                                } else {
                                                  setExpandedBlogs(prev => new Set(prev).add(blogKey));
                                                }
                                              }}
                                              className="text-gray-500 hover:text-gray-700"
                                            >
                                              {isBlogExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                                            </button>
                                          </div>
                                        </td>
                                        <td className="px-4 py-2">
                                          <Badge className={totalExposed > 0 ? "bg-emerald-100 text-emerald-800" : "bg-gray-100 text-gray-600"}>
                                            {totalExposed}개
                                          </Badge>
                                        </td>
                                        <td className="px-4 py-2">
                                          <Badge className={getScoreColor(totalScore)}>
                                            {Math.round(totalScore)}pts
                                          </Badge>
                                        </td>
                                        <td className="px-4 py-2">
                                          <Badge variant="outline">수집됨</Badge>
                                        </td>
                                        <td className="px-4 py-2">
                                          <div className="flex gap-1">
                                            <Button size="sm" variant="outline">수집됨</Button>
                                            <Button size="sm" variant="outline">블랙</Button>
                                            <Button size="sm" variant="outline">섭외</Button>
                                          </div>
                                        </td>
                                      </tr>
                                      
                                      {isBlogExpanded && (
                                        <tr>
                                          <td colSpan={5} className="px-4 py-4 bg-gray-50">
                                            <div className="space-y-4">
                                              {/* A. 블로그 통합 Top 키워드 */}
                                              <div>
                                                <h5 className="font-medium mb-2">블로그 총 Top 키워드(통합)</h5>
                                                <div className="flex flex-wrap gap-2">
                                                  {blog.topKeywords.slice(0, 10).map((keyword: any, kidx: number) => (
                                                    <div key={kidx} className="inline-flex items-center gap-1">
                                                      <Badge variant="outline" className={`${getVolumeColor(keyword.volume)} border`}>
                                                        {keyword.text}
                                                        {!keyword.related && " [관련X]"}
                                                        · {fmtVol(keyword.volume)}
                                                        · {keyword.score}pts
                                                      </Badge>
                                                      <Badge className={getRankColor(keyword.rank)}>
                                                        {fmtRank(keyword.rank)}
                                                      </Badge>
                                                    </div>
                                                  ))}
                                                  {blog.topKeywords.length > 10 && (
                                                    <Button size="sm" variant="ghost">더보기</Button>
                                                  )}
                                                </div>
                                              </div>
                                              
                                              {/* B. 포스트별 1-4티어 */}
                                              <div>
                                                <h5 className="font-medium mb-2">포스트별 1-4티어</h5>
                                                <div className="space-y-2">
                                                  {blog.titlesSample.map((title: string, pidx: number) => {
                                                    // Group keywords by tier based on search volume
                                                    const getKeywordTier = (volume: number | null) => {
                                                      if (volume === null) return 4;
                                                      if (volume >= 10000) return 1;
                                                      if (volume >= 1000) return 2;
                                                      if (volume >= 100) return 3;
                                                      return 4;
                                                    };
                                                    
                                                    // Use different keyword slices per post to create unique per-post data
                                                    const startIdx = (pidx * 3) % blog.topKeywords.length;
                                                    const postKeywords = blog.topKeywords.slice(startIdx, startIdx + 6);
                                                    
                                                    const tierKeywords = {1: [], 2: [], 3: [], 4: []};
                                                    postKeywords.forEach((kw: any) => {
                                                      const tier = getKeywordTier(kw.volume);
                                                      tierKeywords[tier].push(kw);
                                                    });
                                                    
                                                    return (
                                                      <Card key={pidx} className="p-3">
                                                        <h6 className="font-medium text-sm mb-2" data-testid={`post-title-${pidx}`}>{title}</h6>
                                                        <div className="text-xs space-y-1">
                                                          {[1, 2, 3, 4].map(tier => {
                                                            const keywords = tierKeywords[tier];
                                                            if (keywords.length === 0) return null;
                                                            
                                                            return (
                                                              <div key={tier} className="flex items-center gap-2">
                                                                <span className="font-medium min-w-12">{tier}티어:</span>
                                                                <div className="flex flex-wrap gap-1">
                                                                  {keywords.slice(0, 3).map((kw: any, kidx: number) => (
                                                                    <span key={kidx} className="text-gray-600">
                                                                      {kw.text} · {fmtVol(kw.volume)} · {fmtRank(kw.rank)}
                                                                      {kidx < Math.min(keywords.length, 3) - 1 && " | "}
                                                                    </span>
                                                                  ))}
                                                                  {keywords.length > 3 && <span className="text-gray-400">...</span>}
                                                                </div>
                                                              </div>
                                                            );
                                                          })}
                                                        </div>
                                                      </Card>
                                                    );
                                                  })}
                                                </div>
                                              </div>
                                            </div>
                                          </td>
                                        </tr>
                                      )}
                                    </>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </CardContent>
                    )}
                  </Card>
                );
              })
          ) : (
            <Card>
              <CardContent className="pt-6">
                <p className="text-center text-gray-600 dark:text-gray-400">
                  키워드 분석 데이터가 없습니다.
                </p>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Footer */}
        <div className="text-center text-sm text-muted-foreground py-8">
          <p>© 2024 SERP 분석 도구. 검색 결과 순위 및 키워드 분석을 통한 SEO 최적화를 지원합니다.</p>
        </div>
      </div>
    </div>
  );
}