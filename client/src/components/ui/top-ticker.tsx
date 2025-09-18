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
    id: "no-events",
    type: "info",
    icon: <Activity className="w-4 h-4" />,
    message: "이벤트 시스템 대기중 - 순위 변화 감지 시 알림이 여기에 표시됩니다",
    time: "지금",
    priority: 1
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

  // API에서 롤링 알림 데이터 가져오기 - v7.19: localStorage 기반 헤더 사용
  const { data: apiAlerts, isLoading } = useQuery<RollingAlert[]>({
    queryKey: ['/api/alerts/rolling?limit=10&since=24h'],
    // Default queryFn 사용으로 localStorage 기반 헤더 자동 주입
    refetchInterval: 30000, // 30초마다 새로고침
    staleTime: 10000, // 10초간 fresh 상태 유지
  });

  // API 데이터 우선, 빈 배열이면 기본값 표시
  const tickerItems = apiAlerts && apiAlerts.length > 0
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