import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { DatePickerWithRange } from "@/components/ui/date-picker";
import { toast } from "@/hooks/use-toast";
import { useQuery, useMutation } from "@tanstack/react-query";
import { exportApi } from "@/lib/api";
import { queryClient } from "@/lib/queryClient";
import { 
  Download, 
  FileText, 
  FileSpreadsheet, 
  FileImage, 
  Calendar,
  Filter,
  Database,
  CheckCircle,
  Clock,
  AlertCircle
} from "lucide-react";
import { DateRange } from "react-day-picker";

interface ExportJob {
  id: string;
  name: string;
  type: string;
  format: string;
  status: "pending" | "processing" | "completed" | "failed";
  progress: number;
  createdAt: Date;
  downloadUrl?: string;
}

export default function Exports() {
  const [selectedFormat, setSelectedFormat] = React.useState("csv");
  const [selectedData, setSelectedData] = React.useState<string[]>(["rankings"]);
  const [dateRange, setDateRange] = React.useState<DateRange | undefined>({
    from: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days ago
    to: new Date(),
  });
  // Use React Query to fetch export jobs
  const { data: exportJobs = [], isLoading, refetch } = useQuery<ExportJob[]>({
    queryKey: ['/api/exports'],
    refetchInterval: 2000, // Refetch every 2 seconds to update progress
  });

  // Mutation for creating export jobs
  const createExportMutation = useMutation({
    mutationFn: exportApi.startExport,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/exports'] });
      toast({
        title: "내보내기 시작됨",
        description: "데이터 내보내기 작업이 시작되었습니다.",
      });
    },
    onError: () => {
      toast({
        title: "오류",
        description: "내보내기 작업을 시작할 수 없습니다.",
        variant: "destructive",
      });
    }
  });

  // Mutation for downloading files
  const downloadMutation = useMutation({
    mutationFn: exportApi.download,
    onSuccess: (blob, jobId) => {
      // Create download link
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      const job = exportJobs.find(j => j.id === jobId);
      const filename = job ? `export-${new Date(job.createdAt).toISOString().split('T')[0]}-${jobId.substring(0, 8)}.${job.format}` : `export-${jobId}.csv`;
      
      a.style.display = 'none';
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      toast({
        title: "다운로드 완료",
        description: "파일이 성공적으로 다운로드되었습니다.",
      });
    },
    onError: () => {
      toast({
        title: "다운로드 실패",
        description: "파일을 다운로드할 수 없습니다.",
        variant: "destructive",
      });
    }
  });

  const dataTypes = [
    { id: "rankings", label: "순위 데이터", description: "키워드별 순위 히스토리" },
    { id: "alerts", label: "알림 히스토리", description: "발생한 모든 알림 기록" },
    { id: "submissions", label: "제출함 데이터", description: "승인/반려된 제출 항목" },
    { id: "events", label: "이벤트 로그", description: "시스템 이벤트 기록" },
    { id: "metrics", label: "메트릭 데이터", description: "성과 지표 및 통계" },
  ];

  const handleDataTypeChange = (dataType: string, checked: boolean) => {
    if (checked) {
      setSelectedData([...selectedData, dataType]);
    } else {
      setSelectedData(selectedData.filter(d => d !== dataType));
    }
  };

  const handleExport = () => {
    if (selectedData.length === 0) {
      toast({
        title: "오류",
        description: "내보낼 데이터 유형을 선택해주세요.",
        variant: "destructive",
      });
      return;
    }

    if (!dateRange?.from || !dateRange?.to) {
      toast({
        title: "오류",
        description: "날짜 범위를 선택해주세요.",
        variant: "destructive",
      });
      return;
    }

    createExportMutation.mutate({
      dataTypes: selectedData,
      format: selectedFormat,
      dateRange: { from: dateRange.from!, to: dateRange.to! },
    });
  };

  const handleDownload = (jobId: string) => {
    downloadMutation.mutate(jobId);
  };

  const getStatusIcon = (status: ExportJob["status"]) => {
    switch (status) {
      case "completed":
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case "processing":
        return <Clock className="w-4 h-4 text-blue-500" />;
      case "failed":
        return <AlertCircle className="w-4 h-4 text-red-500" />;
      default:
        return <Clock className="w-4 h-4 text-gray-500" />;
    }
  };

  const getStatusBadge = (status: ExportJob["status"]) => {
    switch (status) {
      case "completed":
        return <Badge className="bg-green-500">완료</Badge>;
      case "processing":
        return <Badge className="bg-blue-500">진행중</Badge>;
      case "failed":
        return <Badge variant="destructive">실패</Badge>;
      default:
        return <Badge variant="outline">대기중</Badge>;
    }
  };

  const getFormatIcon = (format: string) => {
    switch (format.toLowerCase()) {
      case "csv":
        return <FileSpreadsheet className="w-4 h-4 text-green-600" />;
      case "xlsx":
        return <FileSpreadsheet className="w-4 h-4 text-blue-600" />;
      case "json":
        return <FileText className="w-4 h-4 text-yellow-600" />;
      case "pdf":
        return <FileImage className="w-4 h-4 text-red-600" />;
      default:
        return <FileText className="w-4 h-4" />;
    }
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="space-y-6">
      {/* Export Configuration */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Data Selection */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="w-5 h-5" />
              데이터 선택
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              <Label>내보낼 데이터 유형</Label>
              <div className="space-y-3">
                {dataTypes.map((dataType) => (
                  <div key={dataType.id} className="flex items-start space-x-3">
                    <Checkbox
                      id={dataType.id}
                      checked={selectedData.includes(dataType.id)}
                      onCheckedChange={(checked) => 
                        handleDataTypeChange(dataType.id, checked as boolean)
                      }
                      data-testid={`checkbox-${dataType.id}`}
                    />
                    <div className="space-y-1">
                      <Label
                        htmlFor={dataType.id}
                        className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                      >
                        {dataType.label}
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        {dataType.description}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <Label>파일 형식</Label>
              <Select value={selectedFormat} onValueChange={setSelectedFormat}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="csv">
                    <div className="flex items-center gap-2">
                      <FileSpreadsheet className="w-4 h-4" />
                      CSV
                    </div>
                  </SelectItem>
                  <SelectItem value="xlsx">
                    <div className="flex items-center gap-2">
                      <FileSpreadsheet className="w-4 h-4" />
                      Excel (XLSX)
                    </div>
                  </SelectItem>
                  <SelectItem value="json">
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4" />
                      JSON
                    </div>
                  </SelectItem>
                  <SelectItem value="pdf">
                    <div className="flex items-center gap-2">
                      <FileImage className="w-4 h-4" />
                      PDF 리포트
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Date Range and Filters */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Filter className="w-5 h-5" />
              필터 및 옵션
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              <Label>날짜 범위</Label>
              <DatePickerWithRange 
                date={dateRange}
                onSelect={setDateRange}
              />
              <p className="text-xs text-muted-foreground">
                선택한 기간의 데이터만 내보냅니다.
              </p>
            </div>

            <div className="space-y-3">
              <Label>압축 옵션</Label>
              <div className="flex items-center space-x-2">
                <Checkbox id="compress" defaultChecked />
                <Label htmlFor="compress" className="text-sm">
                  ZIP으로 압축
                </Label>
              </div>
              <p className="text-xs text-muted-foreground">
                큰 파일의 경우 자동으로 압축됩니다.
              </p>
            </div>

            <div className="pt-4">
              <Button 
                onClick={handleExport} 
                disabled={selectedData.length === 0 || !dateRange?.from || !dateRange?.to || createExportMutation.isPending}
                className="w-full"
                data-testid="button-start-export"
              >
                <Download className="w-4 h-4 mr-2" />
                {createExportMutation.isPending ? "내보내는 중..." : "내보내기 시작"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Export History */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="w-5 h-5" />
            내보내기 기록
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              <p className="mt-2 text-muted-foreground">내보내기 목록을 불러오는 중...</p>
            </div>
          ) : exportJobs.length === 0 ? (
            <div className="text-center py-8">
              <Download className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-foreground mb-2">내보내기 기록이 없습니다</h3>
              <p className="text-muted-foreground">데이터를 내보내면 여기에 기록이 표시됩니다.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {exportJobs.map((job) => (
                <div
                  key={job.id}
                  className="flex items-center justify-between p-4 border border-border rounded-lg hover:bg-secondary/50 transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                      {getFormatIcon(job.format)}
                      {getStatusIcon(job.status)}
                    </div>
                    <div>
                      <h4 className="font-medium text-foreground">{job.name}</h4>
                      <p className="text-sm text-muted-foreground">
                        {formatDate(new Date(job.createdAt))}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    {job.status === "processing" && (
                      <div className="w-32">
                        <Progress value={job.progress} className="h-2" />
                        <p className="text-xs text-muted-foreground mt-1 text-center">
                          {Math.round(job.progress)}%
                        </p>
                      </div>
                    )}
                    
                    {getStatusBadge(job.status)}
                    
                    {job.status === "completed" && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDownload(job.id)}
                        disabled={downloadMutation.isPending}
                        data-testid={`button-download-${job.id}`}
                      >
                        <Download className="w-4 h-4 mr-2" />
                        {downloadMutation.isPending ? "다운로드 중..." : "다운로드"}
                      </Button>
                    )}
                    
                    {job.status === "failed" && (
                      <Button variant="outline" size="sm">
                        재시도
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Quick Export Templates */}
      <Card>
        <CardHeader>
          <CardTitle>빠른 내보내기</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Button variant="outline" className="h-auto p-4 flex flex-col items-start gap-2">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5 text-green-600" />
                <span className="font-medium">순위 리포트</span>
              </div>
              <p className="text-sm text-muted-foreground text-left">
                최근 30일 순위 데이터를 CSV로 내보냅니다.
              </p>
            </Button>

            <Button variant="outline" className="h-auto p-4 flex flex-col items-start gap-2">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-blue-600" />
                <span className="font-medium">알림 백업</span>
              </div>
              <p className="text-sm text-muted-foreground text-left">
                모든 알림 기록을 JSON 형식으로 백업합니다.
              </p>
            </Button>

            <Button variant="outline" className="h-auto p-4 flex flex-col items-start gap-2">
              <div className="flex items-center gap-2">
                <FileImage className="w-5 h-5 text-red-600" />
                <span className="font-medium">월간 리포트</span>
              </div>
              <p className="text-sm text-muted-foreground text-left">
                월간 성과 요약을 PDF 리포트로 생성합니다.
              </p>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
