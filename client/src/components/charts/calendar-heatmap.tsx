import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface CalendarHeatmapProps {
  data: Array<{
    date: string;
    value: number;
  }>;
  title?: string;
  className?: string;
}

export function CalendarHeatmap({ 
  data, 
  title = "월간 활동 패턴",
  className 
}: CalendarHeatmapProps) {
  const today = new Date();
  const startDate = new Date(today.getFullYear(), today.getMonth() - 3, 1);
  const endDate = new Date(today.getFullYear(), today.getMonth() + 1, 0);

  // Generate all dates in range
  const allDates = [];
  for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
    allDates.push(new Date(d));
  }

  // Create data map for quick lookup
  const dataMap = new Map(
    data.map(item => [item.date, item.value])
  );

  // Get intensity level (0-4) based on value
  const getIntensity = (value: number) => {
    if (value === 0) return 0;
    if (value <= 2) return 1;
    if (value <= 5) return 2;
    if (value <= 10) return 3;
    return 4;
  };

  // Get background color class based on intensity
  const getIntensityClass = (intensity: number) => {
    switch (intensity) {
      case 0: return "bg-muted";
      case 1: return "bg-primary/20";
      case 2: return "bg-primary/40";
      case 3: return "bg-primary/60";
      case 4: return "bg-primary/80";
      default: return "bg-muted";
    }
  };

  // Group dates by week
  const weeks: (Date | null)[][] = [];
  let currentWeek: (Date | null)[] = [];
  
  // Add empty days for the first week if it doesn't start on Sunday
  const firstDayOfWeek = allDates[0].getDay();
  for (let i = 0; i < firstDayOfWeek; i++) {
    currentWeek.push(null);
  }

  allDates.forEach((date, index) => {
    currentWeek.push(date);
    
    if (currentWeek.length === 7) {
      weeks.push(currentWeek);
      currentWeek = [];
    }
  });

  // Add the remaining days to the last week
  if (currentWeek.length > 0) {
    while (currentWeek.length < 7) {
      currentWeek.push(null);
    }
    weeks.push(currentWeek);
  }

  const monthLabels = ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월'];
  const dayLabels = ['일', '월', '화', '수', '목', '금', '토'];

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <div className="w-2 h-2 bg-primary rounded-full"></div>
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Month labels */}
          <div className="flex justify-between text-xs text-muted-foreground">
            {Array.from({ length: 4 }, (_, i) => {
              const monthIndex = (today.getMonth() - 3 + i + 12) % 12;
              return (
                <span key={i}>{monthLabels[monthIndex]}</span>
              );
            })}
          </div>

          {/* Calendar grid */}
          <div className="grid grid-cols-7 gap-1">
            {/* Day labels */}
            {dayLabels.map(day => (
              <div key={day} className="text-xs text-muted-foreground text-center py-1">
                {day}
              </div>
            ))}
            
            {/* Calendar cells */}
            {weeks.flat().map((date, index) => {
              if (!date) {
                return <div key={`empty-${index}`} className="h-3 w-3" />;
              }

              const dateStr = (date as Date).toISOString().split('T')[0];
              const value = dataMap.get(dateStr) || 0;
              const intensity = getIntensity(value);
              
              return (
                <div
                  key={dateStr}
                  className={cn(
                    "h-3 w-3 rounded-sm",
                    getIntensityClass(intensity),
                    "cursor-pointer transition-all hover:scale-110"
                  )}
                  title={`${dateStr}: ${value}개 변동`}
                />
              );
            })}
          </div>

          {/* Legend */}
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>적음</span>
            <div className="flex gap-1">
              {[0, 1, 2, 3, 4].map(intensity => (
                <div
                  key={intensity}
                  className={cn("h-3 w-3 rounded-sm", getIntensityClass(intensity))}
                />
              ))}
            </div>
            <span>많음</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
