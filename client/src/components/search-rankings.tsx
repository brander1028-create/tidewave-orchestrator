import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowUp, ArrowDown, Minus, X } from "lucide-react";
import type { Blog, Keyword } from "@shared/schema";

interface SearchRankingsProps {
  blogId: string;
}

interface BlogData {
  blog: Blog;
  keywords: Keyword[];
}

export default function SearchRankings({ blogId }: SearchRankingsProps) {
  const { data, isLoading } = useQuery<BlogData>({
    queryKey: ["/api/blogs", blogId],
    refetchInterval: 30000, // Refetch every 30 seconds for real-time rankings
  });

  if (isLoading) {
    return (
      <Card className="shadow-sm">
        <CardContent className="pt-6">
          <div className="animate-pulse space-y-3">
            <div className="h-4 bg-muted rounded w-1/4"></div>
            <div className="space-y-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex items-center space-x-3">
                    <div className="h-4 bg-muted rounded w-20"></div>
                    <div className="h-5 bg-muted rounded w-12"></div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <div className="h-4 bg-muted rounded w-16"></div>
                    <div className="w-4 h-4 bg-muted rounded"></div>
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
  
  // Filter keywords that have rankings and sort by rank
  const rankedKeywords = keywords
    .filter(k => k.searchRank !== null)
    .sort((a, b) => (a.searchRank || 999) - (b.searchRank || 999))
    .slice(0, 10);

  // Show some unranked keywords as well
  const unrankedKeywords = keywords
    .filter(k => k.searchRank === null)
    .slice(0, Math.max(0, 10 - rankedKeywords.length));

  const displayKeywords = [...rankedKeywords, ...unrankedKeywords];

  const getRankingBadge = (keyword: Keyword) => {
    const { rankChange } = keyword;
    
    if ((rankChange || 0) > 0) {
      return (
        <Badge variant="default" className="bg-chart-1/10 text-chart-1 border-chart-1/20">
          순위 상승
        </Badge>
      );
    } else if ((rankChange || 0) < 0) {
      return (
        <Badge variant="destructive" className="bg-destructive/10 text-destructive border-destructive/20">
          순위 하락
        </Badge>
      );
    } else if (keyword.searchRank) {
      return (
        <Badge variant="secondary" className="bg-muted/50 text-muted-foreground">
          순위 유지
        </Badge>
      );
    } else {
      return (
        <Badge variant="outline" className="text-muted-foreground">
          순위 없음
        </Badge>
      );
    }
  };

  const getRankingIcon = (keyword: Keyword) => {
    const { rankChange } = keyword;
    
    if ((rankChange || 0) > 0) {
      return <ArrowUp className="text-chart-1 h-3 w-3" />;
    } else if ((rankChange || 0) < 0) {
      return <ArrowDown className="text-destructive h-3 w-3" />;
    } else if (keyword.searchRank) {
      return <Minus className="text-muted-foreground h-3 w-3" />;
    } else {
      return <X className="text-muted-foreground h-3 w-3" />;
    }
  };

  const getRankingText = (keyword: Keyword) => {
    if (keyword.searchRank) {
      return `${keyword.searchRank}위`;
    }
    return "-";
  };

  const getRankingTextColor = (keyword: Keyword) => {
    if (keyword.rankChange > 0) return "text-chart-1";
    if (keyword.rankChange < 0) return "text-destructive";
    if (keyword.searchRank) return "text-foreground";
    return "text-muted-foreground";
  };

  return (
    <Card className="shadow-sm">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>네이버 검색 순위</CardTitle>
          <div className="flex items-center space-x-2">
            <span className="text-sm text-muted-foreground">실시간 확인</span>
            <div className="w-2 h-2 bg-chart-1 rounded-full animate-pulse"></div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {displayKeywords.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            검색 순위를 확인하고 있습니다...
          </div>
        ) : (
          <div className="space-y-3">
            {displayKeywords.map((keyword, index) => (
              <div
                key={keyword.id}
                className="flex items-center justify-between p-3 border border-border rounded-lg"
                data-testid={`ranking-item-${index}`}
              >
                <div className="flex items-center space-x-3">
                  <span className="text-sm font-medium">{keyword.keyword}</span>
                  {getRankingBadge(keyword)}
                </div>
                <div className="flex items-center space-x-2 text-right">
                  <div className="text-sm">
                    <span className="text-muted-foreground">현재:</span>
                    <span 
                      className={`font-medium ml-1 ${getRankingTextColor(keyword)}`}
                      data-testid={`ranking-position-${index}`}
                    >
                      {getRankingText(keyword)}
                    </span>
                  </div>
                  {getRankingIcon(keyword)}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
