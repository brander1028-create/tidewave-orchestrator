import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ExternalLink, ChevronDown, ChevronUp, TrendingUp, Users, Database } from "lucide-react";
import type { SerpJob, SerpResultsData } from "@shared/schema";

interface KeywordSummaryCardsProps {
  jobId: string;
}

interface KeywordCardData {
  keyword: string;
  searchVolume?: number;
  newBlogs: number;
  totalBlogs: number;
  phase2ExposedNew: number;
  phase2ExposedAll: number;
  blogs: Array<{
    blog_id: string;
    blog_name: string;
    blog_url: string;
    base_rank?: number;
    gathered_posts: number;
    isNew: boolean;
    keywords: Array<any>; // Simplified to any for now
  }>;
}

export default function KeywordSummaryCards({ jobId }: KeywordSummaryCardsProps) {
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());

  // Get job details for input keywords
  const { data: job } = useQuery<SerpJob>({
    queryKey: ["/api/serp/jobs", jobId],
    enabled: !!jobId,
  });

  // Get analysis results
  const { data: results, isLoading, error } = useQuery<SerpResultsData>({
    queryKey: ["/api/serp/jobs", jobId, "results"],
    enabled: !!jobId,
  });

  const toggleExpanded = (keyword: string) => {
    const newExpanded = new Set(expandedCards);
    if (newExpanded.has(keyword)) {
      newExpanded.delete(keyword);
    } else {
      newExpanded.add(keyword);
    }
    setExpandedCards(newExpanded);
  };

  const getSearchVolume = async (keyword: string): Promise<number | undefined> => {
    // TODO: API call to get search volume for keyword
    // For now, return undefined
    return undefined;
  };

  const processKeywordData = (): KeywordCardData[] => {
    if (!job?.keywords || !results) return [];

    return job.keywords.map(keyword => {
      // Find blogs discovered by this keyword
      // Using seedKeyword from discoveredBlogs or base_rank logic
      const relatedBlogs = results.blogs.filter(blog => {
        // Simple heuristic: if blog has base_rank, it was found by a primary keyword
        // More sophisticated logic would require seedKeyword from API
        return blog.base_rank && blog.base_rank <= 10;
      });

      const blogsWithKeywords = relatedBlogs.map(blog => {
        const keywordData = results.keywords.find(k => k.blog_id === blog.blog_id);
        const blogKeywords = keywordData?.top3 || (keywordData as any)?.top4 || [];
        return {
          ...blog,
          isNew: true, // TODO: Logic to determine if blog is new
          keywords: blogKeywords
        };
      });

      // Calculate metrics
      const totalBlogs = blogsWithKeywords.length;
      const newBlogs = blogsWithKeywords.filter(b => b.isNew).length;
      
      // Phase2 exposed = blogs with at least one keyword ranked 1-10
      const phase2ExposedAll = blogsWithKeywords.filter(blog => 
        blog.keywords.some((kw: any) => kw.rank > 0 && kw.rank <= 10)
      ).length;
      
      const phase2ExposedNew = blogsWithKeywords.filter(blog => 
        blog.isNew && blog.keywords.some((kw: any) => kw.rank > 0 && kw.rank <= 10)
      ).length;

      return {
        keyword,
        searchVolume: undefined, // TODO: Get from SearchAd API
        newBlogs,
        totalBlogs,
        phase2ExposedNew,
        phase2ExposedAll,
        blogs: blogsWithKeywords
      };
    });
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i} className="animate-pulse">
            <CardHeader>
              <div className="h-6 bg-muted rounded w-1/3"></div>
              <div className="h-4 bg-muted rounded w-1/2"></div>
            </CardHeader>
            <CardContent>
              <div className="h-4 bg-muted rounded w-2/3"></div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (error || !results || !job) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-destructive">결과를 불러올 수 없습니다.</p>
        </CardContent>
      </Card>
    );
  }

  const keywordData = processKeywordData();

  // Sort by Phase2 노출(신규) 비율 내림차순 → 동률 시 신규 블로그 수 내림차순
  const sortedKeywordData = keywordData.sort((a, b) => {
    const ratioA = a.newBlogs > 0 ? a.phase2ExposedNew / a.newBlogs : 0;
    const ratioB = b.newBlogs > 0 ? b.phase2ExposedNew / b.newBlogs : 0;
    
    if (ratioB !== ratioA) return ratioB - ratioA;
    return b.newBlogs - a.newBlogs;
  });

  return (
    <div className="space-y-6">
      {sortedKeywordData.map((data) => {
        const isExpanded = expandedCards.has(data.keyword);
        
        return (
          <Card key={data.keyword} className="overflow-hidden" data-testid={`keyword-card-${data.keyword}`}>
            <CardHeader className="pb-4">
              {/* Header: 키워드 + 검색량 */}
              <div className="flex items-center justify-between">
                <CardTitle className="text-xl font-bold">
                  {data.keyword}
                  {data.searchVolume && (
                    <span className="ml-3 text-sm font-normal text-muted-foreground">
                      • 검색량 {data.searchVolume.toLocaleString()}
                    </span>
                  )}
                </CardTitle>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => window.open(`https://m.search.naver.com/search.naver?query=${encodeURIComponent(data.keyword)}`, '_blank')}
                    data-testid={`external-link-${data.keyword}`}
                  >
                    <ExternalLink className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {/* KPI 한 줄 */}
              <div className="flex flex-wrap gap-4 text-sm">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-primary" />
                  <span>
                    <strong>신규 노출 블로그:</strong> {data.newBlogs}/{data.totalBlogs}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-chart-1" />
                  <span>
                    <strong>Phase2 노출(신규):</strong> {data.phase2ExposedNew}/{data.newBlogs}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Database className="h-4 w-4" />
                  <span>
                    Phase2 노출(전체): {data.phase2ExposedAll}/{data.totalBlogs}
                  </span>
                </div>
              </div>
            </CardHeader>

            <CardContent className="pt-0">
              <Collapsible open={isExpanded} onOpenChange={() => toggleExpanded(data.keyword)}>
                <CollapsibleTrigger asChild>
                  <Button 
                    variant="ghost" 
                    className="w-full justify-between p-0 h-auto text-left"
                    data-testid={`toggle-details-${data.keyword}`}
                  >
                    <span className="font-medium">자세히</span>
                    {isExpanded ? (
                      <ChevronUp className="h-4 w-4" />
                    ) : (
                      <ChevronDown className="h-4 w-4" />
                    )}
                  </Button>
                </CollapsibleTrigger>

                <CollapsibleContent className="space-y-6 mt-4">
                  {/* ① 신규 블로그 리스트 */}
                  <div>
                    <h4 className="font-semibold mb-3 flex items-center gap-2">
                      <Users className="h-4 w-4 text-primary" />
                      ① 신규 블로그 ({data.blogs.filter(b => b.isNew).length}개)
                    </h4>
                    <div className="space-y-2">
                      {data.blogs.filter(b => b.isNew).slice(0, 50).map((blog, index) => (
                        <div
                          key={blog.blog_id}
                          className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50"
                          data-testid={`new-blog-${blog.blog_id}`}
                        >
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{blog.blog_name}</span>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => window.open(blog.blog_url, '_blank')}
                              >
                                <ExternalLink className="h-3 w-3" />
                              </Button>
                            </div>
                            <div className="text-sm text-muted-foreground">
                              스캔 포스트수: {blog.gathered_posts}개
                              {blog.base_rank && (
                                <span className="ml-2">
                                  • 발견경로: 지정키워드 {blog.base_rank}위
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* ② Phase2 블로그 키워드 표 */}
                  <div>
                    <h4 className="font-semibold mb-3 flex items-center gap-2">
                      <TrendingUp className="h-4 w-4 text-chart-1" />
                      ② Phase2 블로그(신규만) - 노출 키워드 Top10
                    </h4>
                    <div className="space-y-4">
                      {data.blogs
                        .filter(b => b.isNew && b.keywords.length > 0)
                        .slice(0, 10)
                        .map((blog) => (
                          <div
                            key={blog.blog_id}
                            className="p-4 border rounded-lg"
                            data-testid={`phase2-blog-${blog.blog_id}`}
                          >
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2">
                                <span className="font-medium">{blog.blog_name}</span>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => window.open(blog.blog_url, '_blank')}
                                >
                                  <ExternalLink className="h-3 w-3" />
                                </Button>
                              </div>
                            </div>
                            
                            {/* 키워드 칩들 */}
                            <div className="flex flex-wrap gap-2 mt-2">
                              {blog.keywords
                                .sort((a, b) => b.combined_score - a.combined_score || b.raw_volume - a.raw_volume)
                                .slice(0, 10)
                                .map((keyword, keywordIndex) => {
                                  const volumeClass = 
                                    keyword.raw_volume >= 100000 ? "bg-red-100 text-red-800 border-red-200" :
                                    keyword.raw_volume >= 50000 ? "bg-green-100 text-green-800 border-green-200" : 
                                    "bg-gray-100 text-gray-600 border-gray-200";

                                  const rankText = keyword.rank > 0 
                                    ? `모바일 1p #${keyword.rank}` 
                                    : "미노출";

                                  return (
                                    <Badge
                                      key={keywordIndex}
                                      className={`${volumeClass} text-xs px-2 py-1 font-medium`}
                                      data-testid={`keyword-chip-${blog.blog_id}-${keywordIndex}`}
                                    >
                                      {keyword.text}
                                      {keyword.meta?.related === false && (
                                        <span className="ml-1 text-xs opacity-70">[관련X]</span>
                                      )}
                                      <span className="ml-1">
                                        ({keyword.raw_volume.toLocaleString()})
                                      </span>
                                      <span className="ml-1">
                                        ({keyword.combined_score}pts)
                                      </span>
                                      <span className="ml-1">
                                        ({rankText})
                                      </span>
                                    </Badge>
                                  );
                                })}
                            </div>
                          </div>
                        ))}
                    </div>
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}