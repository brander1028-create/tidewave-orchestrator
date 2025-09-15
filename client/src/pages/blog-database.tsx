import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { 
  ArrowLeft, 
  Search, 
  Filter, 
  Download,
  ExternalLink,
  X,
  Plus
} from "lucide-react";
import { Link, useSearch } from "wouter";

// Blog registry schema with safe defaults
const BlogRegistryItemSchema = z.object({
  id: z.string().default(""),
  blogId: z.string().optional(),
  blogName: z.string().default(""),
  name: z.string().optional(),
  blogUrl: z.string().default(""),
  url: z.string().optional(),
  status: z.enum(["collected", "blacklist", "outreach"]).default("collected"),
  notes: z.string().optional().default(""),
  note: z.string().optional(),
  exposureCount: z.number().default(0),
  totalScore: z.number().default(0),
  lastUpdated: z.string().default(""),
  updatedAt: z.string().optional(),
  discoveredKeywords: z.array(z.string()).default([]),
}).transform((data) => ({
  id: data.id || data.blogId || "",
  blogName: data.blogName || data.name || "",
  blogUrl: data.blogUrl || data.url || "",
  status: data.status,
  notes: data.notes || data.note || "",
  exposureCount: data.exposureCount,
  totalScore: data.totalScore,
  lastUpdated: data.lastUpdated || data.updatedAt || "",
  discoveredKeywords: data.discoveredKeywords,
}));

type BlogRegistryItem = z.infer<typeof BlogRegistryItemSchema>;

export default function BlogDatabasePage() {
  const searchParams = new URLSearchParams(useSearch());
  const keywordFilter = searchParams.get('keyword');
  
  // State for filters and UI
  const [showHiddenColumns, setShowHiddenColumns] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [selectedStatus, setSelectedStatus] = useState<string>("all");
  const [filterMode, setFilterMode] = useState<"all" | "any">("all");
  const [appliedFilters, setAppliedFilters] = useState<Array<{
    id: string;
    type: string;
    value: string;
    condition: string;
  }>>([]);

  // Fetch real blog registry data from API
  const { data: blogs = [], isLoading, error } = useQuery({
    queryKey: ['/api/blog-registry', selectedStatus, searchText],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedStatus !== 'all') {
        params.append('status', selectedStatus);
      }
      if (searchText.trim()) {
        params.append('keyword', searchText.trim());
      }
      
      const response = await fetch(`/api/blog-registry?${params}`);
      if (!response.ok) {
        throw new Error('Failed to fetch blog registry');
      }
      const rawData = await response.json();
      return z.array(BlogRegistryItemSchema).parse(rawData);
    }
  });

  // API already handles status and keyword filtering, so only apply local text search
  const filteredBlogs = blogs.filter((blog: BlogRegistryItem) => {
    // Apply local filters that weren't sent to API
    if (appliedFilters.length > 0) {
      return appliedFilters.every(filter => {
        if (filter.type === 'exposure' && filter.condition === 'greater_than') {
          return blog.exposureCount > parseInt(filter.value);
        }
        if (filter.type === 'score' && filter.condition === 'greater_than') {
          return blog.totalScore > parseInt(filter.value);
        }
        return true;
      });
    }
    
    // Keyword filter from URL (additional local filter)
    if (keywordFilter && !((blog.discoveredKeywords || []).includes(keywordFilter))) {
      return false;
    }
    
    return true;
  });

  const addFilter = (type: string, condition: string, value: string) => {
    const newFilter = {
      id: Date.now().toString(),
      type,
      condition,
      value
    };
    setAppliedFilters(prev => [...prev, newFilter]);
  };

  const removeFilter = (filterId: string) => {
    setAppliedFilters(prev => prev.filter(f => f.id !== filterId));
  };

  // Use mutation for status updates with proper cache invalidation
  const updateStatusMutation = useMutation({
    mutationFn: async ({ blogId, status, note }: { blogId: string; status: "collected" | "blacklist" | "outreach"; note?: string }) => {
      const response = await fetch(`/api/blog-registry/${blogId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ status, note })
      });
      
      if (!response.ok) {
        throw new Error('Failed to update blog status');
      }
      
      return response.json();
    },
    onSuccess: () => {
      // Invalidate and refetch blog registry data
      queryClient.invalidateQueries({ queryKey: ['/api/blog-registry'] });
    },
    onError: (error) => {
      console.error('Error updating blog status:', error);
      alert('상태 업데이트에 실패했습니다.');
    }
  });

  const updateBlogStatus = (blogId: string, newStatus: "collected" | "blacklist" | "outreach", note?: string) => {
    updateStatusMutation.mutate({ blogId, status: newStatus, note });
  };

  if (isLoading) {
    return <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4 flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
        <p className="text-sm text-muted-foreground">블로그 데이터를 불러오는 중...</p>
      </div>
    </div>;
  }

  if (error) {
    return <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4 flex items-center justify-center">
      <div className="text-center">
        <p className="text-red-600 mb-4">데이터를 불러오는데 실패했습니다.</p>
        <Button onClick={() => window.location.reload()} data-testid="retry-button">
          다시 시도
        </Button>
      </div>
    </div>;
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <Link href="/">
              <Button variant="ghost" size="sm" data-testid="back-to-dashboard">
                <ArrowLeft className="h-4 w-4 mr-2" />
                대시보드로
              </Button>
            </Link>
            <div>
              <h1 className="text-2xl font-bold" data-testid="page-title">Blog Database Manager</h1>
              {keywordFilter && (
                <p className="text-sm text-muted-foreground">
                  키워드 필터: <Badge variant="secondary">{keywordFilter}</Badge>
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" data-testid="export-button">
              <Download className="h-4 w-4 mr-2" />
              Export CSV
            </Button>
          </div>
        </div>

        {/* Main Content Card */}
        <Card className="mb-6">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <CardTitle className="text-lg">MERGED DATASETS</CardTitle>
                <Badge variant="outline" className="bg-blue-50">
                  My Combined Data ({filteredBlogs.length} 블로그)
                </Badge>
              </div>
              <div className="flex items-center space-x-2">
                <span className="text-sm text-muted-foreground">Show hidden columns</span>
                <Switch
                  checked={showHiddenColumns}
                  onCheckedChange={setShowHiddenColumns}
                  data-testid="show-hidden-toggle"
                />
              </div>
            </div>
          </CardHeader>

          <CardContent className="space-y-6">
            {/* Filter Section */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 p-4 bg-gray-50 rounded-lg">
              <div className="space-y-2">
                <label className="text-sm font-medium">Text Search</label>
                <div className="relative">
                  <Search className="h-4 w-4 absolute left-3 top-3 text-muted-foreground" />
                  <Input
                    placeholder="블로그명 또는 URL 검색..."
                    value={searchText}
                    onChange={(e) => setSearchText(e.target.value)}
                    className="pl-10"
                    data-testid="search-input"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Status</label>
                <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                  <SelectTrigger data-testid="status-filter">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="collected">수집됨</SelectItem>
                    <SelectItem value="blacklist">블랙리스트</SelectItem>
                    <SelectItem value="outreach">섭외</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Filter Mode</label>
                <div className="flex gap-4">
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="radio"
                      name="filterMode"
                      checked={filterMode === "all"}
                      onChange={() => setFilterMode("all")}
                      className="text-blue-600"
                    />
                    <span className="text-sm">Match all</span>
                  </label>
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="radio"
                      name="filterMode"
                      checked={filterMode === "any"}
                      onChange={() => setFilterMode("any")}
                      className="text-blue-600"
                    />
                    <span className="text-sm">Match any</span>
                  </label>
                </div>
              </div>
            </div>

            {/* Applied Filters */}
            {appliedFilters.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Applied filters ({appliedFilters.length})</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setAppliedFilters([])}
                    className="text-blue-600 hover:text-blue-700"
                  >
                    Clear all
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {appliedFilters.map((filter) => (
                    <Badge
                      key={filter.id}
                      variant="secondary"
                      className="flex items-center gap-2"
                    >
                      {filter.type} {filter.condition} {filter.value}
                      <X
                        className="h-3 w-3 cursor-pointer"
                        onClick={() => removeFilter(filter.id)}
                      />
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Blog Table */}
            <div className="border rounded-lg overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium text-gray-900">블로그명</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-900">URL</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-900">노출 수</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-900">총합 점수</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-900">상태</th>
                      {showHiddenColumns && (
                        <>
                          <th className="px-4 py-3 text-left font-medium text-gray-900">키워드</th>
                          <th className="px-4 py-3 text-left font-medium text-gray-900">메모</th>
                        </>
                      )}
                      <th className="px-4 py-3 text-left font-medium text-gray-900">액션</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredBlogs.map((blog: BlogRegistryItem, index: number) => (
                      <tr key={blog.id || `blog-${index}`} className="border-t hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <div className="font-medium">{blog.blogName}</div>
                          <div className="text-xs text-gray-500">{blog.lastUpdated}</div>
                        </td>
                        <td className="px-4 py-3">
                          <a
                            href={blog.blogUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:text-blue-700 flex items-center gap-1"
                            data-testid={`blog-url-${blog.id}`}
                          >
                            {(blog.blogUrl || "").length > 30 ? (blog.blogUrl || "").substring(0, 30) + '...' : (blog.blogUrl || "")}
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        </td>
                        <td className="px-4 py-3">
                          <Badge className={blog.exposureCount > 3 ? "bg-emerald-100 text-emerald-800" : "bg-gray-100 text-gray-600"}>
                            {blog.exposureCount}개
                          </Badge>
                        </td>
                        <td className="px-4 py-3">
                          <Badge className={
                            blog.totalScore >= 100 ? "bg-emerald-100 text-emerald-800" :
                            blog.totalScore >= 50 ? "bg-blue-100 text-blue-800" :
                            "bg-yellow-100 text-yellow-800"
                          }>
                            {blog.totalScore}pts
                          </Badge>
                        </td>
                        <td className="px-4 py-3">
                          <Badge className={
                            blog.status === "collected" ? "bg-green-100 text-green-800" :
                            blog.status === "outreach" ? "bg-blue-100 text-blue-800" :
                            "bg-red-100 text-red-800"
                          }>
                            {blog.status === "collected" ? "수집됨" : 
                             blog.status === "outreach" ? "섭외" : "블랙"}
                          </Badge>
                        </td>
                        {showHiddenColumns && (
                          <>
                            <td className="px-4 py-3">
                              <div className="flex flex-wrap gap-1">
                                {(blog.discoveredKeywords || []).slice(0, 3).map((keyword: string, idx: number) => (
                                  <Badge key={idx} variant="outline" className="text-xs">
                                    {keyword}
                                  </Badge>
                                ))}
                                {(blog.discoveredKeywords || []).length > 3 && (
                                  <span className="text-xs text-gray-500">
                                    +{(blog.discoveredKeywords || []).length - 3}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <div className="text-sm text-gray-600 max-w-40 truncate">
                                {blog.notes || "—"}
                              </div>
                            </td>
                          </>
                        )}
                        <td className="px-4 py-3">
                          <div className="flex gap-1">
                            <Button
                              size="sm"
                              variant={blog.status === "collected" ? "default" : "outline"}
                              onClick={() => updateBlogStatus(blog.id, "collected")}
                              data-testid={`status-collected-${blog.id}`}
                            >
                              수집됨
                            </Button>
                            <Button
                              size="sm"
                              variant={blog.status === "blacklist" ? "default" : "outline"}
                              onClick={() => updateBlogStatus(blog.id, "blacklist")}
                              data-testid={`status-blacklist-${blog.id}`}
                            >
                              블랙
                            </Button>
                            <Button
                              size="sm"
                              variant={blog.status === "outreach" ? "default" : "outline"}
                              onClick={() => updateBlogStatus(blog.id, "outreach")}
                              data-testid={`status-outreach-${blog.id}`}
                            >
                              섭외
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {filteredBlogs.length === 0 && (
              <div className="text-center py-8 text-gray-500">
                조건에 맞는 블로그가 없습니다.
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}