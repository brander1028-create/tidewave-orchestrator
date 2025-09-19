import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Search, 
  Database, 
  TrendingUp, 
  CheckCircle, 
  Circle,
  Play,
  Loader2,
  FileText,
  BarChart3
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

export default function StepwiseSearchPage() {
  const [keyword, setKeyword] = useState("");
  const [currentStep, setCurrentStep] = useState(1);
  const [selectedTab, setSelectedTab] = useState("step1");
  const [step1Loading, setStep1Loading] = useState(false);
  const [step2Loading, setStep2Loading] = useState(false);
  const [step3Loading, setStep3Loading] = useState(false);
  const { toast } = useToast();
  
  // 상태 데이터
  const [step1Blogs, setStep1Blogs] = useState<any[]>([]);
  const [step2Blogs, setStep2Blogs] = useState<any[]>([]);
  const [step2Results, setStep2Results] = useState<any[]>([]);
  const [step3Blogs, setStep3Blogs] = useState<any[]>([]);
  const [step3Results, setStep3Results] = useState<any[]>([]);
  const [jobId, setJobId] = useState<string | null>(null);

  const handleStep1Search = async () => {
    if (!keyword.trim()) return;
    
    setStep1Loading(true);
    try {
      console.log(`🔍 [Frontend] 1단계 시작: "${keyword}"`);
      
      const res = await apiRequest('POST', '/api/stepwise-search/step1', {
        keyword: keyword.trim()
      });
      const response = await res.json();

      if (response.blogs && response.blogs.length > 0) {
        setStep1Blogs(response.blogs);
        setJobId(response.jobId);
        setCurrentStep(2);
        console.log(`✅ [Frontend] 1단계 완료: ${response.blogs.length}개 블로그 수집`);
        
        toast({
          title: "블로그 수집 완료",
          description: `${response.blogs.length}개의 블로그를 발견했습니다`,
        });
      } else {
        toast({
          title: "검색 결과 없음",
          description: "해당 키워드로 블로그를 찾을 수 없습니다",
          variant: "destructive"
        });
      }
    } catch (error) {
      console.error("❌ [Frontend] 1단계 검색 실패:", error);
      toast({
        title: "검색 실패",
        description: "블로그 검색 중 오류가 발생했습니다",
        variant: "destructive"
      });
    } finally {
      setStep1Loading(false);
    }
  };

  const handleStep2Process = async (blogId: string) => {
    // Guard: jobId가 없으면 2단계 실행 불가
    if (!jobId) {
      toast({
        title: "작업 ID 없음",
        description: "먼저 1단계 블로그 수집을 완료해주세요",
        variant: "destructive",
      });
      return;
    }

    setStep2Loading(true);
    setSelectedTab("step2"); // 자동으로 2단계 탭으로 전환
    try {
      console.log(`🔍 [Frontend] 2단계 시작: "${blogId}"`);
      
      const res = await apiRequest('POST', '/api/stepwise-search/step2', {
        jobId: jobId,
        blogIds: [blogId] // 단일 블로그를 배열로 전달
      });
      const response = await res.json();

      if (response.results && response.results.length > 0) {
        setStep2Blogs(prev => [...prev, blogId]);
        setStep2Results(prev => [...prev, ...response.results]);
        if (currentStep < 3) setCurrentStep(3);
        toast({
          title: "키워드 분석 완료",
          description: `${response.message}`,
        });
        console.log(`✅ [Frontend] 2단계 완료:`, response.results);
      } else {
        toast({
          title: "키워드 분석 실패",
          description: "키워드를 추출할 수 없습니다",
          variant: "destructive",
        });
      }

      setStep2Loading(false);
    } catch (error) {
      console.error("❌ [Frontend] 2단계 처리 실패:", error);
      toast({
        title: "키워드 분석 실패",
        description: "키워드 분석 중 오류가 발생했습니다",
        variant: "destructive",
      });
      setStep2Loading(false);
    }
  };

  const handleStep3Check = async (blogId: string) => {
    // Guard: jobId가 없으면 3단계 실행 불가
    if (!jobId) {
      toast({
        title: "작업 ID 없음",
        description: "먼저 1단계 블로그 수집을 완료해주세요",
        variant: "destructive",
      });
      return;
    }

    setStep3Loading(true);
    setSelectedTab("step3"); // 자동으로 3단계 탭으로 전환
    try {
      console.log(`🎯 [Frontend] 3단계 시작: "${blogId}"`);
      
      const res = await apiRequest('POST', '/api/stepwise-search/step3', {
        jobId: jobId,
        blogIds: [blogId] // 단일 블로그를 배열로 전달
      });
      const response = await res.json();

      if (response.results && response.results.length > 0) {
        setStep3Blogs(prev => [...prev, blogId]);
        setStep3Results(prev => [...prev, ...response.results]);
        toast({
          title: "순위 확인 완료",
          description: `${response.message}`,
        });
        console.log(`✅ [Frontend] 3단계 완료:`, response.results);
      } else {
        toast({
          title: "순위 확인 실패",
          description: "블로그 순위를 확인할 수 없습니다",
          variant: "destructive",
        });
      }

      setStep3Loading(false);
    } catch (error) {
      console.error("❌ [Frontend] 3단계 처리 실패:", error);
      toast({
        title: "순위 확인 실패",
        description: "순위 확인 중 오류가 발생했습니다",
        variant: "destructive",
      });
      setStep3Loading(false);
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* 헤더 */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">단계별 검색</h1>
        <p className="text-muted-foreground mt-2">
          3단계 블로그 분석 프로세스: 키워드 검색 → API 활성화 → 지수 확인
        </p>
      </div>

      {/* 프로세스 단계 표시 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            분석 프로세스
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <div className={`flex items-center gap-2 ${currentStep >= 1 ? 'text-blue-600' : 'text-gray-400'}`}>
              {step1Blogs.length > 0 ? <CheckCircle className="h-5 w-5 text-green-600" /> : <Circle className="h-5 w-5" />}
              <span className="font-medium">1단계: 블로그 수집</span>
            </div>
            <div className="h-px bg-gray-300 flex-1" />
            <div className={`flex items-center gap-2 ${currentStep >= 2 ? 'text-blue-600' : 'text-gray-400'}`}>
              {step2Blogs.length > 0 ? <CheckCircle className="h-5 w-5 text-green-600" /> : <Circle className="h-5 w-5" />}
              <span className="font-medium">2단계: 키워드 API</span>
            </div>
            <div className="h-px bg-gray-300 flex-1" />
            <div className={`flex items-center gap-2 ${currentStep >= 3 ? 'text-blue-600' : 'text-gray-400'}`}>
              {step3Blogs.length > 0 ? <CheckCircle className="h-5 w-5 text-green-600" /> : <Circle className="h-5 w-5" />}
              <span className="font-medium">3단계: 지수 확인</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 키워드 입력 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="h-5 w-5" />
            키워드 검색
          </CardTitle>
          <CardDescription>
            M.NAVER.COM에서 키워드를 검색하여 첫페이지 블로그를 수집합니다
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4">
            <Input
              placeholder="검색할 키워드를 입력하세요"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleStep1Search()}
              data-testid="input-keyword"
            />
            <Button 
              onClick={handleStep1Search}
              disabled={!keyword.trim() || step1Loading}
              data-testid="button-step1-search"
            >
              {step1Loading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  검색 중...
                </>
              ) : (
                <>
                  <Play className="h-4 w-4 mr-2" />
                  1단계 시작
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* 탭으로 각 단계 결과 표시 */}
      <Tabs value={selectedTab} onValueChange={setSelectedTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="step1">
            1단계: 블로그 수집
          </TabsTrigger>
          <TabsTrigger value="step2" disabled={step1Blogs.length === 0}>
            2단계: 키워드 API
          </TabsTrigger>
          <TabsTrigger value="step3" disabled={step2Blogs.length === 0}>
            3단계: 지수 확인
          </TabsTrigger>
        </TabsList>

        {/* 1단계 결과 */}
        <TabsContent value="step1" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="h-5 w-5" />
                1단계 블로그 ({step1Blogs.length}개)
              </CardTitle>
              <CardDescription>
                첫페이지에서 수집된 블로그 목록 (피치피드 위까지)
              </CardDescription>
            </CardHeader>
            <CardContent>
              {step1Blogs.length > 0 ? (
                <div className="space-y-4">
                  {step1Blogs.map((blog) => (
                    <div key={blog.id} className="border rounded-lg p-4" data-testid={`blog-step1-${blog.id}`}>
                      <div className="flex items-center justify-between">
                        <div className="space-y-2">
                          <h4 className="font-medium">{blog.blogName}</h4>
                          <div className="flex items-center gap-4 text-sm text-gray-600">
                            <span>순위: {blog.rank}위</span>
                            <span>조회량: {blog.volume?.toLocaleString()}</span>
                            <span>점수: {blog.score}점</span>
                            <Badge variant={blog.status === "수집됨" ? "default" : "secondary"}>
                              {blog.status}
                            </Badge>
                          </div>
                        </div>
                        <Button 
                          onClick={() => handleStep2Process(blog.id)}
                          disabled={step2Loading || step2Blogs.includes(blog.id)}
                          size="sm"
                          data-testid={`button-step2-${blog.id}`}
                        >
                          {step2Loading ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : step2Blogs.includes(blog.id) ? (
                            "활성화됨"
                          ) : (
                            "키워드 API 활성화"
                          )}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-500 text-center py-8">
                  키워드를 검색하여 블로그를 수집해주세요
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* 2단계 결과 */}
        <TabsContent value="step2" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                2단계: 키워드 API 활성화 ({step2Blogs.length}개 처리됨)
              </CardTitle>
              <CardDescription>
                블로그 최신글에서 키워드를 추출하고 분석합니다
              </CardDescription>
            </CardHeader>
            <CardContent>
              {step2Blogs.length > 0 ? (
                <div className="space-y-4">
                  {step2Blogs.map((blogId) => {
                    const blog = step1Blogs.find(b => b.id === blogId);
                    return (
                      <div key={blogId} className="border rounded-lg p-4" data-testid={`blog-step2-${blogId}`}>
                        <div className="flex items-center justify-between">
                          <div className="space-y-2">
                            <h4 className="font-medium">{blog?.blogName} - 키워드 추출 완료</h4>
                            <div className="text-sm text-gray-600">
                              제목에서 키워드를 추출하고 조회량 및 경쟁도를 분석했습니다
                            </div>
                          </div>
                          <Button 
                            onClick={() => handleStep3Check(blogId)}
                            disabled={step3Loading || step3Blogs.includes(blogId)}
                            size="sm"
                            data-testid={`button-step3-${blogId}`}
                          >
                            {step3Loading ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : step3Blogs.includes(blogId) ? (
                              "지수 확인됨"
                            ) : (
                              "블로그 지수 확인"
                            )}
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-gray-500 text-center py-8">
                  1단계에서 블로그를 선택하고 "키워드 API 활성화" 버튼을 눌러주세요
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* 3단계 결과 */}
        <TabsContent value="step3" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                3단계: 블로그 지수 확인 ({step3Blogs.length}개 확인됨)
              </CardTitle>
              <CardDescription>
                키워드의 실제 노출 순위를 확인합니다
              </CardDescription>
            </CardHeader>
            <CardContent>
              {step3Blogs.length > 0 ? (
                <div className="space-y-4">
                  {step3Blogs.map((blogId) => {
                    const blog = step1Blogs.find(b => b.id === blogId);
                    return (
                      <div key={blogId} className="border rounded-lg p-4" data-testid={`blog-step3-${blogId}`}>
                        <div className="space-y-2">
                          <h4 className="font-medium">{blog?.blogName} - 지수 확인 완료</h4>
                          <div className="text-sm text-gray-600">
                            키워드별 네이버 모바일 노출 순위가 확인되었습니다
                          </div>
                          <div className="flex gap-2">
                            <Badge variant="outline" className="text-green-600">
                              노출 키워드: 3개
                            </Badge>
                            <Badge variant="outline" className="text-blue-600">
                              평균 순위: 5.2위
                            </Badge>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-gray-500 text-center py-8">
                  2단계 완료 후 이용 가능합니다
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}