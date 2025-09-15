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
  const [exportJobs, setExportJobs] = React.useState<ExportJob[]>([
    {
      id: "1",
      name: "순위 데이터 (30일)",
      type: "rankings",
      format: "csv",
      status: "completed",
      progress: 100,
      createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours ago
      downloadUrl: "#"
    },
    {
      id: "2", 
      name: "알림 히스토리",
      type: "alerts",
      format: "json",
      status: "processing",
      progress: 75,
      createdAt: new Date(Date.now() - 30 * 60 * 1000), // 30 minutes ago
    },
    {
      id: "3",
      name: "제출함 데이터",
      type: "submissions",
      format: "xlsx",
      status: "failed",
      progress: 0,
      createdAt: new Date(Date.now() - 60 * 60 * 1000), // 1 hour ago
    }
  ]);

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

    const newJob: ExportJob = {
      id: Date.now().toString(),
      name: `${selectedData.map(d => dataTypes.find(dt => dt.id === d)?.label).join(", ")} (${selectedFormat.toUpperCase()})`,
      type: selectedData.join(","),
      format: selectedFormat,
      status: "pending",
      progress: 0,
      createdAt: new Date(),
    };

    setExportJobs([newJob, ...exportJobs]);

    // Simulate export process
    setTimeout(() => {
      setExportJobs(prev => prev.map(job => 
        job.id === newJob.id ? { ...job, status: "processing" } : job
      ));
      
      const progressInterval = setInterval(() => {
        setExportJobs(prev => prev.map(job => {
          if (job.id === newJob.id && job.progress < 100) {
            const newProgress = Math.min(job.progress + Math.random() * 20, 100);
            if (newProgress >= 100) {
              clearInterval(progressInterval);
              return { 
                ...job, 
                progress: 100, 
                status: "completed",
                downloadUrl: "#"
              };
            }
            return { ...job, progress: newProgress };
          }
          return job;
        }));
      }, 500);
    }, 1000);

    toast({
      title: "내보내기 시작됨",
      description: "데이터 내보내기 작업이 시작되었습니다.",
    });
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
                dateRange={dateRange}
                onDateRangeChange={setDateRange}
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
                className="w-full"
                data-testid="button-start-export"
              >
                <Download className="w-4 h-4 mr-2" />
                내보내기 시작
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
          {exportJobs.length === 0 ? (
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
                        {formatDate(job.createdAt)}
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
                    
                    {job.status === "completed" && job.downloadUrl && (
                      <Button 
                        variant="outline" 
                        size="sm"
                        data-testid={`button-download-${job.id}`}
                      >
                        <Download className="w-4 h-4 mr-2" />
                        다운로드
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
