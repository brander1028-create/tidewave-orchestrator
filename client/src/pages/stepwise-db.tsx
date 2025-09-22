import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ExternalLink, Calendar, ChevronRight, Database, Layers, CheckCircle } from "lucide-react";
import { Link } from "wouter";

interface StepwiseDbBlog {
  id: string;
  jobId: string;
  seedKeyword: string;
  rank: number;
  blogId: string;
  blogName: string;
  blogUrl: string;
  blogType?: 'top_exposure' | 'search_feed';
  postsAnalyzed: number;
  createdAt: string;
  stepStatus: {
    step1: boolean; // 블로그 수집
    step2: boolean; // 키워드 API 활성화
    step3: boolean; // 지수 확인
  };
}

interface StepwiseDbResponse {
  blogs: StepwiseDbBlog[];
  summary: {
    totalBlogs: number;
    step1Only: number;
    step2Complete: number;
    step3Complete: number;
  };
}

export default function StepwiseDbPage() {
  const [selectedTab, setSelectedTab] = useState("step1");

  // 단계별 DB 조회
  const { data: stepwiseData, isLoading } = useQuery<StepwiseDbResponse>({
    queryKey: ["/api/stepwise-db"],
    refetchInterval: 10000, // 10초마다 새로고침
  });

  const renderBlogTable = (blogs: StepwiseDbBlog[], showStepStatus = true) => (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>블로그명</TableHead>
          <TableHead>키워드</TableHead>
          <TableHead>순위</TableHead>
          <TableHead>타입</TableHead>
          <TableHead>포스트</TableHead>
          {showStepStatus && <TableHead>단계</TableHead>}
          <TableHead>수집일</TableHead>
          <TableHead>링크</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {blogs.map((blog) => (
          <TableRow key={blog.id} data-testid={`blog-row-${blog.id}`}>
            <TableCell className="font-medium">
              <div className="max-w-48 truncate" title={blog.blogName}>
                {blog.blogName}
              </div>
              <div className="text-sm text-gray-500">{blog.blogId}</div>
            </TableCell>
            <TableCell>
              <Badge variant="outline" data-testid={`keyword-${blog.seedKeyword}`}>
                {blog.seedKeyword}
              </Badge>
            </TableCell>
            <TableCell>
              <div className="flex items-center space-x-2">
                <span className="font-medium">{blog.rank}위</span>
                {blog.blogType && (
                  <Badge 
                    variant={blog.blogType === 'top_exposure' ? 'default' : 'secondary'}
                    data-testid={`blog-type-${blog.blogType}`}
                  >
                    {blog.blogType === 'top_exposure' ? '상위노출' : '서치피드'}
                  </Badge>
                )}
              </div>
            </TableCell>
            <TableCell>{blog.blogType || 'N/A'}</TableCell>
            <TableCell>
              <span className="text-sm">{blog.postsAnalyzed || 0}개</span>
            </TableCell>
            {showStepStatus && (
              <TableCell>
                <div className="flex items-center space-x-1">
                  <div className={`w-2 h-2 rounded-full ${blog.stepStatus.step1 ? 'bg-green-500' : 'bg-gray-300'}`} />
                  <div className={`w-2 h-2 rounded-full ${blog.stepStatus.step2 ? 'bg-green-500' : 'bg-gray-300'}`} />
                  <div className={`w-2 h-2 rounded-full ${blog.stepStatus.step3 ? 'bg-green-500' : 'bg-gray-300'}`} />
                </div>
              </TableCell>
            )}
            <TableCell>
              <div className="flex items-center text-sm text-gray-500">
                <Calendar className="w-4 h-4 mr-1" />
                {new Date(blog.createdAt).toLocaleDateString('ko-KR')}
              </div>
            </TableCell>
            <TableCell>
              <Button variant="ghost" size="sm" asChild data-testid={`visit-blog-${blog.id}`}>
                <a href={blog.blogUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="w-4 h-4" />
                </a>
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );

  if (isLoading) {
    return (
      <div className="container mx-auto p-6 space-y-6">
        <div className="flex items-center space-x-2">
          <Layers className="w-6 h-6 text-blue-600" />
          <h1 className="text-2xl font-bold">단계별 DB 현황</h1>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}>
              <CardHeader className="pb-2">
                <div className="h-6 bg-gray-200 rounded animate-pulse" />
              </CardHeader>
              <CardContent>
                <div className="h-8 bg-gray-200 rounded animate-pulse" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  const summary = stepwiseData?.summary || {
    totalBlogs: 0,
    step1Only: 0,
    step2Complete: 0,
    step3Complete: 0
  };

  // 각 단계별 필터링된 블로그 목록
  const step1Blogs = stepwiseData?.blogs.filter(blog => blog.stepStatus.step1) || [];
  const step2Blogs = stepwiseData?.blogs.filter(blog => blog.stepStatus.step2) || [];
  const step3Blogs = stepwiseData?.blogs.filter(blog => blog.stepStatus.step3) || [];

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Layers className="w-6 h-6 text-blue-600" />
          <h1 className="text-2xl font-bold">단계별 DB 현황</h1>
        </div>
        <Link href="/stepwise-search">
          <Button variant="outline" data-testid="link-stepwise-search">
            단계별 검색으로 이동
            <ChevronRight className="w-4 h-4 ml-2" />
          </Button>
        </Link>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">전체 블로그</CardTitle>
            <Database className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="total-blogs">
              {summary.totalBlogs}개
            </div>
            <p className="text-xs text-muted-foreground">수집된 총 블로그</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">1단계만 완료</CardTitle>
            <CheckCircle className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600" data-testid="step1-only">
              {summary.step1Only}개
            </div>
            <p className="text-xs text-muted-foreground">블로그 수집만 완료</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">2단계 완료</CardTitle>
            <CheckCircle className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600" data-testid="step2-complete">
              {summary.step2Complete}개
            </div>
            <p className="text-xs text-muted-foreground">키워드 API까지 완료</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">3단계 완료</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600" data-testid="step3-complete">
              {summary.step3Complete}개
            </div>
            <p className="text-xs text-muted-foreground">지수 확인까지 완료</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs for different steps */}
      <Tabs value={selectedTab} onValueChange={setSelectedTab}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="step1" data-testid="tab-step1">
            1단계 통과 ({step1Blogs.length})
          </TabsTrigger>
          <TabsTrigger value="step2" data-testid="tab-step2">
            2단계 통과 ({step2Blogs.length})
          </TabsTrigger>
          <TabsTrigger value="step3" data-testid="tab-step3">
            3단계 통과 ({step3Blogs.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="step1" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>1단계 통과 블로그</CardTitle>
              <CardDescription>
                블로그 수집이 완료된 블로그 목록입니다. 다음 단계로 키워드 API 활성화를 진행할 수 있습니다.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {step1Blogs.length > 0 ? (
                renderBlogTable(step1Blogs)
              ) : (
                <p className="text-center text-gray-500 py-8">1단계 통과 블로그가 없습니다.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="step2" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>2단계 통과 블로그</CardTitle>
              <CardDescription>
                키워드 API 활성화까지 완료된 블로그 목록입니다. 다음 단계로 지수 확인을 진행할 수 있습니다.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {step2Blogs.length > 0 ? (
                renderBlogTable(step2Blogs)
              ) : (
                <p className="text-center text-gray-500 py-8">2단계 통과 블로그가 없습니다.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="step3" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>3단계 통과 블로그</CardTitle>
              <CardDescription>
                지수 확인까지 모든 단계가 완료된 블로그 목록입니다. 분석이 완전히 완료되었습니다.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {step3Blogs.length > 0 ? (
                renderBlogTable(step3Blogs)
              ) : (
                <p className="text-center text-gray-500 py-8">3단계 통과 블로그가 없습니다.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}