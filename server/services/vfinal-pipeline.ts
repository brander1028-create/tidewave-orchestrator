/**
 * vFinal Pipeline: 제목 프리엔리치 + 빅그램 조합 + Gate 이후 적용
 * 올바른 순서: 프리엔리치 → 선정 → 빅그램 확장 → 재프리엔리치 → 재선정 → Gate → 저장
 */
import { getAlgoConfig } from './algo-config';
import { getVolumesWithHealth } from './externals-health';
import { serpScraper } from './serp-scraper';
import { db } from '../db';
import { postTierChecks, managedKeywords, serpJobs } from '../../shared/schema';
import { nrm, expandBigrams } from '../utils/normalization';
import { nrm as policyNrm, isBigram, isBannedSingle } from '../title/policy';
import { inArray, eq } from 'drizzle-orm';

// Import Phase2 engines (재사용)
import { engineRegistry } from '../phase2';
import { Candidate, Tier } from '../phase2/types';

export interface VFinalPipelineResult {
  tiers: Array<{
    tier: number;
    text: string;
    volume: number | null;
    rank: number | null;
    score: number;
    adScore: number;
    eligible: boolean;
    skipReason: string | null;
  }>;
  stats: {
    candidatesGenerated: number;
    preEnriched: number;
    firstSelected: number;
    bigramsExpanded: number;
    reEnriched: number;
    reSelected: number;
    gateFiltered: number;
    eligibleAfterGate: number;
    tiersAssigned: number;
  };
}

/**
 * pickTopK - 첫 번째 선정 로직
 */
function pickTopK(candidates: Candidate[], k: number = 4): Candidate[] {
  return candidates
    .filter(c => c.volume && c.volume > 0)
    .sort((a, b) => (b.totalScore || b.volume || 0) - (a.totalScore || a.volume || 0))
    .slice(0, k);
}

/**
 * pickMaxVolumeToken - 최대 볼륨 토큰 선택
 */
function pickMaxVolumeToken(candidates: Candidate[]): string | null {
  if (!candidates.length) return null;
  
  const maxVolumeCandidate = candidates
    .filter(c => c.volume && c.volume > 0)
    .sort((a, b) => (b.volume || 0) - (a.volume || 0))[0];
    
  return maxVolumeCandidate?.text || null;
}

/**
 * pickLongest - 가장 긴 토큰 선택 (fallback)
 */
function pickLongest(tokens: string[]): string | null {
  if (!tokens.length) return null;
  return tokens.sort((a, b) => b.length - a.length)[0];
}

// 조합 폭발 제어 상수
const MAX_CANDS_PER_TITLE = 30;   // 추출 전체 상한
const MAX_BIGRAMS_PER_BASE = 12;  // base 조합 상한

/**
 * extractTitleTokens - 제목에서 토큰 추출 (첨부 파일 개선안 적용)
 * 조사 제거, banSingles 제외, 로컬/맛집 단독 금지, 제목 토큰 상한 적용
 */
function extractTitleTokens(title: string, cfg: any): string[] {
  const maxTitleTokens = cfg.phase2?.maxTitleTokens || 6;
  const banSingles = new Set(cfg.phase2?.banSingles || ["맛집","정리","방법","추천","후기","여자","바르","및","과","와","의","이제","중인데","때인가"]);
  
  // 조사 패턴
  const tails = /(은|는|이|가|을|를|에|에서|으로|로|과|와|의|및|도|만|까지|부터)$/;
  
  // 로컬 지역 패턴
  const isLocal = (w: string) => /(서울|부산|인천|대구|대전|광주|울산|세종|경기|강원|충북|충남|전북|전남|경북|경남|제주)(특별시|광역시|도)?$/.test(w) || /[가-힣]+(시|군|구|동|읍|면|리)$/.test(w);
  
  return title.replace(/[^가-힣a-zA-Z0-9\s]/g, ' ')  // 한글/영문/숫자/공백만 유지
    .split(/\s+/)
    .map(w => w.replace(tails, ''))  // 조사 제거
    .filter(w => 
      w.length >= 2 && 
      !banSingles.has(w) && 
      !/^\d+$/.test(w) &&     // 순수 숫자 제외
      !isLocal(w)              // 로컬 지역 제외
    )
    .slice(0, maxTitleTokens); // 상한 적용
}

/**
 * applyPostEnrichGate - vFinal Gate (프리엔리치 이후 적용)
 */
async function applyPostEnrichGate(candidates: Candidate[], cfg: any): Promise<Candidate[]> {
  const gatedCandidates: Candidate[] = [];
  
  // DB에서 키워드 정보 직접 조회 (상업성 체크용)
  const keywordTexts = candidates.map(c => c.text);
  const existingKeywords = await db.select({
    text: managedKeywords.text,
    source: managedKeywords.source,
    ad_eligible: managedKeywords.ad_eligible,  // ★ 규칙3: ad_eligible 필드 추가
    volume: managedKeywords.volume
  })
    .from(managedKeywords)
    .where(inArray(managedKeywords.text, keywordTexts));
  
  const dbMap = new Map(existingKeywords.map(kw => [kw.text, kw]));
  
  // 3) Gate 정책(제목 단계는 soft) + 연결어 컷
  const BAN_SINGLES = new Set(["정리","방법","추천","후기","테스트","여자","바르","및","과","와","의","이제","중인데","때인가"]);
  
  for (const candidate of candidates) {
    let eligible = true;
    let skipReason: string | undefined;
    let adScore = 0;
    
    try {
      // 연결어/조사류는 하드컷
      if (BAN_SINGLES.has(candidate.text) || /^\d+$/.test(candidate.text)) {
        eligible = false;
        skipReason = "ban";
      } else {
        // ★ 규칙3: Gate 하드 필터링 (source='api_ok' && ad_eligible=true)
        const dbInfo = dbMap.get(candidate.text);
        const hasCommerce = dbInfo?.source === 'api_ok' && dbInfo?.ad_eligible === true;
        
        if (!hasCommerce) {
          eligible = false;
          skipReason = "no_commerce";
          console.log(`🚫 [Gate] "${candidate.text}" filtered: source=${dbInfo?.source}, ad_eligible=${dbInfo?.ad_eligible}`);
        } else {
          // AdScore 계산용 volume 설정 (Step 8.5에서 더 정확한 필터링 예정)
          const volume = candidate.volume || 0;
          const { calculateAdScore } = await import('./adscore-engine');
          
          const metrics = {
            volume,
            competition: 0.5, // Mock fallback
            adDepth: 2,
            cpc: 100
          };
          
          const weights = {
            volume: cfg.adscore?.wVolume || 0.4,
            competition: cfg.adscore?.wCompetition || 0.3,
            adDepth: cfg.adscore?.wAdDepth || 0.2,
            cpc: cfg.adscore?.wCpc || 0.1
          };
          
          const adScoreResult = calculateAdScore(metrics, weights);
          adScore = adScoreResult.adScore;
          
          // ★ AdScore 하드컷 제거 (Step 8.5에서 DB-backed 필터링으로 대체)
          console.log(`✅ [Gate] "${candidate.text}" passed: hasCommerce=true, AdScore=${Math.round(adScore*100)/100}`);
        }
      }
    } catch (error) {
      console.error(`❌ [vFinal Gate] Error evaluating "${candidate.text}":`, error);
      // Fallback: allow candidate through
      eligible = true;
      skipReason = "Gate evaluation failed";
    }
    
    gatedCandidates.push({
      ...candidate,
      eligible,
      adScore,
      skipReason
    });
  }
  
  return gatedCandidates;
}

/**
 * calculateTotalScore - vFinal 7:3 점수 시스템 (volume 70% + ads 30%)
 */
function calculateTotalScore(candidate: Candidate, cfg: any): number {
  // volumeScale = min(100, log10(max(1, volume))*25)
  const volume = candidate.volume || 1;
  const volumeScale = Math.min(100, Math.log10(Math.max(1, volume)) * 25);
  
  // adScore (0~100 범위로 정규화)
  const adScore = (candidate.adScore || 0) * 100;
  
  // vFinal 7:3 가중치: volume 70% + ads 30%
  const volumeWeight = 0.7;
  const adWeight = 0.3;
  
  const totalScore = volumeWeight * volumeScale + adWeight * adScore;
  return Math.round(totalScore * 100) / 100;
}

/**
 * ensureSerpJobExists - Create serp_jobs entry if it doesn't exist to prevent FK violations
 */
async function ensureSerpJobExists(jobId: string, inputKeyword: string): Promise<void> {
  try {
    // Check if job exists
    const existingJob = await db.select({ id: serpJobs.id })
      .from(serpJobs)
      .where(eq(serpJobs.id, jobId))
      .limit(1);
    
    if (existingJob.length === 0) {
      console.log(`📝 [vFinal] Creating missing serp_jobs entry for jobId: ${jobId}`);
      
      // Create minimal serp_jobs entry
      await db.insert(serpJobs).values({
        id: jobId,
        keywords: [inputKeyword],
        status: 'completed',
        progress: 100,
        currentStep: 'vfinal_processing',
        currentStepDetail: 'vFinal 파이프라인에서 생성됨',
        totalSteps: 1,
        completedSteps: 1,
        results: { testMode: true, vfinalCreated: true }
      });
      
      console.log(`✅ [vFinal] Created serp_jobs entry for jobId: ${jobId}`);
    }
  } catch (error) {
    console.error(`❌ [vFinal] Failed to ensure serp_jobs entry for ${jobId}:`, error);
    throw error;
  }
}

/**
 * filterValidTiers - Filter out empty or invalid tier candidates
 */
function filterValidTiers(tiers: any[]): any[] {
  return tiers.filter(tier => {
    const candidate = tier.candidate;
    // Filter out candidates with empty text, null text, or whitespace-only text
    const hasValidText = candidate && 
                        candidate.text && 
                        typeof candidate.text === 'string' && 
                        candidate.text.trim().length > 0;
    
    if (!hasValidText) {
      console.log(`🚫 [vFinal] Filtering out invalid tier ${tier.tier}: empty or invalid text`);
      return false;
    }
    
    return true;
  });
}

/**
 * vFinal 완전 파이프라인
 */
export async function processPostTitleVFinal(
  title: string,
  jobId: string,
  blogId: string,
  postId: number,
  inputKeyword: string
): Promise<VFinalPipelineResult> {
  console.log(`🚀 [vFinal Pipeline] Starting for title: "${title.substring(0, 50)}..."`);
  
  const cfg = await getAlgoConfig();
  const K = cfg.phase2?.tiersPerPost || 4;
  
  const stats = {
    candidatesGenerated: 0,
    preEnriched: 0,
    firstSelected: 0,
    bigramsExpanded: 0,
    reEnriched: 0,
    reSelected: 0,
    gateFiltered: 0,
    eligibleAfterGate: 0,
    tiersAssigned: 0,
  };
  
  // Step 1: 제목→토큰 추출 (첨부 파일 개선안: 제목 토큰만, 상한 적용)
  const toks = extractTitleTokens(title, cfg);
  console.log(`📝 [vFinal] Extracted ${toks.length} tokens: ${toks.slice(0, 5).join(', ')}...`);
  
  // Step 2: ★ 결정론적 티어 구성 (첨부 파일 개선안)
  console.log(`🎯 [Deterministic Tiers] Starting tier assignment from title tokens only...`);
  
  if (toks.length === 0) {
    console.log(`⚠️ [vFinal] No eligible tokens after filtering`);
    return {
      tiers: [],
      stats: { ...stats, candidatesGenerated: 0, firstSelected: 0, eligibleAfterGate: 0 }
    };
  }
  
  // Helper: Convert token to candidate
  const toCandidateFromToken = (token: string): Candidate => ({
    text: token,
    frequency: 1,
    position: 0,
    length: token.length,
    compound: false,
    volume: 0
  });
  
  const toCandidateFromBigram = (text: string): Candidate => ({
    text: text,
    frequency: 1,
    position: 0,
    length: text.length,
    compound: true,
    volume: 0
  });
  
  // Step 2.1: 단일 토큰을 Candidate로 변환
  const singles: Candidate[] = toks.map(tok => toCandidateFromToken(tok));
  stats.candidatesGenerated = singles.length;
  console.log(`🏭 [vFinal] Generated ${stats.candidatesGenerated} single-token candidates`);
  
  // Step 2.2: 단일 토큰 Pre-enrich
  console.log(`📊 [vFinal] Pre-enriching single tokens...`);
  
  const singleTexts = singles.map(c => c.text);
  const singleVolumeData = await getVolumesWithHealth(db, singleTexts);
  
  singles.forEach(candidate => {
    const normKey = nrm(candidate.text);
    const volumeInfo = singleVolumeData.volumes[normKey];
    
    if (volumeInfo && volumeInfo.total > 0) {
      candidate.volume = volumeInfo.total;
      stats.preEnriched++;
      console.log(`   📊 [Single Pre-enrich] "${candidate.text}" → volume ${volumeInfo.total}`);
    }
  });
  
  console.log(`✅ [vFinal] Pre-enriched ${stats.preEnriched}/${stats.candidatesGenerated} single tokens`);
  
  // Step 3: T1 선정 (최고 볼륨 우선, 동점시 길이)
  const sortedSingles = singles.sort((a, b) => {
    const volA = a.volume || 0;
    const volB = b.volume || 0;
    if (volB !== volA) return volB - volA;  // 볼륨 높은순
    return b.length - a.length;  // 길이 긴순
  });
  
  const T1 = sortedSingles[0];
  const second = sortedSingles[1] || null;
  stats.firstSelected = 1;
  
  console.log(`🎯 [T1 Selection] "${T1.text}" (volume: ${T1.volume || 0})`);
  
  // Step 4: T2, T3, T4 구성 (결정론적 bigram 시퀀스)
  const base = T1.text;
  const bigramSeq: Candidate[] = [];
  
  // T2: T1 + second (고정)
  if (second) {
    const t2Text = `${base} ${second.text}`;
    bigramSeq.push(toCandidateFromBigram(t2Text));
    console.log(`🎯 [T2 Fixed] "${t2Text}" (T1 + second highest)`);
  }
  
  // T3, T4: T1 + 나머지 조합 (상위 4개까지)
  const others = sortedSingles.slice(2, 6);
  for (const tok of others) {
    const bigramText = `${base} ${tok.text}`;
    bigramSeq.push(toCandidateFromBigram(bigramText));
  }
  
  console.log(`🏭 [Bigram Generation] Generated ${bigramSeq.length} deterministic bigrams`);
  
  // Step 5: Bigram Pre-enrich
  if (bigramSeq.length > 0) {
    const bigramTexts = bigramSeq.map(c => c.text);
    const bigramVolumeData = await getVolumesWithHealth(db, bigramTexts);
    
    bigramSeq.forEach(candidate => {
      const normKey = nrm(candidate.text);
      const volumeInfo = bigramVolumeData.volumes[normKey];
      
      if (volumeInfo && volumeInfo.total > 0) {
        candidate.volume = volumeInfo.total;
        stats.reEnriched++;
        console.log(`   📊 [Bigram Pre-enrich] "${candidate.text}" → volume ${volumeInfo.total}`);
      }
    });
  }
  
  stats.bigramsExpanded = bigramSeq.length;
  
  // Step 6: totalScore 계산 (70% 볼륨 + 30% adScore)
  const allCandidates = [T1, ...bigramSeq];
  allCandidates.forEach(candidate => {
    const vol = candidate.volume || 0;
    const volScore = vol > 0 ? Math.log10(vol) * 25 : 0;
    const adScore = candidate.adScore || 0;
    candidate.totalScore = 0.7 * volScore + 0.3 * (adScore * 100);
  });
  
  // Step 7: T2, T3, T4 선정 (bigram 중 점수순)
  const T2 = bigramSeq[0] || null;  // 고정: T1 + second
  const remainingBigrams = bigramSeq.slice(1).sort((a, b) => (b.totalScore || 0) - (a.totalScore || 0));
  const T3 = remainingBigrams[0] || null;
  const T4 = remainingBigrams[1] || null;
  
  // Step 8: shortlist 구성 [T1, T2, T3, T4]
  let shortlist = [T1, T2, T3, T4].filter(Boolean) as Candidate[];
  
  console.log(`📊 [Tier Policy] T1: "${T1.text}", T2: "${T2?.text || 'N/A'}", T3: "${T3?.text || 'N/A'}", T4: "${T4?.text || 'N/A'}"`);
  
  // Step 9: ★ 하드 Gate 적용 (source='api_ok' && ad_eligible=true만 통과)
  console.log(`🚫 [Hard Gate] Applying post-enrich gate to ${shortlist.length} candidates...`);
  const beforeGateCount = shortlist.length;
  
  const gatedCandidates = await applyPostEnrichGate(shortlist, cfg);
  const eligibleCandidates = gatedCandidates.filter(c => c.eligible);
  
  stats.gateFiltered = beforeGateCount - eligibleCandidates.length;
  stats.eligibleAfterGate = eligibleCandidates.length;
  
  console.log(`🚫 [Hard Gate] Filtered ${stats.gateFiltered}/${beforeGateCount}, ${stats.eligibleAfterGate} eligible candidates`);
  
  // Step 9.1: soft 보정 (eligible 중에서 volume≥10 || adScore≥0.35), 비면 1개 남기고 rank=null
  const MIN_VOL = 10;
  const MIN_ADS = cfg.adscore?.SCORE_MIN ?? 0.35;
  const finalPool = eligibleCandidates.filter(k => (k.volume || 0) >= MIN_VOL || (k.adScore || 0) >= MIN_ADS);
  
  if (!finalPool.length && eligibleCandidates.length) {
    shortlist = [{...eligibleCandidates[0], rank: null}];
  } else if (finalPool.length) {
    shortlist = finalPool;
  } else {
    shortlist = [];
  }
  
  // Step 10: SERP 랭크 체크 (최종 shortlist만)
  console.log(`🔍 [vFinal] Checking SERP rankings on final shortlist...`);
  
  for (const candidate of shortlist) {
    try {
      candidate.rank = await serpScraper.checkKeywordRankingInMobileNaver(
        candidate.text, 
        `https://blog.naver.com/${blogId}`
      );
      console.log(`   📊 [Rank Check] "${candidate.text}" → rank ${candidate.rank || 'NA'}`);
    } catch (error) {
      console.error(`   ❌ [Rank Check] Failed for "${candidate.text}":`, error);
    }
  }
  
  const finalCandidates = shortlist;
  console.log(`🎯 [최종 보정] ${finalCandidates.length} candidates in final deterministic shortlist`);
  
  // Step 11: ★ 결정론적 티어 할당 (engine 없이 직접 구성)
  const deterministic_tiers: Tier[] = finalCandidates.map((candidate, index) => ({
    tier: index + 1,
    candidate: candidate,
    score: candidate.totalScore || 0
  }));
  
  // ★ Filter out empty/invalid tiers to fix empty tier issue
  const validTiers = filterValidTiers(deterministic_tiers);
  stats.tiersAssigned = validTiers.length;
  
  console.log(`🏆 [vFinal] Created ${deterministic_tiers.length} deterministic tiers, filtered to ${validTiers.length} valid tiers`);
  
  // Step 10: 저장 (postTierChecks) - vFinal 테스트 모드 안전 처리 + DB 무결성 보장
  const isTestMode = jobId?.startsWith('test-') || jobId === 'test-job-001';
  
  if (isTestMode) {
    console.log(`💾 [vFinal] Test mode detected (jobId: ${jobId}) - skipping DB saves`);
  } else {
    console.log(`💾 [vFinal] Saving ${validTiers.length} valid tiers to database`);
    
    try {
      // ★ Ensure serp_jobs entry exists to prevent FK violations
      await ensureSerpJobExists(jobId, inputKeyword);
      
      // Save valid tiers only
      for (const tier of validTiers) {
        const candidate = tier.candidate;
        // Double-check validity (should already be filtered but being safe)
        if (!candidate || !candidate.text || candidate.text.trim().length === 0) {
          console.log(`⚠️ [vFinal] Skipping invalid tier ${tier.tier} in save loop`);
          continue;
        }
        
        const normalizedText = nrm(candidate.text);
        const isRelated = nrm(inputKeyword).includes(normalizedText) ||
                         title.toLowerCase().includes(candidate.text.toLowerCase());
        
        try {
          await db.insert(postTierChecks).values({
            jobId,
            inputKeyword,
            blogId,
            postId: String(postId),
            postTitle: title,
            tier: tier.tier,
            textSurface: candidate.text,
            textNrm: normalizedText,
            volume: candidate.volume ?? null,
            rank: candidate.rank,
            score: tier.score,
            related: isRelated,
            eligible: candidate.eligible ?? true,
            adscore: candidate.adScore,
            skipReason: candidate.skipReason,
          });
          
          console.log(`   💾 [Tier ${tier.tier}] "${candidate.text}" → score ${tier.score}, rank ${candidate.rank || 'NA'}, eligible ${candidate.eligible}`);
        } catch (insertError) {
          console.error(`❌ [vFinal] Insert failed for tier ${tier.tier}:`, insertError);
          // Continue with other tiers instead of failing completely
        }
      }
    } catch (error) {
      console.error(`❌ [vFinal] Database operation failed:`, error);
      // Continue to return results even if DB save fails
    }
  }
  
  // 결과 준비 (표준 응답 포맷: {text, volume, rank, score, adScore, eligible, skipReason})
  // ★ Use filtered valid tiers only in final result
  const result: VFinalPipelineResult = {
    tiers: validTiers.map(tier => ({
      tier: tier.tier,
      text: tier.candidate.text,
      volume: tier.candidate.volume ?? null,
      rank: tier.candidate.rank ?? null,
      // vFinal: 서버 계산 점수 우선 (score → adScore 변환)  
      score: tier.score ?? (tier.candidate.adScore ?? 0) * 100,
      // vFinal: AdScore 안전 바인딩
      adScore: tier.candidate.adScore ?? 0, // Required field
      eligible: tier.candidate.eligible ?? true, // Required field
      skipReason: tier.candidate.skipReason ?? null, // Nullable but required field
    })),
    stats,
  };
  
  console.log(`✅ [vFinal Pipeline] Completed - Generated ${result.tiers.length} tiers`);
  // ★ Task 8: eligibleAfterGate 통계는 이미 하드 Gate 적용 시 설정됨
  
  console.log(`📊 [vFinal Stats] Generated:${stats.candidatesGenerated}, PreEnriched:${stats.preEnriched}, FirstSelected:${stats.firstSelected}, BigramsExpanded:${stats.bigramsExpanded}, ReEnriched:${stats.reEnriched}, ReSelected:${stats.reSelected}, GateFiltered:${stats.gateFiltered}, EligibleAfterGate:${stats.eligibleAfterGate}, TiersAssigned:${stats.tiersAssigned}`);
  
  return result;
}