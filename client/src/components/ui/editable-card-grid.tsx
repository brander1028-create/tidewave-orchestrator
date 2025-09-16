import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { 
  Settings, 
  GripVertical, 
  Eye, 
  EyeOff, 
  Plus,
  Target,
  TrendingUp,
  AlertTriangle,
  Activity,
  Clock,
  BarChart3
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export interface DashboardCardConfig {
  id: string;
  title: string;
  type: "kpi" | "chart" | "list" | "metric";
  icon: React.ReactNode;
  visible: boolean;
  order: number;
  size: "small" | "medium" | "large";
  content: React.ReactNode;
}

interface EditableCardGridProps {
  cards: DashboardCardConfig[];
  onCardsChange: (cards: DashboardCardConfig[]) => void;
  editMode?: boolean;
  onEditModeChange?: (editMode: boolean) => void;
}

const defaultCards: DashboardCardConfig[] = [
  {
    id: "avg-rank",
    title: "평균 순위",
    type: "kpi",
    icon: <Target className="w-4 h-4" />,
    visible: true,
    order: 1,
    size: "small",
    content: (
      <div>
        <div className="text-2xl font-bold text-foreground">8.3위</div>
        <div className="flex items-center gap-1 text-sm text-muted-foreground">
          <TrendingUp className="w-3 h-3 text-green-500" />
          <span className="text-green-500">-2.1</span>
          <span>전일 대비</span>
        </div>
      </div>
    )
  },
  {
    id: "keyword-count",
    title: "추적 키워드",
    type: "kpi", 
    icon: <Activity className="w-4 h-4" />,
    visible: true,
    order: 2,
    size: "small",
    content: (
      <div>
        <div className="text-2xl font-bold text-foreground">127개</div>
        <div className="flex items-center gap-1 text-sm text-muted-foreground">
          <span>이번 주</span>
          <Badge variant="outline" className="text-green-500">+5</Badge>
        </div>
      </div>
    )
  },
  {
    id: "top-keywords",
    title: "상위 10위 키워드",
    type: "kpi",
    icon: <TrendingUp className="w-4 h-4" />,
    visible: true,
    order: 3,
    size: "small", 
    content: (
      <div>
        <div className="text-2xl font-bold text-foreground">45개</div>
        <div className="flex items-center gap-1 text-sm text-muted-foreground">
          <span>어제</span>
          <Badge variant="outline" className="text-green-500">+3</Badge>
        </div>
      </div>
    )
  },
  {
    id: "attention-needed",
    title: "주의 필요",
    type: "kpi",
    icon: <AlertTriangle className="w-4 h-4" />,
    visible: true,
    order: 4,
    size: "small",
    content: (
      <div>
        <div className="text-2xl font-bold text-foreground">12개</div>
        <div className="flex items-center gap-1 text-sm text-muted-foreground">
          <span>개선됨</span>
          <Badge variant="outline" className="text-blue-500">-2</Badge>
        </div>
      </div>
    )
  },
  {
    id: "trend-chart",
    title: "순위 추이",
    type: "chart",
    icon: <BarChart3 className="w-4 h-4" />,
    visible: true,
    order: 5,
    size: "large",
    content: (
      <div className="h-48 flex items-center justify-center text-muted-foreground">
        <div className="text-center">
          <BarChart3 className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">순위 추이 차트</p>
        </div>
      </div>
    )
  },
  {
    id: "recent-alerts",
    title: "최근 알림",
    type: "list",
    icon: <Clock className="w-4 h-4" />,
    visible: true,
    order: 6,
    size: "medium",
    content: (
      <div className="space-y-3">
        {[
          { title: "홍삼스틱 순위 급락", desc: "8위 → 15위 (-7)", time: "30분 전", severity: "high" },
          { title: "홍삼 추천 Top 5 진입", desc: "7위 → 4위 (+3)", time: "1시간 전", severity: "low" },
        ].map((alert, i) => (
          <div key={i} className="flex items-start gap-3 p-2 bg-secondary/20 rounded-lg">
            <div className={`w-2 h-2 rounded-full mt-2 ${
              alert.severity === 'high' ? 'bg-red-500' : 'bg-green-500'
            }`} />
            <div className="flex-1 min-w-0">
              <div className="font-medium text-sm">{alert.title}</div>
              <div className="text-xs text-muted-foreground">{alert.desc}</div>
              <div className="text-xs text-muted-foreground mt-1">{alert.time}</div>
            </div>
          </div>
        ))}
      </div>
    )
  }
];

export function EditableCardGrid({ 
  cards = defaultCards, 
  onCardsChange, 
  editMode = false, 
  onEditModeChange 
}: EditableCardGridProps) {
  const [localCards, setLocalCards] = useState(cards);
  const [draggedCard, setDraggedCard] = useState<string | null>(null);

  // 로컬 변경사항을 부모에게 전달
  useEffect(() => {
    onCardsChange(localCards);
  }, [localCards, onCardsChange]);

  // 카드 표시/숨김 토글
  const toggleCardVisibility = (cardId: string) => {
    setLocalCards(prev => prev.map(card => 
      card.id === cardId ? { ...card, visible: !card.visible } : card
    ));
  };

  // 카드 순서 변경
  const reorderCards = (fromIndex: number, toIndex: number) => {
    setLocalCards(prev => {
      const newCards = [...prev];
      const [removed] = newCards.splice(fromIndex, 1);
      newCards.splice(toIndex, 0, removed);
      
      // order 재계산
      return newCards.map((card, index) => ({ ...card, order: index + 1 }));
    });
  };

  // 보이는 카드들만 정렬해서 가져오기
  const visibleCards = localCards.filter(card => card.visible).sort((a, b) => a.order - b.order);

  // 그리드 클래스 계산
  const getGridClass = (size: DashboardCardConfig["size"]) => {
    switch (size) {
      case "small": return "col-span-1";
      case "medium": return "col-span-2"; 
      case "large": return "col-span-3";
      default: return "col-span-1";
    }
  };

  const handleDragStart = (e: React.DragEvent, cardId: string) => {
    setDraggedCard(cardId);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleDrop = (e: React.DragEvent, targetCardId: string) => {
    e.preventDefault();
    if (!draggedCard || draggedCard === targetCardId) return;

    const fromIndex = visibleCards.findIndex(card => card.id === draggedCard);
    const toIndex = visibleCards.findIndex(card => card.id === targetCardId);
    
    if (fromIndex !== -1 && toIndex !== -1) {
      reorderCards(fromIndex, toIndex);
    }
    
    setDraggedCard(null);
  };

  return (
    <div className="space-y-4">
      {/* 편집 모드 토글 및 설정 */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground">대시보드 위젯</h2>
        <div className="flex items-center gap-2">
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" data-testid="button-card-settings">
                <Settings className="w-4 h-4 mr-1" />
                카드 설정
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>카드 표시 설정</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 mt-4">
                {localCards.map((card) => (
                  <div key={card.id} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {card.icon}
                      <span className="text-sm font-medium">{card.title}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {card.visible ? (
                        <Eye className="w-4 h-4 text-green-500" />
                      ) : (
                        <EyeOff className="w-4 h-4 text-muted-foreground" />
                      )}
                      <Switch
                        checked={card.visible}
                        onCheckedChange={() => toggleCardVisibility(card.id)}
                        data-testid={`switch-card-${card.id}`}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </DialogContent>
          </Dialog>
          
          <Button 
            variant={editMode ? "default" : "outline"} 
            size="sm"
            onClick={() => onEditModeChange?.(!editMode)}
            data-testid="button-edit-mode"
          >
            {editMode ? "편집 완료" : "레이아웃 편집"}
          </Button>
        </div>
      </div>

      {/* 카드 그리드 */}
      <div className="grid grid-cols-3 gap-4">
        {visibleCards.map((card) => (
          <Card
            key={card.id}
            className={cn(
              getGridClass(card.size),
              editMode && "cursor-move border-dashed border-primary/50 hover:border-primary",
              draggedCard === card.id && "opacity-50"
            )}
            draggable={editMode}
            onDragStart={(e) => editMode && handleDragStart(e, card.id)}
            onDragOver={editMode ? handleDragOver : undefined}
            onDrop={(e) => editMode && handleDrop(e, card.id)}
            data-testid={`card-${card.id}`}
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                {card.icon}
                {card.title}
              </CardTitle>
              {editMode && (
                <GripVertical className="w-4 h-4 text-muted-foreground" />
              )}
            </CardHeader>
            <CardContent>
              {card.content}
            </CardContent>
          </Card>
        ))}
        
        {/* 새 카드 추가 버튼 (편집 모드일 때만) */}
        {editMode && (
          <Card className="col-span-1 border-dashed border-muted-foreground/30 flex items-center justify-center min-h-[120px]">
            <Button variant="ghost" className="h-full w-full flex-col gap-2 text-muted-foreground" data-testid="button-add-card">
              <Plus className="w-6 h-6" />
              <span className="text-sm">카드 추가</span>
            </Button>
          </Card>
        )}
      </div>
    </div>
  );
}