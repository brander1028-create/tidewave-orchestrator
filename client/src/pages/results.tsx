import { useParams, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, Download, Clock } from "lucide-react";
import type { SerpResultsData } from "../../../shared/schema";

interface KeywordChipProps {
  keyword: { text: string; raw_volume: number; rank: number };
  blogId: string;
}

function KeywordChip({ keyword, blogId }: KeywordChipProps) {
  const getColorClass = (raw_volume: number, rank: number) => {
    if (rank === 0) return "bg-gray-100 text-gray-600"; // 미노출
    if (raw_volume >= 100000) return "bg-red-100 text-red-700";
    if (raw_volume >= 50000) return "bg-amber-100 text-amber-700";
    return "bg-green-100 text-green-700";
  };

  const displayRank = keyword.rank === 0 ? "미노출" : `${keyword.rank}위`;

  return (
    <Badge
      variant="secondary"
      className={`${getColorClass(keyword.raw_volume, keyword.rank)} text-xs`}
      data-testid={`chip-${blogId}-${keyword.text}`}
    >
      {keyword.text} ({keyword.raw_volume.toLocaleString()}) {displayRank}
    </Badge>
  );
}

export default function ResultsPage() {
  const { jobId } = useParams<{ jobId: string }>();

  const { data: results, isLoading, error } = useQuery<SerpResultsData>({
    queryKey: ['/api/serp/jobs', jobId, 'results'],
    enabled: !!jobId
  });

  if (isLoading) {
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

  if (error || !results) {
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
          <Card>
            <CardContent className="pt-6">
              <p className="text-red-600 dark:text-red-400">결과를 불러올 수 없습니다.</p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // Aggregate all keywords for the keywords table, sorted by raw_volume desc
  const allKeywords = results.keywords
    .flatMap(blog => 
      blog.top3.map(keyword => ({
        ...keyword,
        blog_id: blog.blog_id,
        blog_name: results.blogs.find(b => b.blog_id === blog.blog_id)?.blog_name || blog.blog_id
      }))
    )
    .sort((a, b) => b.raw_volume - a.raw_volume);

  const getColorClass = (raw_volume: number, rank: number) => {
    if (rank === 0) return "bg-gray-100 text-gray-600";
    if (raw_volume >= 100000) return "bg-red-100 text-red-700";
    if (raw_volume >= 50000) return "bg-amber-100 text-amber-700";
    return "bg-green-100 text-green-700";
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <Link href="/">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="h-4 w-4 mr-2" />
                대시보드로
              </Button>
            </Link>
            <Link href="/history">
              <Button variant="outline" size="sm">
                <Clock className="h-4 w-4 mr-2" />
                히스토리
              </Button>
            </Link>
          </div>
          <Button
            variant="outline"
            size="sm"
            asChild
            data-testid="export-csv-button"
          >
            <a href={`/api/serp/jobs/${jobId}/export.csv`} download>
              <Download className="h-4 w-4 mr-2" />
              CSV 내보내기
            </a>
          </Button>
        </div>

        {/* Summary */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>분석 결과 요약</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-sm text-gray-600 dark:text-gray-400" data-testid="results-summary">
              발견 {results.counters.discovered_blogs} → 통과 {results.counters.hit_blogs} · 
              요청 {results.counters.selected_keywords} · 
              실제 {results.counters.searched_keywords} · 
              모드 {results.counters.volumes_mode}
            </div>
          </CardContent>
        </Card>

        {/* Empty state */}
        {results.counters.hit_blogs === 0 ? (
          <Card>
            <CardContent className="pt-6 text-center">
              <p className="text-gray-600 dark:text-gray-400">
                지정 키워드 기준 1~10위 미노출된 블로그가 없습니다.
              </p>
            </CardContent>
          </Card>
        ) : (
          /* Main Content */
          <Tabs defaultValue="blogs" className="space-y-6">
            <TabsList>
              <TabsTrigger value="blogs" data-testid="tab-blogs">블로그별</TabsTrigger>
              <TabsTrigger value="keywords" data-testid="tab-keywords">키워드 전체표</TabsTrigger>
            </TabsList>

            {/* Blogs Tab */}
            <TabsContent value="blogs" className="space-y-4">
              {results.blogs.map(blog => {
                const keywords = results.keywords.find(k => k.blog_id === blog.blog_id)?.top3 || [];
                // Sort keywords by raw_volume desc
                const sortedKeywords = [...keywords].sort((a, b) => b.raw_volume - a.raw_volume);

                return (
                  <Card key={blog.blog_id} data-testid={`blog-card-${blog.blog_id}`}>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-lg">{blog.blog_name}</CardTitle>
                        {blog.base_rank && (
                          <Badge variant="secondary">
                            {blog.base_rank}위
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        {blog.blog_url} · {blog.gathered_posts}개 포스트
                      </p>
                    </CardHeader>
                    <CardContent>
                      <div className="flex flex-wrap gap-2">
                        {sortedKeywords.map(keyword => (
                          <KeywordChip
                            key={keyword.text}
                            keyword={keyword}
                            blogId={blog.blog_id}
                          />
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </TabsContent>

            {/* Keywords Tab */}
            <TabsContent value="keywords">
              <Card>
                <CardHeader>
                  <CardTitle>키워드 전체표</CardTitle>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    조회량(raw) 내림차순 정렬
                  </p>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>블로그명</TableHead>
                        <TableHead>키워드</TableHead>
                        <TableHead className="text-right">조회량(raw)</TableHead>
                        <TableHead className="text-right">랭크</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {allKeywords.map((keyword, index) => (
                        <TableRow key={`${keyword.blog_id}-${keyword.text}-${index}`}>
                          <TableCell className="font-medium">{keyword.blog_name}</TableCell>
                          <TableCell>
                            <Badge
                              variant="secondary"
                              className={`${getColorClass(keyword.raw_volume, keyword.rank)} text-xs`}
                            >
                              {keyword.text}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            {keyword.raw_volume.toLocaleString()}
                          </TableCell>
                          <TableCell className="text-right">
                            {keyword.rank === 0 ? "미노출" : `${keyword.rank}위`}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        )}
      </div>
    </div>
  );
}