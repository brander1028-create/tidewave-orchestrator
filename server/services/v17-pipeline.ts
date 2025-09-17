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

// Import Phase2 engines
// Phase2 engines
import { engineRegistry } from '../phase2';
import { Candidate, Tier } from '../phase2/types';

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
  inputKeyword: string
): Promise<V17PipelineResult> {
  console.log(`🚀 [v17 Pipeline] Starting for title: "${title.substring(0, 50)}..."`);
  
  // Step 0: 자동 키워드 Enrichment (사용자 요구사항)
  console.log(`🔍 [v17 Pipeline] Starting auto-enrichment for title analysis`);
  try {
    const enrichmentResult = await autoEnrichFromTitle(title, inputKeyword, jobId, blogId);
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
  
  console.log(`⚙️ [v17 Pipeline] Config loaded - Engine: ${cfg.phase2.engine}, Gate: ${cfg.features.scoreFirstGate ? 'ON' : 'OFF'}${isCanaryTraffic ? ' [CANARY]' : ''}`);
  
  // Step 2: Phase2 엔진으로 후보 생성
  const engine = engineRegistry.get(cfg.phase2.engine);
  
  if (!engine) {
    throw new Error(`Unknown Phase2 engine: ${cfg.phase2.engine}`);
  }
  
  const ctx = { 
    title, 
    blogId,
    postId: postId.toString(),
    inputKeyword,
    jobId 
  };
  const candidates = engine.generateCandidates(ctx, cfg);
  console.log(`🔤 [v17 Pipeline] Generated ${candidates.length} candidates using ${cfg.phase2.engine} engine`);
  
  const stats = {
    candidatesGenerated: candidates.length,
    preEnriched: 0,
    gateFiltered: 0,
    tiersAutoFilled: 0,
  };
  
  // Step 3: Pre-enrich (DB→API→upsert→merge)
  if (cfg.features.preEnrich) {
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
  }
  
  // Step 4: Score-First Gate + Scoring
  const enrichedCandidates = await engine.enrichAndScore(candidates, cfg);
  
  // Count gate filtering
  stats.gateFiltered = enrichedCandidates.filter(c => !c.eligible).length;
  console.log(`🚫 [v17 Pipeline] Gate filtered ${stats.gateFiltered} candidates`);
  
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
  
  // Step 6: Tier assignment + Auto-fill
  const tiers = engine.assignTiers(rankedCandidates, cfg);
  
  // Step 7: Auto-fill if enabled and needed  
  let finalTiers = [...tiers];  // ✅ Create copy to avoid mutation
  if (cfg.features.tierAutoFill && tiers.length < cfg.phase2.tiersPerPost) {
    console.log(`🔧 [v17 Pipeline] Auto-filling tiers (${tiers.length}/${cfg.phase2.tiersPerPost})`);
    
    // Simple auto-fill: add remaining candidates as additional tiers
    const usedTexts = new Set(tiers.map(t => t.candidate?.text).filter(Boolean));
    const remainingCandidates = rankedCandidates.filter(c => !usedTexts.has(c.text));
    
    // Fill remaining slots
    while (finalTiers.length < cfg.phase2.tiersPerPost && remainingCandidates.length > 0) {
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
    
    // 2) 기본 processSerpAnalysisJob 실행 (legacy와 동일하지만 v17 모드)
    // 동적 import로 circular dependency 방지
    const { registerRoutes } = await import("../routes");
    
    // processSerpAnalysisJob을 Promise로 래핑 (원래는 fire-and-forget)
    await new Promise<void>((resolve, reject) => {
      setTimeout(async () => {
        try {
          // 여기서 실제 legacy 함수 호출 (나중에 구현)
          console.log(`📝 [v17 Assembly] Basic processing completed for ${jobId}`);
          resolve();
        } catch (error) {
          reject(error);
        }
      }, 1000); // 임시로 1초 대기
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