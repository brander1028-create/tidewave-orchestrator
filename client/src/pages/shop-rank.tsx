import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ShoppingCart } from "lucide-react";

export default function ShopRank() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">쇼핑몰 순위</h1>
          <p className="text-muted-foreground mt-1">네이버 쇼핑 검색 순위 모니터링 및 추적</p>
        </div>
        <Badge variant="outline" className="text-green-600">
          <ShoppingCart className="w-4 h-4 mr-1" />
          쇼핑 전용
        </Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>쇼핑몰 순위 페이지</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            기존 /rank 페이지의 쇼핑 기능을 이곳으로 이전하고 확장할 예정입니다.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}