import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

const analysisSchema = z.object({
  url: z.string().url("올바른 URL을 입력해주세요").refine(
    (url) => url.includes('blog.naver.com'),
    "네이버 블로그 URL만 지원합니다"
  ),
  postLimit: z.number().min(10).max(30),
  useStopWords: z.boolean(),
});

type AnalysisFormData = z.infer<typeof analysisSchema>;

interface URLInputProps {
  onAnalysisStarted: (blogId: string, jobId: string) => void;
}

export default function URLInput({ onAnalysisStarted }: URLInputProps) {
  const { toast } = useToast();
  
  const form = useForm<AnalysisFormData>({
    resolver: zodResolver(analysisSchema),
    defaultValues: {
      url: "",
      postLimit: 15,
      useStopWords: true,
    },
  });

  const startAnalysisMutation = useMutation({
    mutationFn: async (data: AnalysisFormData) => {
      const response = await apiRequest("POST", "/api/blogs/analyze", data);
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "분석 시작됨",
        description: "블로그 분석이 시작되었습니다. 잠시만 기다려주세요.",
      });
      onAnalysisStarted(data.blogId, data.jobId);
    },
    onError: (error) => {
      toast({
        title: "분석 시작 실패",
        description: error.message || "분석을 시작할 수 없습니다.",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: AnalysisFormData) => {
    startAnalysisMutation.mutate(data);
  };

  return (
    <Card className="mb-8 shadow-sm">
      <CardHeader>
        <CardTitle>블로그 URL 입력</CardTitle>
        <CardDescription>
          분석할 네이버 블로그의 URL을 입력하고 분석 옵션을 선택하세요.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="flex gap-4">
            <div className="flex-1">
              <Label htmlFor="url">네이버 블로그 URL</Label>
              <Input
                id="url"
                type="url"
                placeholder="https://blog.naver.com/username"
                data-testid="input-blog-url"
                {...form.register("url")}
              />
              {form.formState.errors.url && (
                <p className="text-sm text-destructive mt-1">
                  {form.formState.errors.url.message}
                </p>
              )}
            </div>
            <div className="flex items-end">
              <Button 
                type="submit" 
                disabled={startAnalysisMutation.isPending}
                data-testid="button-start-analysis"
              >
                <Search className="h-4 w-4 mr-2" />
                {startAnalysisMutation.isPending ? "분석 중..." : "분석 시작"}
              </Button>
            </div>
          </div>
          
          <div className="flex gap-4 items-center text-sm">
            <div className="flex items-center space-x-2">
              <Input
                type="number"
                className="w-16"
                min="10"
                max="30"
                data-testid="input-post-limit"
                {...form.register("postLimit", { valueAsNumber: true })}
              />
              <span className="text-muted-foreground">개의 최신 포스트 수집</span>
            </div>
            
            <div className="flex items-center space-x-2">
              <Checkbox
                id="useStopWords"
                data-testid="checkbox-stop-words"
                checked={form.watch("useStopWords")}
                onCheckedChange={(checked) => 
                  form.setValue("useStopWords", !!checked)
                }
              />
              <Label htmlFor="useStopWords" className="text-muted-foreground">
                불용어 필터링
              </Label>
            </div>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
