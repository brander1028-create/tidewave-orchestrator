import { Phase2Engine, Phase2Context, Candidate, Tier } from "./types";
import { AlgoConfig } from "@shared/config-schema";
import { lkEngine } from "./engines/lk";
import { ngramsEngine } from "./engines/ngrams";
import { hybridEngine } from "./engines/hybrid";

// Phase2 Engine Registry
export const engineRegistry = new Map<string, Phase2Engine>([
  ["lk", lkEngine],
  ["ngrams", ngramsEngine], 
  ["hybrid", hybridEngine],
]);

// Main Phase2 execution function
export async function runPhase2(
  ctx: Phase2Context, 
  cfg: AlgoConfig
): Promise<Tier[]> {
  try {
    // Get the configured engine
    const engine = engineRegistry.get(cfg.phase2.engine) ?? engineRegistry.get("lk")!;
    
    if (cfg.features.log_calculations) {
      console.log(`🔧 [Phase2] Using engine: ${engine.name} for "${ctx.title}"`);
    }
    
    // Step 1: Generate candidates
    const candidates = engine.generateCandidates(ctx, cfg);
    
    if (cfg.features.log_calculations) {
      console.log(`📊 [Phase2] Generated ${candidates.length} candidates: ${candidates.slice(0, 3).map(c => c.text).join(", ")}...`);
    }
    
    // Step 2: Enrich with volume data and calculate scores
    const enrichedCandidates = await engine.enrichAndScore(candidates, cfg);
    
    if (cfg.features.log_calculations) {
      const topCandidates = enrichedCandidates
        .filter(c => c.totalScore && c.totalScore > 0)
        .slice(0, 3);
      console.log(`💰 [Phase2] Top scored candidates: ${topCandidates.map(c => `${c.text}(${c.totalScore?.toFixed(2)})`).join(", ")}`);
    }
    
    // Step 3: Assign to tiers
    const tiers = engine.assignTiers(enrichedCandidates, cfg);
    
    if (cfg.features.log_calculations) {
      console.log(`🎯 [Phase2] Assigned ${tiers.length} tiers: ${tiers.map(t => `T${t.tier}:${t.candidate?.text || 'empty'}`).join(", ")}`);
    }
    
    return tiers;
    
  } catch (error) {
    console.error(`❌ [Phase2] Error in engine ${cfg.phase2.engine}:`, error);
    
    // Fallback to LK engine
    if (cfg.phase2.engine !== "lk") {
      console.log(`🔄 [Phase2] Falling back to LK engine`);
      const fallbackEngine = engineRegistry.get("lk")!;
      const candidates = fallbackEngine.generateCandidates(ctx, cfg);
      const enriched = await fallbackEngine.enrichAndScore(candidates, cfg);
      return fallbackEngine.assignTiers(enriched, cfg);
    }
    
    throw error;
  }
}

// Get available engines
export function getAvailableEngines(): string[] {
  return Array.from(engineRegistry.keys());
}

// Engine info for admin UI
export function getEngineInfo(engineName: string): { 
  name: string; 
  description: string; 
  features: string[]; 
} | null {
  const descriptions = {
    lk: {
      name: "LK (Local + Keyword)",
      description: "Word-based extraction with category classification and compound preference",
      features: ["Category Classification", "Compound Preference", "Position Weighting", "Ban List Support"]
    },
    ngrams: {
      name: "N-grams",
      description: "Character and word-level n-gram extraction with frequency analysis", 
      features: ["Character N-grams", "Word N-grams", "Frequency Analysis", "Substring Deduplication"]
    },
    hybrid: {
      name: "Hybrid",
      description: "Combines LK and N-grams approaches with intelligent merging",
      features: ["Dual Approach", "Score Combination", "Intelligent Tier Filling", "Quality Filtering"]
    }
  };
  
  return descriptions[engineName as keyof typeof descriptions] || null;
}

// Engine validation - check if engine is available and working
export async function validateEngine(engineName: string): Promise<{
  valid: boolean;
  error?: string;
}> {
  try {
    const engine = engineRegistry.get(engineName);
    if (!engine) {
      return { valid: false, error: `Engine '${engineName}' not found` };
    }
    
    // Test basic functionality
    const testCtx: Phase2Context = {
      title: "테스트 제품 효능 비교 후기",
      blogId: "test",
      postId: "test",
      inputKeyword: "테스트",
      jobId: "test"
    };
    
    const testCfg: AlgoConfig = {
      phase2: {
        engine: engineName as any,
        postsPerBlog: 10,
        tiersPerPost: 4,
        preferCompound: true,
        allowThreeGram: true,
        cats: ["효능", "비교"],
        banSingles: ["테스트"],
        VOL_MIN: 600
      },
      weights: { volume: 0.7, content: 0.3 },
      contentWeights: { freq: 0.5, pos: 0.3, len: 0.2 },
      adscore: {
        wVolume: 0.35, wCompetition: 0.35, wAdDepth: 0.20, wCpc: 0.10,
        SCORE_MIN: 0.55, VOL_MIN: 600, AD_DEPTH_MIN: 1, CPC_MIN: 0,
        mode: "hard", forceFill: true
      },
      features: {
        preEnrich: true, scoreFirstGate: true, tierAutoFill: true,
        log_calculations: false, canary: { enabled: false, ratio: 0.2, keywords: [] }
      }
    };
    
    const candidates = engine.generateCandidates(testCtx, testCfg);
    if (!Array.isArray(candidates)) {
      return { valid: false, error: "Engine did not return candidate array" };
    }
    
    const enriched = await engine.enrichAndScore(candidates, testCfg);
    if (!Array.isArray(enriched)) {
      return { valid: false, error: "Engine did not return enriched array" };
    }
    
    const tiers = engine.assignTiers(enriched, testCfg);
    if (!Array.isArray(tiers) || tiers.length === 0) {
      return { valid: false, error: "Engine did not return tier array" };
    }
    
    return { valid: true };
    
  } catch (error) {
    return { 
      valid: false, 
      error: error instanceof Error ? error.message : "Unknown validation error"
    };
  }
}

// Export all engines for direct access if needed
export { lkEngine, ngramsEngine, hybridEngine };
export type { Phase2Engine, Phase2Context, Candidate, Tier };