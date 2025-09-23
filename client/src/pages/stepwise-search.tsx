import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { 
  Search, 
  Database, 
  TrendingUp, 
  CheckCircle, 
  Circle,
  Play,
  Loader2,
  FileText,
  BarChart3,
  Square,
  ExternalLink,
  Settings
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
  const [postsPerBlog, setPostsPerBlog] = useState(5); // 🔥 블로그당 포스트 개수 설정 (기본 5개)

  // 작업 취소 함수
  const handleCancelJob = async () => {
    if (!jobId) return;
    
    try {
      console.log(`🛑 [Frontend] Job ${jobId} 취소 요청`);
      
      const res = await apiRequest('POST', `/api/serp/jobs/${jobId}/cancel`);
      const response = await res.json();
      
      console.log(`✅ [Frontend] Job ${jobId} 취소 완료`);
      
      // UI 상태 초기화
      setStep1Loading(false);
      setStep2Loading(false);
      setStep3Loading(false);
      
      toast({
        title: "분석 중단됨",
        description: "분석이 성공적으로 중단되었습니다",
        variant: "default"
      });
      
    } catch (error) {
      console.error("❌ [Frontend] Job 취소 실패:", error);
      toast({
        title: "취소 실패",
        description: "분석 중단 중 오류가 발생했습니다",
        variant: "destructive"
      });
    }
  };

  const handleStep1Search = async () => {
    if (!keyword.trim()) return;
    
    setStep1Loading(true);
    try {
      console.log(`🔍 [Frontend] 1단계 시작: "${keyword}"`);
      
      // 1단계 job 시작
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

  // 일괄 활성화 함수
  const handleBulkStep2Analysis = async () => {
    if (!jobId) {
      toast({
        title: "작업 ID 없음",
        description: "먼저 1단계 블로그 수집을 완료해주세요",
        variant: "destructive",
      });
      return;
    }

    setStep2Loading(true);
    try {
      // 아직 키워드 분석이 안된 블로그들만 처리
      const blogsToProcess = step1Blogs.filter(blog => !step2Blogs.includes(blog.id));
      
      if (blogsToProcess.length === 0) {
        toast({
          title: "처리할 블로그 없음",
          description: "모든 블로그가 이미 키워드 분석되었습니다",
        });
        return;
      }
      
      console.log(`🔄 [Frontend] 일괄 키워드 분석 시작: ${blogsToProcess.length}개 블로그`);
      
      for (const blog of blogsToProcess) {
        try {
          console.log(`🔄 [Frontend] 블로그 "${blog.blogName}" 키워드 분석 중...`);
          
          // localStorage에서 키워드 선정 설정값 읽어오기
          const savedSettings = localStorage.getItem('keywordSelectionSettings');
          const keywordSettings = savedSettings ? JSON.parse(savedSettings) : null;
          
          const res = await apiRequest('POST', '/api/stepwise-search/step2', {
            jobId: jobId,
            blogIds: [blog.id],
            keywordSettings: keywordSettings,
            postsPerBlog: postsPerBlog // 🔥 블로그당 포스트 개수 전송
          });
          
          if (!res.ok) {
            throw new Error(`API 요청 실패: ${res.status}`);
          }
          
          const response = await res.json();
          
          // 성공 시 step2Blogs와 step2Results에 추가
          setStep2Blogs(prev => [...prev, blog.id]);
          if (response.results && response.results.length > 0) {
            setStep2Results(prev => [...prev, ...response.results]);
          }
          
          console.log(`✅ [Frontend] 블로그 "${blog.blogName}" 키워드 분석 완료`);
          
          // 잠시 대기 (서버 부하 방지)
          await new Promise(resolve => setTimeout(resolve, 1000));
          
        } catch (error) {
          console.error(`❌ [Frontend] 블로그 "${blog.blogName}" 키워드 분석 실패:`, error);
          toast({
            title: `${blog.blogName} 키워드 분석 실패`,
            description: `오류: ${error instanceof Error ? error.message : '알 수 없는 오류'}`,
            variant: "destructive"
          });
        }
      }
      
      console.log(`🎉 [Frontend] 일괄 키워드 분석 완료: ${blogsToProcess.length}개 처리됨`);
      
      toast({
        title: "일괄 키워드 분석 완료",
        description: `${blogsToProcess.length}개 블로그의 키워드가 분석되었습니다`,
      });
      
    } catch (error) {
      console.error("❌ [Frontend] 일괄 키워드 분석 실패:", error);
      toast({
        title: "일괄 키워드 분석 실패", 
        description: "키워드 분석 중 오류가 발생했습니다",
        variant: "destructive"
      });
    } finally {
      setStep2Loading(false);
    }
  };

  const handleBulkActivation = async () => {
    if (!jobId) {
      toast({
        title: "작업 ID 없음",
        description: "먼저 1단계 블로그 수집을 완료해주세요",
        variant: "destructive",
      });
      return;
    }

    setStep2Loading(true);
    try {
      const totalBlogs = step1Blogs.length;
      const activatedBlogs = step2Blogs.length;
      
      console.log(`🔄 [Frontend] 일괄 활성화 시작: ${totalBlogs - activatedBlogs}개 블로그`);
      
      // 아직 활성화되지 않은 블로그들만 처리
      const blogsToProcess = step1Blogs.filter(blog => !step2Blogs.includes(blog.id));
      
      for (const blog of blogsToProcess) {
        try {
          console.log(`🔄 [Frontend] 블로그 "${blog.blogName}" 키워드 활성화 시작...`);
          
          const res = await apiRequest('POST', `/api/stepwise-search/step2`, {
            jobId,
            blogIds: [blog.id]
          });
          
          console.log(`🔍 [Debug] Response status: ${res.status}`);
          console.log(`🔍 [Debug] Response headers:`, res.headers.get('content-type'));
          
          // 응답 텍스트를 먼저 읽어서 확인
          const responseText = await res.text();
          console.log(`🔍 [Debug] Response body (first 200 chars):`, responseText.substring(0, 200));
          
          let response;
          try {
            response = JSON.parse(responseText);
            console.log(`🔍 [Debug] JSON 파싱 성공:`, response);
          } catch (parseError) {
            console.error(`❌ [Debug] JSON 파싱 실패:`, parseError);
            console.error(`❌ [Debug] 전체 응답:`, responseText);
            throw new Error(`서버 응답이 JSON 형식이 아닙니다: ${responseText.substring(0, 100)}`);
          }
          
          // 성공 시 step2Blogs와 step2Results에 추가
          setStep2Blogs(prev => [...prev, blog.id]);
          if (response.results && response.results.length > 0) {
            setStep2Results(prev => [...prev, ...response.results]);
          }
          
          console.log(`✅ [Frontend] 블로그 "${blog.blogName}" 활성화 완료`);
          
          // 잠시 대기 (서버 부하 방지)
          await new Promise(resolve => setTimeout(resolve, 500));
          
        } catch (error: any) {
          console.error(`❌ [Frontend] 블로그 "${blog.blogName}" 활성화 실패:`, error);
          
          // 제목이 없는 경우 친화적인 메시지
          if (error.message && error.message.includes('제목')) {
            toast({
              title: `${blog.blogName} 키워드 분석 불가`,
              description: "먼저 '제목 긁어오기' 버튼을 눌러 블로그 포스트를 수집해주세요",
              variant: "default"
            });
          } else {
            toast({
              title: `${blog.blogName} 활성화 실패`,
              description: `오류: ${error instanceof Error ? error.message : '알 수 없는 오류'}`,
              variant: "destructive"
            });
          }
        }
      }
      
      console.log(`🎉 [Frontend] 일괄 활성화 완료: ${blogsToProcess.length}개 처리됨`);
      
      // Step2 탭으로 자동 전환
      setSelectedTab("step2");
      
      toast({
        title: "일괄 활성화 완료",
        description: `${blogsToProcess.length}개 블로그가 활성화되었습니다`,
      });
      
    } catch (error) {
      console.error("❌ [Frontend] 일괄 활성화 실패:", error);
      toast({
        title: "일괄 활성화 실패", 
        description: "블로그 활성화 중 오류가 발생했습니다",
        variant: "destructive"
      });
    } finally {
      setStep2Loading(false);
    }
  };

  // 제목 스크래핑 함수
  const handleTitleScraping = async () => {
    if (!jobId) {
      toast({
        title: "작업 ID 없음",
        description: "먼저 1단계 블로그 수집을 완료해주세요",
        variant: "destructive",
      });
      return;
    }
    
    try {
      console.log(`🔍 [Frontend] 제목 스크래핑 시작`);
      
      const res = await apiRequest('POST', '/api/stepwise-search/scrape-titles', {
        jobId: jobId
      });
      const response = await res.json();
      
      if (response.results && response.results.length > 0) {
        // UI에 제목 업데이트 반영
        const updatedBlogs = step1Blogs.map(blog => {
          const scraped = response.results.find((r: any) => r.id === blog.id);
          if (scraped && scraped.title) {
            return { ...blog, title: scraped.title };
          }
          return blog;
        });
        
        setStep1Blogs(updatedBlogs);
        
        console.log(`✅ [Frontend] 제목 스크래핑 완료: 성공 ${response.summary.scraped}개, 실패 ${response.summary.failed}개`);
        
        toast({
          title: "제목 스크래핑 완료",
          description: `${response.summary.scraped}개 제목을 성공적으로 가져왔습니다`,
        });
      } else {
        toast({
          title: "스크래핑 결과 없음",
          description: "새로 가져올 제목이 없습니다",
          variant: "default"
        });
      }
    } catch (error) {
      console.error("❌ [Frontend] 제목 스크래핑 실패:", error);
      toast({
        title: "스크래핑 실패",
        description: "제목 스크래핑 중 오류가 발생했습니다",
        variant: "destructive"
      });
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
      
      // 키워드 관리 시스템을 활용하여 자동으로 처리됩니다.
      
      // localStorage에서 키워드 선정 설정값 읽어오기
      const savedSettings = localStorage.getItem('keywordSelectionSettings');
      const keywordSettings = savedSettings ? JSON.parse(savedSettings) : null;
      
      const res = await apiRequest('POST', '/api/stepwise-search/step2', {
        jobId: jobId,
        blogIds: [blogId], // 단일 블로그를 배열로 전달
        keywordSettings: keywordSettings, // 사용자 설정값 전달
        postsPerBlog: postsPerBlog // 🔥 블로그당 포스트 개수 전송
      });
      
      console.log(`🔍 [Debug Individual] Response status: ${res.status}`);
      console.log(`🔍 [Debug Individual] Response headers:`, res.headers.get('content-type'));
      
      // 응답 텍스트를 먼저 읽어서 확인
      const responseText = await res.text();
      console.log(`🔍 [Debug Individual] Response body (first 200 chars):`, responseText.substring(0, 200));
      
      let response;
      try {
        response = JSON.parse(responseText);
        console.log(`🔍 [Debug Individual] JSON 파싱 성공:`, response);
      } catch (parseError) {
        console.error(`❌ [Debug Individual] JSON 파싱 실패:`, parseError);
        console.error(`❌ [Debug Individual] 전체 응답:`, responseText);
        throw new Error(`서버 응답이 JSON 형식이 아닙니다: ${responseText.substring(0, 100)}`);
      }

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
          <div className="space-y-4">
            {/* 키워드 입력 */}
            <div className="flex gap-4">
              <Input
                placeholder="검색할 키워드를 입력하세요"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleStep1Search()}
                data-testid="input-keyword"
              />
              <Button 
                onClick={step1Loading ? handleCancelJob : handleStep1Search}
                disabled={!step1Loading && !keyword.trim()}
                data-testid={step1Loading ? "button-cancel-analysis" : "button-step1-search"}
                variant={step1Loading ? "destructive" : "default"}
              >
                {step1Loading ? (
                  <>
                    <Square className="h-4 w-4 mr-2" />
                    분석 중단
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4 mr-2" />
                    1단계 시작
                  </>
                )}
              </Button>
            </div>
            
            {/* 포스트 개수 설정 */}
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <Settings className="h-4 w-4 text-gray-600" />
                  <Label htmlFor="posts-per-blog" className="text-sm font-medium">
                    블로그당 분석할 포스트 개수:
                  </Label>
                </div>
                <Input
                  id="posts-per-blog"
                  type="number"
                  min="1"
                  max="10"
                  value={postsPerBlog}
                  onChange={(e) => setPostsPerBlog(parseInt(e.target.value) || 5)}
                  className="w-20"
                  data-testid="input-posts-per-blog"
                />
                <span className="text-sm text-gray-600">
                  (기본 5개, 최대 10개) → 총 {postsPerBlog * 4}개 키워드 추출
                </span>
              </div>
              <p className="text-xs text-gray-500 mt-2">
                💡 각 포스트에서 4개 키워드를 추출하므로, 5개 포스트 × 4개 = 총 20개 키워드가 분석됩니다
              </p>
            </div>
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
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Database className="h-5 w-5" />
                    1단계 블로그 ({step1Blogs.length}개)
                  </CardTitle>
                  <CardDescription>
                    첫페이지에서 수집된 블로그 목록
                  </CardDescription>
                </div>
                {step1Blogs.length > 0 && (
                  <div className="flex items-center gap-2 ml-4">
                    <Button 
                      onClick={handleBulkActivation}
                      disabled={step2Loading || step1Blogs.every(blog => step2Blogs.includes(blog.id))}
                      size="sm"
                      data-testid="button-bulk-activate"
                    >
                      {step2Loading ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin mr-2" />
                          일괄 활성화 중...
                        </>
                      ) : step1Blogs.every(blog => step2Blogs.includes(blog.id)) ? (
                        "모두 활성화됨"
                      ) : (
                        "모두 활성화"
                      )}
                    </Button>
                    <Button
                      onClick={handleTitleScraping}
                      variant="outline"
                      size="sm"
                      data-testid="button-title-scraping"
                    >
                      제목 긁어오기
                    </Button>
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {step1Blogs.length > 0 ? (
                <div className="space-y-4">
                  {step1Blogs.map((blog) => (
                    <div key={blog.id} className="border rounded-lg p-4" data-testid={`blog-step1-${blog.id}`}>
                      <div className="flex items-center justify-between">
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <h4 className="font-medium">{blog.blogName}</h4>
                            <span className="text-gray-400">/</span>
                            <button
                              onClick={() => window.open(blog.blogUrl, '_blank', 'noopener,noreferrer')}
                              className="p-1 hover:bg-gray-100 rounded transition-colors"
                              title="블로그 새창에서 열기"
                              data-testid={`button-open-blog-${blog.id}`}
                            >
                              <ExternalLink className="h-4 w-4 text-blue-600" />
                            </button>
                            {blog.title && blog.title !== `${blog.blogName}의 인플루언서` && blog.title !== `${blog.blogName}의 포스트` && (
                              <span className="text-gray-700 text-sm">{blog.title}</span>
                            )}
                          </div>
                          <div className="flex items-center gap-4 text-sm text-gray-600">
                            <span>순위: {blog.blogType === 'top_exposure' ? `상위노출 ${blog.rank}위` : `서치피드 ${blog.rank}위`}</span>
                            <span>조회량: {blog.volume?.toLocaleString()}</span>
                            <span>점수: {blog.score}점</span>
                            <Badge variant={blog.blogType === "top_exposure" ? "default" : "secondary"}>
                              {blog.blogType === 'top_exposure' ? '상위노출' : '서치피드'}
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

        {/* 2단계 결과 - SERP 스타일 티어별 키워드 표시 */}
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
              {step2Blogs.length > 0 && step2Blogs.length < step1Blogs.length && (
                <div className="flex items-center gap-2">
                  <Button 
                    onClick={handleBulkStep2Analysis}
                    disabled={step2Loading}
                    size="sm"
                    data-testid="button-bulk-step2-analysis"
                  >
                    {step2Loading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        일괄 키워드 분석 중...
                      </>
                    ) : (
                      "남은 블로그 일괄 키워드 분석"
                    )}
                  </Button>
                </div>
              )}
            </CardHeader>
            <CardContent>
              {step2Blogs.length > 0 ? (
                <div className="space-y-6">
                  {step2Blogs.map((blogId) => {
                    const blog = step1Blogs.find(b => b.id === blogId);
                    const result = step2Results.find(r => r.blogId === blogId);
                    
                    // SERP UI 스타일 헬퍼 함수
                    const fmtVol = (v: number | null) => v === null ? "–" : v.toLocaleString();
                    const getVolumeColor = (volume: number | null) => {
                      if (volume === null) return "bg-gray-100 text-gray-600";
                      if (volume >= 10000) return "bg-emerald-100 text-emerald-800 font-medium";
                      if (volume >= 1000) return "bg-blue-100 text-blue-800";
                      return "bg-yellow-100 text-yellow-800";
                    };
                    const getScoreColor = (score: number) => {
                      if (score >= 80) return "bg-emerald-100 text-emerald-800 font-medium";
                      if (score >= 60) return "bg-blue-100 text-blue-800";
                      return "bg-yellow-100 text-yellow-800";
                    };
                    
                    return (
                      <div key={blogId} className="border-2 rounded-lg p-6" data-testid={`blog-step2-${blogId}`}>
                        {/* 블로그 헤더 */}
                        <div className="flex items-center justify-between mb-4">
                          <div className="flex items-center gap-4">
                            <h3 className="text-xl font-semibold" data-testid={`text-blogname-${blogId}`}>
                              {blog?.blogName}
                            </h3>
                            <Badge variant="outline" className="bg-blue-50">
                              분석된 포스트: {result?.postsAnalyzed || 0}개
                            </Badge>
                            <Badge variant="outline" className="bg-green-50">
                              추출된 키워드: {result?.keywordsExtracted || 0}개
                            </Badge>
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

                        {result && result.topKeywords && result.topKeywords.length > 0 ? (
                          <div className="space-y-4">
                            {/* 블로그 총 Top 키워드 (통합) */}
                            <div className="bg-gray-50 rounded-lg p-4">
                              <h4 className="font-medium text-lg mb-3">블로그 총 Top 키워드(통합)</h4>
                              <div className="space-y-2" data-testid={`list-agg-${blogId}`}>
                                {result.topKeywords.slice(0, 4).map((kw: any, idx: number) => (
                                  <div key={idx} className="flex items-center justify-between py-2 border-b last:border-b-0">
                                    <div className="flex items-center gap-3">
                                      <Badge variant="outline" className="bg-blue-50 font-medium">
                                        {idx + 1}티어:
                                      </Badge>
                                      <span className="font-semibold">{kw.text || kw.keyword}</span>
                                      {kw.isCombo && <Badge variant="secondary" className="text-xs">조합</Badge>}
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <Badge className={getVolumeColor(kw.volume)}>
                                        조회량 {fmtVol(kw.volume)}
                                      </Badge>
                                      <Badge className={getScoreColor(kw.score || kw.cpc || 0)}>
                                        점수 {kw.score || kw.cpc || 0}pts
                                      </Badge>
                                      <Badge variant="outline" className="bg-gray-50">
                                        순위 미확인
                                      </Badge>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>

                            {/* 포스트별 1~4티어 (전수조사 기능 준비) */}
                            <div className="bg-white border rounded-lg p-4">
                              <h4 className="font-medium text-lg mb-3">포스트별 1~4티어 (전수조사)</h4>
                              <div className="text-sm text-gray-600 mb-3">
                                각 포스트에서 상위 4개 키워드를 티어별로 분석 (구현 예정)
                              </div>
                              
                              {/* 포스트 샘플 (실제 구현시 posts 데이터 활용) */}
                              {Array.from({length: Math.min(result.postsAnalyzed, 5)}, (_, postIdx) => (
                                <div key={postIdx} className="border rounded p-3 mb-3 last:mb-0">
                                  <div className="font-medium text-sm mb-2">
                                    포스트 {postIdx + 1} (전수조사)
                                  </div>
                                  <div className="grid grid-cols-4 gap-2">
                                    {[1, 2, 3, 4].map((tier) => {
                                      const kw = result.topKeywords[postIdx * 4 + tier - 1];
                                      return (
                                        <div key={tier} className="text-xs" data-testid={`row-tier-${blogId}-${postIdx}-${tier}`}>
                                          <div className="font-medium">{tier}티어:</div>
                                          <div className="text-blue-600">
                                            {kw ? (kw.text || kw.keyword) : '비어있음'}
                                          </div>
                                          {kw && (
                                            <>
                                              <div className="text-gray-500">조회량 {fmtVol(kw.volume)}</div>
                                              <div className="text-gray-500">점수 {kw.score || kw.cpc || 0}pts</div>
                                            </>
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : (
                          <div className="text-center py-8 text-gray-500">
                            키워드 분석 중이거나 결과가 없습니다
                          </div>
                        )}
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
                    const result = step3Results.find(r => r.blogId === blogId);
                    return (
                      <div key={blogId} className="border rounded-lg p-4" data-testid={`blog-step3-${blogId}`}>
                        <div className="space-y-2">
                          <h4 className="font-medium" data-testid={`text-blog-name-${blogId}`}>
                            {blog?.blogName} - 지수 확인 완료
                          </h4>
                          <div className="text-sm text-gray-600" data-testid={`text-description-${blogId}`}>
                            키워드별 네이버 모바일 노출 순위가 확인되었습니다
                          </div>
                          <div className="flex gap-2">
                            {result ? (
                              <>
                                <Badge 
                                  variant={result.isRanked ? "default" : "secondary"} 
                                  className={result.isRanked ? "text-green-600" : "text-gray-600"}
                                  data-testid={`badge-status-${blogId}`}
                                >
                                  {result.isRanked ? `${result.ranking}위 진입` : "순위 미진입"}
                                </Badge>
                                <Badge variant="outline" className="text-blue-600" data-testid={`badge-details-${blogId}`}>
                                  {result.details || "순위 확인 완료"}
                                </Badge>
                                {result.error && (
                                  <Badge variant="destructive" data-testid={`badge-error-${blogId}`}>
                                    오류 발생
                                  </Badge>
                                )}
                              </>
                            ) : (
                              <Badge variant="outline" data-testid={`badge-processing-${blogId}`}>
                                처리 중...
                              </Badge>
                            )}
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