// ✅ Shared keyword normalization (architect 권장)
export function normalizeKeyword(text: string): string {
  return text.normalize('NFKC').toLowerCase().replace(/[\s\-_.]+/g, '');
}

// ✅ Multi-key lookup with normalization priority
export function multiKeyLookup<T>(map: Record<string, T>, keyword: string): T | null {
  const keyRaw = keyword;
  const keyLC = keyword.toLowerCase().trim();
  const keyNrm = normalizeKeyword(keyword);
  
  return map[keyRaw] || map[keyLC] || map[keyNrm] || null;
}

// ✅ Build canonical volume map (architect 전략)
export function buildCanonicalVolumeMap(
  inputKeywords: string[], 
  tiers: any[], 
  keywordVolumeMap: Record<string, number | null>
): Record<string, number | null> {
  const canonical: Record<string, number | null> = {};
  let sourceA = 0, sourceB = 0, sourceC = 0;
  
  // (A) Pre-enriched DB/API volumes for input keywords (최우선)
  for (const keyword of inputKeywords) {
    const volume = multiKeyLookup(keywordVolumeMap, keyword);
    if (volume && volume > 0) {
      canonical[keyword] = volume;
      // 정규화된 키들에도 동일 값 설정
      canonical[keyword.toLowerCase().trim()] = volume;
      canonical[normalizeKeyword(keyword)] = volume;
      sourceA++;
    }
  }
  
  // (B) Tier candidate volumes (보조)
  for (const t of tiers) {
    for (const kw of (t.keywords ?? [])) {
      if (kw.volume && kw.volume > 0) {
        const keys = [kw.text, kw.inputKeyword].filter(Boolean);
        for (const key of keys) {
          if (!canonical[key]) {
            canonical[key] = kw.volume;
            canonical[key.toLowerCase().trim()] = kw.volume;
            canonical[normalizeKeyword(key)] = kw.volume;
            sourceB++;
          }
        }
      }
    }
  }
  
  // (C) ManagedKeywords DB fallback (최후)
  for (const keyword of inputKeywords) {
    if (!canonical[keyword]) {
      const volume = multiKeyLookup(keywordVolumeMap, keyword);
      if (volume && volume > 0) {
        canonical[keyword] = volume;
        canonical[keyword.toLowerCase().trim()] = volume;
        canonical[normalizeKeyword(keyword)] = volume;
        sourceC++;
      }
    }
  }
  
  console.log(`📊 [Canonical Map] Sources: A=${sourceA}, B=${sourceB}, C=${sourceC}`);
  return canonical;
}

// v17 파이프라인 결과 조립 - UI 호환 스키마 생성 (순수 함수)
export function assembleResults(jobId: string, tiers: any[], cfg: any) {
  console.log(`🔧 [assembleResults] Processing ${tiers.length} tiers for job ${jobId}`);
  
  // 🔧 TODO: Canonical volume map 통합 예정 (현재는 호환성 유지)
  const searchVolumes: Record<string, number|null> = {};
  
  // 모든 tier에서 키워드 볼륨 수집 (inputKeyword 기준으로 수정)
  for (const t of tiers) {
    for (const kw of (t.keywords ?? [])) {
      // ✅ 수정: inputKeyword를 키로 사용 (UI가 찾는 원본 키워드)
      const inputKey = kw.inputKeyword?.trim?.() || "";
      const extractedKey = kw.text?.trim?.() || "";
      
      // 원본 입력 키워드로 volume 설정
      if (inputKey && kw.volume !== null && kw.volume !== undefined) {
        searchVolumes[inputKey] = kw.volume;
      }
      // 추출된 키워드도 같은 volume으로 설정 (호환성)
      if (extractedKey && kw.volume !== null && kw.volume !== undefined) {
        searchVolumes[extractedKey] = kw.volume;
      }
    }
  }

  const summaryByKeyword = buildSummaryByKeywordFromTiers(tiers, cfg);

  // ★ 레거시 UI가 finalStats만 읽는 경우를 대비해 tiers를 finalStats에도 넣어줌
  const finalStats = {
    blogs: summaryByKeyword.reduce((a,k)=>a+(k.blogs?.length||0),0),
    posts: summaryByKeyword.flatMap(k=>k.blogs||[]).reduce((a: number, b: any)=>a+((b.posts||[]).length),0),
    keywords: summaryByKeyword.length,
    tiers  // ★ 중요: 레거시 표시용
  };

  // ★ Legacy UI 호환성: attemptsByKeyword, exposureStatsByKeyword 추가
  const attemptsByKeyword: Record<string, number> = {};
  const exposureStatsByKeyword: Record<string, {page1: number, zero: number, unknown: number}> = {};
  
  for (const kwData of summaryByKeyword) {
    const keyword = kwData.keyword;
    // 시도 횟수 계산: 각 블로그의 posts 수 × tiersPerPost
    attemptsByKeyword[keyword] = kwData.blogs.reduce((sum: number, blog: any) => 
      sum + (blog.posts?.length || 0) * (cfg.phase2?.tiersPerPost || 4), 0
    );
    
    // 노출 통계 (기본값으로 설정, 실제 구현에서는 더 정교한 계산 가능)
    exposureStatsByKeyword[keyword] = {
      page1: kwData.phase2ExposedNew || 0,
      zero: Math.max(0, (kwData.newBlogs || 0) - (kwData.phase2ExposedNew || 0)),
      unknown: 0
    };
  }

  return {
    jobId,
    params: { 
      postsPerBlog: cfg.phase2?.postsPerBlog || 4, 
      tiersPerPost: cfg.phase2?.tiersPerPost || 4 
    },
    searchVolumes,
    summaryByKeyword,           // ★ v17 UI가 읽는 필드
    finalStats,                 // ★ 레거시 대비
    attemptsByKeyword,          // ★ Legacy UI 호환성
    exposureStatsByKeyword,     // ★ Legacy UI 호환성
    tiers,                      // ★ API 응답에 최상위 tiers 배열 추가
    postTierChecks: tiers       // ★ postTierChecks로도 동일한 데이터 제공
  };
}

// 최소 유틸: 키워드별로 블로그/포스트/티어 정리
function buildSummaryByKeywordFromTiers(tiers: any[], cfg: any) {
  const byKw: Record<string, any> = {};
  
  for (const t of tiers) {
    // tier가 키워드 배열을 가지고 있다고 가정
    for (const kw of (t.keywords ?? [])) {
      const key = kw.inputKeyword || kw.text || "unknown";
      if (!byKw[key]) {
        byKw[key] = { 
          keyword: key, 
          searchVolume: kw.volume ?? null,
          totalBlogs: 0,
          newBlogs: 0,
          phase2ExposedNew: 0,
          blogs: [] 
        };
      }
      
      // tier를 blog/post 구조로 추가
      // 실제 프로젝트 구조에 맞춰 조정 필요
      if (t.blog && t.post) {
        let blog = byKw[key].blogs.find((b: any) => b.blogId === t.blog.blogId);
        if (!blog) {
          blog = {
            blogId: t.blog.blogId,
            blogName: t.blog.blogName || t.blog.blogId,
            blogUrl: t.blog.blogUrl || '',
            status: 'collected',
            totalExposed: 0,
            totalScore: 0,
            topKeywords: [],
            posts: []
          };
          byKw[key].blogs.push(blog);
          byKw[key].totalBlogs++;
        }
        
        let post = blog.posts.find((p: any) => p.title === t.post.title);
        if (!post) {
          post = {
            title: t.post.title,
            tiers: []
          };
          blog.posts.push(post);
        }
        
        // ★ tier 추가: v17 실제 계산 점수 우선 사용
        post.tiers.push({
          tier: t.tier || 1,
          text: t.candidate?.text || t.textSurface || t.text || "",
          volume: t.candidate?.volume ?? t.volume ?? null,
          rank: t.candidate?.rank ?? t.rank ?? null,
          score: t.candidate?.totalScore ?? t.score ?? t.candidate?.adScore ?? 0, // ★ totalScore 최우선
          eligible: t.candidate?.eligible ?? true,
          skipReason: t.candidate?.skipReason ?? null
        });
        
        blog.totalScore += (t.score ?? 0);
      }
    }
  }
  
  return Object.values(byKw);
}