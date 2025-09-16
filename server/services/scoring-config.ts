import { readFile, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

// v10 Score-First Gate 통합
import { evaluateKeyword, type KeywordMetrics, getAdScoreTrace } from './adscore-engine';
import { getScoreConfig } from './score-config';

// 점수 계산 설정 타입 정의
export interface ScoringConfig {
  version: string;
  description: string;
  scoring: {
    weights: {
      volume: number;
      competition: number;
      ad_depth: number;
      cpc: number;
    };
    normalization: {
      volume: {
        type: 'logarithmic' | 'linear';
        base?: number;
        max_raw: number;
        scale_factor?: number;
      };
      competition: {
        type: 'direct' | 'linear';
        scale: number;
      };
      ad_depth: {
        type: 'linear';
        max: number;
      };
      cpc: {
        type: 'linear';
        max: number;
      };
    };
    competition_mapping: Record<string, number>;
  };
  logging: {
    enabled: boolean;
    detailed: boolean;
    log_calculations: boolean;
  };
  metadata: {
    last_modified: string;
    modified_by: string;
    change_log: Array<{
      date: string;
      changes: string;
      author: string;
    }>;
  };
}

const CONFIG_FILE_PATH = path.join(process.cwd(), 'score.config.json');

let cachedConfig: ScoringConfig | null = null;
let lastLoadTime = 0;
const CACHE_TTL = 60000; // 1분 캐시

/**
 * 점수 계산 설정을 로드합니다 (캐시 적용)
 */
export async function loadScoringConfig(): Promise<ScoringConfig> {
  const now = Date.now();
  
  // 캐시된 설정이 유효하면 반환
  if (cachedConfig && (now - lastLoadTime) < CACHE_TTL) {
    return cachedConfig;
  }
  
  try {
    if (!existsSync(CONFIG_FILE_PATH)) {
      throw new Error('Score config file not found');
    }
    
    const configData = await readFile(CONFIG_FILE_PATH, 'utf-8');
    cachedConfig = JSON.parse(configData);
    lastLoadTime = now;
    
    if (cachedConfig!.logging.enabled) {
      console.log(`📊 [Scoring Config] Loaded config version ${cachedConfig!.version}`);
    }
    
    return cachedConfig!;
  } catch (error) {
    console.error('❌ Failed to load scoring config:', error);
    // Fallback to default config
    return getDefaultConfig();
  }
}

/**
 * 점수 계산 설정을 저장합니다
 */
export async function saveScoringConfig(config: ScoringConfig): Promise<void> {
  try {
    // 메타데이터 업데이트
    config.metadata.last_modified = new Date().toISOString();
    config.metadata.change_log.push({
      date: new Date().toISOString(),
      changes: 'Configuration updated via admin panel',
      author: 'admin'
    });
    
    const configData = JSON.stringify(config, null, 2);
    await writeFile(CONFIG_FILE_PATH, configData, 'utf-8');
    
    // 캐시 갱신
    cachedConfig = config;
    lastLoadTime = Date.now();
    
    console.log(`✅ [Scoring Config] Saved config version ${config.version}`);
  } catch (error) {
    console.error('❌ Failed to save scoring config:', error);
    throw error;
  }
}

/**
 * 기본 설정을 반환합니다
 */
function getDefaultConfig(): ScoringConfig {
  return {
    version: "v10.0",
    description: "키워드 점수 계산 엔진 설정 (Default)",
    scoring: {
      weights: {
        volume: 0.35,
        competition: 0.35,
        ad_depth: 0.20,
        cpc: 0.10
      },
      normalization: {
        volume: {
          type: 'logarithmic',
          base: 10,
          max_raw: 100000,
          scale_factor: 5
        },
        competition: {
          type: 'direct',
          scale: 100
        },
        ad_depth: {
          type: 'linear',
          max: 5
        },
        cpc: {
          type: 'linear',
          max: 5000
        }
      },
      competition_mapping: {
        "높음": 100,
        "high": 100,
        "2": 100,
        "중간": 60,
        "mid": 60,
        "1": 60,
        "낮음": 20,
        "low": 20,
        "0": 20,
        "default": 60
      }
    },
    logging: {
      enabled: true,
      detailed: false,
      log_calculations: true
    },
    metadata: {
      last_modified: new Date().toISOString(),
      modified_by: "system",
      change_log: []
    }
  };
}

/**
 * 경쟁도 텍스트를 점수로 변환 (설정 기반)
 */
export async function compIdxToScore(idx?: string | null): Promise<number> {
  const config = await loadScoringConfig();
  
  if (!idx) return config.scoring.competition_mapping.default;
  
  const s = String(idx).toLowerCase();
  
  // 설정에서 매핑 찾기
  for (const [key, value] of Object.entries(config.scoring.competition_mapping)) {
    if (key === 'default') continue;
    if (s.includes(key.toLowerCase()) || s === key) {
      return value;
    }
  }
  
  return config.scoring.competition_mapping.default;
}

/**
 * v10 Score-First Gate 통합 종합점수 계산 
 * AdScore Engine을 사용한 정확한 점수 계산
 */
export async function calculateOverallScore(
  raw_volume: number,
  comp_score: number,
  ad_depth: number,
  est_cpc: number
): Promise<number> {
  try {
    // Score-First Gate 설정 로드
    const scoreConfig = getScoreConfig();
    
    // KeywordMetrics 객체 생성 (AdScore Engine 형식)
    const metrics: KeywordMetrics = {
      volume: raw_volume || 0,
      competition: comp_score / 100, // 0-100 → 0-1 정규화
      adDepth: ad_depth || 0,
      cpc: est_cpc || 0
    };

    // AdScore Engine으로 평가
    const adScoreResult = evaluateKeyword(
      metrics,
      scoreConfig.weights,
      scoreConfig.thresholds,
      scoreConfig.cpcMax
    );

    // 로깅 (Score-First Gate 스타일)
    if (scoreConfig.logging.enabled && scoreConfig.logging.log_calculations) {
      console.log(`🎯 [AdScore] ${getAdScoreTrace(adScoreResult)}`);
      
      if (!adScoreResult.eligible) {
        console.log(`❌ [Gate] Keyword rejected: ${adScoreResult.skipReason}`);
      } else {
        console.log(`✅ [Gate] Keyword passed: Score ${(adScoreResult.adScore * 100).toFixed(1)}/100`);
      }
    }

    // 점수를 0-100 범위로 스케일링하여 반환
    const finalScore = Math.round(adScoreResult.adScore * 100);
    
    return Math.max(0, Math.min(100, finalScore));
    
  } catch (error) {
    console.error(`❌ [AdScore] Score calculation failed:`, error);
    
    // Fallback: 기존 로직의 간단한 버전
    const fallbackScore = Math.min(100, Math.round(
      (Math.log10(Math.max(1, raw_volume)) / 5) * 35 +    // Volume 35%
      (comp_score / 100) * 35 +                            // Competition 35%
      Math.min(1, (ad_depth || 0) / 5) * 20 +             // AdDepth 20%
      Math.min(1, (est_cpc || 0) / 2000) * 10             // CPC 10%
    ) * 100);
    
    console.log(`⚠️ [AdScore] Using fallback score: ${fallbackScore}/100`);
    return fallbackScore;
  }
}

/**
 * 설정 검증 및 가중치 합계 체크
 */
export async function validateScoringConfig(config: ScoringConfig): Promise<{ isValid: boolean; errors: string[] }> {
  const errors: string[] = [];
  
  // 가중치 합계 체크 (1.0이어야 함)
  const { weights } = config.scoring;
  const weightSum = weights.volume + weights.competition + weights.ad_depth + weights.cpc;
  
  if (Math.abs(weightSum - 1.0) > 0.001) {
    errors.push(`가중치 합계가 1.0이 아님: ${weightSum.toFixed(3)}`);
  }
  
  // 가중치 범위 체크 (0-1)
  Object.entries(weights).forEach(([key, value]) => {
    if (value < 0 || value > 1) {
      errors.push(`${key} 가중치가 범위를 벗어남: ${value}`);
    }
  });
  
  // 경쟁도 매핑 체크
  if (!config.scoring.competition_mapping.default) {
    errors.push('기본 경쟁도 값이 없음');
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * 캐시 무효화
 */
export function invalidateConfigCache(): void {
  cachedConfig = null;
  lastLoadTime = 0;
}