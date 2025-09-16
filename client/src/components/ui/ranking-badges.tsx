import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ExternalLink, Eye, EyeOff, TrendingUp, TrendingDown } from "lucide-react";
import { cn } from "@/lib/utils";

// 키워드 조회량 배지
interface KeywordVolumeBadgeProps {
  volume: number;
  className?: string;
}

export function KeywordVolumeBadge({ volume, className }: KeywordVolumeBadgeProps) {
  const formatVolume = (vol: number) => {
    if (vol >= 10000) return `${Math.floor(vol / 1000)}K`;
    if (vol >= 1000) return `${(vol / 1000).toFixed(1)}K`;
    return vol.toString();
  };

  return (
    <Badge 
      variant="secondary" 
      className={cn(
        "text-xs font-medium bg-blue-50 text-blue-700 hover:bg-blue-100 dark:bg-blue-950 dark:text-blue-300",
        className
      )}
    >
      {formatVolume(volume)}
    </Badge>
  );
}

// 키워드 점수 배지
interface KeywordScoreBadgeProps {
  score: number;
  className?: string;
}

export function KeywordScoreBadge({ score, className }: KeywordScoreBadgeProps) {
  const getScoreColor = (score: number) => {
    if (score >= 80) return "bg-green-50 text-green-700 hover:bg-green-100 dark:bg-green-950 dark:text-green-300";
    if (score >= 60) return "bg-yellow-50 text-yellow-700 hover:bg-yellow-100 dark:bg-yellow-950 dark:text-yellow-300";
    return "bg-red-50 text-red-700 hover:bg-red-100 dark:bg-red-950 dark:text-red-300";
  };

  return (
    <Badge 
      variant="secondary" 
      className={cn(
        "text-xs font-medium",
        getScoreColor(score),
        className
      )}
    >
      {score}점
    </Badge>
  );
}

// 유지기간 배지 (연속 노출 일수)
interface StreakBadgeProps {
  days: number;
  exposed: boolean;
  className?: string;
}

export function StreakBadge({ days, exposed, className }: StreakBadgeProps) {
  if (!exposed) {
    return (
      <Badge 
        variant="outline" 
        className={cn(
          "text-xs font-medium bg-gray-50 text-gray-600 border-gray-200 dark:bg-gray-900 dark:text-gray-400 dark:border-gray-700",
          className
        )}
      >
        <EyeOff className="w-3 h-3 mr-1" />
        미노출
      </Badge>
    );
  }

  const getStreakColor = (days: number) => {
    if (days >= 7) return "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800";
    if (days >= 3) return "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800";
    return "bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-300 dark:border-green-800";
  };

  return (
    <Badge 
      variant="outline" 
      className={cn(
        "text-xs font-medium",
        getStreakColor(days),
        className
      )}
    >
      <Eye className="w-3 h-3 mr-1" />
      유지 {days}일
    </Badge>
  );
}

// 바로가기 버튼
interface GoToLinkButtonProps {
  url: string;
  title?: string;
  className?: string;
}

export function GoToLinkButton({ url, title, className }: GoToLinkButtonProps) {
  const handleClick = () => {
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleClick}
      className={cn(
        "h-8 px-3 text-xs font-medium bg-white hover:bg-gray-50 text-gray-700 border-gray-200",
        "dark:bg-gray-800 dark:hover:bg-gray-700 dark:text-gray-300 dark:border-gray-600",
        "transition-colors duration-200",
        className
      )}
      title={title || url}
    >
      <ExternalLink className="w-3 h-3 mr-1.5" />
      바로가기
    </Button>
  );
}

// 노출 상태 토글 필터
interface ExposureFilterProps {
  value: "all" | "exposed" | "hidden";
  onChange: (value: "all" | "exposed" | "hidden") => void;
  className?: string;
}

export function ExposureFilter({ value, onChange, className }: ExposureFilterProps) {
  const options = [
    { value: "all" as const, label: "전체", icon: null },
    { value: "exposed" as const, label: "노출만", icon: Eye },
    { value: "hidden" as const, label: "미노출만", icon: EyeOff },
  ];

  return (
    <div className={cn("inline-flex rounded-lg border border-gray-200 dark:border-gray-700", className)}>
      {options.map((option) => {
        const isSelected = value === option.value;
        const Icon = option.icon;
        
        return (
          <Button
            key={option.value}
            variant={isSelected ? "default" : "ghost"}
            size="sm"
            onClick={() => onChange(option.value)}
            className={cn(
              "h-8 px-3 text-xs font-medium rounded-none first:rounded-l-lg last:rounded-r-lg border-0",
              isSelected 
                ? "bg-blue-600 text-white hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-700" 
                : "bg-white hover:bg-gray-50 text-gray-600 dark:bg-gray-800 dark:hover:bg-gray-700 dark:text-gray-400"
            )}
          >
            {Icon && <Icon className="w-3 h-3 mr-1.5" />}
            {option.label}
          </Button>
        );
      })}
    </div>
  );
}

// 순위 변화 배지
interface RankChangeBadgeProps {
  change: number;
  className?: string;
}

export function RankChangeBadge({ change, className }: RankChangeBadgeProps) {
  if (change === 0) {
    return (
      <Badge 
        variant="outline" 
        className={cn(
          "text-xs font-medium bg-gray-50 text-gray-600 border-gray-200 dark:bg-gray-900 dark:text-gray-400",
          className
        )}
      >
        변동없음
      </Badge>
    );
  }

  const isPositive = change > 0;
  
  return (
    <Badge 
      variant="outline" 
      className={cn(
        "text-xs font-medium",
        isPositive 
          ? "bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-300" 
          : "bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300",
        className
      )}
    >
      {isPositive ? <TrendingUp className="w-3 h-3 mr-1" /> : <TrendingDown className="w-3 h-3 mr-1" />}
      {isPositive ? '+' : ''}{change}
    </Badge>
  );
}

// 전체 체크 시작 버튼
interface StartAllChecksButtonProps {
  isRunning?: boolean;
  disabled?: boolean;
  onClick: () => void;
  className?: string;
}

export function StartAllChecksButton({ isRunning, disabled, onClick, className }: StartAllChecksButtonProps) {
  return (
    <Button
      onClick={onClick}
      disabled={disabled || isRunning}
      className={cn(
        "h-10 px-6 font-medium text-white",
        "bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800",
        "dark:from-blue-500 dark:to-blue-600 dark:hover:from-blue-600 dark:hover:to-blue-700",
        "shadow-md hover:shadow-lg transition-all duration-200",
        "disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:shadow-md",
        className
      )}
      data-testid="button-start-all-checks"
    >
      {isRunning ? (
        <>
          <div className="w-4 h-4 mr-2 border-2 border-white border-t-transparent rounded-full animate-spin" />
          체크 진행 중...
        </>
      ) : (
        <>
          <TrendingUp className="w-4 h-4 mr-2" />
          전체 체크 시작
        </>
      )}
    </Button>
  );
}

// 키워드 칩 (조회량 + 점수 포함)
interface KeywordChipProps {
  keyword: string;
  volume?: number;
  score?: number;
  className?: string;
}

export function KeywordChip({ keyword, volume, score, className }: KeywordChipProps) {
  return (
    <div className={cn("inline-flex items-center gap-1.5", className)}>
      <Badge variant="default" className="text-sm font-medium bg-gray-100 text-gray-800 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-200">
        {keyword}
      </Badge>
      {volume !== undefined && <KeywordVolumeBadge volume={volume} />}
      {score !== undefined && <KeywordScoreBadge score={score} />}
    </div>
  );
}