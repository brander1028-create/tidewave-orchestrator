import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Download, FileText, FileSpreadsheet, Code2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface ExportSectionProps {
  blogId: string;
}

export default function ExportSection({ blogId }: ExportSectionProps) {
  const { toast } = useToast();
  const [isExporting, setIsExporting] = useState(false);

  const downloadFile = (url: string, filename: string) => {
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const exportMutation = useMutation({
    mutationFn: async ({ format }: { format: string }) => {
      setIsExporting(true);
      const response = await fetch(`/api/blogs/${blogId}/export/${format}`);
      
      if (!response.ok) {
        throw new Error(`Export failed: ${response.statusText}`);
      }
      
      return { response, format };
    },
    onSuccess: async ({ response, format }) => {
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      
      const filename = format === 'csv' 
        ? 'blog-keywords.csv'
        : format === 'json'
        ? 'blog-analysis.json'
        : `blog-analysis.${format}`;
      
      downloadFile(url, filename);
      window.URL.revokeObjectURL(url);
      
      toast({
        title: "내보내기 완료",
        description: `${format.toUpperCase()} 파일이 다운로드되었습니다.`,
      });
      
      setIsExporting(false);
    },
    onError: (error) => {
      toast({
        title: "내보내기 실패",
        description: error.message || "파일을 내보낼 수 없습니다.",
        variant: "destructive",
      });
      setIsExporting(false);
    },
  });

  const handleExport = (format: string) => {
    exportMutation.mutate({ format });
  };

  const exportOptions = [
    {
      id: 'csv',
      title: 'CSV 파일',
      description: '키워드, 순위, 점수 데이터를 CSV 형식으로 내보내기',
      icon: FileText,
      color: 'text-chart-2',
    },
    {
      id: 'excel',
      title: 'Excel 파일',
      description: '차트와 함께 Excel 형식으로 상세 분석 결과 내보내기',
      icon: FileSpreadsheet,
      color: 'text-chart-1',
      disabled: true, // Excel export not implemented yet
    },
    {
      id: 'json',
      title: 'JSON 파일',
      description: 'API 연동을 위한 JSON 형식 데이터 내보내기',
      icon: Code2,
      color: 'text-chart-4',
    },
  ];

  return (
    <Card className="shadow-sm">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>데이터 내보내기</CardTitle>
          <Badge variant="secondary" className="text-xs">
            최종 업데이트: 방금 전
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          분석 결과를 다양한 형식으로 내보낼 수 있습니다.
        </p>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          {exportOptions.map((option) => (
            <Button
              key={option.id}
              variant="outline"
              className="h-auto p-4 text-left justify-start"
              onClick={() => handleExport(option.id)}
              disabled={option.disabled || isExporting}
              data-testid={`button-export-${option.id}`}
            >
              <div className="flex items-start space-x-3 w-full">
                <option.icon className={`h-5 w-5 ${option.color} mt-0.5`} />
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm mb-1">{option.title}</div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {option.description}
                  </p>
                </div>
              </div>
            </Button>
          ))}
        </div>

        <div className="flex items-center justify-between pt-4 border-t border-border">
          <div className="text-sm text-muted-foreground">
            분석 완료된 데이터를 내보낼 수 있습니다
          </div>
          <Button
            onClick={() => handleExport('json')}
            disabled={isExporting}
            data-testid="button-export-all"
          >
            <Download className="h-4 w-4 mr-2" />
            {isExporting ? "내보내는 중..." : "전체 내보내기"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
