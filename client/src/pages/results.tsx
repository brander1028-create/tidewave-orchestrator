import { useParams, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Clock, Download, ChevronDown, ChevronUp, ExternalLink } from "lucide-react";
import { useState } from "react";
import type { SerpJob } from "../../../shared/schema";

// v8 Results Response Type with Enhanced Fields
type V8ResultsResponse = {
  keywords: string[];
  status: string;
  analyzedAt: string;
  params: {
    postsPerBlog: number;
    tiersPerPost: number;
  };
  searchVolumes: Record<string, number | null>;
  attemptsByKeyword: Record<string, number>;
  exposureStatsByKeyword: Record<string, {page1: number, zero: number, unknown: number}>;
  summaryByKeyword: Array<{
    keyword: string;
    searchVolume: number | null;
    totalBlogs: number;
    newBlogs: number;
    phase2ExposedNew: number;
    blogs: Array<{
      blogId: string;
      blogName: string;
      blogUrl: string;
      status: string;
      totalExposed: number;
      totalScore: number;
      topKeywords: Array<{
        text: string;
        volume: number | null;
        score: number;
        rank: number | null;
        related: boolean;
      }>;
      posts: Array<{
        title: string;
        tiers: Array<{
          tier: number;
          text: string;
          volume: number | null;
          rank: number | null;
          score: number;
        }>;
      }>;
    }>;
  }>;
  // Enhanced fields from server response schema
  blogs?: Array<{
    blog_id: string;
    blog_name: string;
    blog_url: string;
    base_rank: number | null;
    gathered_posts: number;
  }>;
  posts?: Array<{
    blog_id: string;
    title: string;
    content: string;
    url: string;
  }>;
  counters?: {
    discovered_blogs: number;
    blogs: number;
    posts: number;
    selected_keywords: number;
    searched_keywords: number;
    hit_blogs: number;
    volumes_mode: string;
  };
  warnings?: string[];
  errors?: string[];
};

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

// ✅ 수정: 0-1 범위 점수에 맞게 색상 임계값 조정
const getScoreColor = (score: number) => {
  if (score >= 0.8) return "bg-emerald-100 text-emerald-800 font-medium";
  if (score >= 0.6) return "bg-blue-100 text-blue-800";
  if (score >= 0.4) return "bg-yellow-100 text-yellow-800";
  return "bg-red-100 text-red-800";
};

const getRankColor = (rank: number | null) => {
  if (rank === null) return "bg-gray-100 text-gray-600";
  if (rank <= 3) return "bg-emerald-100 text-emerald-800 font-medium";
  if (rank <= 10) return "bg-blue-100 text-blue-800";
  return "bg-red-100 text-red-800";
};

// ✅ 수정: 서버의 권위 있는 tier와 점수 정보 추출 (재계산 없음)
const getTierInfo = (keywordData: any) => {
  // keywordData.blogs에서 최고 점수와 tier 정보 추출
  let bestTier = 4; // 기본값
  let bestScore = 0;
  
  if (keywordData.blogs && keywordData.blogs.length > 0) {
    for (const blog of keywordData.blogs) {
      if (blog.posts && blog.posts.length > 0) {
        for (const post of blog.posts) {
          if (post.tiers && post.tiers.length > 0) {
            for (const tier of post.tiers) {
              // ✅ 서버 제공 점수 그대로 사용 (이미 7:3 가중치 적용됨)
              if (tier.score > bestScore) {
                bestScore = tier.score;
                bestTier = tier.tier || 4;
              }
            }
          }
        }
      }
      // topKeywords에서도 확인
      if (blog.topKeywords && blog.topKeywords.length > 0) {
        for (const kw of blog.topKeywords) {
          if (kw.score > bestScore) {
            bestScore = kw.score;
          }
        }
      }
    }
  }
  
  // ✅ 안전장치: 점수를 0-1 범위로 제한
  const clampedScore = Math.max(0, Math.min(1, bestScore));
  if (bestScore !== clampedScore) {
    console.warn(`Score ${bestScore} clamped to ${clampedScore} for keyword ${keywordData.keyword}`);
  }
  
  return {
    tier: bestTier,
    combinedScore: clampedScore // 서버의 권위 있는 점수 사용
  };
};

export default function ResultsPage() {
  const { jobId } = useParams<{ jobId: string }>();
  const [expandedKeywords, setExpandedKeywords] = useState<Set<string>>(new Set());
  const [expandedBlogs, setExpandedBlogs] = useState<Set<string>>(new Set());
  
  // Status toggle handler for blog registry
  const handleStatusToggle = async (blogId: string, newStatus: string) => {
    try {
      const response = await fetch(`/api/blog-registry/${blogId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      });
      
      if (response.ok) {
        // Use react-query cache invalidation instead of reload
        const { queryClient } = await import('@/lib/queryClient');
        queryClient.invalidateQueries({ queryKey: ['/api/serp/jobs', jobId, 'results'] });
      } else {
        console.error('Failed to update blog status');
      }
    } catch (error) {
      console.error('Error updating blog status:', error);
    }
  };

  // Get job status to show basic info
  const { data: job } = useQuery<SerpJob>({
    queryKey: ["/api/serp/jobs", jobId],
    enabled: !!jobId,
  });

  // Get analysis results (v8 format)
  const { data: results, isLoading, error } = useQuery<V8ResultsResponse>({
    queryKey: ["/api/serp/jobs", jobId, "results"],
    enabled: !!jobId,
  });

  if (isLoading || !jobId) {
    return (
      <div className="p-6">
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
      <div className="p-6">
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
    <div className="p-6">
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
          
          {/* Keyword chips header with checks count */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CardTitle className="text-xl font-bold">검색값 보고서</CardTitle>
                </div>
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <span data-testid="job-status">상태: {results?.status || "알 수 없음"}</span>
                  <span data-testid="job-date">
                    {results?.analyzedAt ? new Date(results.analyzedAt).toLocaleString("ko-KR") : "알 수 없음"}
                  </span>
                  <span data-testid="job-params">
                    P={results?.params?.postsPerBlog || 10}, T={results?.params?.tiersPerPost || 4}
                  </span>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 mt-3">
                {results?.keywords?.map((keyword) => {
                  const attempts = results.attemptsByKeyword[keyword] || 0;
                  const exposure = results.exposureStatsByKeyword[keyword] || {page1: 0, zero: 0, unknown: 0};
                  
                  return (
                    <div key={keyword} className="flex items-center gap-2">
                      <Badge 
                        variant="secondary" 
                        className="text-sm px-3 py-1 cursor-pointer hover:bg-blue-100"
                        onClick={() => {
                          // Safe ID generation for scroll target (handle Unicode)
                          const safeId = `keyword-${encodeURIComponent(keyword).replace(/[^a-zA-Z0-9]/g, '_')}`;
                          const element = document.getElementById(safeId);
                          element?.scrollIntoView({ behavior: 'smooth' });
                        }}
                      >
                        {keyword}
                      </Badge>
                      <Badge variant="outline" className="text-xs">
                        검사 {attempts}개
                      </Badge>
                      <Badge variant="outline" className="text-xs bg-emerald-50">
                        1페이지 {exposure.page1}개
                      </Badge>
                    </div>
                  );
                })}
              </div>
            </CardHeader>
          </Card>
          
          {/* Warnings and Errors Display */}
          {(results.warnings && results.warnings.length > 0) || (results.errors && results.errors.length > 0) ? (
            <Card className="mt-4">
              <CardContent className="pt-6">
                {results.errors && results.errors.length > 0 && (
                  <div className="mb-4">
                    <h4 className="text-sm font-medium text-red-600 mb-2">오류</h4>
                    <div className="space-y-1">
                      {results.errors.map((error, index) => (
                        <div key={index} className="text-sm text-red-600 bg-red-50 p-2 rounded" data-testid={`error-${index}`}>
                          {error}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {results.warnings && results.warnings.length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium text-yellow-600 mb-2">경고</h4>
                    <div className="space-y-1">
                      {results.warnings.map((warning, index) => (
                        <div key={index} className="text-sm text-yellow-600 bg-yellow-50 p-2 rounded" data-testid={`warning-${index}`}>
                          {warning}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ) : null}
          
          {/* Enhanced Statistics Display with Counters */}
          {results.counters && (
            <Card className="mt-4">
              <CardHeader>
                <CardTitle className="text-lg">분석 통계</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="text-center p-3 bg-blue-50 rounded-lg">
                    <div className="text-2xl font-bold text-blue-600" data-testid="counter-discovered-blogs">
                      {results.counters.discovered_blogs}
                    </div>
                    <div className="text-sm text-blue-600">발견된 블로그</div>
                  </div>
                  <div className="text-center p-3 bg-green-50 rounded-lg">
                    <div className="text-2xl font-bold text-green-600" data-testid="counter-new-blogs">
                      {results.counters.blogs}
                    </div>
                    <div className="text-sm text-green-600">NEW 블로그</div>
                  </div>
                  <div className="text-center p-3 bg-purple-50 rounded-lg">
                    <div className="text-2xl font-bold text-purple-600" data-testid="counter-hit-blogs">
                      {results.counters.hit_blogs}
                    </div>
                    <div className="text-sm text-purple-600">노출된 블로그</div>
                  </div>
                  <div className="text-center p-3 bg-yellow-50 rounded-lg">
                    <div className="text-2xl font-bold text-yellow-600" data-testid="counter-analyzed-posts">
                      {results.counters.posts}
                    </div>
                    <div className="text-sm text-yellow-600">분석된 포스트</div>
                  </div>
                </div>
                <div className="mt-4 text-sm text-gray-600 text-center">
                  검색량 모드: <Badge variant="outline" data-testid="volume-mode">{results.counters.volumes_mode}</Badge>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Tier별 키워드 요약 - 스크린샷 스타일 */}
        {results.summaryByKeyword && results.summaryByKeyword.length > 0 && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="text-xl font-bold">키워드 티어별 분석 결과</CardTitle>
            </CardHeader>
            <CardContent>
              {results.summaryByKeyword.map((keywordData, index) => {
                // ✅ 수정: 실제 tier 정보 계산 (7:3 가중치 기반)
                const tierInfo = getTierInfo(keywordData);
                
                return (
                  <div key={keywordData.keyword} className="flex items-center justify-between py-3 border-b last:border-b-0">
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="bg-blue-50 font-medium">
                          {tierInfo.tier}티어:
                        </Badge>
                        <span className="font-semibold text-lg">{keywordData.keyword}</span>
                      </div>
                      
                      <div className="flex items-center gap-3">
                        <Badge className={getVolumeColor(keywordData.searchVolume)}>
                          조회량 {fmtVol(keywordData.searchVolume)}
                        </Badge>
                        
                        <Badge className={getScoreColor(tierInfo.combinedScore)}>
                          점수 {tierInfo.combinedScore.toFixed(6)}pts
                        </Badge>
                        
                        <Badge variant="outline" className="bg-gray-50">
                          손익 미확인
                        </Badge>
                      </div>
                    </div>
                    
                    <div className="text-sm text-gray-500">
                      NEW {keywordData.newBlogs}/{keywordData.totalBlogs} · Phase2 {keywordData.phase2ExposedNew}
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        )}

        {/* Keyword Summary Cards - v8 Design */}
        <div className="space-y-4" data-testid="keyword-summary-list">
          {results.summaryByKeyword && results.summaryByKeyword.length > 0 ? (
            results.summaryByKeyword
              .sort((a, b) => {
                // Safe ratio calculation to avoid division by zero
                const ratioA = a.newBlogs > 0 ? a.phase2ExposedNew / a.newBlogs : 0;
                const ratioB = b.newBlogs > 0 ? b.phase2ExposedNew / b.newBlogs : 0;
                return ratioB - ratioA || (b.newBlogs - a.newBlogs);
              })
              .map((keywordData) => {
                const isExpanded = expandedKeywords.has(keywordData.keyword);
                const attempts = results.attemptsByKeyword[keywordData.keyword] || 0;
                const exposure = results.exposureStatsByKeyword[keywordData.keyword] || {page1: 0, zero: 0, unknown: 0};
                
                return (
                  <Card key={keywordData.keyword} id={`keyword-${encodeURIComponent(keywordData.keyword).replace(/[^a-zA-Z0-9]/g, '_')}`} className="border-2">
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <h3 className="text-lg font-semibold">{keywordData.keyword}</h3>
                          <Badge className={getVolumeColor(keywordData.searchVolume)}>
                            조회량 {fmtVol(keywordData.searchVolume)}
                          </Badge>
                          {/* 추가된 점수 정보 */}
                          {keywordData.blogs && keywordData.blogs.length > 0 && keywordData.blogs[0].topKeywords && keywordData.blogs[0].topKeywords.length > 0 && (
                            <Badge className={getScoreColor(keywordData.blogs[0].topKeywords[0].score || 0)}>
                              점수 {(keywordData.blogs[0].topKeywords[0].score || 0).toFixed(6)}pts
                            </Badge>
                          )}
                          <Badge variant="outline" className="bg-gray-50">
                            손익 미확인
                          </Badge>
                        </div>
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
                      </div>
                      <div className="flex items-center gap-4 text-sm flex-wrap">
                        <Badge variant="outline" className="bg-blue-50">
                          NEW {keywordData.newBlogs}/{keywordData.totalBlogs}
                        </Badge>
                        <Badge variant="outline" className="bg-emerald-50">
                          Phase2(신규) {keywordData.phase2ExposedNew}/{keywordData.newBlogs}
                        </Badge>
                        <Badge variant="outline" className="bg-purple-50">
                          검사 {attempts}개 (NEW × {results.params?.postsPerBlog || 10} × {results.params?.tiersPerPost || 4})
                        </Badge>
                        <Badge variant="outline" className="bg-green-50">
                          1페이지 {exposure.page1}개
                        </Badge>
                        <Badge variant="outline" className="bg-gray-50">
                          미노출 {exposure.zero}개
                        </Badge>
                        <Badge variant="outline" className="bg-yellow-50">
                          미확인 {exposure.unknown}개
                        </Badge>
                      </div>
                    </CardHeader>
                    
                    {isExpanded && (
                      <CardContent>
                        {/* Blog List Table - v8 Format */}
                        <div className="mb-6">
                          <h4 className="text-md font-medium mb-3">블로그 리스트 (NEW만)</h4>
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
                                {keywordData.blogs.map((blog, idx) => {
                                  const blogKey = `${keywordData.keyword}-${blog.blogId}`;
                                  const isBlogExpanded = expandedBlogs.has(blogKey);
                                  
                                  return (
                                    <>
                                      <tr key={blog.blogId} className="border-t hover:bg-gray-50">
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
                                          <Badge className={blog.totalExposed > 0 ? "bg-emerald-100 text-emerald-800" : "bg-gray-100 text-gray-600"}>
                                            {blog.totalExposed}개
                                          </Badge>
                                        </td>
                                        <td className="px-4 py-2">
                                          <Badge className={getScoreColor(blog.totalScore)}>
                                            {Math.round(blog.totalScore)}pts
                                          </Badge>
                                        </td>
                                        <td className="px-4 py-2">
                                          <Badge variant="outline">{blog.status}</Badge>
                                        </td>
                                        <td className="px-4 py-2">
                                          <div className="flex gap-1 flex-wrap">
                                            <Button 
                                              size="sm" 
                                              variant="outline"
                                              onClick={() => {
                                                // 10개 포스트 보기 - 블로그 확장
                                                if (!isBlogExpanded) {
                                                  setExpandedBlogs(prev => new Set(prev).add(blogKey));
                                                }
                                              }}
                                              data-testid={`button-posts-${blog.blogId}`}
                                            >
                                              10개 포스트 보기
                                            </Button>
                                            <Button 
                                              size="sm" 
                                              variant="outline"
                                              onClick={() => window.open(blog.blogUrl, '_blank', 'noopener')}
                                              data-testid={`button-blog-visit-${blog.blogId}`}
                                            >
                                              블로그 바로가기
                                            </Button>
                                          </div>
                                          <div className="flex gap-1 mt-2">
                                            <Button 
                                              size="sm" 
                                              variant={blog.status === 'collected' ? 'default' : 'outline'}
                                              onClick={() => handleStatusToggle(blog.blogId, 'collected')}
                                              className="text-xs"
                                              data-testid={`status-collected-${blog.blogId}`}
                                            >
                                              수집됨
                                            </Button>
                                            <Button 
                                              size="sm" 
                                              variant={blog.status === 'blacklist' ? 'default' : 'outline'}
                                              onClick={() => handleStatusToggle(blog.blogId, 'blacklist')}
                                              className="text-xs"
                                              data-testid={`status-blacklist-${blog.blogId}`}
                                            >
                                              블랙
                                            </Button>
                                            <Button 
                                              size="sm" 
                                              variant={blog.status === 'outreach' ? 'default' : 'outline'}
                                              onClick={() => handleStatusToggle(blog.blogId, 'outreach')}
                                              className="text-xs"
                                              data-testid={`status-outreach-${blog.blogId}`}
                                            >
                                              섭외
                                            </Button>
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
                                                  {blog.topKeywords.slice(0, 10).map((keyword, kidx) => (
                                                    <div key={`${blog.blogId}-keyword-${kidx}-${keyword.text}`} className="inline-flex items-center gap-1">
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
                                              
                                              {/* B. 포스트별 실제 티어 데이터 */}
                                              <div>
                                                <h5 className="font-medium mb-2">포스트별 1~{results.params?.tiersPerPost || 4}티어 (전수검사)</h5>
                                                <div className="space-y-2">
                                                  {blog.posts.map((post, pidx) => (
                                                    <Card key={`${blog.blogId}-post-${pidx}`} className="p-3">
                                                      <h6 className="font-medium text-sm mb-2" data-testid={`post-title-${pidx}`}>{post.title}</h6>
                                                      <div className="text-xs space-y-1">
                                                        {post.tiers.map((tierData, tierIdx) => (
                                                          <div key={`${blog.blogId}-post-${pidx}-tier-${tierData.tier}-${tierIdx}`} className="flex items-center gap-2 flex-wrap">
                                                            <span className="font-medium min-w-12">{tierData.tier}티어:</span>
                                                            <div className="flex items-center gap-2 flex-wrap">
                                                              <span className="text-gray-700 font-medium" data-testid={`tier-text-${tierData.tier}`}>
                                                                {tierData.text || "비어있음"}
                                                              </span>
                                                              {/* 조회량·점수·순위 항상 표시 */}
                                                              <Badge className={getVolumeColor(tierData.volume)} data-testid={`tier-volume-${tierData.tier}`}>
                                                                조회량 {fmtVol(tierData.volume)}
                                                              </Badge>
                                                              <Badge className={getScoreColor(tierData.score || 0)} data-testid={`tier-score-${tierData.tier}`}>
                                                                점수 {tierData.score || 0}pts
                                                              </Badge>
                                                              <Badge className={getRankColor(tierData.rank)} data-testid={`tier-rank-${tierData.tier}`}>
                                                                순위 {fmtRank(tierData.rank)}
                                                              </Badge>
                                                            </div>
                                                          </div>
                                                        ))}
                                                      </div>
                                                    </Card>
                                                  ))}
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