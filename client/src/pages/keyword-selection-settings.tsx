import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { 
  Settings, 
  Save, 
  RotateCcw,
  TrendingUp,
  Star,
  Hash,
  DollarSign,
  Sliders
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// 기본 설정값
const defaultSettings = {
  minCPC: 300,
  minScore: 1,
  maxKeywords: 4,
  volumeWeight: 1.0,
  scoreWeight: 1.0,
  combineWithSpace: false,
  enableTrigrams: false,
};

export default function KeywordSelectionSettingsPage() {
  const [settings, setSettings] = useState(defaultSettings);
  const { toast } = useToast();

  // localStorage에서 설정 불러오기
  useEffect(() => {
    const saved = localStorage.getItem('keywordSelectionSettings');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setSettings({ ...defaultSettings, ...parsed });
      } catch (error) {
        console.error('설정 불러오기 실패:', error);
      }
    }
  }, []);

  // 설정 저장
  const saveSettings = () => {
    try {
      localStorage.setItem('keywordSelectionSettings', JSON.stringify(settings));
      toast({
        title: "설정 저장 완료",
        description: "키워드 선정 설정이 저장되었습니다",
      });
    } catch (error) {
      toast({
        title: "저장 실패",
        description: "설정 저장 중 오류가 발생했습니다",
        variant: "destructive"
      });
    }
  };

  // 초기화
  const resetSettings = () => {
    setSettings(defaultSettings);
    toast({
      title: "설정 초기화",
      description: "모든 설정이 기본값으로 초기화되었습니다",
    });
  };

  const handleNumberChange = (key: string, value: string) => {
    const numValue = parseFloat(value);
    if (!isNaN(numValue)) {
      setSettings(prev => ({ ...prev, [key]: numValue }));
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* 헤더 */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
          <Settings className="h-8 w-8" />
          키워드 선정 설정
        </h1>
        <p className="text-muted-foreground mt-2">
          제목에서 상위 4개 키워드를 선정하는 알고리즘의 수치를 조정할 수 있습니다
        </p>
      </div>

      {/* 알고리즘 설명 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Hash className="h-5 w-5" />
            키워드 선정 알고리즘
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="space-y-2">
              <Badge variant="default" className="text-center w-full">1번 키워드</Badge>
              <p className="text-sm text-gray-600">
                가장 높은 (조회량+점수) 단일 키워드
              </p>
            </div>
            <div className="space-y-2">
              <Badge variant="secondary" className="text-center w-full">2번 키워드</Badge>
              <p className="text-sm text-gray-600">
                1번 + 2순위 조합 검증 후 선정
              </p>
            </div>
            <div className="space-y-2">
              <Badge variant="secondary" className="text-center w-full">3번 키워드</Badge>
              <p className="text-sm text-gray-600">
                1번 + 3순위 조합 검증 후 선정
              </p>
            </div>
            <div className="space-y-2">
              <Badge variant="secondary" className="text-center w-full">4번 키워드</Badge>
              <p className="text-sm text-gray-600">
                1번 + 4순위 조합 검증 후 선정
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 필터링 조건 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5" />
              필터링 조건
            </CardTitle>
            <CardDescription>
              키워드가 유효하다고 판단하는 최소 기준값들
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="minCPC" className="flex items-center gap-2">
                <DollarSign className="h-4 w-4" />
                최소 CPC (원)
              </Label>
              <Input
                id="minCPC"
                type="number"
                min="0"
                step="50"
                value={settings.minCPC}
                onChange={(e) => handleNumberChange('minCPC', e.target.value)}
                data-testid="input-min-cpc"
              />
              <p className="text-xs text-gray-500">
                CPC가 이 값보다 낮으면 키워드에서 제외됩니다
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="minScore" className="flex items-center gap-2">
                <Star className="h-4 w-4" />
                최소 점수
              </Label>
              <Input
                id="minScore"
                type="number"
                min="0"
                step="1"
                value={settings.minScore}
                onChange={(e) => handleNumberChange('minScore', e.target.value)}
                data-testid="input-min-score"
              />
              <p className="text-xs text-gray-500">
                점수가 0이면 키워드에서 제외됩니다
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="maxKeywords" className="flex items-center gap-2">
                <Hash className="h-4 w-4" />
                최대 키워드 개수
              </Label>
              <Input
                id="maxKeywords"
                type="number"
                min="1"
                max="10"
                step="1"
                value={settings.maxKeywords}
                onChange={(e) => handleNumberChange('maxKeywords', e.target.value)}
                data-testid="input-max-keywords"
              />
              <p className="text-xs text-gray-500">
                제목에서 선정할 최대 키워드 개수
              </p>
            </div>
          </CardContent>
        </Card>

        {/* 가중치 설정 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sliders className="h-5 w-5" />
              점수 계산 가중치
            </CardTitle>
            <CardDescription>
              (조회량 × 가중치) + (점수 × 가중치) 공식에 사용됩니다
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="volumeWeight" className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4" />
                조회량 가중치
              </Label>
              <Input
                id="volumeWeight"
                type="number"
                min="0"
                step="0.1"
                value={settings.volumeWeight}
                onChange={(e) => handleNumberChange('volumeWeight', e.target.value)}
                data-testid="input-volume-weight"
              />
              <p className="text-xs text-gray-500">
                조회량에 적용되는 가중치 (기본값: 1.0)
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="scoreWeight" className="flex items-center gap-2">
                <Star className="h-4 w-4" />
                점수 가중치
              </Label>
              <Input
                id="scoreWeight"
                type="number"
                min="0"
                step="0.1"
                value={settings.scoreWeight}
                onChange={(e) => handleNumberChange('scoreWeight', e.target.value)}
                data-testid="input-score-weight"
              />
              <p className="text-xs text-gray-500">
                점수에 적용되는 가중치 (기본값: 1.0)
              </p>
            </div>

            <Separator />

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <Label className="text-base">조합 방식</Label>
                  <p className="text-xs text-gray-500">
                    키워드 조합 시 띄어쓰기 사용 여부
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm">붙여쓰기</span>
                  <Switch
                    checked={settings.combineWithSpace}
                    onCheckedChange={(checked) => 
                      setSettings(prev => ({ ...prev, combineWithSpace: checked }))
                    }
                    data-testid="switch-combine-space"
                  />
                  <span className="text-sm">띄어쓰기</span>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <Label className="text-base">3개 조합 사용</Label>
                  <p className="text-xs text-gray-500">
                    트라이그램(3개 단어 조합) 키워드 생성
                  </p>
                </div>
                <Switch
                  checked={settings.enableTrigrams}
                  onCheckedChange={(checked) => 
                    setSettings(prev => ({ ...prev, enableTrigrams: checked }))
                  }
                  data-testid="switch-enable-trigrams"
                />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 예시 및 버튼 */}
      <Card>
        <CardHeader>
          <CardTitle>설정 예시</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="bg-gray-50 p-4 rounded-lg text-sm font-mono space-y-1">
            <div>📊 최소 CPC: {settings.minCPC}원</div>
            <div>⭐ 최소 점수: {settings.minScore}점</div>
            <div>🔢 최대 키워드: {settings.maxKeywords}개</div>
            <div>📈 조회량 가중치: {settings.volumeWeight}x</div>
            <div>⭐ 점수 가중치: {settings.scoreWeight}x</div>
            <div>🔗 조합 방식: {settings.combineWithSpace ? '띄어쓰기' : '붙여쓰기'}</div>
            <div>🎯 3개 조합: {settings.enableTrigrams ? '사용' : '사용 안함'}</div>
          </div>
          
          <div className="mt-4 text-sm text-gray-600">
            <p><strong>점수 계산 공식:</strong></p>
            <p>최종점수 = (조회량 × {settings.volumeWeight}) + (점수 × {settings.scoreWeight})</p>
          </div>
        </CardContent>
      </Card>

      {/* 액션 버튼들 */}
      <div className="flex items-center justify-between">
        <Button
          onClick={resetSettings}
          variant="outline"
          data-testid="button-reset-settings"
        >
          <RotateCcw className="h-4 w-4 mr-2" />
          초기화
        </Button>
        
        <Button 
          onClick={saveSettings}
          data-testid="button-save-settings"
        >
          <Save className="h-4 w-4 mr-2" />
          설정 저장
        </Button>
      </div>
    </div>
  );
}