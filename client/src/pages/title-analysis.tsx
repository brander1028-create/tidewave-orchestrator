import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { FileText, Brain, Database, RefreshCw, TrendingUp } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';

interface TitleKeywordItem {
  text: string;
  raw_volume: number;
  score: number;
  volume_score: number;
  combined_score: number;
  frequency?: number;
  source: 'db' | 'api-refresh' | 'freq-fallback';
}

interface TitleAnalysisResult {
  success: boolean;
  mode: 'db-only' | 'api-refresh' | 'freq-fallback';
  topN: TitleKeywordItem[];
  stats: {
    candidates: number;
    db_hits: number;
    api_refreshed: number;
    ttl_skipped: number;
  };
  budget: {
    dailyRemaining: number;
    perMinuteRemaining: number;
  };
  metadata: {
    titles_analyzed: number;
    keywords_requested: number;
    extraction_mode: string;
    timestamp: string;
  };
}

const ModeIcon = ({ mode }: { mode: string }) => {
  switch (mode) {
    case 'db-only':
      return <Database className="w-3 h-3" />;
    case 'api-refresh':
      return <RefreshCw className="w-3 h-3" />;
    case 'freq-fallback':
      return <TrendingUp className="w-3 h-3" />;
    default:
      return <Brain className="w-3 h-3" />;
  }
};

const ModeBadge = ({ mode }: { mode: string }) => {
  const getVariant = (mode: string) => {
    switch (mode) {
      case 'db-only':
        return 'default';
      case 'api-refresh':
        return 'secondary';
      case 'freq-fallback':
        return 'outline';
      default:
        return 'default';
    }
  };

  const getLabel = (mode: string) => {
    switch (mode) {
      case 'db-only':
        return 'DB 전용';
      case 'api-refresh':
        return 'API 갱신';
      case 'freq-fallback':
        return '빈도 기반';
      default:
        return mode;
    }
  };

  return (
    <Badge variant={getVariant(mode)} className="flex items-center gap-1">
      <ModeIcon mode={mode} />
      {getLabel(mode)}
    </Badge>
  );
};

export default function TitleAnalysisPage() {
  const [titles, setTitles] = useState('');
  const [topN, setTopN] = useState(4);
  const [result, setResult] = useState<TitleAnalysisResult | null>(null);
  const { toast } = useToast();

  const analyzeMutation = useMutation({
    mutationFn: async (data: { titles: string[]; N: number }) => {
      const response = await apiRequest('POST', '/api/titles/analyze', data);
      return response.json() as Promise<TitleAnalysisResult>;
    },
    onSuccess: (data) => {
      setResult(data);
      toast({
        title: '제목 분석 완료',
        description: `${data.mode} 모드로 ${data.topN.length}개 키워드를 추출했습니다.`,
      });
    },
    onError: (error: any) => {
      console.error('Title analysis error:', error);
      toast({
        title: '분석 실패',
        description: error?.message || '제목 분석 중 오류가 발생했습니다.',
        variant: 'destructive',
      });
    },
  });

  const handleAnalyze = () => {
    const titleLines = titles
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0);

    if (titleLines.length === 0) {
      toast({
        title: '입력 오류',
        description: '최소 1개 이상의 제목을 입력해주세요.',
        variant: 'destructive',
      });
      return;
    }

    if (titleLines.length > 20) {
      toast({
        title: '입력 제한',
        description: '최대 20개까지 제목을 입력할 수 있습니다.',
        variant: 'destructive',
      });
      return;
    }

    analyzeMutation.mutate({ titles: titleLines, N: topN });
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* 헤더 */}
      <div className="flex items-center gap-3">
        <FileText className="w-8 h-8 text-blue-600" />
        <div>
          <h1 className="text-3xl font-bold">제목 키워드 분석</h1>
          <p className="text-muted-foreground">
            블로그 제목에서 핵심 키워드를 추출하고 조회량 기반으로 순위를 매깁니다
          </p>
        </div>
      </div>

      {/* 입력 섹션 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain className="w-5 h-5" />
            제목 입력 및 설정
          </CardTitle>
          <CardDescription>
            분석할 블로그 제목들을 입력하세요 (최대 20개). 각 줄에 하나씩 입력합니다.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="titles">블로그 제목 목록</Label>
            <Textarea
              id="titles"
              data-testid="input-titles"
              placeholder="홍삼의 놀라운 효능과 선택 방법&#10;비타민D 부족증상과 해결책&#10;건강한 다이어트를 위한 영양제 추천&#10;..."
              value={titles}
              onChange={(e) => setTitles(e.target.value)}
              className="min-h-32 mt-2"
              disabled={analyzeMutation.isPending}
            />
            <p className="text-sm text-muted-foreground mt-1">
              현재 {titles.split('\n').filter(line => line.trim()).length}개 제목 입력됨 (최대 20개)
            </p>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Label htmlFor="topN">추출할 키워드 수:</Label>
              <Input
                id="topN"
                data-testid="input-top-n"
                type="number"
                min="1"
                max="10"
                value={topN}
                onChange={(e) => setTopN(parseInt(e.target.value) || 4)}
                className="w-20"
                disabled={analyzeMutation.isPending}
              />
            </div>

            <Button
              data-testid="button-analyze"
              onClick={handleAnalyze}
              disabled={analyzeMutation.isPending || titles.trim().length === 0}
              className="flex items-center gap-2"
            >
              {analyzeMutation.isPending ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  분석 중...
                </>
              ) : (
                <>
                  <Brain className="w-4 h-4" />
                  키워드 분석
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* 결과 섹션 */}
      {result && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5" />
                분석 결과
              </span>
              <ModeBadge mode={result.mode} />
            </CardTitle>
            <CardDescription>
              {result.metadata.titles_analyzed}개 제목에서 상위 {result.topN.length}개 키워드 추출
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* 통계 정보 */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center p-3 bg-muted rounded-lg">
                <div className="font-semibold text-lg" data-testid="stat-candidates">
                  {result.stats.candidates}
                </div>
                <div className="text-sm text-muted-foreground">후보 키워드</div>
              </div>
              <div className="text-center p-3 bg-muted rounded-lg">
                <div className="font-semibold text-lg" data-testid="stat-db-hits">
                  {result.stats.db_hits}
                </div>
                <div className="text-sm text-muted-foreground">DB 매칭</div>
              </div>
              <div className="text-center p-3 bg-muted rounded-lg">
                <div className="font-semibold text-lg" data-testid="stat-api-refreshed">
                  {result.stats.api_refreshed}
                </div>
                <div className="text-sm text-muted-foreground">API 갱신</div>
              </div>
              <div className="text-center p-3 bg-muted rounded-lg">
                <div className="font-semibold text-lg" data-testid="stat-budget-remaining">
                  {result.budget.dailyRemaining}
                </div>
                <div className="text-sm text-muted-foreground">일일 예산 잔여</div>
              </div>
            </div>

            <Separator />

            {/* 키워드 결과 */}
            <div className="space-y-3">
              <h3 className="font-semibold">추출된 키워드 (조회량 70% + 종합점수 30%)</h3>
              <div className="space-y-2">
                {result.topN.map((keyword, index) => (
                  <div
                    key={`${keyword.text}-${index}`}
                    data-testid={`keyword-result-${index}`}
                    className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50"
                  >
                    <div className="flex items-center gap-3">
                      <Badge variant="secondary" className="font-mono">
                        #{index + 1}
                      </Badge>
                      <div>
                        <div className="font-medium">{keyword.text}</div>
                        <div className="text-sm text-muted-foreground">
                          {keyword.frequency && `빈도: ${keyword.frequency}회`}
                        </div>
                      </div>
                    </div>
                    <div className="text-right space-y-1">
                      <div className="font-semibold text-primary">
                        {keyword.combined_score}점
                      </div>
                      <div className="text-xs text-muted-foreground">
                        조회량: {keyword.raw_volume.toLocaleString()} (
                        {keyword.volume_score}점)
                      </div>
                      <Badge variant="outline">
                        {keyword.source === 'db' && 'DB'}
                        {keyword.source === 'api-refresh' && 'API'}
                        {keyword.source === 'freq-fallback' && '빈도'}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 메타데이터 */}
            <div className="text-xs text-muted-foreground space-y-1">
              <div>분석 시간: {new Date(result.metadata.timestamp).toLocaleString()}</div>
              <div>추출 모드: {result.metadata.extraction_mode}</div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}