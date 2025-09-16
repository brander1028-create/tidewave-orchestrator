import { useState, useEffect } from "react";
import { AlertTriangle, TrendingUp, TrendingDown, Bell, Target, Activity } from "lucide-react";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";

// RollingAlert API 타입 (shared/schema.ts와 일치)
interface RollingAlert {
  id: string;
  owner: string;
  type: "alert" | "success" | "info" | "warning";
  icon: string;
  message: string;
  time: string;
  priority: number;
  isActive: boolean;
  targetId: string | null;
  createdAt: Date;
}

interface TickerItem {
  id: string;
  type: "alert" | "success" | "info" | "warning";
  icon: React.ReactNode;
  message: string;
  time?: string;
  priority: number;
}

interface TopTickerProps {
  items?: TickerItem[];
  speed?: number;
  className?: string;
}

const defaultItems: TickerItem[] = [
  {
    id: "1",
    type: "alert",
    icon: <TrendingDown className="w-4 h-4" />,
    message: "홍삼스틱 키워드 8위 → 15위 급락 (-7) - 경쟁사 신규 포스팅 영향",
    time: "30분 전",
    priority: 1
  },
  {
    id: "2", 
    type: "success",
    icon: <TrendingUp className="w-4 h-4" />,
    message: "홍삼 추천 키워드 Top 5 진입! 7위 → 4위 (+3) - 목표 달성",
    time: "1시간 전",
    priority: 2
  },
  {
    id: "3",
    type: "warning",
    icon: <AlertTriangle className="w-4 h-4" />,
    message: "신규 경쟁사 5개 포스팅 감지 - 홍삼 관련 키워드 모니터링 강화 필요",
    time: "2시간 전", 
    priority: 3
  },
  {
    id: "4",
    type: "info",
    icon: <Target className="w-4 h-4" />,
    message: "오늘 순위 체크 완료 - 127개 키워드 모니터링 중 (성공률 98.4%)",
    time: "3시간 전",
    priority: 4
  },
  {
    id: "5",
    type: "info",
    icon: <Activity className="w-4 h-4" />,
    message: "주간 성과 요약: 상위 10위 키워드 45개 (+3), 평균 순위 8.3위 (전주 대비 -2.1)",
    time: "어제",
    priority: 5
  }
];

// 아이콘 문자열을 실제 아이콘으로 변환
const getIconComponent = (iconName: string) => {
  switch (iconName) {
    case "TrendingUp": return <TrendingUp className="w-4 h-4" />;
    case "TrendingDown": return <TrendingDown className="w-4 h-4" />;
    case "AlertTriangle": return <AlertTriangle className="w-4 h-4" />;
    case "Target": return <Target className="w-4 h-4" />;
    case "Activity": return <Activity className="w-4 h-4" />;
    default: return <Bell className="w-4 h-4" />;
  }
};

// RollingAlert를 TickerItem으로 변환
const convertRollingAlertToTickerItem = (alert: RollingAlert): TickerItem => ({
  id: alert.id,
  type: alert.type,
  icon: getIconComponent(alert.icon),
  message: alert.message,
  time: alert.time,
  priority: alert.priority,
});

export function TopTicker({ items, speed = 50, className }: TopTickerProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isHovered, setIsHovered] = useState(false);

  // API에서 롤링 알림 데이터 가져오기
  const { data: apiAlerts, isLoading } = useQuery<RollingAlert[]>({
    queryKey: ['/api/alerts/rolling'],
    queryFn: async () => {
      const response = await fetch('/api/alerts/rolling?active=true&limit=10', {
        headers: { 'x-role': 'system' }
      });
      if (!response.ok) {
        throw new Error('Failed to fetch rolling alerts');
      }
      return await response.json();
    },
    refetchInterval: 30000, // 30초마다 새로고침
    staleTime: 10000, // 10초간 fresh 상태 유지
  });

  // API 데이터 우선, fallback은 전달받은 items 또는 기본값
  const tickerItems = apiAlerts 
    ? apiAlerts.map(convertRollingAlertToTickerItem)
    : items || defaultItems;

  // 우선순위순으로 정렬
  const sortedItems = [...tickerItems].sort((a, b) => a.priority - b.priority);

  useEffect(() => {
    if (isHovered || sortedItems.length === 0) return;

    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % sortedItems.length);
    }, speed * 100);

    return () => clearInterval(interval);
  }, [sortedItems.length, speed, isHovered]);

  if (sortedItems.length === 0) return null;

  const currentItem = sortedItems[currentIndex];

  const getTypeStyles = (type: TickerItem["type"]) => {
    switch (type) {
      case "alert":
        return "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400";
      case "success":
        return "border-green-500/30 bg-green-500/10 text-green-600 dark:text-green-400";
      case "warning":
        return "border-yellow-500/30 bg-yellow-500/10 text-yellow-600 dark:text-yellow-400";
      case "info":
        return "border-blue-500/30 bg-blue-500/10 text-blue-600 dark:text-blue-400";
      default:
        return "border-gray-500/30 bg-gray-500/10 text-gray-600 dark:text-gray-400";
    }
  };

  return (
    <div 
      className={cn(
        "w-full border rounded-lg p-4 transition-all duration-300",
        getTypeStyles(currentItem.type),
        className
      )}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      data-testid="top-ticker"
    >
      <div className="flex items-center gap-3">
        {/* Status Indicator */}
        <div className="flex-shrink-0">
          <div className={cn(
            "flex items-center justify-center rounded-full p-2",
            currentItem.type === "alert" && "bg-red-500/20",
            currentItem.type === "success" && "bg-green-500/20",
            currentItem.type === "warning" && "bg-yellow-500/20", 
            currentItem.type === "info" && "bg-blue-500/20"
          )}>
            {currentItem.icon}
          </div>
        </div>

        {/* Message Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <Bell className="w-3 h-3 opacity-60" />
            <span className="text-xs opacity-60 uppercase tracking-wide font-medium">
              LIVE 알림
            </span>
            {currentItem.time && (
              <span className="text-xs opacity-60">• {currentItem.time}</span>
            )}
          </div>
          <div className="font-medium text-sm mt-1 leading-relaxed">
            {currentItem.message}
          </div>
        </div>

        {/* Progress Indicators */}
        <div className="flex-shrink-0 flex items-center gap-1">
          {sortedItems.map((_, index) => (
            <div
              key={index}
              className={cn(
                "w-2 h-2 rounded-full transition-all duration-300",
                index === currentIndex 
                  ? "bg-current opacity-100 scale-125" 
                  : "bg-current opacity-30"
              )}
            />
          ))}
        </div>
      </div>
    </div>
  );
}