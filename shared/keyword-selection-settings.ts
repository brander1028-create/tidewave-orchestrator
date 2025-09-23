// 키워드 선정 설정 타입 정의

export interface KeywordSelectionSettings {
  minCPC: number;
  minScore: number;
  maxKeywords: number;
  volumeWeight: number;
  scoreWeight: number;
  combineWithSpace: boolean;
  enableTrigrams: boolean;
}

// 기본 설정값
export const defaultKeywordSelectionSettings: KeywordSelectionSettings = {
  minCPC: 300,
  minScore: 1,
  maxKeywords: 4,
  volumeWeight: 1.0,
  scoreWeight: 1.0,
  combineWithSpace: true,   // ✅ 키워드 조합 활성화 (2개 조합)
  enableTrigrams: true,     // ✅ 3개 조합 활성화
};

// 설정 검증 함수
export function validateKeywordSelectionSettings(settings: Partial<KeywordSelectionSettings>): KeywordSelectionSettings {
  return {
    minCPC: Math.max(0, settings.minCPC ?? defaultKeywordSelectionSettings.minCPC),
    minScore: Math.max(0, settings.minScore ?? defaultKeywordSelectionSettings.minScore),
    maxKeywords: Math.min(10, Math.max(1, settings.maxKeywords ?? defaultKeywordSelectionSettings.maxKeywords)),
    volumeWeight: Math.max(0, settings.volumeWeight ?? defaultKeywordSelectionSettings.volumeWeight),
    scoreWeight: Math.max(0, settings.scoreWeight ?? defaultKeywordSelectionSettings.scoreWeight),
    combineWithSpace: settings.combineWithSpace ?? defaultKeywordSelectionSettings.combineWithSpace,
    enableTrigrams: settings.enableTrigrams ?? defaultKeywordSelectionSettings.enableTrigrams,
  };
}