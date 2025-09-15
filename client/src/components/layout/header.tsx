import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import { useLocation } from "wouter";

const pageInfo = {
  "/": { title: "대시보드", description: "전체 현황을 한눈에 확인하세요" },
  "/dashboard": { title: "대시보드", description: "전체 현황을 한눈에 확인하세요" },
  "/rank": { title: "순위 체크", description: "블로그, 쇼핑몰, 리뷰 순위를 모니터링하고 추적합니다" },
  "/reviews": { title: "리뷰 분석", description: "상위 리뷰들의 순위와 변동사항을 분석합니다" },
  "/insights": { title: "인사이트", description: "데이터 분석과 트렌드를 확인하세요" },
  "/inbox": { title: "제출함", description: "새로운 타겟 등록과 승인을 관리합니다" },
  "/alerts": { title: "알림", description: "중요한 순위 변동과 이벤트를 확인하세요" },
  "/settings": { title: "설정", description: "시스템 설정과 알림 규칙을 관리합니다" },
  "/exports": { title: "내보내기", description: "데이터를 다양한 형식으로 내보냅니다" },
};

export default function Header() {
  const [location] = useLocation();
  const currentPage = pageInfo[location as keyof typeof pageInfo] || pageInfo["/"];

  return (
    <header className="bg-card border-b border-border px-6 py-4 flex-shrink-0">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-foreground">{currentPage.title}</h2>
          <p className="text-muted-foreground text-sm">{currentPage.description}</p>
        </div>
        <div className="flex items-center gap-4">
          {/* 실시간 업데이트 상태 */}
          <div className="flex items-center gap-2 text-sm">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse-dot"></div>
            <span className="text-muted-foreground">실시간 업데이트</span>
          </div>
          {/* 마지막 업데이트 시간 */}
          <div className="text-sm text-muted-foreground">
            마지막 업데이트: 2분 전
          </div>
          {/* 새로고침 버튼 */}
          <Button 
            variant="ghost" 
            size="sm"
            className="h-8 w-8 p-0"
            data-testid="button-refresh"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </header>
  );
}
