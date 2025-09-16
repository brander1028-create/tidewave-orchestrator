import { AlgoConfig } from "@shared/config-schema";

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