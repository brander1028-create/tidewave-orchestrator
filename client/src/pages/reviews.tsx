import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Star, MessageSquare, ThumbsUp, AlertTriangle, TrendingUp, TrendingDown } from "lucide-react";

export default function Reviews() {
  return (
    <div className="space-y-6">
      <div className="text-center py-12">
        <Star className="w-16 h-16 text-primary mx-auto mb-4" />
        <h2 className="text-2xl font-semibold text-foreground mb-2">리뷰 분석</h2>
        <p className="text-muted-foreground">상위 리뷰들의 순위와 변동사항을 분석합니다.</p>
      </div>
      
      {/* Placeholder cards for future implementation */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="w-5 h-5" />
              리뷰 랭킹
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground text-sm">상위 10개 리뷰의 순서와 도움수를 추적합니다.</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ThumbsUp className="w-5 h-5" />
              도움수 분석
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground text-sm">리뷰별 도움수 변동과 트렌드를 분석합니다.</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" />
              악성 리뷰 감지
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground text-sm">어뷰징 리뷰와 중복 문구를 자동 감지합니다.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
