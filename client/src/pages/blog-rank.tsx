import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp } from "lucide-react";

export default function BlogRank() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">블로그 순위</h1>
          <p className="text-muted-foreground mt-1">네이버 블로그 SERP 순위 모니터링 및 추적</p>
        </div>
        <Badge variant="outline" className="text-blue-600">
          <TrendingUp className="w-4 h-4 mr-1" />
          블로그 전용
        </Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>블로그 순위 페이지</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            기존 /rank 페이지의 블로그 기능을 이곳으로 이전할 예정입니다.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}