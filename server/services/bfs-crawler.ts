import { readFileSync } from 'fs';
import { join } from 'path';
import { getVolumesWithHealth } from './externals-health.js';
import { listKeywords, upsertMany } from '../store/keywords.js';
import { nanoid } from 'nanoid';
import { db } from '../db.js';

// CSV에서 시드 키워드 로드
export function loadSeedsFromCSV(): string[] {
  try {
    const csvPath = join(process.cwd(), 'server/data/seed_keywords_v2_ko.csv');
    const csvContent = readFileSync(csvPath, 'utf-8');
    
    const lines = csvContent.split('\n').slice(1); // Skip header
    const seeds = lines
      .map(line => {
        const parts = line.split(',');
        return parts[1]?.trim(); // seed column (index 1)
      })
      .filter(Boolean) // Remove empty entries
      .filter(seed => seed.length > 0);
      
    console.log(`📂 Loaded ${seeds.length} seed keywords from CSV`);
    console.log(`🌱 Sample seeds: ${seeds.slice(0, 5).join(', ')}...`);
    
    return seeds;
  } catch (error) {
    console.error('❌ Failed to load seeds from CSV:', error);
    return [];
  }
}

// 키워드 정규화 (중복 제거용)
export function normalizeKeyword(keyword: string): string {
  return keyword.trim().toLowerCase().replace(/\s+/g, ' ');
}

// 경쟁도 텍스트를 점수로 변환
export function compIdxToScore(compIdx: string): number {
  switch (compIdx) {
    case '낮음': return 100;
    case '중간': return 60;
    case '높음': return 20;
    default: return 50;
  }
}

// 종합점수 계산
export function calculateOverallScore(
  volume: number, 
  compScore: number, 
  adDepth: number, 
  cpc: number
): number {
  // 가중 평균: 조회량 35% + 경쟁도 35% + 광고깊이 20% + CPC 10%
  const normalizedVolume = Math.min(volume / 100000 * 100, 100); // Max 100k volume = 100 points
  const normalizedCpc = Math.min(cpc / 5000 * 100, 100); // Max 5000 CPC = 100 points  
  const normalizedAdDepth = Math.min(adDepth / 10 * 100, 100); // Max 10 depth = 100 points
  
  const score = 
    normalizedVolume * 0.35 + 
    compScore * 0.35 + 
    normalizedAdDepth * 0.20 + 
    normalizedCpc * 0.10;
    
  return Math.round(score);
}

// BFS 크롤러 클래스
export class BFSKeywordCrawler {
  private frontier: Set<string> = new Set();
  private visited: Set<string> = new Set();
  private collected: number = 0;
  private maxTarget: number;
  private maxHops: number;
  private currentHop: number = 0;
  private minVolume: number;
  private hasAdsOnly: boolean;
  private chunkSize: number;
  private concurrency: number;
  
  // Phase 3: 단일 실행 가드용 타임스탬프
  public lastUpdated: Date = new Date();
  public jobId: string = nanoid();
  
  // 진행 상태
  public status: 'idle' | 'running' | 'completed' | 'error' = 'idle';
  public progress = {
    currentHop: 0,
    totalProcessed: 0,
    keywordsFound: 0,
    keywordsSaved: 0,
    frontierSize: 0,
    visitedSize: 0,
    estimatedTimeLeft: '계산 중...'
  };

  constructor(config: {
    target: number;
    maxHops: number;
    minVolume: number;
    hasAdsOnly: boolean;
    chunkSize: number;
    concurrency: number;
    stopIfNoNewPct?: number;
    strict?: boolean;
  }) {
    this.maxTarget = config.target;
    this.maxHops = config.maxHops;
    this.minVolume = config.minVolume;
    this.hasAdsOnly = config.hasAdsOnly;
    this.chunkSize = config.chunkSize;
    this.concurrency = config.concurrency;
    // 새로운 매개변수들은 추후 구현에서 활용 예정
  }

  // 시드 키워드로 frontier 초기화
  public initializeWithSeeds(seeds: string[]) {
    console.log(`🌱 Initializing BFS crawler with ${seeds.length} seed keywords`);
    
    for (const seed of seeds) {
      const normalized = normalizeKeyword(seed);
      if (normalized) {
        this.frontier.add(normalized);
      }
    }
    
    this.progress.frontierSize = this.frontier.size;
    console.log(`✅ Frontier initialized with ${this.frontier.size} unique seeds`);
  }

  // 메인 크롤링 실행
  public async crawl(): Promise<void> {
    if (this.status === 'running') {
      throw new Error('Crawler is already running');
    }
    
    this.status = 'running';
    this.currentHop = 0;
    
    console.log(`🚀 Starting BFS keyword crawl - Target: ${this.maxTarget}, MaxHops: ${this.maxHops}`);
    console.log(`⚙️ Config: minVolume=${this.minVolume}, hasAdsOnly=${this.hasAdsOnly}, chunk=${this.chunkSize}, concurrency=${this.concurrency}`);
    
    try {
      while (
        this.currentHop < this.maxHops && 
        this.collected < this.maxTarget && 
        this.frontier.size > 0
      ) {
        this.currentHop++;
        this.progress.currentHop = this.currentHop;
        
        console.log(`\n🔄 === HOP ${this.currentHop}/${this.maxHops} === (Frontier: ${this.frontier.size}, Collected: ${this.collected}/${this.maxTarget})`);
        
        await this.processCurrentFrontier();
        
        if (this.collected >= this.maxTarget) {
          console.log(`🎯 Target reached: ${this.collected}/${this.maxTarget} keywords collected`);
          break;
        }
      }
      
      this.status = 'completed';
      console.log(`\n✅ BFS crawl completed!`);
      console.log(`📊 Final stats: ${this.collected} keywords collected in ${this.currentHop} hops`);
      
    } catch (error) {
      this.status = 'error';
      console.error('❌ BFS crawl failed:', error);
      throw error;
    }
  }

  // 현재 frontier의 키워드들 처리
  private async processCurrentFrontier(): Promise<void> {
    const currentFrontierArray = Array.from(this.frontier);
    const nextFrontier = new Set<string>();
    
    // 현재 frontier를 chunk 단위로 처리
    for (let i = 0; i < currentFrontierArray.length; i += this.chunkSize) {
      if (this.collected >= this.maxTarget) break;
      
      const chunk = currentFrontierArray.slice(i, i + this.chunkSize);
      console.log(`📦 Processing chunk ${Math.floor(i/this.chunkSize) + 1}/${Math.ceil(currentFrontierArray.length/this.chunkSize)}: ${chunk.length} keywords`);
      
      // Phase 3: 호출 예산 체크
      const budgetCheck = checkAndConsumeCallBudget(1);
      if (!budgetCheck.allowed) {
        console.log(`💳 Call budget exhausted: ${budgetCheck.reason}`);
        await new Promise(resolve => setTimeout(resolve, 60000)); // 1분 대기
        continue;
      }
      
      // Phase 3: lastUpdated 갱신
      this.lastUpdated = new Date();
      
      // 검색량 조회 (health-aware)
      const volumeResult = await getVolumesWithHealth(db, chunk);
      const volumes = volumeResult.volumes;
      const mode = volumeResult.mode;
      
      console.log(`📊 Got volumes for ${Object.keys(volumes).length}/${chunk.length} keywords (mode: ${mode})`);
      
      // 각 키워드 처리
      for (const keyword of chunk) {
        if (this.collected >= this.maxTarget) break;
        
        // visited에 추가
        this.visited.add(keyword);
        this.progress.visitedSize = this.visited.size;
        
        const volumeData = volumes[keyword];
        if (!volumeData) {
          console.log(`⏭️  No volume data for "${keyword}" - skipping`);
          continue;
        }
        
        const rawVolume = volumeData.total || 0;
        const hasAds = (volumeData.plAvgDepth || 0) > 0;
        
        // 필터 적용 - ONLY in searchads mode (Phase 1: 임시 저장 정책)
        if (mode === 'searchads') {
          if (rawVolume < this.minVolume) {
            console.log(`⏭️  "${keyword}" volume ${rawVolume} < ${this.minVolume} - skipping`);
            continue;
          }
          
          if (this.hasAdsOnly && !hasAds) {
            console.log(`⏭️  "${keyword}" has no ads - skipping`);
            continue;
          }
        } else {
          console.log(`📝 "${keyword}" saving with raw_volume=${rawVolume} (${mode} mode - no filters)`);
        }
        
        // 키워드 저장 (Phase 1: 임시 저장 정책)
        const overallScore = mode === 'searchads' 
          ? calculateOverallScore(
              rawVolume,
              compIdxToScore(volumeData.compIdx || '중간'),
              volumeData.plAvgDepth || 0,
              volumeData.avePcCpc || 0
            )
          : 40; // 임시 보수적 점수 for fallback/partial mode
        
        const keywordData = {
          text: keyword,
          raw_volume: mode === 'searchads' ? rawVolume : 0, // fallback/partial에서는 0으로 저장
          comp_idx: volumeData.compIdx || '중간',
          ad_depth: volumeData.plAvgDepth || 0,
          est_cpc_krw: volumeData.avePcCpc || 0,
          score: overallScore,
          excluded: false
        };
        
        await upsertMany([keywordData]);
        this.collected++;
        this.progress.keywordsSaved = this.collected;
        
        console.log(`✅ Saved "${keyword}" (Vol: ${rawVolume.toLocaleString()}, Score: ${overallScore}) [${this.collected}/${this.maxTarget}]`);
        
        // 연관 키워드를 다음 frontier에 추가 (구현 필요 시)
        // 현재는 시드 키워드만으로 진행
      }
      
      // 동시성 제어 - 잠시 대기
      if (this.concurrency === 1) {
        await new Promise(resolve => setTimeout(resolve, 1000)); // 1초 대기
      }
    }
    
    // frontier 업데이트
    this.frontier = nextFrontier;
    this.progress.frontierSize = this.frontier.size;
    this.progress.totalProcessed = this.visited.size;
  }

  // 진행 상태 반환
  public getProgress() {
    return {
      ...this.progress,
      status: this.status,
      collected: this.collected,
      maxTarget: this.maxTarget,
      currentHop: this.currentHop,
      maxHops: this.maxHops
    };
  }

  // 크롤링 중단
  public stop() {
    if (this.status === 'running') {
      this.status = 'idle';
      console.log('🛑 BFS crawl stopped by user');
    }
  }
}

// 글로벌 크롤러 인스턴스
let globalCrawler: BFSKeywordCrawler | null = null;

export function getGlobalCrawler(): BFSKeywordCrawler | null {
  return globalCrawler;
}

export function createGlobalCrawler(config: {
  target: number;
  maxHops: number;
  minVolume: number;
  hasAdsOnly: boolean;
  chunkSize: number;
  concurrency: number;
  stopIfNoNewPct?: number;
  strict?: boolean;
}): BFSKeywordCrawler {
  globalCrawler = new BFSKeywordCrawler(config);
  return globalCrawler;
}

export function clearGlobalCrawler() {
  globalCrawler = null;
}

// Phase 3: Call budget management
interface CallBudgetStatus {
  dailyRemaining: number;
  perMinuteRemaining: number;
  dailyLimit: number;
  perMinuteLimit: number;
  resetAt: Date;
}

// Simple in-memory call tracking (resets on server restart)
let dailyCallCount = 0;
let minuteCallCount = 0;
let lastMinuteReset = Date.now();
let lastDayReset = Date.now();

const DAILY_CALL_LIMIT = 2000;
const PER_MINUTE_LIMIT = 40;

export function checkAndConsumeCallBudget(calls: number = 1): boolean {
  const now = Date.now();
  
  // Reset minute counter if needed
  if (now - lastMinuteReset >= 60000) {
    minuteCallCount = 0;
    lastMinuteReset = now;
  }
  
  // Reset daily counter if needed  
  if (now - lastDayReset >= 86400000) {
    dailyCallCount = 0;
    lastDayReset = now;
  }
  
  // Check if we can make the calls
  if (minuteCallCount + calls > PER_MINUTE_LIMIT) {
    return false;
  }
  
  if (dailyCallCount + calls > DAILY_CALL_LIMIT) {
    return false;
  }
  
  // Consume the calls
  minuteCallCount += calls;
  dailyCallCount += calls;
  
  return true;
}

export function getCallBudgetStatus(): CallBudgetStatus {
  const now = Date.now();
  
  // Calculate next reset times
  const nextMinuteReset = new Date(lastMinuteReset + 60000);
  const nextDayReset = new Date(lastDayReset + 86400000);
  
  return {
    dailyRemaining: Math.max(0, DAILY_CALL_LIMIT - dailyCallCount),
    perMinuteRemaining: Math.max(0, PER_MINUTE_LIMIT - minuteCallCount),
    dailyLimit: DAILY_CALL_LIMIT,
    perMinuteLimit: PER_MINUTE_LIMIT,
    resetAt: nextMinuteReset < nextDayReset ? nextMinuteReset : nextDayReset
  };
}

// Phase 3: Stale crawler detection
export function isStale(crawler: BFSKeywordCrawler | null): boolean {
  if (!crawler || !crawler.lastUpdated) {
    return false;
  }
  
  const STALE_THRESHOLD = 5 * 60 * 1000; // 5 minutes
  return Date.now() - crawler.lastUpdated > STALE_THRESHOLD;
}