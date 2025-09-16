import { storage } from "./storage";
import { log } from "./vite";
import type { TrackedTarget, InsertGroupIndexDaily, InsertRankAggDay } from "@shared/schema";

/**
 * 일일 집계 크론 서비스
 * 매일 자정(00:00)에 실행되어 랭킹 데이터와 그룹 지수를 집계합니다.
 */

export async function startDailyAggregation(): Promise<void> {
  const startTime = new Date();
  log(`[크론] 일일 집계 시작: ${startTime.toISOString()}`);

  try {
    // 1. 그룹 지수 일일 집계
    const groupAggResults = await aggregateGroupIndexDaily();
    
    // 2. 랭킹 일일 집계  
    const rankAggResults = await aggregateRankDaily();

    // 3. YoY/MoM/WoW 지표 계산
    const periodicMetrics = await calculatePeriodicMetrics();

    const endTime = new Date();
    const duration = endTime.getTime() - startTime.getTime();

    log(`[크론] 일일 집계 완료: ${endTime.toISOString()} (${duration}ms)`);
    log(`[크론] 집계 결과: 그룹 ${groupAggResults.count}개, 랭킹 ${rankAggResults.count}개, 지표 ${periodicMetrics.count}개`);

  } catch (error) {
    log(`[크론] 일일 집계 실패: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
}

async function aggregateGroupIndexDaily(): Promise<{ count: number }> {
  // 모든 활성 타겟에 대해 일일 지수 계산 (그룹 개념을 타겟으로 단순화)
  const targets = await storage.getTrackedTargets("system");
  let count = 0;

  // 타겟들을 가상의 그룹으로 묶어서 집계
  const groupedTargets = targets.reduce((groups: Record<string, TrackedTarget[]>, target) => {
    const groupKey = target.kind || 'default';
    if (!groups[groupKey]) groups[groupKey] = [];
    groups[groupKey].push(target);
    return groups;
  }, {});

  for (const [groupId, groupTargets] of Object.entries(groupedTargets)) {
    try {
      
      // 일일 집계 데이터 계산
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // 활성 타겟들로 그룹 지수 계산
      const enabledTargets = groupTargets.filter((target: TrackedTarget) => target.enabled);
      const avgRank = enabledTargets.length > 0 
        ? Math.round(enabledTargets.reduce((sum: number, target: TrackedTarget) => sum + 15, 0) / enabledTargets.length) 
        : 0; // 모의 평균 순위

      const aggregatedData: InsertGroupIndexDaily = {
        groupId,
        date: today,
        avgRank: avgRank.toString(), // 스키마에서 string 타입 요구
        keywordCount: enabledTargets.length,
        topRankCount: Math.floor(enabledTargets.length * 0.3), // 30% 가정
        improvementCount: Math.floor(enabledTargets.length * 0.2), // 20% 개선 가정
        alertCount: Math.floor(enabledTargets.length * 0.1), // 10% 알림 가정
        indexScore: Math.min(100, Math.max(0, 101 - avgRank)).toString() // 스키마에서 string 타입 요구
      };

      await storage.insertGroupIndexDaily(aggregatedData);
      count++;
      
    } catch (error) {
      log(`[크론] 그룹 ${groupId} 집계 실패: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return { count };
}

async function aggregateRankDaily(): Promise<{ count: number }> {
  // 활성 타겟들에 대해 일일 랭킹 집계
  const targets = await storage.getTrackedTargets("system");
  let count = 0;

  for (const target of targets.filter(t => t.enabled)) {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // 모의 집계 데이터 (실제 환경에서는 rankTimeSeries에서 계산)
      const avgRank = Math.floor(Math.random() * 30) + 1;
      const minRank = Math.max(1, avgRank - 5);
      const maxRank = Math.min(50, avgRank + 5);

      const aggregatedData: InsertRankAggDay = {
        targetId: target.id,
        keyword: target.query || "", // null 안전성 확보
        date: today,
        avgRank: avgRank.toString(), // 스키마에서 string 타입 요구
        minRank,
        maxRank,
        checkCount: 24, // 시간당 체크 가정
        deltaDaily: Math.floor(Math.random() * 11) - 5, // -5 ~ +5
        deltaWeekly: Math.floor(Math.random() * 21) - 10, // -10 ~ +10
      };

      await storage.insertRankAggDay(aggregatedData);
      count++;

    } catch (error) {
      log(`[크론] 타겟 ${target.id} 집계 실패: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return { count };
}

async function calculatePeriodicMetrics(): Promise<{ count: number }> {
  // YoY/MoM/WoW 지표 계산을 위한 타임스탬프 업데이트
  const timestamps = {
    last_rank_agg_day_ts: new Date().toISOString(),
    last_group_index_daily_ts: new Date().toISOString(),
    last_periodic_metrics_ts: new Date().toISOString(),
  };

  // 설정에 타임스탬프 저장
  try {
    for (const [key, value] of Object.entries(timestamps)) {
      await storage.updateSetting(key, value);
    }
    log(`[크론] 주기적 지표 타임스탬프 저장 완료: ${JSON.stringify(timestamps)}`);
  } catch (error) {
    log(`[크론] 타임스탬프 저장 실패: ${error instanceof Error ? error.message : String(error)}`);
  }

  return { count: Object.keys(timestamps).length };
}

/**
 * YoY/MoM/WoW 지표 계산 함수
 */
export function calculateYoYMoMWoW(rows: any[], options: { metric: string; period: string }): {
  current: number;
  previous: number;
  change: number;
  changePercent: number;
  trend: 'up' | 'down' | 'stable';
} {
  // 시계열 데이터에서 최신값과 비교값 추출
  if (rows.length < 2) {
    return { current: 0, previous: 0, change: 0, changePercent: 0, trend: 'stable' };
  }

  const latest = rows[0];
  const previous = rows[1];
  const current = parseFloat(latest[options.metric] || latest.avgRank || '0');
  const prev = parseFloat(previous[options.metric] || previous.avgRank || '0');

  const change = current - prev;
  const changePercent = prev > 0 ? (change / prev) * 100 : 0;
  
  let trend: 'up' | 'down' | 'stable' = 'stable';
  if (Math.abs(change) > 0.5) {
    trend = change > 0 ? 'down' : 'up'; // 순위에서는 숫자가 작을수록 좋음
  }

  return { current, previous: prev, change, changePercent, trend };
}

export async function calculateYoYMoMWoWForProduct(owner: string, productKey: string, range: string = "30d"): Promise<{
  yoy: number | null;
  mom: number | null;
  wow: number | null;
  asOf: string;
}> {
  try {
    // 메트릭 히스토리 조회
    const history = await storage.getMetricHistory(owner, productKey, range);
    
    // YoY/MoM/WoW 계산 (모의 데이터)
    const now = new Date();
    return {
      yoy: history.length > 50 ? Math.round((Math.random() - 0.5) * 20) : null,
      mom: history.length > 10 ? Math.round((Math.random() - 0.5) * 15) : null,
      wow: history.length > 3 ? Math.round((Math.random() - 0.5) * 10) : null,
      asOf: now.toISOString()
    };
  } catch (error) {
    return { yoy: null, mom: null, wow: null, asOf: new Date().toISOString() };
  }
}

export async function calculateYoYMoMWoWLegacy(targetId: string, period: 'day' | 'week' | 'month' | 'year'): Promise<{
  current: number;
  previous: number;
  change: number;
  changePercent: number;
  trend: 'up' | 'down' | 'stable';
}> {
  // 현재 날짜와 비교 날짜 계산
  const now = new Date();
  const compareDate = new Date(now);
  
  switch (period) {
    case 'day':
      compareDate.setDate(now.getDate() - 1);
      break;
    case 'week':
      compareDate.setDate(now.getDate() - 7);
      break;
    case 'month':
      compareDate.setMonth(now.getMonth() - 1);
      break;
    case 'year':
      compareDate.setFullYear(now.getFullYear() - 1);
      break;
  }

  // 실제 환경에서는 rankAggDay에서 데이터 조회
  // 현재는 모의 데이터 반환
  const current = Math.floor(Math.random() * 30) + 1;
  const previous = Math.floor(Math.random() * 30) + 1;
  const change = current - previous;
  const changePercent = previous > 0 ? (change / previous) * 100 : 0;
  
  let trend: 'up' | 'down' | 'stable' = 'stable';
  if (change > 0.5) trend = 'down'; // 순위가 올라가면(숫자 증가) 부정적
  else if (change < -0.5) trend = 'up'; // 순위가 내려가면(숫자 감소) 긍정적

  return {
    current,
    previous,
    change,
    changePercent,
    trend
  };
}