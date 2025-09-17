/**
 * vFinal Pipeline: 제목 프리엔리치 + 빅그램 조합 + Gate 이후 적용
 * 올바른 순서: 프리엔리치 → 선정 → 빅그램 확장 → 재프리엔리치 → 재선정 → Gate → 저장
 */
import { getAlgoConfig } from './algo-config';
import { getVolumesWithHealth } from './externals-health';
import { serpScraper } from './serp-scraper';
import { db } from '../db';
import { postTierChecks, managedKeywords } from '../../shared/schema';
import { nrm, expandBigrams } from '../utils/normalization';
import { inArray } from 'drizzle-orm';

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
 * extractTokens - 제목에서 토큰 추출 (banSingles 제외)
 */
function extractTokens(title: string, banSingles: string[] = []): string[] {
  const words = title
    .split(/[\s\-_.,!?()]+/)
    .map(w => w.trim())
    .filter(w => w.length >= 2);
    
  // banSingles 제외
  return words.filter(word => !banSingles.includes(word));
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
          // AdScore 계산용 volume 설정
          const volume = candidate.volume || 0;
          // 제목 단계: vol<thr 하드컷 제거! (volume 조건 없음)
          // AdScore 계산 (나중에 70:30 적용)
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
          
          // 제목 단계는 soft 권장: score 기준도 mode==="hard"에서만
          if (cfg.adscore?.mode === 'hard' && adScore < (cfg.adscore?.SCORE_MIN || 0.35)) {
            eligible = false;
            skipReason = `AdScore too low: ${adScore}`;
          }
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
    tiersAssigned: 0,
  };
  
  // Step 1: 제목→토큰 추출
  const toks = extractTokens(title, cfg.phase2?.banSingles || []);
  console.log(`📝 [vFinal] Extracted ${toks.length} tokens: ${toks.slice(0, 5).join(', ')}...`);
  
  // Step 2: Phase2 엔진으로 초기 후보 생성 (Gate 적용 안함!)
  const engine = engineRegistry.get(cfg.phase2?.engine || 'lk');
  if (!engine) {
    throw new Error(`Unknown Phase2 engine: ${cfg.phase2?.engine}`);
  }
  
  const ctx = { title, blogId, postId: postId.toString(), inputKeyword, jobId };
  let rawCandidates = engine.generateCandidates(ctx, cfg);
  
  // n-gram/추가 후보 생성 후: candidates 상한 적용 (조합 폭발 제어)
  rawCandidates = rawCandidates.slice(0, MAX_CANDS_PER_TITLE);
  stats.candidatesGenerated = rawCandidates.length;
  
  console.log(`🔤 [vFinal] Generated ${stats.candidatesGenerated} candidates (limited to ${MAX_CANDS_PER_TITLE})`);
  
  // Step 3: 제목 토큰 프리엔리치 (DB→API→upsert→merge)
  console.log(`📊 [vFinal] Pre-enriching tokens...`);
  
  const candidateTexts = rawCandidates.map(c => c.text);
  const volumeData = await getVolumesWithHealth(db, candidateTexts);
  
  // Merge volumes back to candidates
  rawCandidates.forEach(candidate => {
    const normKey = nrm(candidate.text);
    const volumeInfo = volumeData.volumes[normKey];
    
    if (volumeInfo && volumeInfo.total > 0) {
      candidate.volume = volumeInfo.total;
      stats.preEnriched++;
      console.log(`   📊 [Pre-enrich] "${candidate.text}" → volume ${volumeInfo.total}`);
    }
  });
  
  console.log(`✅ [vFinal] Pre-enriched ${stats.preEnriched}/${stats.candidatesGenerated} candidates`);
  
  // Step 4: 1차 선정
  let pool = [...rawCandidates];
  let topK = pickTopK(pool, K);
  stats.firstSelected = topK.length;
  
  console.log(`🎯 [vFinal] First selection: ${stats.firstSelected} candidates`);
  
  // Step 5: 전부 비었거나 부족하면 → 빅그램 확장
  if (!topK.length || topK.every(t => !t.text)) {
    console.log(`🔧 [vFinal] Expanding with bigrams...`);
    
    // base + 나머지로 빅그램 생성
    const base = pickMaxVolumeToken(pool) || pickLongest(toks);
    if (base) {
      // bigrams 만들 때 상한 적용
      const bigrams = expandBigrams(base, toks).slice(0, MAX_BIGRAMS_PER_BASE);
      stats.bigramsExpanded = bigrams.length;
      
      console.log(`📈 [vFinal] Generated ${stats.bigramsExpanded} bigrams with base "${base}" (limited to ${MAX_BIGRAMS_PER_BASE})`);
      
      // 빅그램 프리엔리치
      const bigramTexts = bigrams.map(b => b.surface);
      const bigramVolumeData = await getVolumesWithHealth(db, bigramTexts);
      
      // 빅그램을 후보로 추가
      const bigramCandidates: Candidate[] = bigrams.map(bigram => ({
        text: bigram.surface,
        frequency: 1,
        position: 0,
        length: bigram.surface.length,
        compound: true,
        volume: 0
      }));
      
      // 볼륨 병합
      bigramCandidates.forEach(candidate => {
        const normKey = nrm(candidate.text);
        const volumeInfo = bigramVolumeData.volumes[normKey];
        
        if (volumeInfo && volumeInfo.total > 0) {
          candidate.volume = volumeInfo.total;
          stats.reEnriched++;
          console.log(`   📊 [Re-enrich] "${candidate.text}" → volume ${volumeInfo.total}`);
        }
      });
      
      // 풀에 추가하고 재선정
      pool = [...rawCandidates, ...bigramCandidates];
      topK = pickTopK(pool, K);
      stats.reSelected = topK.length;
      
      console.log(`🎯 [vFinal] Re-selected: ${stats.reSelected} candidates after bigram expansion`);
    }
  }
  
  // Step 6: Gate (프리엔리치 이후 적용!) - vFinal 핵심!
  console.log(`🚫 [vFinal] Applying post-enrich gate...`);
  const gatedCandidates = await applyPostEnrichGate(topK, cfg);
  stats.gateFiltered = gatedCandidates.filter(c => !c.eligible).length;
  
  console.log(`🚫 [vFinal] Gate filtered ${stats.gateFiltered}/${topK.length} candidates`);
  
  // Step 7: 점수 계산
  gatedCandidates.forEach(candidate => {
    candidate.totalScore = calculateTotalScore(candidate, cfg);
  });
  
  // Step 8: 랭크 체크
  console.log(`🔍 [vFinal] Checking SERP rankings...`);
  
  for (const candidate of gatedCandidates) {
    if (candidate.eligible) {
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
  }
  
  // Step 8.5: ★ 패치3: 최종 선정 직전 보정 (상업성 기반 필터링)
  const MIN_VOL = 10;
  const MIN_ADS = cfg.adscore?.SCORE_MIN ?? 0.35;
  
  // 상업성 있는 키워드만 최종 풀에 선정
  const eligibleCandidates = gatedCandidates.filter(c => c.eligible);
  
  // 배치 DB 쿼리 (개별 쿼리 대신)
  const finalCandidateTexts = eligibleCandidates.map(c => c.text);
  const existingDbInfo = finalCandidateTexts.length > 0 ? await db.select({
    text: managedKeywords.text,
    source: managedKeywords.source,
    ad_depth: managedKeywords.ad_depth,
    est_cpc_krw: managedKeywords.est_cpc_krw
  })
    .from(managedKeywords)
    .where(inArray(managedKeywords.text, finalCandidateTexts)) : [];
  
  const dbMap = new Map(existingDbInfo.map(info => [info.text, info]));
  
  const finalPool = eligibleCandidates.filter(k => {
    const dbInfo = dbMap.get(k.text);
    const hasCommerce = dbInfo?.source === "api_ok" && 
                       (dbInfo?.ad_depth ?? 0) > 0 && 
                       (dbInfo?.est_cpc_krw ?? 0) > 0;
    const meetsThreshold = (k.volume ?? 0) >= MIN_VOL || (k.adScore ?? 0) >= MIN_ADS;
    
    return hasCommerce && meetsThreshold;
  });
  
  // soft gate: finalPool이 비어있으면 eligible 중 최고점 1개라도 넘김
  const finalCandidates = finalPool.length > 0 ? 
    finalPool : 
    eligibleCandidates.slice(0, 1).map(k => ({...k, rank: null}));
  
  console.log(`🎯 [최종 보정] ${finalCandidates.length}/${eligibleCandidates.length} candidates passed final filter`);

  // Step 9: 티어 할당
  const tiers = engine.assignTiers(finalCandidates, cfg);
  stats.tiersAssigned = tiers.length;
  
  console.log(`🏆 [vFinal] Assigned ${stats.tiersAssigned} tiers`);
  
  // Step 10: 저장 (postTierChecks) - vFinal 테스트 모드 안전 처리
  const isTestMode = jobId?.startsWith('test-') || jobId === 'test-job-001';
  
  if (isTestMode) {
    console.log(`💾 [vFinal] Test mode detected (jobId: ${jobId}) - skipping DB saves`);
  } else {
    console.log(`💾 [vFinal] Saving ${tiers.length} tiers to database`);
    
    for (const tier of tiers) {
      const candidate = tier.candidate;
      if (!candidate || !candidate.text) continue;
      
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
      }
    }
  }
  
  // 결과 준비 (표준 응답 포맷: {text, volume, rank, score, adScore, eligible, skipReason})
  const result: VFinalPipelineResult = {
    tiers: tiers.map(tier => ({
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
  console.log(`📊 [vFinal Stats] Generated:${stats.candidatesGenerated}, PreEnriched:${stats.preEnriched}, FirstSelected:${stats.firstSelected}, BigramsExpanded:${stats.bigramsExpanded}, ReEnriched:${stats.reEnriched}, ReSelected:${stats.reSelected}, GateFiltered:${stats.gateFiltered}, TiersAssigned:${stats.tiersAssigned}`);
  
  return result;
}