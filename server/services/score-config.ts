/**
 * Score Configuration System - v10 관리자 설정
 * 
 * AdScore 가중치, Gate 임계치, 키워드 생성 옵션 등을 
 * JSON 파일과 API로 관리
 */

import { join } from 'path';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { AdScoreWeights, AdScoreThresholds, GateConfig, DEFAULT_WEIGHTS, DEFAULT_THRESHOLDS, DEFAULT_GATE_CONFIG } from './adscore-engine';

export interface KeywordGeneration {
  categories: string[];        // LK Mode 카테고리 태그
  banSingles: string[];       // 단독 금지어 리스트
  preferCompound: boolean;    // 복합어 우선순위
  allowThreeGram: boolean;    // 3-gram 허용
}

export interface LoggingConfig {
  enabled: boolean;
  detail: boolean;
  traceScore: boolean;
}

export interface ScoreConfig {
  version: string;
  description: string;
  
  // AdScore 가중치 (합=1.0)
  weights: AdScoreWeights;
  
  // Gate 임계치
  thresholds: AdScoreThresholds;
  
  // Gate 설정
  gate: GateConfig;
  
  // CPC 최대값 (정규화용)
  cpcMax: number;
  
  // 키워드 생성 옵션
  keywordGen: KeywordGeneration;
  
  // 로깅 옵션
  logging: LoggingConfig;
  
  lastUpdated: string;
}

// 기본 설정값
const DEFAULT_SCORE_CONFIG: ScoreConfig = {
  version: "v10.1",
  description: "Score-First Gate + Pre-enrich 시스템 설정",
  
  weights: DEFAULT_WEIGHTS,
  thresholds: DEFAULT_THRESHOLDS,
  gate: DEFAULT_GATE_CONFIG,
  cpcMax: 2000,
  
  keywordGen: {
    categories: ["health", "beauty", "food", "education", "shopping", "lifestyle"],
    banSingles: ["맛집", "추천", "방법", "여자", "남자", "바르", "좋은", "효과", "제품", "사용법"],
    preferCompound: true,
    allowThreeGram: true
  },
  
  logging: {
    enabled: true,
    detail: false,
    traceScore: true
  },
  
  lastUpdated: new Date().toISOString()
};

const CONFIG_FILE_PATH = join(process.cwd(), 'server/data/score.config.json');

/**
 * 설정 파일 로드
 */
export function loadScoreConfig(): ScoreConfig {
  try {
    if (existsSync(CONFIG_FILE_PATH)) {
      const content = readFileSync(CONFIG_FILE_PATH, 'utf-8');
      const config = JSON.parse(content) as ScoreConfig;
      
      // 유효성 검사
      validateScoreConfig(config);
      
      console.log(`📊 [Score Config] Loaded config version ${config.version}`);
      return config;
    } else {
      // 기본 설정 생성
      console.log(`📊 [Score Config] Creating default config file`);
      saveScoreConfig(DEFAULT_SCORE_CONFIG);
      return DEFAULT_SCORE_CONFIG;
    }
  } catch (error) {
    console.error(`❌ [Score Config] Failed to load config, using defaults:`, error);
    return DEFAULT_SCORE_CONFIG;
  }
}

/**
 * 설정 파일 저장
 */
export function saveScoreConfig(config: ScoreConfig): void {
  try {
    // 유효성 검사
    validateScoreConfig(config);
    
    // 타임스탬프 업데이트
    config.lastUpdated = new Date().toISOString();
    
    // 파일 저장
    writeFileSync(CONFIG_FILE_PATH, JSON.stringify(config, null, 2), 'utf-8');
    console.log(`✅ [Score Config] Saved config version ${config.version}`);
    
    // 캐시 무효화
    invalidateConfigCache();
    
  } catch (error) {
    console.error(`❌ [Score Config] Failed to save config:`, error);
    throw error;
  }
}

/**
 * 설정 유효성 검사
 */
export function validateScoreConfig(config: ScoreConfig): void {
  // 가중치 합계 검사 (1.0 ± 0.001)
  const weightSum = config.weights.volume + config.weights.competition + 
                   config.weights.adDepth + config.weights.cpc;
  
  if (Math.abs(weightSum - 1.0) > 0.001) {
    throw new Error(`Invalid weights sum: ${weightSum.toFixed(3)}, must be 1.000`);
  }
  
  // 가중치 범위 검사 (0-1)
  Object.values(config.weights).forEach(weight => {
    if (weight < 0 || weight > 1) {
      throw new Error(`Invalid weight value: ${weight}, must be 0-1`);
    }
  });
  
  // 임계치 범위 검사
  if (config.thresholds.scoreMin < 0 || config.thresholds.scoreMin > 1) {
    throw new Error(`Invalid scoreMin: ${config.thresholds.scoreMin}, must be 0-1`);
  }
  
  if (config.thresholds.volumeMin < 0) {
    throw new Error(`Invalid volumeMin: ${config.thresholds.volumeMin}, must be >= 0`);
  }
  
  // banSingles 중복 제거
  config.keywordGen.banSingles = Array.from(new Set(config.keywordGen.banSingles));
  config.keywordGen.categories = Array.from(new Set(config.keywordGen.categories));
}

/**
 * 캐시된 설정 (hot-reload)
 */
let cachedConfig: ScoreConfig | null = null;
let configLoadTime = 0;
const CACHE_TTL = 30000; // 30초

/**
 * 캐시된 설정 로드 (성능 최적화)
 */
export function getScoreConfig(): ScoreConfig {
  const now = Date.now();
  
  if (!cachedConfig || (now - configLoadTime) > CACHE_TTL) {
    cachedConfig = loadScoreConfig();
    configLoadTime = now;
    console.log(`🔄 [Score Config] Cache refreshed`);
  }
  
  return cachedConfig;
}

/**
 * 캐시 무효화
 */
export function invalidateConfigCache(): void {
  cachedConfig = null;
  configLoadTime = 0;
  console.log(`🔄 [Score Config] Cache invalidated`);
}

/**
 * 설정 부분 업데이트
 */
export function updateScoreConfig(updates: Partial<ScoreConfig>): ScoreConfig {
  const current = loadScoreConfig();
  const updated = { ...current, ...updates };
  
  saveScoreConfig(updated);
  return updated;
}

/**
 * 가중치 정규화 (합계=1.0 보장)
 */
export function normalizeWeights(weights: Partial<AdScoreWeights>): AdScoreWeights {
  const current = getScoreConfig().weights;
  const updated = { ...current, ...weights };
  
  const sum = updated.volume + updated.competition + updated.adDepth + updated.cpc;
  
  if (sum === 0) {
    throw new Error("All weights cannot be zero");
  }
  
  return {
    volume: updated.volume / sum,
    competition: updated.competition / sum,
    adDepth: updated.adDepth / sum,
    cpc: updated.cpc / sum
  };
}

/**
 * 설정 내보내기/가져오기
 */
export function exportConfig(): string {
  return JSON.stringify(getScoreConfig(), null, 2);
}

export function importConfig(configJson: string): ScoreConfig {
  const config = JSON.parse(configJson) as ScoreConfig;
  validateScoreConfig(config);
  saveScoreConfig(config);
  return config;
}

/**
 * 설정 초기화
 */
export function resetToDefaults(): ScoreConfig {
  const defaultConfig = {
    ...DEFAULT_SCORE_CONFIG,
    lastUpdated: new Date().toISOString()
  };
  
  saveScoreConfig(defaultConfig);
  return defaultConfig;
}