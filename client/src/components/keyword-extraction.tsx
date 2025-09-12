import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Filter } from "lucide-react";
import type { Blog, Keyword } from "@shared/schema";

interface KeywordExtractionProps {
  blogId: string;
}

interface BlogData {
  blog: Blog;
  keywords: Keyword[];
}

export default function KeywordExtraction({ blogId }: KeywordExtractionProps) {
  const { data, isLoading } = useQuery<BlogData>({
    queryKey: ["/api/blogs", blogId],
  });

  if (isLoading) {
    return (
      <Card className="shadow-sm">
        <CardContent className="pt-6">
          <div className="animate-pulse space-y-3">
            <div className="h-4 bg-muted rounded w-1/4"></div>
            <div className="space-y-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex items-center space-x-3">
                    <div className="w-6 h-6 bg-muted rounded"></div>
                    <div className="h-4 bg-muted rounded w-24"></div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <div className="h-5 bg-muted rounded w-8"></div>
                    <div className="h-4 bg-muted rounded w-12"></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!data) return null;

  const { keywords } = data;
  const displayKeywords = keywords.slice(0, 20); // Show top 20

  const getScoreColor = (index: number) => {
    const colors = ["chart-1", "chart-2", "chart-3", "chart-4", "chart-5"];
    return colors[index % colors.length];
  };

  return (
    <Card className="shadow-sm">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>추출된 키워드</CardTitle>
          <div className="flex items-center space-x-2">
            <span className="text-sm text-muted-foreground">
              상위 {displayKeywords.length}개
            </span>
            <Button variant="ghost" size="icon" data-testid="button-filter-keywords">
              <Filter className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {displayKeywords.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            키워드를 추출하고 있습니다...
          </div>
        ) : (
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {displayKeywords.map((keyword, index) => (
              <div
                key={keyword.id}
                className="flex items-center justify-between p-3 border border-border rounded-lg"
                data-testid={`keyword-item-${index}`}
              >
                <div className="flex items-center space-x-3">
                  <div 
                    className={`w-6 h-6 bg-${getScoreColor(index)} text-white rounded text-xs flex items-center justify-center font-medium`}
                  >
                    {index + 1}
                  </div>
                  <span className="text-sm font-medium">{keyword.keyword}</span>
                </div>
                <div className="flex items-center space-x-2">
                  <Badge 
                    variant="secondary" 
                    className={`text-xs bg-${getScoreColor(index)}/10 text-${getScoreColor(index)}`}
                  >
                    {keyword.frequency}회
                  </Badge>
                  <span 
                    className={`text-sm font-medium text-${getScoreColor(index)}`}
                    data-testid={`keyword-score-${index}`}
                  >
                    {(keyword.score / 100).toFixed(2)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
