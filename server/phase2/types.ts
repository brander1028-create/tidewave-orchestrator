import { AlgoConfig } from "@shared/config-schema";

// Score-First Gate helper function
export async function applyScoreFirstGate(
  candidate: Candidate, 
  cfg: AlgoConfig
): Promise<Candidate> {
  let enrichedCandidate = { ...candidate };
  
  if (cfg.features.scoreFirstGate) {
    try {
      // Import AdScore engine dynamically
      const { calculateAdScore, checkGateEligibility } = await import('../services/adscore-engine');
      
      // Prepare keyword metrics - mock for now, would need actual data
      const metrics = {
        volume: candidate.volume || 0,
        competition: 0.5, // Mock competition
        adDepth: 2, // Mock ad depth 
        cpc: 100 // Mock CPC
      };
      
      // Configure AdScore from settings
      const weights = {
        volume: cfg.adscore.wVolume,
        competition: cfg.adscore.wCompetition,
        adDepth: cfg.adscore.wAdDepth,
        cpc: cfg.adscore.wCpc
      };
      
      const thresholds = {
        scoreMin: cfg.adscore.SCORE_MIN,
        volumeMin: cfg.adscore.VOL_MIN,
        adDepthMin: cfg.adscore.AD_DEPTH_MIN,
        cpcMin: cfg.adscore.CPC_MIN
      };
      
      const gateConfig = {
        mode: cfg.adscore.mode,
        forceFill: cfg.adscore.forceFill
      };
      
      // Calculate AdScore
      const adScoreResult = calculateAdScore(metrics, weights);
      
      // Check gate eligibility  
      const eligibilityResult = checkGateEligibility(metrics, adScoreResult.adScore, thresholds);
      
      // Apply gate results
      enrichedCandidate.eligible = eligibilityResult.eligible;
      enrichedCandidate.adScore = adScoreResult.adScore;
      enrichedCandidate.skipReason = eligibilityResult.skipReason;
      
      if (cfg.features.log_calculations && !eligibilityResult.eligible) {
        console.log(`🚫 [Score-First Gate] "${candidate.text}" filtered: ${eligibilityResult.skipReason}`);
      }
      
    } catch (error) {
      console.error(`❌ [Score-First Gate] Error evaluating "${candidate.text}":`, error);
      // Fallback: allow candidate through
      enrichedCandidate.eligible = true;
      enrichedCandidate.skipReason = "AdScore evaluation failed";
    }
  } else {
    // Gate disabled, all candidates pass
    enrichedCandidate.eligible = true;
  }
  
  return enrichedCandidate;
}

// Candidate keyword for Phase2 processing
export interface Candidate {
  text: string;
  volume?: number | null;
  frequency: number;
  position: number; // Position in title (0-based)
  length: number; // Text length
  compound: boolean; // Is compound phrase
  category?: string; // Category classification
  rank?: number | null; // SERP rank
  totalScore?: number; // Combined score
  eligible?: boolean; // AdScore gate eligibility
  adScore?: number; // AdScore value
  skipReason?: string; // Reason for skipping
}

// Tier assignment result
export interface Tier {
  tier: number;
  text: string;
  volume: number | null;
  rank: number | null;
  score: number;
  eligible?: boolean;
  adScore?: number;
  skipReason?: string;
}

// Phase2 processing context
export interface Phase2Context {
  title: string;
  blogId: string;
  postId: string;
  inputKeyword: string;
  jobId: string;
}

// Phase2 Engine interface
export interface Phase2Engine {
  name: "lk" | "ngrams" | "hybrid";
  
  // Generate candidate keywords from title
  generateCandidates(ctx: Phase2Context, cfg: AlgoConfig): Candidate[];
  
  // Enrich candidates with volume data and calculate scores
  enrichAndScore(candidates: Candidate[], cfg: AlgoConfig): Promise<Candidate[]>;
  
  // Assign candidates to tiers based on configuration
  assignTiers(candidates: Candidate[], cfg: AlgoConfig): Tier[];
}