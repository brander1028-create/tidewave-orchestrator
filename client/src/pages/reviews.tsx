import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { KPICard } from "@/components/ui/kpi-card";
import { Star, MessageSquare, ThumbsUp, AlertTriangle, TrendingUp, TrendingDown, Plus, Search } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { reviewsApi } from "@/lib/api";

export default function Reviews() {
  const [selectedProduct, setSelectedProduct] = useState("product1");
  const [newProduct, setNewProduct] = useState("");
  const [productList, setProductList] = useState([
    { key: "product1", name: "홍삼스틱" },
    { key: "product2", name: "프로폴리스 캡슐" },
    { key: "product3", name: "오메가3" }
  ]);

  // Fetch review data for selected product
  const { data: rankings, isLoading: rankingsLoading } = useQuery({
    queryKey: ['/api/reviews/rankings', selectedProduct],
    queryFn: () => reviewsApi.getRankings(selectedProduct)
  });

  const { data: health, isLoading: healthLoading } = useQuery({
    queryKey: ['/api/reviews/health', selectedProduct],
    queryFn: () => reviewsApi.getHealth(selectedProduct)
  });

  const { data: abuse, isLoading: abuseLoading } = useQuery({
    queryKey: ['/api/reviews/abuse', selectedProduct],
    queryFn: () => reviewsApi.getAbuseDetection(selectedProduct)
  });

  const handleAddProduct = () => {
    if (newProduct.trim()) {
      const newKey = `product${productList.length + 1}`;
      setProductList([...productList, { key: newKey, name: newProduct.trim() }]);
      setNewProduct("");
      setSelectedProduct(newKey);
    }
  };

  if (rankingsLoading || healthLoading || abuseLoading) {
    return <div className="flex justify-center items-center h-96 text-muted-foreground">데이터를 불러오는 중...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4">
        <div className="text-center">
          <Star className="w-12 h-12 text-primary mx-auto mb-3" />
          <h2 className="text-2xl font-semibold text-foreground mb-2">리뷰 분석</h2>
          <p className="text-muted-foreground">상위 리뷰들의 순위와 변동사항을 분석합니다.</p>
        </div>
        
        {/* Product Selection & Management */}
        <div className="flex flex-col sm:flex-row gap-3 items-center justify-center">
          <Select value={selectedProduct} onValueChange={setSelectedProduct}>
            <SelectTrigger className="w-48" data-testid="select-product">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {productList.map((product) => (
                <SelectItem key={product.key} value={product.key}>
                  {product.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex gap-2">
            <Input
              value={newProduct}
              onChange={(e) => setNewProduct(e.target.value)}
              placeholder="새 제품 추가..."
              className="w-32"
              data-testid="input-new-product"
            />
            <Button onClick={handleAddProduct} size="sm" data-testid="button-add-product">
              <Plus className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Health KPIs */}
      {health && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KPICard
            title="평균 별점"
            value={health.starAvg?.toFixed(1) || "0.0"}
            icon={<Star className="w-4 h-4" />}
            change={{
              value: 0.2,
              label: "지난주 대비",
              trend: "up"
            }}
          />
          <KPICard
            title="총 리뷰"
            value={health.reviewCount || 0}
            icon={<MessageSquare className="w-4 h-4" />}
            change={{
              value: health.newReviews7d || 0,
              label: "7일간 신규",
              trend: health.newReviews7d > 5 ? "up" : "stable"
            }}
          />
          <KPICard
            title="사진 비율"
            value={`${Math.round((health.photoRatio || 0) * 100)}%`}
            icon={<ThumbsUp className="w-4 h-4" />}
            change={{
              value: 5,
              label: "지난달 대비",
              trend: "up"
            }}
          />
          <KPICard
            title="Q&A 개수"
            value={health.qaCount || 0}
            icon={<MessageSquare className="w-4 h-4" />}
          />
        </div>
      )}
      
      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Review Rankings */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="w-5 h-5" />
              리뷰 랭킹 TOP 10
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 max-h-80 overflow-y-auto">
              {rankings?.slice(0, 10).map((review: any) => (
                <div key={review.id} className="flex items-center gap-3 p-2 border rounded-lg">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <Badge variant="secondary" className="shrink-0">
                      {review.rank}위
                    </Badge>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-foreground truncate" title={review.content}>
                        {review.content}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {review.author} • 도움 {review.helpCount}개
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {review.change > 0 ? (
                      <TrendingUp className="w-3 h-3 text-green-500" />
                    ) : review.change < 0 ? (
                      <TrendingDown className="w-3 h-3 text-red-500" />
                    ) : null}
                    {review.change !== 0 && (
                      <span className={`text-xs ${review.change > 0 ? 'text-green-500' : 'text-red-500'}`}>
                        {review.change > 0 ? '+' : ''}{review.change}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
        
        {/* Abuse Detection */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" />
              악성 리뷰 감지
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {abuse && (
              <>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">위험 등급</span>
                  <Badge 
                    variant={abuse.riskLevel === 'high' ? 'destructive' : abuse.riskLevel === 'medium' ? 'default' : 'secondary'}
                  >
                    {abuse.riskLevel === 'high' ? '높음' : abuse.riskLevel === 'medium' ? '보통' : '낮음'}
                  </Badge>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-sm">의심스러운 리뷰</span>
                    <span className="text-sm font-medium">{abuse.suspiciousReviews}개</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm">중복 콘텐츠</span>
                    <span className="text-sm font-medium">{abuse.duplicateContent}개</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm">급작스런 증가</span>
                    <span className="text-sm font-medium">{abuse.rapidBurst}개</span>
                  </div>
                </div>
                <div className="pt-2 border-t">
                  <p className="text-xs text-muted-foreground">
                    최근 검사: {new Date(abuse.lastCheck).toLocaleDateString('ko-KR')}
                  </p>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
