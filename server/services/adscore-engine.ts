/**
 * AdScore Engine - Score-First Gate System
 * 
 * Calculates AdScore using weighted combination of:
 * - Volume (검색량)
 * - Competition (경쟁도) 
 * - AD Depth (광고 깊이)
 * - CPC (클릭당 비용)
 */

export interface AdScoreWeights {
  volume: number;      // 기본 0.35
  competition: number; // 기본 0.35
  adDepth: number;     // 기본 0.20
  cpc: number;         // 기본 0.10
}

export interface AdScoreThresholds {
  scoreMin: number;    // 기본 0.55
  volumeMin: number;   // 기본 600
  adDepthMin: number;  // 기본 1
  cpcMin: number;      // 기본 0
}

export interface GateConfig {
  mode: 'hard' | 'soft'; // hard=스킵, soft=표시만
  forceFill: boolean;    // T개 미만시 임계 완화
}

export interface KeywordMetrics {
  volume: number;
  competition: number;   // 0-1
  adDepth: number;
  cpc: number;
}

export interface AdScoreResult {
  adScore: number;
  eligible: boolean;
  skipReason?: string;
  scoreTrace: {
    volumeNorm: number;
    competitionNorm: number;
    adDepthNorm: number;
    cpcNorm: number;
    weightedScore: number;
  };
}

// 기본 설정값 (v10 명세서 기준)
export const DEFAULT_WEIGHTS: AdScoreWeights = {
  volume: 0.35,
  competition: 0.35,
  adDepth: 0.20,
  cpc: 0.10
};

export const DEFAULT_THRESHOLDS: AdScoreThresholds = {
  scoreMin: 0.55,
  volumeMin: 600,
  adDepthMin: 1,
  cpcMin: 0
};

export const DEFAULT_GATE_CONFIG: GateConfig = {
  mode: 'hard',
  forceFill: true
};

/**
 * AdScore 정규화 함수들
 */
export function normalizeVolume(volume: number): number {
  // V_norm = min(1, log10(max(1,volume))/5)
  return Math.min(1, Math.log10(Math.max(1, volume)) / 5);
}

export function normalizeCompetition(competition: number): number {
  // Comp_norm = competition(0..1) - API/DB 값 직접 사용
  return Math.max(0, Math.min(1, competition));
}

export function normalizeAdDepth(adDepth: number): number {
  // ADDepth_norm = min(1, adDepth/5)
  return Math.min(1, adDepth / 5);
}

export function normalizeCPC(cpc: number, cpcMax: number = 2000): number {
  // CPC_norm = min(1, CPC / CPC_MAX)
  return Math.min(1, cpc / cpcMax);
}

/**
 * AdScore 계산 메인 함수
 */
export function calculateAdScore(
  metrics: KeywordMetrics,
  weights: AdScoreWeights = DEFAULT_WEIGHTS,
  cpcMax: number = 2000
): AdScoreResult {
  // 정규화
  const volumeNorm = normalizeVolume(metrics.volume);
  const competitionNorm = normalizeCompetition(metrics.competition);
  const adDepthNorm = normalizeAdDepth(metrics.adDepth);
  const cpcNorm = normalizeCPC(metrics.cpc, cpcMax);

  // 가중 평균 계산
  const weightedScore = (
    weights.volume * volumeNorm +
    weights.competition * competitionNorm +
    weights.adDepth * adDepthNorm +
    weights.cpc * cpcNorm
  );

  const scoreTrace = {
    volumeNorm,
    competitionNorm,
    adDepthNorm,
    cpcNorm,
    weightedScore
  };

  return {
    adScore: weightedScore,
    eligible: true, // Gate 체크는 별도 함수에서
    scoreTrace
  };
}

/**
 * Score-First Gate 체크 (vFinal 완화 버전)
 */
export function checkGateEligibility(
  metrics: KeywordMetrics,
  adScore: number,
  thresholds: AdScoreThresholds = DEFAULT_THRESHOLDS,
  mode: 'soft' | 'hard' = 'soft'
): { eligible: boolean; skipReason?: string } {
  
  // 광고불가 or 지표0은 하드 컷 (CTR=0, competition=0 등)
  if ((metrics.competition ?? 0) === 0 && (metrics.adDepth ?? 0) === 0) {
    return { eligible: false, skipReason: "ineligible" };
  }
  
  // 제목 단계는 soft 권장: vol<thr 하드컷 제거
  // score 기준은 mode==="hard"에서만
  if (mode === "hard" && (adScore ?? 0) < (thresholds.scoreMin ?? 0.55)) {
    return { eligible: false, skipReason: "score<thr" };
  }

  return { eligible: true };
}

/**
 * 완전한 AdScore + Gate 평가
 */
export function evaluateKeyword(
  metrics: KeywordMetrics,
  weights: AdScoreWeights = DEFAULT_WEIGHTS,
  thresholds: AdScoreThresholds = DEFAULT_THRESHOLDS,
  cpcMax: number = 2000
): AdScoreResult {
  
  // AdScore 계산
  const scoreResult = calculateAdScore(metrics, weights, cpcMax);
  
  // Gate 체크
  const gateResult = checkGateEligibility(metrics, scoreResult.adScore, thresholds);
  
  return {
    ...scoreResult,
    eligible: gateResult.eligible,
    skipReason: gateResult.skipReason
  };
}

/**
 * 로깅용 AdScore 상세 정보
 */
export function getAdScoreTrace(result: AdScoreResult): string {
  const trace = result.scoreTrace;
  return `AdScore=${result.adScore.toFixed(3)} (V:${trace.volumeNorm.toFixed(2)}, C:${trace.competitionNorm.toFixed(2)}, AD:${trace.adDepthNorm.toFixed(2)}, CPC:${trace.cpcNorm.toFixed(2)})`;
}

/**
 * 임계 완화 (forceFill 모드)
 */
export function relaxThresholds(
  thresholds: AdScoreThresholds,
  relaxationLevel: number = 0.1
): AdScoreThresholds {
  return {
    scoreMin: Math.max(0, thresholds.scoreMin - relaxationLevel),
    volumeMin: Math.max(0, Math.floor(thresholds.volumeMin * (1 - relaxationLevel))),
    adDepthMin: Math.max(0, thresholds.adDepthMin - relaxationLevel),
    cpcMin: Math.max(0, thresholds.cpcMin - relaxationLevel)
  };
}