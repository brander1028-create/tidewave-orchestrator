import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, ChevronUp } from "lucide-react";

export type KeywordItem = {
  blogName: string; 
  blogUrl: string;
  scannedPosts: number;
  titlesSample: string[];
  topKeywords: { 
    text: string; 
    volume: number | null; 
    score: number; 
    rank: number | null; 
    related: boolean 
  }[];
};

export type KeywordSummaryData = {
  keyword: string;
  searchVolume: number | null;
  totalBlogs: number;
  newBlogs: number;
  phase2ExposedNew: number;
  items: KeywordItem[];
};

export default function KeywordSummaryCard({
  data,
}: {
  data: KeywordSummaryData;
}) {
  const [open, setOpen] = useState(false);
  
  const fmtVol = (v: number | null) => v == null ? "–" : v.toLocaleString();
  const fmtRank = (r: number | null) => 
    r == null ? "미확인" : (r <= 10 ? `모바일 1p #${r}` : "미노출");

  return (
    <Card className="rounded-2xl border shadow-sm bg-white dark:bg-gray-800 mb-4">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100" data-testid={`keyword-title-${data.keyword}`}>
              {data.keyword}
            </h3>
            <span className="text-sm text-gray-500 dark:text-gray-400" data-testid={`search-volume-${data.keyword}`}>
              검색량 {fmtVol(data.searchVolume)}
            </span>
          </div>
          <Collapsible open={open} onOpenChange={setOpen}>
            <CollapsibleTrigger asChild>
              <Button 
                variant="outline" 
                size="sm"
                className="px-3 py-1 rounded-xl border hover:bg-gray-50 dark:hover:bg-gray-700"
                data-testid={`toggle-details-${data.keyword}`}
              >
                {open ? (
                  <>
                    접기 <ChevronUp className="w-4 h-4 ml-1" />
                  </>
                ) : (
                  <>
                    자세히 <ChevronDown className="w-4 h-4 ml-1" />
                  </>
                )}
              </Button>
            </CollapsibleTrigger>
          </Collapsible>
        </div>

        <div className="flex items-center gap-4 text-sm text-gray-700 dark:text-gray-300">
          <span data-testid={`new-blogs-${data.keyword}`}>
            신규 {data.newBlogs}/{data.totalBlogs}
          </span>
          <span data-testid={`phase2-exposed-${data.keyword}`}>
            Phase2(신규) {data.phase2ExposedNew}/{data.newBlogs}
          </span>
        </div>
      </CardHeader>

      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleContent>
          <CardContent className="pt-0">
            <div className="space-y-6">
              {/* ① 신규 블로그 */}
              <div>
                <div className="font-medium mb-3 text-gray-900 dark:text-gray-100">
                  ① 신규 블로그
                </div>
                <div className="space-y-3">
                  {data.items.length === 0 ? (
                    <div className="text-sm text-gray-500 dark:text-gray-400 p-3 border rounded-xl">
                      신규 블로그가 없습니다.
                    </div>
                  ) : (
                    data.items.map((item, i) => (
                      <div 
                        key={i} 
                        className="rounded-xl border border-gray-200 dark:border-gray-600 p-3 bg-gray-50 dark:bg-gray-700"
                        data-testid={`new-blog-${data.keyword}-${i}`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <a 
                            className="font-medium hover:underline text-blue-600 dark:text-blue-400" 
                            href={item.blogUrl} 
                            target="_blank" 
                            rel="noreferrer"
                            data-testid={`blog-link-${data.keyword}-${i}`}
                          >
                            {item.blogName}
                          </a>
                          <div className="text-xs text-gray-500 dark:text-gray-400">
                            스캔 {item.scannedPosts}개
                          </div>
                        </div>
                        
                        {/* 제목 샘플 */}
                        {item.titlesSample.length > 0 && (
                          <div className="text-xs text-gray-600 dark:text-gray-300">
                            제목 샘플: {item.titlesSample.join(" · ")}
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* ② Phase2(신규) */}
              <div>
                <div className="font-medium mb-3 text-gray-900 dark:text-gray-100">
                  ② Phase2(신규)
                </div>
                <div className="space-y-3">
                  {data.items.length === 0 ? (
                    <div className="text-sm text-gray-500 dark:text-gray-400 p-3 border rounded-xl">
                      Phase2 키워드가 없습니다.
                    </div>
                  ) : (
                    data.items.map((item, i) => (
                      <div 
                        key={i} 
                        className="rounded-xl border border-gray-200 dark:border-gray-600 p-3 bg-gray-50 dark:bg-gray-700"
                        data-testid={`phase2-blog-${data.keyword}-${i}`}
                      >
                        <div className="mb-3 flex items-center justify-between">
                          <a 
                            className="font-medium hover:underline text-blue-600 dark:text-blue-400" 
                            href={item.blogUrl} 
                            target="_blank" 
                            rel="noreferrer"
                            data-testid={`phase2-blog-link-${data.keyword}-${i}`}
                          >
                            {item.blogName}
                          </a>
                        </div>
                        
                        {/* 키워드 태그들 */}
                        <div className="flex flex-wrap gap-2">
                          {item.topKeywords.length === 0 ? (
                            <span className="text-sm text-gray-500 dark:text-gray-400">
                              추출된 키워드 없음
                            </span>
                          ) : (
                            item.topKeywords.map((k, idx) => (
                              <Badge
                                key={idx}
                                variant="secondary"
                                className="text-sm rounded-full border px-2 py-1 text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-600"
                                data-testid={`keyword-tag-${data.keyword}-${i}-${idx}`}
                              >
                                {k.text}
                                {!k.related && " [관련X]"} · {fmtVol(k.volume)} · {k.score}pts · {fmtRank(k.rank)}
                              </Badge>
                            ))
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}