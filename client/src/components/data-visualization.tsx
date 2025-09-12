import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { ExpandIcon } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Legend } from "recharts";
import { useState } from "react";
import type { Blog, Keyword } from "@shared/schema";

interface DataVisualizationProps {
  blogId: string;
}

interface BlogData {
  blog: Blog;
  keywords: Keyword[];
}

export default function DataVisualization({ blogId }: DataVisualizationProps) {
  const [timeRange, setTimeRange] = useState("7days");
  
  const { data, isLoading } = useQuery<BlogData>({
    queryKey: ["/api/blogs", blogId],
  });

  if (isLoading) {
    return (
      <Card className="mb-8 shadow-sm">
        <CardContent className="pt-6">
          <div className="animate-pulse">
            <div className="h-4 bg-muted rounded w-1/4 mb-6"></div>
            <div className="h-64 bg-muted/20 rounded-lg"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!data) return null;

  const { keywords } = data;
  const topKeywords = keywords.slice(0, 10);

  // Create mock trend data since we don't have historical data yet
  const chartData = topKeywords.map((keyword, index) => ({
    keyword: keyword.keyword.length > 15 
      ? keyword.keyword.substring(0, 15) + "..." 
      : keyword.keyword,
    fullKeyword: keyword.keyword,
    score: keyword.score,
    frequency: keyword.frequency,
    rank: keyword.searchRank || 0,
  })).slice(0, 7); // Show top 7 for better visualization

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-card border border-border rounded-lg p-3 shadow-lg">
          <p className="font-medium">{data.fullKeyword}</p>
          <p className="text-sm text-chart-1">
            점수: {payload[0].value}
          </p>
          <p className="text-sm text-muted-foreground">
            빈도: {data.frequency}회
          </p>
          {data.rank > 0 && (
            <p className="text-sm text-muted-foreground">
              순위: {data.rank}위
            </p>
          )}
        </div>
      );
    }
    return null;
  };

  return (
    <Card className="mb-8 shadow-sm">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>키워드 성과 분석</CardTitle>
          <div className="flex items-center space-x-2">
            <Select value={timeRange} onValueChange={setTimeRange}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7days">최근 7일</SelectItem>
                <SelectItem value="30days">최근 30일</SelectItem>
                <SelectItem value="90days">최근 90일</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="ghost" size="icon" data-testid="button-expand-chart">
              <ExpandIcon className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {chartData.length === 0 ? (
          <div className="h-64 flex items-center justify-center text-muted-foreground">
            키워드 데이터를 분석하고 있습니다...
          </div>
        ) : (
          <>
            <div className="h-64 w-full" data-testid="keyword-chart">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                  <XAxis 
                    dataKey="keyword" 
                    tick={{ fontSize: 12 }}
                    tickFormatter={(value) => value.length > 8 ? value.substr(0, 8) + "..." : value}
                  />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Bar 
                    dataKey="score" 
                    fill="hsl(var(--chart-1))"
                    radius={[4, 4, 0, 0]}
                  />
                  <CustomTooltip />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="flex items-center justify-center space-x-6 mt-4">
              <div className="flex items-center space-x-2">
                <div className="w-3 h-3 bg-chart-1 rounded-full"></div>
                <span className="text-sm text-muted-foreground">키워드 점수</span>
              </div>
              <div className="flex items-center space-x-2 text-xs text-muted-foreground">
                총 {keywords.length}개 키워드 분석됨
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
