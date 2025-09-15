import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { useSettingsStore } from "@/stores/settings-store";
import { 
  Settings, 
  Clock, 
  Bell, 
  Database, 
  Shield, 
  Trash2, 
  AlertTriangle,
  Save,
  RotateCcw,
  Users,
  Key,
  Activity
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

export default function SettingsPage() {
  const [selectedTab, setSelectedTab] = React.useState("general");
  const { settings, updateSetting, userRole, setUserRole } = useSettingsStore();

  const queryClient = useQueryClient();

  // Fetch current settings
  const { data: serverSettings = [], isLoading } = useQuery({
    queryKey: ["/api/mock/settings"],
  });

  // Update settings mutation
  const updateSettingsMutation = useMutation({
    mutationFn: async ({ key, value }: { key: string; value: any }) => {
      return await apiRequest("POST", "/api/mock/settings", { key, value });
    },
    onSuccess: (data, variables) => {
      updateSetting(variables.key, variables.value);
      queryClient.invalidateQueries({ queryKey: ["/api/mock/settings"] });
      toast({
        title: "설정 저장됨",
        description: "설정이 성공적으로 저장되었습니다.",
      });
    },
    onError: () => {
      toast({
        title: "오류",
        description: "설정 저장 중 오류가 발생했습니다.",
        variant: "destructive",
      });
    },
  });

  const handleSettingUpdate = (key: string, value: any) => {
    updateSettingsMutation.mutate({ key, value });
  };

  const resetToDefaults = () => {
    const defaultSettings = [
      { key: 'checkInterval', value: { interval: '1h' } },
      { key: 'alertCooldown', value: { cooldown: '6h' } },
      { key: 'rateLimits', value: { perMin: 60, perDay: 10000 } },
      { key: 'cacheTTL', value: { ttl: '10m' } },
    ];

    defaultSettings.forEach(setting => {
      updateSettingsMutation.mutate(setting);
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-foreground">시스템 설정</h3>
          <p className="text-sm text-muted-foreground">모니터링 시스템의 각종 설정을 관리합니다</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={resetToDefaults} data-testid="button-reset-defaults">
            <RotateCcw className="w-4 h-4 mr-2" />
            기본값 복원
          </Button>
        </div>
      </div>

      <Tabs value={selectedTab} onValueChange={setSelectedTab}>
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="general" data-testid="tab-general">일반</TabsTrigger>
          <TabsTrigger value="alerts" data-testid="tab-alerts">알림</TabsTrigger>
          <TabsTrigger value="performance" data-testid="tab-performance">성능</TabsTrigger>
          <TabsTrigger value="permissions" data-testid="tab-permissions">권한</TabsTrigger>
          <TabsTrigger value="maintenance" data-testid="tab-maintenance">유지보수</TabsTrigger>
        </TabsList>

        {/* General Settings */}
        <TabsContent value="general" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="w-5 h-5" />
                체크 주기 설정
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-3">
                  <Label>기본 체크 주기</Label>
                  <Select 
                    defaultValue={settings.checkInterval?.interval || "1h"}
                    onValueChange={(value) => handleSettingUpdate("checkInterval", { interval: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="10m">10분</SelectItem>
                      <SelectItem value="30m">30분</SelectItem>
                      <SelectItem value="1h">1시간</SelectItem>
                      <SelectItem value="6h">6시간</SelectItem>
                      <SelectItem value="12h">12시간</SelectItem>
                      <SelectItem value="24h">24시간</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    순위 체크를 수행할 기본 주기를 설정합니다.
                  </p>
                </div>

                <div className="space-y-3">
                  <Label>디바이스 기본값</Label>
                  <Select 
                    defaultValue={settings.defaultDevice || "mobile"}
                    onValueChange={(value) => handleSettingUpdate("defaultDevice", value)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="mobile">모바일</SelectItem>
                      <SelectItem value="pc">PC</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    순위 체크 시 사용할 기본 디바이스입니다.
                  </p>
                </div>
              </div>

              <Separator />

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <Label>자동 체크 활성화</Label>
                    <p className="text-xs text-muted-foreground">
                      설정된 주기에 따라 자동으로 순위를 체크합니다.
                    </p>
                  </div>
                  <Switch 
                    defaultChecked={settings.autoCheck !== false}
                    onCheckedChange={(checked) => handleSettingUpdate("autoCheck", checked)}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="w-5 h-5" />
                데이터 설정
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-3">
                  <Label>데이터 보존 기간</Label>
                  <Select 
                    defaultValue={settings.dataRetention || "90d"}
                    onValueChange={(value) => handleSettingUpdate("dataRetention", value)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="30d">30일</SelectItem>
                      <SelectItem value="90d">90일</SelectItem>
                      <SelectItem value="180d">180일</SelectItem>
                      <SelectItem value="1y">1년</SelectItem>
                      <SelectItem value="unlimited">무제한</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    순위 히스토리 데이터를 보관할 기간을 설정합니다.
                  </p>
                </div>

                <div className="space-y-3">
                  <Label>캐시 TTL</Label>
                  <Select 
                    defaultValue={settings.cacheTTL?.ttl || "10m"}
                    onValueChange={(value) => handleSettingUpdate("cacheTTL", { ttl: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="5m">5분</SelectItem>
                      <SelectItem value="10m">10분</SelectItem>
                      <SelectItem value="30m">30분</SelectItem>
                      <SelectItem value="1h">1시간</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    API 응답 캐시 유효 시간을 설정합니다.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Alert Settings */}
        <TabsContent value="alerts" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bell className="w-5 h-5" />
                알림 규칙 설정
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 border border-border rounded-lg">
                  <div>
                    <h4 className="font-medium text-foreground">Top 10 진입 알림</h4>
                    <p className="text-sm text-muted-foreground">키워드가 상위 10위에 진입했을 때</p>
                  </div>
                  <Switch defaultChecked />
                </div>

                <div className="flex items-center justify-between p-4 border border-border rounded-lg">
                  <div>
                    <h4 className="font-medium text-foreground">Top 10 이탈 알림</h4>
                    <p className="text-sm text-muted-foreground">키워드가 상위 10위에서 벗어났을 때</p>
                  </div>
                  <Switch defaultChecked />
                </div>

                <div className="flex items-center justify-between p-4 border border-border rounded-lg">
                  <div>
                    <h4 className="font-medium text-foreground">5위 이상 하락 알림</h4>
                    <p className="text-sm text-muted-foreground">하루 만에 5위 이상 하락했을 때</p>
                  </div>
                  <Switch defaultChecked />
                </div>

                <div className="flex items-center justify-between p-4 border border-border rounded-lg">
                  <div>
                    <h4 className="font-medium text-foreground">연속 하락 알림</h4>
                    <p className="text-sm text-muted-foreground">3일 연속으로 순위가 하락했을 때</p>
                  </div>
                  <Switch defaultChecked />
                </div>

                <div className="flex items-center justify-between p-4 border border-border rounded-lg">
                  <div>
                    <h4 className="font-medium text-foreground">신규 포스팅 감지</h4>
                    <p className="text-sm text-muted-foreground">경쟁사의 새로운 포스팅이 감지되었을 때</p>
                  </div>
                  <Switch />
                </div>

                <div className="flex items-center justify-between p-4 border border-border rounded-lg">
                  <div>
                    <h4 className="font-medium text-foreground">악성 리뷰 감지</h4>
                    <p className="text-sm text-muted-foreground">어뷰징 리뷰가 감지되었을 때</p>
                  </div>
                  <Switch />
                </div>
              </div>

              <Separator />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-3">
                  <Label>알림 쿨다운</Label>
                  <Select 
                    defaultValue={settings.alertCooldown?.cooldown || "6h"}
                    onValueChange={(value) => handleSettingUpdate("alertCooldown", { cooldown: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1h">1시간</SelectItem>
                      <SelectItem value="3h">3시간</SelectItem>
                      <SelectItem value="6h">6시간</SelectItem>
                      <SelectItem value="12h">12시간</SelectItem>
                      <SelectItem value="24h">24시간</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    같은 알림이 다시 발송되기까지의 최소 대기 시간입니다.
                  </p>
                </div>

                <div className="space-y-3">
                  <Label>일일 요약 발송 시간</Label>
                  <Input 
                    type="time" 
                    defaultValue={settings.dailySummaryTime || "09:00"}
                    onChange={(e) => handleSettingUpdate("dailySummaryTime", e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    매일 요약 알림을 받을 시간을 설정합니다.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Performance Settings */}
        <TabsContent value="performance" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="w-5 h-5" />
                성능 및 제한 설정
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-3">
                  <Label>분당 요청 제한</Label>
                  <Input 
                    type="number"
                    defaultValue={settings.rateLimits?.perMin || 60}
                    onChange={(e) => handleSettingUpdate("rateLimits", { 
                      ...settings.rateLimits, 
                      perMin: parseInt(e.target.value) 
                    })}
                  />
                  <p className="text-xs text-muted-foreground">
                    분당 최대 API 요청 수를 제한합니다.
                  </p>
                </div>

                <div className="space-y-3">
                  <Label>일일 요청 제한</Label>
                  <Input 
                    type="number"
                    defaultValue={settings.rateLimits?.perDay || 10000}
                    onChange={(e) => handleSettingUpdate("rateLimits", { 
                      ...settings.rateLimits, 
                      perDay: parseInt(e.target.value) 
                    })}
                  />
                  <p className="text-xs text-muted-foreground">
                    일일 최대 API 요청 수를 제한합니다.
                  </p>
                </div>
              </div>

              <Separator />

              <div className="space-y-4">
                <h4 className="font-medium text-foreground">비용 모니터링 위젯</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="p-4 bg-secondary/50 rounded-lg">
                    <div className="text-2xl font-bold text-foreground">2,457</div>
                    <div className="text-sm text-muted-foreground">오늘 호출 수</div>
                    <div className="text-xs text-green-500 mt-1">한도의 24.6%</div>
                  </div>
                  <div className="p-4 bg-secondary/50 rounded-lg">
                    <div className="text-2xl font-bold text-foreground">78%</div>
                    <div className="text-sm text-muted-foreground">캐시 히트율</div>
                    <div className="text-xs text-green-500 mt-1">양호</div>
                  </div>
                  <div className="p-4 bg-secondary/50 rounded-lg">
                    <div className="text-2xl font-bold text-foreground">0.2%</div>
                    <div className="text-sm text-muted-foreground">429 오류율</div>
                    <div className="text-xs text-green-500 mt-1">정상</div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Permissions Settings */}
        <TabsContent value="permissions" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="w-5 h-5" />
                권한 관리
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-3">
                <Label>현재 역할</Label>
                <div className="flex items-center gap-4">
                  <Select value={userRole} onValueChange={setUserRole}>
                    <SelectTrigger className="w-48">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">
                        <div className="flex items-center gap-2">
                          <Users className="w-4 h-4" />
                          관리자 (Admin)
                        </div>
                      </SelectItem>
                      <SelectItem value="manager">
                        <div className="flex items-center gap-2">
                          <Key className="w-4 h-4" />
                          매니저 (Manager)
                        </div>
                      </SelectItem>
                      <SelectItem value="analyst">
                        <div className="flex items-center gap-2">
                          <Activity className="w-4 h-4" />
                          분석가 (Analyst)
                        </div>
                      </SelectItem>
                      <SelectItem value="contributor">기여자 (Contributor)</SelectItem>
                      <SelectItem value="viewer">뷰어 (Viewer)</SelectItem>
                    </SelectContent>
                  </Select>
                  <Badge variant="outline" className="text-primary">
                    {userRole === "admin" ? "모든 권한" : 
                     userRole === "manager" ? "관리 권한" : 
                     userRole === "analyst" ? "분석 권한" : 
                     userRole === "contributor" ? "기여 권한" : "읽기 권한"}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  역할에 따라 사용할 수 있는 기능이 제한됩니다. (UI 제어만, 실제 인증은 별도)
                </p>
              </div>

              <Separator />

              <div className="space-y-4">
                <h4 className="font-medium text-foreground">역할별 권한</h4>
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 border border-border rounded-lg">
                    <span className="text-sm">대시보드 조회</span>
                    <Badge variant="secondary">모든 역할</Badge>
                  </div>
                  <div className="flex items-center justify-between p-3 border border-border rounded-lg">
                    <span className="text-sm">순위 체크 실행</span>
                    <Badge variant="secondary">Contributor 이상</Badge>
                  </div>
                  <div className="flex items-center justify-between p-3 border border-border rounded-lg">
                    <span className="text-sm">제출함 승인/반려</span>
                    <Badge variant="secondary">Manager 이상</Badge>
                  </div>
                  <div className="flex items-center justify-between p-3 border border-border rounded-lg">
                    <span className="text-sm">시스템 설정 변경</span>
                    <Badge variant="secondary">Admin만</Badge>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Maintenance Settings */}
        <TabsContent value="maintenance" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Trash2 className="w-5 h-5" />
                데이터 관리
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <div className="p-4 border border-border rounded-lg">
                  <div className="flex items-start justify-between">
                    <div>
                      <h4 className="font-medium text-foreground">소프트 딜리트 정책</h4>
                      <p className="text-sm text-muted-foreground mt-1">
                        삭제된 데이터는 휴지통으로 이동되어 7일간 보관됩니다.
                      </p>
                    </div>
                    <Switch defaultChecked />
                  </div>
                </div>

                <div className="p-4 border border-border rounded-lg">
                  <div className="flex items-start justify-between">
                    <div>
                      <h4 className="font-medium text-foreground">자동 백업</h4>
                      <p className="text-sm text-muted-foreground mt-1">
                        매일 자정에 데이터를 자동으로 백업합니다.
                      </p>
                    </div>
                    <Switch defaultChecked />
                  </div>
                </div>
              </div>

              <Separator />

              <div className="space-y-4">
                <h4 className="font-medium text-foreground flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-destructive" />
                  위험한 작업
                </h4>
                
                <div className="space-y-3">
                  <Button variant="destructive" className="w-full" disabled>
                    <Trash2 className="w-4 h-4 mr-2" />
                    휴지통 비우기 (7일 경과된 항목)
                  </Button>
                  
                  <Button variant="destructive" className="w-full" disabled>
                    <Trash2 className="w-4 h-4 mr-2" />
                    모든 캐시 삭제
                  </Button>
                  
                  <Button variant="destructive" className="w-full" disabled>
                    <AlertTriangle className="w-4 h-4 mr-2" />
                    시스템 초기화 (모든 데이터 삭제)
                  </Button>
                </div>
                
                <p className="text-xs text-muted-foreground">
                  위험한 작업은 현재 비활성화되어 있습니다. 실제 환경에서는 추가 인증이 필요합니다.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
