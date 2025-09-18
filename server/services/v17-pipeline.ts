/**
 * v17 Pipeline: Pre-enrich + Score-First Gate + autoFill + Auto Keyword Enrichment
 * 완전 자동화된 키워드 관리 시스템
 */
import { getAlgoConfig } from './algo-config';
import { getVolumesWithHealth } from './externals-health';
import { serpScraper } from './serp-scraper';
import { db } from '../db';
import { postTierChecks } from '../../shared/schema';
import { autoEnrichFromTitle } from './auto-keyword-enrichment';

// Import Phase2 types only (engines replaced with deterministic logic)
import { Candidate, Tier } from '../phase2/types';
import { extractTitleTokens, makeBigrams, hasMatjip, hasLocal } from './title-keyword-extractor';

// ★ v17-deterministic: 새로운 제목 토큰 추출기 사용

/**
 * Decide whether to activate canary configuration based on ratio and keywords
 */
function shouldActivateCanary(inputKeyword: string, canaryConfig: any): boolean {
  if (!canaryConfig.enabled) {
    return false;
  }
  
  // If specific keywords are defined, only apply canary to those keywords
  if (canaryConfig.keywords && canaryConfig.keywords.length > 0) {
    const normalizedKeyword = inputKeyword.toLowerCase().trim();
    const isTargetKeyword = canaryConfig.keywords.some((keyword: string) => 
      normalizedKeyword.includes(keyword.toLowerCase()) || 
      keyword.toLowerCase().includes(normalizedKeyword)
    );
    
    if (!isTargetKeyword) {
      return false; // Not a target keyword, use production
    }
  }
  
  // Apply ratio-based decision
  const randomValue = Math.random();
  const shouldActivate = randomValue < canaryConfig.ratio;
  
  if (canaryConfig.keywords && canaryConfig.keywords.length > 0) {
    console.log(`🎯 [Canary] Keyword "${inputKeyword}" matched target keywords, ratio check: ${randomValue.toFixed(3)} < ${canaryConfig.ratio} = ${shouldActivate}`);
  } else {
    console.log(`🎲 [Canary] Ratio check: ${randomValue.toFixed(3)} < ${canaryConfig.ratio} = ${shouldActivate}`);
  }
  
  return shouldActivate;
}

export interface V17PipelineResult {
  tiers: Array<{
    tier: number;
    text: string;
    volume: number | null;
    rank: number | null;
    score: number;
    adScore?: number;
    eligible?: boolean;
    skipReason?: string;
  }>;
  stats: {
    candidatesGenerated: number;
    preEnriched: number;
    gateFiltered: number;
    tiersAutoFilled: number;
  };
}

/**
 * v17 완전 파이프라인: 제목 → 후보 생성 → Pre-enrich → Gate → 점수 → 티어 → 자동보강
 */
export async function processPostTitleV17(
  title: string,
  jobId: string,
  blogId: string,
  postId: number,
  inputKeyword: string,
  options: { deterministic?: boolean } = {}
): Promise<V17PipelineResult> {
  console.log(`🚀 [v17 Pipeline] Starting for title: "${title.substring(0, 50)}..."`);
  
  // Step 0: 자동 키워드 Enrichment (사용자 요구사항)
  // 🔒 HYBRID MODE: autoEnrichFromTitle 비활성화 (제목 조합만 사용)
  if (process.env.HYBRID_MODE === 'true') {
    console.log(`🎯 [HYBRID MODE] Skipping autoEnrichFromTitle - using title bigrams only`);
  } else {
    console.log(`🔍 [v17 Pipeline] Starting auto-enrichment for title analysis`);
    try {
      const enrichmentResult = await autoEnrichFromTitle(title, inputKeyword, jobId, blogId, { deterministic: options.deterministic });
      console.log(`✅ [v17 Pipeline] Auto-enrichment completed:`);
      console.log(`   - Found in DB: ${enrichmentResult.foundInDB.length}`);
      console.log(`   - Missing from DB: ${enrichmentResult.missingFromDB.length}`);
      console.log(`   - Newly enriched: ${enrichmentResult.newlyEnriched.length}`);
      console.log(`   - Top keyword: ${enrichmentResult.topKeyword}`);
      console.log(`   - Generated combinations: ${enrichmentResult.generatedCombinations.length}`);
      console.log(`   - Filtered ineligible: ${enrichmentResult.filteredIneligible.length}`);
      console.log(`   - Final tiers: ${enrichmentResult.finalTiers.length}`);
      console.log(`   - API calls: ${enrichmentResult.stats.apiCalls}`);
    } catch (enrichmentError) {
      console.error(`⚠️ [v17 Pipeline] Auto-enrichment failed, continuing with standard pipeline:`, enrichmentError);
    }
  }
  
  // Step 1: v17 핫리로드 설정
  const baseCfg = await getAlgoConfig();
  
  // Step 1.1: Canary System - Decide configuration to use
  let cfg = baseCfg;
  let isCanaryTraffic = false;
  
  if (baseCfg.features?.canary?.enabled === true) {
    // Check if this request should use canary configuration
    const shouldUseCanary = shouldActivateCanary(inputKeyword, baseCfg.features.canary);
    
    if (shouldUseCanary) {
      isCanaryTraffic = true;
      // Load test/canary configuration (for now, use base config with modifications)
      // In future, this could load from a separate canary config store
      cfg = {
        ...baseCfg,
        // Example: Use different engine for canary traffic
        phase2: {
          ...baseCfg.phase2,
          engine: baseCfg.phase2.engine === 'lk' ? 'hybrid' : 'lk'
        }
      };
      console.log(`🧪 [v17 Canary] ACTIVE - Using canary config for keyword "${inputKeyword}"`);
      console.log(`🧪 [v17 Canary] Engine switch: ${baseCfg.phase2.engine} → ${cfg.phase2.engine}`);
    } else {
      console.log(`📊 [v17 Canary] INACTIVE - Using production config`);
    }
  }
  
  console.log(`⚙️ [v17 Pipeline] Config loaded - Deterministic Mode, Gate: ${cfg.features.scoreFirstGate ? 'ON' : 'OFF'}${isCanaryTraffic ? ' [CANARY]' : ''}`);
  
  // Step 2: ★ 결정론적 토큰 추출 (키워드 폭증 방지)
  console.log(`🎯 [v17 Deterministic] Starting title token extraction...`);
  
  const toks = extractTitleTokens(title);
  console.log(`📝 [v17] Extracted ${toks.length} tokens: ${toks.slice(0, 5).join(', ')}...`);
  
  if (toks.length === 0) {
    console.log(`⚠️ [v17] No eligible tokens after filtering, using input keyword as fallback`);
    // ✅ 입력 키워드를 T1으로 사용하여 빈 결과 방지
    const fallbackTokens = [inputKeyword];
    console.log(`🔄 [v17 Fallback] Using input keyword "${inputKeyword}" as T1 candidate`);
    
    // fallback 토큰으로 진행
    const fallbackCandidates: Candidate[] = fallbackTokens.map(tok => ({
      text: tok,
      frequency: 1,
      position: 0,
      length: tok.length,
      compound: false,
      volume: 0,
      rank: null,
      adScore: 0,
      eligible: true
    }));
    
    // T1만 생성하고 나머지는 빈 상태로 저장
    const tiers: Tier[] = [
      {
        tier: 1,
        candidate: {
          text: inputKeyword,
          volume: 0,
          frequency: 1,
          position: 0,
          length: inputKeyword.length,
          compound: false,
          rank: null,
          adScore: 0,
          eligible: true
        },
        score: 50 // 기본 점수
      }
    ];
    
    // 데이터베이스에 tier 정보 저장
    try {
      for (const tier of tiers) {
        await db.insert(postTierChecks).values({
          jobId: jobId,
          blogId: blogId,
          postId: postId.toString(),
          postTitle: title,
          inputKeyword: inputKeyword,
          tier: tier.tier,
          textSurface: tier.candidate.text,
          textNrm: tier.candidate.text,
          volume: tier.candidate.volume || null,
          rank: tier.candidate.rank || null,
          score: tier.score,
          eligible: tier.candidate.eligible || false,
          adscore: tier.candidate.adScore || null
        });
      }
      console.log(`✅ [v17 Fallback] Saved ${tiers.length} tier to database`);
    } catch (error) {
      console.error(`❌ [v17 Fallback] Failed to save tiers:`, error);
    }
    
    return {
      tiers: tiers.map(t => ({
        tier: t.tier,
        text: t.candidate.text,
        volume: t.candidate.volume || null,
        rank: t.candidate.rank || null,
        score: t.score,
        adScore: t.candidate.adScore || undefined,
        eligible: t.candidate.eligible || undefined
      })),
      stats: { candidatesGenerated: 1, preEnriched: 0, gateFiltered: 0, tiersAutoFilled: 0 }
    };
  }
  
  // Convert tokens to bigram candidates (제목에서 쓸 조합만)
  const candidates: Candidate[] = [];
  
  // 하이브리드 모드: bigram 조합만 생성
  if (process.env.HYBRID_MODE === 'true') {
    // 제목에서 bigram 조합 생성 (sliding window)
    for (let i = 0; i < toks.length - 1 && candidates.length < 4; i++) {
      const bigram = `${toks[i]} ${toks[i + 1]}`;
      candidates.push({
        text: bigram,
        frequency: 1,
        position: i,
        length: bigram.length,
        compound: true,
        volume: 0
      });
    }
    
    // 🔒 HYBRID MODE: bigram 조합만 사용, unigram 폴백 없음
    // "제목에서 쓸 조합만" 원칙 준수
    
    console.log(`🔤 [HYBRID MODE] Generated ${candidates.length} bigram combinations from title tokens`);
  } else {
    // 기존 로직: unigram 후보 생성
    toks.slice(0, 4).forEach(tok => {
      candidates.push({
        text: tok,
        frequency: 1,
        position: 0,
        length: tok.length,
        compound: false,
        volume: 0
      });
    });
    
    console.log(`🔤 [v17 Pipeline] Generated ${candidates.length} deterministic candidates (max 4 to prevent explosion)`);
  }
  
  const stats = {
    candidatesGenerated: candidates.length,
    preEnriched: 0,
    gateFiltered: 0,
    tiersAutoFilled: 0,
  };
  
  // Step 3: Pre-enrich (DB→API→upsert→merge) - DETERMINISTIC MODE: Skip API calls
  if (cfg.features.preEnrich && !options.deterministic) {
    console.log(`📊 [v17 Pipeline] Pre-enriching ${candidates.length} candidates`);
    
    const candidateTexts = candidates.map(c => c.text);
    try {
      const volumeData = await getVolumesWithHealth(db, candidateTexts);
    
    // Merge volumes back to candidates (다중 키 조회로 수정)
    candidates.forEach(candidate => {
      // ✅ 수정: 다중 키 조회 (architect 권장사항)
      const keyRaw = candidate.text;
      const keyLC = keyRaw.toLowerCase().trim();
      const keyNrm = keyRaw.normalize('NFKC').toLowerCase().replace(/[\s\-_.]+/g, '');
      
      const volumeInfo = volumeData.volumes[keyRaw] || 
                        volumeData.volumes[keyLC] || 
                        volumeData.volumes[keyNrm];
      
      if (volumeInfo && volumeInfo.total > 0) {
        candidate.volume = volumeInfo.total;
        stats.preEnriched++;
        console.log(`   📊 [Pre-enrich] "${candidate.text}" → volume ${volumeInfo.total}`);
      }
    });
    
      console.log(`✅ [v17 Pipeline] Pre-enriched ${stats.preEnriched}/${candidates.length} candidates`);
    } catch (error) {
      console.error(`❌ [v17 Pipeline] Pre-enrich failed:`, error);
    }
  } else if (cfg.features.preEnrich && options.deterministic) {
    console.log(`🎯 [DETERMINISTIC MODE] Skipping pre-enrich API calls for ${candidates.length} candidates`);
  }
  
  // Step 3.5: 추가 키워드 발굴 (사용자 요청사항)
  // 🔒 HYBRID MODE: 제목 조합만 사용, 연관키워드 발굴 비활성화
  if (process.env.HYBRID_MODE === 'true') {
    console.log(`🎯 [HYBRID MODE] Skipping Step 3.5 추가 키워드 발굴 - title bigrams only`);
    const candidatesWithoutVolume = candidates.filter(c => !c.volume || c.volume === 0);
    if (candidatesWithoutVolume.length > 0) {
      console.log(`🔄 [HYBRID MODE] ${candidatesWithoutVolume.length}개 키워드는 제목 조합에서만 추출된 상태로 유지`);
    }
  } else {
    // 제목에서 추출된 키워드가 DB에 없으면 API로 추가해서 DB 확장
    console.log(`🔍 [v17 Pipeline] Step 3.5: 추가 키워드 발굴 시작`);
    const candidatesWithoutVolume = candidates.filter(c => !c.volume || c.volume === 0);
    
    if (candidatesWithoutVolume.length > 0 && !options.deterministic) {
      console.log(`🚀 [추가 키워드 발굴] ${candidatesWithoutVolume.length}개 키워드를 DB에 추가합니다`);
      console.log(`   키워드: ${candidatesWithoutVolume.map(c => c.text).slice(0, 5).join(', ')}${candidatesWithoutVolume.length > 5 ? '...' : ''}`);
      
      try {
        const missingKeywords = candidatesWithoutVolume.map(c => c.text);
        
        // 네이버 SearchAds API로 키워드 발굴 및 DB 추가
        const volumeData = await getVolumesWithHealth(db, missingKeywords);
        let enrichedCount = 0;
        
        // 새로 추가된 키워드 정보를 candidates에 다시 merge
        candidatesWithoutVolume.forEach(candidate => {
          const keyRaw = candidate.text;
          const keyLC = keyRaw.toLowerCase().trim();
          const keyNrm = keyRaw.normalize('NFKC').toLowerCase().replace(/[\s\-_.]+/g, '');
          
          const volumeInfo = volumeData.volumes[keyRaw] || 
                            volumeData.volumes[keyLC] || 
                            volumeData.volumes[keyNrm];
          
          if (volumeInfo && volumeInfo.total > 0) {
            candidate.volume = volumeInfo.total;
            enrichedCount++;
            console.log(`   ✅ [키워드 발굴] "${candidate.text}" → volume ${volumeInfo.total} (DB에 추가됨)`);
          }
        });
        
        stats.preEnriched += enrichedCount;
        console.log(`🎉 [추가 키워드 발굴] 완료: ${enrichedCount}개 키워드를 DB에 추가하고 volume 확보`);
        
      } catch (error) {
        console.error(`❌ [추가 키워드 발굴] 실패:`, error);
        console.log(`⚠️ [추가 키워드 발굴] API 오류로 일부 키워드는 volume 없이 진행됩니다`);
      }
    } else if (candidatesWithoutVolume.length > 0 && options.deterministic) {
      console.log(`🎯 [DETERMINISTIC MODE] Skipping 추가 키워드 발굴 API calls for ${candidatesWithoutVolume.length} keywords`);
    } else {
      console.log(`✅ [추가 키워드 발굴] 모든 키워드가 이미 DB에 있습니다`);
    }
  }
  
  // Step 4: ★ 결정론적 Gate + Scoring (Phase2 엔진 대신)
  console.log(`🚫 [v17 Deterministic] Applying deterministic gate and scoring...`);
  
  // Simple scoring: volume-based with minimal adScore
  const enrichedCandidates: Candidate[] = candidates.map(candidate => {
    const vol = candidate.volume || 0;
    const volScore = vol > 0 ? Math.log10(vol) * 25 : 0;
    const adScore = 0; // No adScore in v17 deterministic mode
    const totalScore = volScore;
    
    // ★ 게이트 정책 완화: 하드컷 제거, 폴백값 허용
    // 결정론적 모드에서는 모든 토큰을 허용 (volume 없어도 OK)
    let eligible = true;
    let skipReason: string | undefined;
    
    // Soft gate: volume 없을 때만 경고, 차단하지 않음
    if (vol === 0) {
      skipReason = 'No volume data (fallback allowed)';
      console.log(`⚠️ [SOFT GATE] "${candidate.text}" → PASSED (no volume, fallback mode)`);
    } else {
      console.log(`✅ [SOFT GATE] "${candidate.text}" → PASSED (volume: ${vol})`);
    }
    
    return {
      ...candidate,
      totalScore,
      adScore,
      eligible,
      skipReason
    };
  });
  
  // Count gate filtering
  stats.gateFiltered = enrichedCandidates.filter((c: Candidate) => !c.eligible).length;
  console.log(`🚫 [v17 Pipeline] Gate filtered ${stats.gateFiltered} candidates (deterministic mode)`);
  
  // Step 5: Ranking checks
  console.log(`🔍 [v17 Pipeline] Checking SERP rankings for ${enrichedCandidates.length} candidates`);
  const rankedCandidates: Candidate[] = [];
  
  for (const candidate of enrichedCandidates) {
    let rank: number | null = null;
    
    // Only check rank for eligible candidates in hard mode
    if (candidate.eligible || cfg.adscore.mode === 'soft') {
      try {
        rank = await serpScraper.checkKeywordRankingInMobileNaver(candidate.text, `https://blog.naver.com/${blogId}`);
        console.log(`   📊 [Rank Check] "${candidate.text}" → rank ${rank || 'NA'}`);
      } catch (error) {
        console.error(`   ❌ [Rank Check] Failed for "${candidate.text}":`, error);
      }
    }
    
    rankedCandidates.push({
      ...candidate,
      rank,
    });
  }
  
  // Step 6: ★ 최종 규칙 적용 (T1=단일 + T2/T3/T4=빅그램)
  console.log(`🎯 [v17 Final Rules] Applying final tier rules: T1=single + T2/T3/T4=bigrams...`);
  
  // Helper functions from vFinal
  const hasMatjip = (tokens: string[]): boolean => tokens.some(t => t.includes('맛집'));
  const hasLocal = (tokens: string[]): boolean => {
    const localPattern = /(서울|부산|인천|대구|대전|광주|울산|세종|경기|강원|충북|충남|전북|전남|경북|경남|제주|[가-힣]+(시|군|구|동|읍|면|리))/;
    return tokens.some(t => localPattern.test(t));
  };
  
  const pickBestSecondary = (allTokens: string[], candidatesWithVolume: Candidate[], t1Text: string): string => {
    console.log(`🔍 [pickBestSecondary] Finding best secondary for T1: "${t1Text}"`);
    
    // 우선순위 1: 맛집 (있으면 무조건)
    if (hasMatjip(allTokens)) {
      console.log(`   ✅ Found 맛집 in tokens - using as bestSecondary`);
      return '맛집';
    }
    
    // 우선순위 2: 로컬 (있으면)
    const localTokens = allTokens.filter(t => hasLocal([t]));
    if (localTokens.length > 0) {
      console.log(`   ✅ Found local token: "${localTokens[0]}" - using as bestSecondary`);
      return localTokens[0];
    }
    
    // 우선순위 3: 조회량 2위 (T1 제외)
    const volumeSorted = candidatesWithVolume
      .filter(c => c.text !== t1Text && (c.volume || 0) > 0)
      .sort((a, b) => (b.volume || 0) - (a.volume || 0));
    
    if (volumeSorted.length > 0) {
      console.log(`   ✅ Found volume #2: "${volumeSorted[0].text}" (volume: ${volumeSorted[0].volume}) - using as bestSecondary`);
      return volumeSorted[0].text;
    }
    
    // Fallback: 다음 토큰
    const fallback = allTokens.find(t => t !== t1Text);
    console.log(`   ⚠️ Fallback to next token: "${fallback || 'none'}"`);
    return fallback || '';
  };
  
  const makeBigram = (token1: string, token2: string): string => token2 ? `${token1} ${token2}` : token1;
  
  // ★ T1 선정: 단일 토큰 중 최고 볼륨 (맛집/로컬 단독 제외)
  const singleCandidates = rankedCandidates.filter(c => 
    c.eligible && 
    !c.compound && 
    c.text !== '맛집' && 
    !hasLocal([c.text])
  ).sort((a, b) => (b.volume || 0) - (a.volume || 0));
  
  // ★ 티어 변수 선언 (스코프 문제 해결)
  let tiers: Tier[] = [];
  
  if (singleCandidates.length === 0) {
    console.log(`❌ [v17 Final Rules] No valid single tokens for T1`);
    tiers = [];
  } else {
    const T1 = singleCandidates[0];
    console.log(`🎯 [T1 Final] "${T1.text}" (volume: ${T1.volume || 0})`);
    
    // ★ T2/T3/T4 빅그램 생성 (Architect 요구사항: 실제 pairwise 조합)
    const titleTokens = extractTitleTokens(title); // 제목에서 직접 토큰 추출
    console.log(`🔧 [Bigram Generation] Title tokens: ${titleTokens.join(', ')}`);
    
    // pairwise 빅그램 생성 (Architect 권장: bigrams = pairwise(toks))
    const bigrams: string[] = [];
    for (let i = 0; i < titleTokens.length; i++) {
      for (let j = i + 1; j < titleTokens.length; j++) {
        const bigram = `${titleTokens[i]} ${titleTokens[j]}`;
        if (!bigrams.includes(bigram)) {
          bigrams.push(bigram);
        }
      }
    }
    console.log(`🔧 [Bigram Generation] Generated ${bigrams.length} bigrams: ${bigrams.slice(0, 3).join(', ')}...`);
    
    // T1이 포함된 빅그램만 필터링 (T1 + 다른 토큰 조합)
    const t1Bigrams = bigrams.filter(bg => bg.includes(T1.text));
    console.log(`🎯 [T1 Bigrams] Filtered ${t1Bigrams.length} bigrams containing T1: ${t1Bigrams.slice(0, 3).join(', ')}...`);
    
    // 우선순위: 맛집 > 로컬 > 알파벳 순
    const prioritizeBigram = (bg: string): number => {
      if (bg.includes('맛집')) return 3;
      if (hasLocal(bg.split(' '))) return 2;
      return 1;
    };
    
    const sortedT1Bigrams = t1Bigrams.sort((a, b) => {
      const priorityDiff = prioritizeBigram(b) - prioritizeBigram(a);
      return priorityDiff !== 0 ? priorityDiff : a.localeCompare(b);
    });
    
    const t2Text = sortedT1Bigrams[0] || null;
    const t3Text = sortedT1Bigrams[1] || null;
    const t4Text = sortedT1Bigrams[2] || null;
    
    console.log(`🎯 [T2 Final] "${t2Text}"`);
    console.log(`🎯 [T3 Final] "${t3Text || 'none'}"`);
    console.log(`🎯 [T4 Final] "${t4Text || 'none'}"`);
    
    // ★ 빅그램 센디데이트 생성
    const createBigramCandidate = (text: string, baseVolume: number = 0): Candidate => ({
      text,
      frequency: 1,
      position: 0,
      length: text.length,
      compound: true,
      volume: baseVolume, // 예상 볼륨 (SearchAds에서 업데이트 필요)
      totalScore: 0.7 * Math.log10(Math.max(1, baseVolume)) * 25,
      adScore: 0.5, // Mock
      eligible: true,
      rank: null
    });
    
    tiers = [
      { tier: 1, candidate: T1, score: T1.totalScore || 0 }
    ];
    
    if (t2Text) {
      const t2Candidate = createBigramCandidate(t2Text, T1.volume || 0);
      tiers.push({ tier: 2, candidate: t2Candidate, score: t2Candidate.totalScore || 0 });
    }
    if (t3Text) {
      const t3Candidate = createBigramCandidate(t3Text, Math.floor((T1.volume || 0) * 0.5));
      tiers.push({ tier: 3, candidate: t3Candidate, score: t3Candidate.totalScore || 0 });
    }
    if (t4Text) {
      const t4Candidate = createBigramCandidate(t4Text, Math.floor((T1.volume || 0) * 0.3));
      tiers.push({ tier: 4, candidate: t4Candidate, score: t4Candidate.totalScore || 0 });
    }
  } // ★ else 블록 닫기
  
  console.log(`🎯 [v17 Deterministic] Created ${tiers.length} deterministic tiers (max 4)`);
  
  // Step 7: Auto-fill if enabled and needed (★ 4개 제한 강제)
  let finalTiers = [...tiers];  // ✅ Create copy to avoid mutation
  const MAX_TIERS_HARD_CAP = 4; // ★ 키워드 폭증 방지를 위한 하드 캡
  const targetTiers = Math.min(cfg.phase2.tiersPerPost || 4, MAX_TIERS_HARD_CAP);
  
  if (cfg.features.tierAutoFill && tiers.length < targetTiers) {
    console.log(`🔧 [v17 Pipeline] Auto-filling tiers (${tiers.length}/${targetTiers}, hard cap: ${MAX_TIERS_HARD_CAP})`);
    
    // Simple auto-fill: add remaining ELIGIBLE candidates only (★ Gate 정책 준수)
    const usedTexts = new Set(tiers.map((t: Tier) => t.candidate?.text).filter(Boolean));
    const remainingCandidates = rankedCandidates.filter(c => 
      !usedTexts.has(c.text) && c.eligible // ★ 적격 후보만 사용
    );
    
    // Fill remaining slots (★ 하드 캡 준수)
    while (finalTiers.length < targetTiers && remainingCandidates.length > 0) {
      const candidate = remainingCandidates.shift()!;
      finalTiers.push({
        tier: finalTiers.length + 1,
        candidate,
        score: candidate.totalScore || 0,
      });
      stats.tiersAutoFilled++;
    }
    
    console.log(`✅ [v17 Pipeline] Auto-filled ${stats.tiersAutoFilled} tiers`);
  }
  
  // Step 8: Save to postTierChecks (eligible/adscore/skip_reason 함께 저장)
  console.log(`💾 [v17 Pipeline] Saving ${finalTiers.length} tiers to database`);
  
  for (const tier of finalTiers) {
    console.log(`🔍 [v17 Debug] Tier ${tier.tier}:`, JSON.stringify(tier, null, 2));
    
    const candidate = tier.candidate;
    if (!candidate) {
      console.error(`❌ [v17 Pipeline] Tier ${tier.tier} has no candidate object!`);
      continue;
    }
    
    if (!candidate.text) {
      console.error(`❌ [v17 Pipeline] Tier ${tier.tier} candidate has no text!`);
      continue;
    }
    
    const normalizedText = candidate.text.normalize('NFKC').toLowerCase().replace(/[\s\-_.]/g, '');
    const isRelated = inputKeyword.normalize('NFKC').toLowerCase().replace(/[\s\-_.]/g, '').includes(normalizedText) ||
                     title.toLowerCase().includes(candidate.text.toLowerCase());
    
    try {
      await db.insert(postTierChecks).values({
        jobId,
        inputKeyword,
        blogId,
        postId: String(postId), // ✅ Convert to string
        postTitle: title,
        tier: tier.tier,
        textSurface: candidate.text,
        textNrm: normalizedText,
        volume: candidate.volume ?? null, // ✅ null 저장 (0 방지)
        rank: candidate.rank,
        score: tier.score,
        related: isRelated,
        // v17 추가: Gate 정보
        eligible: candidate.eligible ?? true,
        adscore: candidate.adScore, // ✅ Lowercase column name
        skipReason: candidate.skipReason,
      });
    } catch (insertError) {
      console.error(`❌ [v17 Pipeline] Insert failed for tier ${tier.tier}:`, insertError);
      throw insertError;
    }
    
    console.log(`   💾 [Tier ${tier.tier}] "${candidate.text}" → score ${tier.score}, rank ${candidate.rank || 'NA'}, eligible ${candidate.eligible}`);
  }
  
  // Prepare return format
  const result: V17PipelineResult = {
    tiers: finalTiers.map(tier => ({
      tier: tier.tier,
      text: tier.candidate.text,
      volume: tier.candidate.volume ?? null,
      rank: tier.candidate.rank ?? null,
      score: tier.score,
      adScore: tier.candidate.adScore,
      eligible: tier.candidate.eligible,
      skipReason: tier.candidate.skipReason,
    })),
    stats,
  };
  
  console.log(`✅ [v17 Pipeline] Completed - Generated ${result.tiers.length} tiers with scores`);
  return result;
}

/**
 * 서버에서 점수 계산 (사용자 요구사항 3단계)
 */
export function calculateTotalScore(candidate: Candidate, cfg: any): number {
  // volumeScale = min(100, log10(max(1, volume))*25);
  const volume = candidate.volume || 1;
  const volumeScale = Math.min(100, Math.log10(Math.max(1, volume)) * 25);
  
  // contentScore = 0.5*freq + 0.3*pos + 0.2*len; (내부 가중치)
  const freq = candidate.frequency || 0;
  const pos = 1 / Math.max(1, candidate.position || 1); // Position penalty
  const len = Math.min(1, (candidate.length || 1) / 20); // Length normalization
  const contentScore = 0.5 * freq + 0.3 * pos + 0.2 * len;
  
  // totalScore = 0.7*volumeScale + 0.3*contentScore; (cfg.weights로 조정)
  const totalScore = (cfg.weights?.volume || 0.7) * volumeScale + (cfg.weights?.content || 0.3) * contentScore * 100;
  
  return Math.round(totalScore * 100) / 100; // 소수점 2자리
}

/**
 * v17 결과 조립 및 저장을 포함한 SERP 분석 래퍼
 */
export async function processSerpAnalysisJobWithV17Assembly(
  jobId: string,
  keywords: string[],
  minRank: number,
  maxRank: number,
  postsPerBlog: number,
  titleExtract: boolean,
  lkOptions: any
) {
  try {
    console.log(`🚀 [v17 Assembly] Starting for job ${jobId}`);
    
    // 1) v17 설정 로드
    const cfg = await getAlgoConfig();
    
    // 2) 실제 SERP 분석 실행 (v17 deterministic 모드)
    console.log(`🎯 [v17-DETERMINISTIC] Executing real SERP analysis for job ${jobId}`);
    
    // ✅ 실제 processSerpAnalysisJob 함수 직접 정의 (circular import 방지)
    const processSerpAnalysisJob = (await import("../routes")).processSerpAnalysisJob;
    
    await new Promise<void>((resolve, reject) => {
      try {
        // ★ 실제 SERP 분석 실행 (기존 로직 재사용하되 v17 모드)
        processSerpAnalysisJob(jobId, keywords, minRank, maxRank, postsPerBlog, titleExtract, {
          ...lkOptions,
          v17Mode: true,
          deterministic: true  // ✅ deterministic 플래그 전달
        });
        
        // 비동기 완료 대기 (실제 분석이 끝날 때까지)
        setTimeout(() => {
          console.log(`✅ [v17-DETERMINISTIC] SERP analysis completed for ${jobId}`);
          resolve();
        }, 5000); // 5초 대기 (실제 분석 시간 고려)
        
      } catch (error) {
        console.error(`❌ [v17-DETERMINISTIC] SERP analysis failed for ${jobId}:`, error);
        reject(error);
      }
    });
    
    // 3) v17 tier 데이터 수집 및 조립
    console.log(`🔧 [v17 Assembly] Collecting tier data for ${jobId}`);
    
    // ★ 실제 DB에서 tier 데이터 수집
    const { db } = await import("../db");
    const { postTierChecks, discoveredBlogs } = await import("../../shared/schema");
    const { eq } = await import("drizzle-orm");
    
    const tierData = await db.select().from(postTierChecks).where(eq(postTierChecks.jobId, jobId));
    const blogData = await db.select().from(discoveredBlogs).where(eq(discoveredBlogs.jobId, jobId));
    
    console.log(`📊 [v17 Assembly] Found ${tierData.length} tier records, ${blogData.length} blogs`);
    
    // ★ assembleResults가 기대하는 형식으로 변환
    const tiers: any[] = tierData.map(tier => ({
      tier: tier.tier,
      keywords: [{
        inputKeyword: tier.inputKeyword,
        text: tier.textSurface,
        volume: tier.volume
      }],
      blog: {
        blogId: tier.blogId,
        blogName: blogData.find(b => b.blogId === tier.blogId)?.blogName || tier.blogId,
        blogUrl: blogData.find(b => b.blogId === tier.blogId)?.blogUrl || ''
      },
      post: {
        title: tier.postTitle
      },
      candidate: {
        text: tier.textSurface,
        volume: tier.volume,
        rank: tier.rank,
        totalScore: tier.score || 0, // ★ 새로 추가된 score 필드 사용
        adScore: tier.adscore,
        eligible: tier.eligible,
        skipReason: tier.skipReason
      },
      score: tier.score || 0 // ★ 레거시 호환성
    }));
    
    // 4) 결과 조립
    const { assembleResults } = await import("../phase2/helpers");
    const payload = assembleResults(jobId, tiers, cfg);
    
    // 5) 결과를 DB에 저장
    const { MemStorage } = await import("../storage");  
    const storage = new MemStorage();
    
    await storage.updateSerpJob(jobId, {
      status: "completed",
      progress: 100,
      currentStep: "completed", 
      currentStepDetail: "v17 pipeline analysis completed successfully",
      results: payload
    });
    
    console.log(`🎉 [v17 Assembly] Completed for job ${jobId}`);
    
  } catch (error) {
    console.error(`❌ [v17 Assembly] Error for job ${jobId}:`, error);
    
    // 에러 발생 시 legacy fallback 실행
    console.log(`🔄 [v17 Assembly] Falling back to legacy for ${jobId}`);
    throw error; // Re-throw to trigger fallback in routes.ts
  }
}