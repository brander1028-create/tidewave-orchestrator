import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Clock, TrendingUp } from "lucide-react";
import type { HistoryResponse } from "../../../shared/schema";

export default function HistoryPage() {
  const [, setLocation] = useLocation();

  const { data: history, isLoading, error } = useQuery<HistoryResponse>({
    queryKey: ['/api/jobs/history', { limit: 50 }]
  });

  const handleRowClick = (jobId: string) => {
    setLocation(`/results/${jobId}`);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('ko-KR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    }).format(date);
  };

  const getVolumesBadge = (mode: string) => {
    switch (mode) {
      case 'searchads':
        return <Badge variant="default" className="bg-green-100 text-green-700 text-xs">SearchAds</Badge>;
      case 'partial':
        return <Badge variant="secondary" className="bg-amber-100 text-amber-700 text-xs">Partial</Badge>;
      case 'fallback':
        return <Badge variant="outline" className="bg-gray-100 text-gray-600 text-xs">Fallback</Badge>;
      default:
        return <Badge variant="outline" className="text-xs">{mode}</Badge>;
    }
  };

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
              <p className="text-gray-600 dark:text-gray-400">히스토리를 불러오는 중...</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error || !history) {
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
              <p className="text-red-600 dark:text-red-400">히스토리를 불러올 수 없습니다.</p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <Link href="/">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              대시보드로
            </Button>
          </Link>
          <div className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-gray-600 dark:text-gray-400" />
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">분석 히스토리</h1>
          </div>
        </div>

        {/* History Table */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              최근 분석 작업 ({history.items.length}건)
            </CardTitle>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              행을 클릭하면 해당 분석 결과로 이동합니다.
            </p>
          </CardHeader>
          <CardContent>
            {history.items.length === 0 ? (
              <div className="text-center py-8">
                <Clock className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600 dark:text-gray-400">아직 분석 기록이 없습니다.</p>
                <Link href="/">
                  <Button className="mt-4" variant="outline">
                    첫 분석 시작하기
                  </Button>
                </Link>
              </div>
            ) : (
              <Table data-testid="history-table">
                <TableHeader>
                  <TableRow>
                    <TableHead>시각</TableHead>
                    <TableHead>기준키워드</TableHead>
                    <TableHead className="text-center">통과블로그</TableHead>
                    <TableHead className="text-center">요청/실제</TableHead>
                    <TableHead className="text-center">모드</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {history.items.map((item) => (
                    <TableRow
                      key={item.jobId}
                      className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800"
                      onClick={() => handleRowClick(item.jobId)}
                      data-testid={`history-row-${item.jobId}`}
                    >
                      <TableCell className="font-medium">
                        {formatDate(item.createdAt)}
                      </TableCell>
                      <TableCell>
                        <div className="max-w-[200px] truncate">
                          {item.baseKeyword}
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="secondary" className="text-xs">
                          {item.counters.hit_blogs}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <span className="text-sm text-gray-600 dark:text-gray-400">
                          {item.counters.selected_keywords}/{item.counters.searched_keywords}
                        </span>
                      </TableCell>
                      <TableCell className="text-center">
                        {getVolumesBadge(item.counters.volumes_mode)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Bottom Info */}
        {history.items.length > 0 && (
          <div className="mt-6 text-center">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              최근 {history.items.length}건의 분석 기록을 표시하고 있습니다.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}