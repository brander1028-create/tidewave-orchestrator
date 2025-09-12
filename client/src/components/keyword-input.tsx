import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { Search, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

const serpAnalysisSchema = z.object({
  keywords: z.array(z.string().min(1, "키워드를 입력해주세요")).min(1, "최소 1개의 키워드가 필요합니다").max(20, "최대 20개까지 입력 가능합니다"),
  minRank: z.number().min(2).max(15),
  maxRank: z.number().min(2).max(15),
  postsPerBlog: z.number().min(1, "최소 1개").max(20, "최대 20개"),
}).refine((data) => data.minRank <= data.maxRank, {
  message: "최소 순위는 최대 순위보다 작거나 같아야 합니다",
  path: ["maxRank"],
});

type SerpAnalysisFormData = z.infer<typeof serpAnalysisSchema>;

interface KeywordInputProps {
  onAnalysisStarted: (jobId: string) => void;
}

export default function KeywordInput({ onAnalysisStarted }: KeywordInputProps) {
  const { toast } = useToast();
  const [currentKeyword, setCurrentKeyword] = useState("");
  const [keywords, setKeywords] = useState<string[]>([]);
  const [rankRange, setRankRange] = useState<[number, number]>([2, 10]);
  const [postsPerBlog, setPostsPerBlog] = useState(10);
  
  const form = useForm<SerpAnalysisFormData>({
    resolver: zodResolver(serpAnalysisSchema),
    defaultValues: {
      keywords: [],
      minRank: 2,
      maxRank: 10,
      postsPerBlog: 10,
    },
  });

  const startAnalysisMutation = useMutation({
    mutationFn: async (data: SerpAnalysisFormData) => {
      const response = await apiRequest("POST", "/api/serp/analyze", data);
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "분석 시작됨",
        description: `${keywords.length}개 키워드로 네이버 검색 분석이 시작되었습니다.`,
      });
      onAnalysisStarted(data.jobId);
    },
    onError: (error) => {
      toast({
        title: "분석 시작 실패",
        description: error.message || "분석을 시작할 수 없습니다.",
        variant: "destructive",
      });
    },
  });

  const addKeyword = () => {
    const trimmed = currentKeyword.trim();
    if (trimmed && !keywords.includes(trimmed) && keywords.length < 20) {
      const newKeywords = [...keywords, trimmed];
      setKeywords(newKeywords);
      form.setValue("keywords", newKeywords);
      setCurrentKeyword("");
    }
  };

  const removeKeyword = (index: number) => {
    const newKeywords = keywords.filter((_, i) => i !== index);
    setKeywords(newKeywords);
    form.setValue("keywords", newKeywords);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addKeyword();
    }
  };

  const onSubmit = (data: SerpAnalysisFormData) => {
    startAnalysisMutation.mutate({
      ...data,
      keywords,
      minRank: rankRange[0],
      maxRank: rankRange[1],
      postsPerBlog,
    });
  };

  return (
    <Card className="mb-8 shadow-sm">
      <CardHeader>
        <CardTitle>네이버 검색 순위 분석</CardTitle>
        <CardDescription>
          키워드들을 입력하고 순위 범위를 설정하여 상위 블로그들의 다른 키워드 노출 현황을 분석하세요.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          {/* 키워드 입력 */}
          <div className="space-y-3">
            <Label>분석할 키워드 (1-20개)</Label>
            <div className="flex gap-2">
              <Input
                value={currentKeyword}
                onChange={(e) => setCurrentKeyword(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="키워드를 입력하고 Enter 또는 + 버튼을 클릭하세요"
                data-testid="input-keyword"
                className="flex-1"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={addKeyword}
                disabled={!currentKeyword.trim() || keywords.length >= 20}
                data-testid="button-add-keyword"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            
            {/* 키워드 목록 */}
            {keywords.length > 0 && (
              <div className="space-y-2">
                <Label className="text-sm text-muted-foreground">
                  추가된 키워드 ({keywords.length}/20)
                </Label>
                <div className="flex flex-wrap gap-2">
                  {keywords.map((keyword, index) => (
                    <Badge
                      key={index}
                      variant="secondary"
                      className="flex items-center gap-1 px-3 py-1"
                      data-testid={`keyword-badge-${index}`}
                    >
                      {keyword}
                      <X
                        className="h-3 w-3 cursor-pointer hover:text-destructive"
                        onClick={() => removeKeyword(index)}
                      />
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* 순위 범위 설정 */}
          <div className="space-y-3">
            <Label>검색 순위 범위 ({rankRange[0]}위 ~ {rankRange[1]}위)</Label>
            <div className="px-4">
              <Slider
                value={rankRange}
                onValueChange={(value) => {
                  setRankRange(value as [number, number]);
                  form.setValue("minRank", value[0]);
                  form.setValue("maxRank", value[1]);
                }}
                min={2}
                max={15}
                step={1}
                className="w-full"
                data-testid="slider-rank-range"
              />
              <div className="flex justify-between text-xs text-muted-foreground mt-1">
                <span>2위</span>
                <span>15위</span>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              선택한 순위 범위 내에 있는 블로그들만 분석 대상에 포함됩니다.
            </p>
          </div>

          {/* 블로그별 포스트 개수 설정 */}
          <div className="space-y-3">
            <Label>각 블로그별 분석할 최근 포스트 개수 ({postsPerBlog}개)</Label>
            <div className="px-4">
              <Slider
                value={[postsPerBlog]}
                onValueChange={(value) => {
                  setPostsPerBlog(value[0]);
                  form.setValue("postsPerBlog", value[0]);
                }}
                min={1}
                max={20}
                step={1}
                className="w-full"
                data-testid="slider-posts-per-blog"
              />
              <div className="flex justify-between text-xs text-muted-foreground mt-1">
                <span>1개</span>
                <span>20개</span>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              각 블로그에서 최근 포스트를 몇 개까지 수집하여 키워드 분석할지 설정합니다.
            </p>
          </div>

          {/* 분석 시작 버튼 */}
          <div className="flex justify-between items-center pt-4 border-t border-border">
            <div className="text-sm text-muted-foreground">
              {keywords.length > 0 ? (
                <span>
                  {keywords.length}개 키워드, {rankRange[0]}-{rankRange[1]}위 블로그, 블로그당 {postsPerBlog}개 포스트 분석 예정
                </span>
              ) : (
                <span>키워드를 추가하여 분석을 시작하세요</span>
              )}
            </div>
            <Button 
              type="submit" 
              disabled={keywords.length === 0 || startAnalysisMutation.isPending}
              data-testid="button-start-analysis"
              className="min-w-32"
            >
              <Search className="h-4 w-4 mr-2" />
              {startAnalysisMutation.isPending ? "분석 중..." : "분석 시작"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}