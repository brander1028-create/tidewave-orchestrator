import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { 
  Bell, 
  BellOff, 
  TrendingUp, 
  TrendingDown, 
  AlertTriangle, 
  Info,
  MessageSquare,
  ShoppingCart,
  Eye,
  EyeOff,
  Filter,
  Calendar
} from "lucide-react";
import type { Alert } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";

export default function Alerts() {
  const [selectedFilter, setSelectedFilter] = React.useState("all");
  const [showRead, setShowRead] = React.useState(false);

  const queryClient = useQueryClient();

  // Fetch alerts
  const { data: alerts = [], isLoading } = useQuery({
    queryKey: ["/api/mock/alerts", showRead ? undefined : false],
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  // Mark alert as seen mutation
  const markSeenMutation = useMutation({
    mutationFn: async (alertId: string) => {
      return await apiRequest("POST", `/api/mock/alerts/${alertId}/seen`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/mock/alerts"] });
    },
  });

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case "critical":
        return "text-red-500 border-red-500 bg-red-500/10";
      case "high":
        return "text-orange-500 border-orange-500 bg-orange-500/10";
      case "medium":
        return "text-yellow-500 border-yellow-500 bg-yellow-500/10";
      case "low":
        return "text-blue-500 border-blue-500 bg-blue-500/10";
      default:
        return "text-gray-500 border-gray-500 bg-gray-500/10";
    }
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case "critical":
        return <AlertTriangle className="w-4 h-4" />;
      case "high":
        return <TrendingDown className="w-4 h-4" />;
      case "medium":
        return <TrendingUp className="w-4 h-4" />;
      case "low":
        return <Info className="w-4 h-4" />;
      default:
        return <Bell className="w-4 h-4" />;
    }
  };

  const getRuleTypeIcon = (rule: string) => {
    if (rule.includes("blog") || rule.includes("post")) {
      return <MessageSquare className="w-4 h-4" />;
    } else if (rule.includes("shop") || rule.includes("product")) {
      return <ShoppingCart className="w-4 h-4" />;
    } else {
      return <TrendingUp className="w-4 h-4" />;
    }
  };

  const formatAlertRule = (rule: string) => {
    // Format rule names to be more user-friendly
    const ruleMap: { [key: string]: string } = {
      "top_10_entry": "Top 10 진입",
      "top_10_exit": "Top 10 이탈",
      "top_5_entry": "Top 5 진입",
      "top_5_exit": "Top 5 이탈",
      "top_3_entry": "Top 3 진입",
      "top_3_exit": "Top 3 이탈",
      "rank_drop_5": "5위 이상 하락",
      "consecutive_drop_3": "연속 3일 하락",
      "review_surge": "리뷰 급증",
      "rating_drop": "평점 하락",
      "new_post": "신규 포스팅",
      "new_review": "신규 리뷰",
      "abuse_review": "악성 리뷰 감지"
    };
    
    return ruleMap[rule] || rule;
  };

  const formatTimestamp = (timestamp: Date) => {
    const now = new Date();
    const diff = now.getTime() - new Date(timestamp).getTime();
    const minutes = Math.floor(diff / (1000 * 60));
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (minutes < 60) {
      return `${minutes}분 전`;
    } else if (hours < 24) {
      return `${hours}시간 전`;
    } else {
      return `${days}일 전`;
    }
  };

  const filteredAlerts = alerts.filter((alert: Alert) => {
    if (selectedFilter === "all") return true;
    if (selectedFilter === "unread") return !alert.seen;
    return alert.severity === selectedFilter;
  });

  const unreadCount = alerts.filter((alert: Alert) => !alert.seen).length;
  const criticalCount = alerts.filter((alert: Alert) => alert.severity === "critical").length;
  const highCount = alerts.filter((alert: Alert) => alert.severity === "high").length;

  // Group alerts by date
  const groupedAlerts = filteredAlerts.reduce((groups: { [key: string]: Alert[] }, alert: Alert) => {
    const date = new Date(alert.timestamp).toLocaleDateString('ko-KR');
    if (!groups[date]) {
      groups[date] = [];
    }
    groups[date].push(alert);
    return groups;
  }, {});

  return (
    <div className="space-y-6">
      {/* Alert Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              읽지 않음
            </CardTitle>
            <Bell className="w-4 h-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">{unreadCount}</div>
            <p className="text-xs text-muted-foreground">새로운 알림</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              긴급
            </CardTitle>
            <AlertTriangle className="w-4 h-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">{criticalCount}</div>
            <p className="text-xs text-muted-foreground">긴급 처리 필요</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              높음
            </CardTitle>
            <TrendingDown className="w-4 h-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">{highCount}</div>
            <p className="text-xs text-muted-foreground">주의 필요</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              전체
            </CardTitle>
            <Calendar className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">{alerts.length}</div>
            <p className="text-xs text-muted-foreground">총 알림 수</p>
          </CardContent>
        </Card>
      </div>

      {/* Controls */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Bell className="w-5 h-5" />
              알림 센터
            </CardTitle>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">읽은 알림 표시</span>
                <Switch 
                  checked={showRead} 
                  onCheckedChange={setShowRead}
                  data-testid="switch-show-read"
                />
              </div>
              <div className="flex items-center gap-2">
                <Filter className="w-4 h-4 text-muted-foreground" />
                <Select value={selectedFilter} onValueChange={setSelectedFilter}>
                  <SelectTrigger className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">전체</SelectItem>
                    <SelectItem value="unread">읽지 않음</SelectItem>
                    <SelectItem value="critical">긴급</SelectItem>
                    <SelectItem value="high">높음</SelectItem>
                    <SelectItem value="medium">보통</SelectItem>
                    <SelectItem value="low">낮음</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8">
              <div className="text-muted-foreground">알림을 불러오는 중...</div>
            </div>
          ) : filteredAlerts.length === 0 ? (
            <div className="text-center py-8">
              <BellOff className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-foreground mb-2">알림이 없습니다</h3>
              <p className="text-muted-foreground">조건에 맞는 알림이 없습니다.</p>
            </div>
          ) : (
            <div className="space-y-6">
              {Object.entries(groupedAlerts).map(([date, dateAlerts]) => (
                <div key={date}>
                  <h3 className="text-sm font-semibold text-muted-foreground mb-3 border-b border-border pb-2">
                    {date}
                  </h3>
                  <div className="space-y-3">
                    {dateAlerts.map((alert: Alert) => (
                      <div
                        key={alert.id}
                        className={`flex items-start gap-4 p-4 rounded-lg border transition-all hover:shadow-md ${
                          alert.seen ? "bg-muted/20 border-border" : "bg-card border-border shadow-sm"
                        }`}
                      >
                        <div className={`p-2 rounded-full ${getSeverityColor(alert.severity)}`}>
                          {getSeverityIcon(alert.severity)}
                        </div>
                        
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between mb-2">
                            <div className="flex items-center gap-2">
                              {getRuleTypeIcon(alert.rule)}
                              <h4 className="text-sm font-semibold text-foreground">
                                {formatAlertRule(alert.rule)}
                              </h4>
                              <Badge variant="outline" className={getSeverityColor(alert.severity)}>
                                {alert.severity}
                              </Badge>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-muted-foreground">
                                {formatTimestamp(alert.timestamp)}
                              </span>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0"
                                onClick={() => markSeenMutation.mutate(alert.id)}
                                disabled={alert.seen}
                                data-testid={`button-mark-seen-${alert.id}`}
                              >
                                {alert.seen ? (
                                  <EyeOff className="h-4 w-4 text-muted-foreground" />
                                ) : (
                                  <Eye className="h-4 w-4" />
                                )}
                              </Button>
                            </div>
                          </div>
                          
                          <div className="space-y-1">
                            {alert.reason && (
                              <p className="text-sm text-foreground">{alert.reason}</p>
                            )}
                            
                            {alert.prevRank && alert.currRank && (
                              <div className="flex items-center gap-4 text-sm">
                                <span className="text-muted-foreground">
                                  순위 변동: {alert.prevRank}위 → {alert.currRank}위
                                </span>
                                {alert.delta && (
                                  <span className={`font-medium ${
                                    alert.delta > 0 ? "text-green-500" : "text-red-500"
                                  }`}>
                                    ({alert.delta > 0 ? "+" : ""}{alert.delta})
                                  </span>
                                )}
                              </div>
                            )}
                            
                            {alert.cooldownUntil && (
                              <p className="text-xs text-muted-foreground">
                                쿨다운: {new Date(alert.cooldownUntil).toLocaleString('ko-KR')}까지
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
