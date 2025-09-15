import { useState } from "react";

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

export default function KeywordSummaryCard({
  data, // { keyword, searchVolume, totalBlogs, newBlogs, phase2ExposedNew, items }
}: { data: {
  keyword: string; 
  searchVolume: number | null;
  totalBlogs: number; 
  newBlogs: number; 
  phase2ExposedNew: number;
  items: KeywordItem[];
}}) {
  const [open, setOpen] = useState(false);
  const fmtVol = (v: number | null) => v == null ? "–" : v.toLocaleString();
  const fmtRank = (r: number | null) => r == null ? "미확인" : (r <= 10 ? `모바일 1p #${r}` : "미노출");

  return (
    <div className="rounded-2xl border p-4 mb-4 shadow-sm bg-white">
      <div className="flex items-center justify-between">
        <div className="text-lg font-semibold">{data.keyword}
          <span className="ml-2 text-sm text-gray-500">검색량 {fmtVol(data.searchVolume)}</span>
        </div>
        <button className="px-3 py-1 rounded-xl border hover:bg-gray-50" onClick={() => setOpen(!open)}>
          {open ? "접기" : "자세히"}
        </button>
      </div>

      <div className="mt-2 text-sm text-gray-700">
        <span className="mr-4">신규 {data.newBlogs}/{data.totalBlogs}</span>
        <span>Phase2(신규) {data.phase2ExposedNew}/{data.newBlogs}</span>
      </div>

      {open && (
        <div className="mt-4 space-y-6">
          {/* ① 신규 블로그 */}
          <div>
            <div className="font-medium mb-2">① 신규 블로그</div>
            <div className="space-y-2">
              {data.items.map((it, i) => (
                <div key={i} className="rounded-xl border p-3">
                  <div className="flex items-center justify-between">
                    <a className="font-medium hover:underline" href={it.blogUrl} target="_blank" rel="noreferrer">{it.blogName}</a>
                    <div className="text-xs text-gray-500">스캔 {it.scannedPosts}개</div>
                  </div>
                  {/* 볼륨이 '–'로 보이는 상황 대비: 제목 샘플 */}
                  <div className="mt-2 text-xs text-gray-600">제목 샘플: {it.titlesSample.join(" · ")}</div>
                </div>
              ))}
            </div>
          </div>

          {/* ② Phase2(신규) */}
          <div>
            <div className="font-medium mb-2">② Phase2(신규)</div>
            <div className="space-y-3">
              {data.items.map((it, i) => (
                <div key={i} className="rounded-xl border p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <a className="font-medium hover:underline" href={it.blogUrl} target="_blank" rel="noreferrer">{it.blogName}</a>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {it.topKeywords.map((k, idx) => (
                      <span key={idx} className="text-sm rounded-full border px-2 py-1">
                        {k.text}{k.related ? "" : " [관련X]"} · {fmtVol(k.volume)} · {k.score}pts · {fmtRank(k.rank)}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>
      )}
    </div>
  );
}