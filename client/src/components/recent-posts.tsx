import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ExternalLink, RefreshCw } from "lucide-react";
import type { Blog, BlogPost, AnalysisJob } from "@shared/schema";

interface RecentPostsProps {
  blogId: string;
}

interface BlogData {
  blog: Blog;
  posts: BlogPost[];
  job?: AnalysisJob;
}

export default function RecentPosts({ blogId }: RecentPostsProps) {
  const { data, isLoading, refetch } = useQuery<BlogData>({
    queryKey: ["/api/blogs", blogId],
    refetchInterval: (query) => {
      // Refetch while job is running
      return query.data?.job?.status === "running" ? 3000 : false;
    },
  });

  if (isLoading) {
    return (
      <Card className="mb-8 shadow-sm">
        <CardContent className="pt-6">
          <div className="animate-pulse space-y-3">
            <div className="h-4 bg-muted rounded w-1/4"></div>
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center space-x-3 p-3 border rounded-lg">
                  <div className="w-2 h-2 bg-muted rounded-full"></div>
                  <div className="flex-1">
                    <div className="h-4 bg-muted rounded w-3/4 mb-1"></div>
                    <div className="h-3 bg-muted rounded w-1/4"></div>
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

  const { blog, posts } = data;

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "날짜 정보 없음";
    
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return "오늘";
    if (diffDays === 1) return "1일 전";
    if (diffDays < 30) return `${diffDays}일 전`;
    
    return date.toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  return (
    <Card className="mb-8 shadow-sm">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>수집된 블로그 포스트</CardTitle>
          <div className="flex items-center space-x-2">
            <span className="text-sm text-muted-foreground">
              총 {posts.length}개
            </span>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => refetch()}
              data-testid="button-refresh-posts"
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {posts.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            {blog.status === "pending" || blog.status === "analyzing" 
              ? "포스트를 수집하고 있습니다..." 
              : "수집된 포스트가 없습니다."
            }
          </div>
        ) : (
          <div className="space-y-3 max-h-64 overflow-y-auto">
            {posts.map((post, index) => (
              <div
                key={post.id}
                className="flex items-start space-x-3 p-3 border border-border rounded-lg hover:bg-muted/50 transition-colors"
                data-testid={`post-item-${index}`}
              >
                <div className="w-2 h-2 bg-chart-2 rounded-full mt-2 flex-shrink-0"></div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-medium text-foreground truncate">
                    {post.title}
                  </h3>
                  <p className="text-xs text-muted-foreground mt-1">
                    {formatDate(post.publishedAt?.toString() || post.createdAt?.toString() || '')}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="flex-shrink-0"
                  onClick={() => window.open(post.url, '_blank')}
                  data-testid={`button-open-post-${index}`}
                >
                  <ExternalLink className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
