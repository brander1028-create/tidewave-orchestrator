import { readFile, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

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
      log_calculations: false
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
 * v10 B번: 설정 기반 종합점수 계산 (로그 적용)
 */
export async function calculateOverallScore(
  raw_volume: number,
  comp_score: number,
  ad_depth: number,
  est_cpc: number
): Promise<number> {
  const config = await loadScoringConfig();
  const { weights, normalization } = config.scoring;
  const { logging } = config;
  
  // 안전 범위 클램핑 함수
  const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
  
  // 1. 볼륨 정규화 (로그 또는 선형)
  let volume_norm = 0;
  if (normalization.volume.type === 'logarithmic') {
    const base = normalization.volume.base || 10;
    const scale_factor = normalization.volume.scale_factor || 5;
    volume_norm = clamp01(Math.log10(Math.max(1, raw_volume)) / scale_factor);
  } else {
    volume_norm = clamp01(raw_volume / normalization.volume.max_raw);
  }
  
  // 2. 경쟁도 정규화 (직접 또는 스케일링)
  let comp_norm = 0;
  if (normalization.competition.type === 'direct') {
    comp_norm = clamp01(comp_score / normalization.competition.scale);
  } else {
    comp_norm = clamp01(comp_score / normalization.competition.scale);
  }
  
  // 3. 광고깊이 정규화
  const depth_norm = clamp01((ad_depth || 0) / normalization.ad_depth.max);
  
  // 4. CPC 정규화
  const cpc_norm = est_cpc ? clamp01(est_cpc / normalization.cpc.max) : 0;
  
  // 5. 가중 평균 계산
  const score = 
    weights.volume * (volume_norm * 100) +
    weights.competition * (comp_norm * 100) +
    weights.ad_depth * (depth_norm * 100) +
    weights.cpc * (cpc_norm * 100);
  
  const finalScore = Math.round(clamp01(score / 100) * 100);
  
  // 6. 로깅 (설정에 따라)
  if (logging.enabled && logging.log_calculations) {
    console.log(`🧮 [Score Calc] 키워드 점수 계산:`);
    console.log(`   📊 Volume: ${raw_volume} → ${volume_norm.toFixed(3)} (${(weights.volume * volume_norm * 100).toFixed(1)}점)`);
    console.log(`   🏆 Competition: ${comp_score} → ${comp_norm.toFixed(3)} (${(weights.competition * comp_norm * 100).toFixed(1)}점)`);
    console.log(`   📈 Ad Depth: ${ad_depth} → ${depth_norm.toFixed(3)} (${(weights.ad_depth * depth_norm * 100).toFixed(1)}점)`);
    console.log(`   💰 CPC: ${est_cpc} → ${cpc_norm.toFixed(3)} (${(weights.cpc * cpc_norm * 100).toFixed(1)}점)`);
    console.log(`   ⚡ Final Score: ${finalScore}/100`);
  }
  
  return finalScore;
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