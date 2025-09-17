import { Phase2Engine, Phase2Context, Candidate, Tier, applyScoreFirstGate } from "../types";
import { AlgoConfig } from "@shared/config-schema";
import { lkEngine } from "./lk";
import { ngramsEngine } from "./ngrams";

// Hybrid Engine - combines LK and NGrams approaches
export class HybridEngine implements Phase2Engine {
  name = "hybrid" as const;

  generateCandidates(ctx: Phase2Context, cfg: AlgoConfig): Candidate[] {
    // Get candidates from both engines
    const lkCandidates = lkEngine.generateCandidates(ctx, cfg);
    const ngramCandidates = ngramsEngine.generateCandidates(ctx, cfg);
    
    // Merge and deduplicate candidates
    const candidateMap = new Map<string, Candidate>();
    
    // Add LK candidates with preference weight
    lkCandidates.forEach(candidate => {
      candidateMap.set(candidate.text, {
        ...candidate,
        frequency: candidate.frequency * 1.2, // Boost LK candidates
      });
    });
    
    // Add or merge N-gram candidates
    ngramCandidates.forEach(candidate => {
      const existing = candidateMap.get(candidate.text);
      if (existing) {
        // Merge: take highest frequency and combine scores
        candidateMap.set(candidate.text, {
          ...existing,
          frequency: Math.max(existing.frequency, candidate.frequency) + 0.5,
          compound: existing.compound || candidate.compound,
          position: Math.min(existing.position, candidate.position), // Earlier position
        });
      } else {
        candidateMap.set(candidate.text, candidate);
      }
    });

    const mergedCandidates = Array.from(candidateMap.values());
    
    // Apply hybrid-specific filtering and ranking
    return this.applyHybridRanking(mergedCandidates, cfg);
  }

  async enrichAndScore(candidates: Candidate[], cfg: AlgoConfig): Promise<Candidate[]> {
    const enrichedCandidates: Candidate[] = [];
    
    for (const candidate of candidates) {
      // Apply Score-First Gate first
      const gatedCandidate = await applyScoreFirstGate(candidate, cfg);
      
      // Calculate hybrid score by combining base scoring approaches
      const baseScore = this.calculateHybridRankScore(gatedCandidate, cfg);
      
      // Apply hybrid weighting
      gatedCandidate.totalScore = baseScore;
      
      enrichedCandidates.push(gatedCandidate);
    }
    
    return enrichedCandidates;
  }

  assignTiers(candidates: Candidate[], cfg: AlgoConfig): Tier[] {
    const { tiersPerPost } = cfg.phase2;
    
    // Hybrid sorting: combine total score, frequency, and compound preference
    const sorted = [...candidates].sort((a, b) => {
      const scoreA = this.calculateHybridRankScore(a, cfg);
      const scoreB = this.calculateHybridRankScore(b, cfg);
      return scoreB - scoreA;
    });
    
    // 제목 단계는 soft지만, 최종 선정 직전 최소조건 1줄 추가
    const MIN_VOL = 10;
    const MIN_ADS = (cfg.adscore?.SCORE_MIN ?? 0.35);
    const pool = sorted.filter(k => (k.volume ?? 0) >= MIN_VOL || (k.adScore ?? 0) >= MIN_ADS);
    const topK = (pool.length ? pool : sorted.slice(0, 1))  // 그래도 없으면 1개는 남기되
                      .slice(0, tiersPerPost);                         // 최대 tiersPerPost개로 제한
    
    const tiers: Tier[] = [];
    
    for (let i = 0; i < topK.length; i++) {
      const candidate = topK[i];
      tiers.push({
        tier: i + 1,
        candidate: candidate,  // ✅ Wrap candidate in candidate property
        score: candidate.totalScore || 0,
      });
    }

    // ★ Empty tier creation removed to fix vFinal filtering issues
    // Apply intelligent tier filling only with real candidates
    if (cfg.features.tierAutoFill && cfg.phase2.preferCompound) {
      this.fillTiersIntelligently(tiers, sorted, tiersPerPost);
    }
    // Note: Standard empty tier filling removed - vFinal pipeline handles missing tiers
    console.log(`📊 [Hybrid Engine] Returning ${tiers.length}/${tiersPerPost} actual candidate tiers`);

    return tiers.filter(tier => tier.candidate && tier.candidate.text && tier.candidate.text.trim().length > 0);
  }

  private applyHybridRanking(candidates: Candidate[], cfg: AlgoConfig): Candidate[] {
    // Apply quality filters
    const filtered = candidates.filter(candidate => {
      // Minimum quality thresholds
      return candidate.length >= 2 && 
             candidate.length <= 15 && 
             candidate.frequency > 0 &&
             this.isQualityCandidate(candidate);
    });

    // Boost candidates that appear in both approaches
    filtered.forEach(candidate => {
      if (candidate.frequency > 2) { // Likely from both engines
        candidate.frequency += 1; // Boost merged candidates
      }
    });

    return filtered;
  }

  private isQualityCandidate(candidate: Candidate): boolean {
    // Must contain Korean characters
    if (!/[가-힣]/.test(candidate.text)) return false;
    
    // Avoid obvious non-keywords
    const lowQualityPatterns = /^[0-9]+$|^[ㄱ-ㅎㅏ-ㅣ]+$|^[a-zA-Z]+$/;
    if (lowQualityPatterns.test(candidate.text)) return false;
    
    // Avoid single character repeats
    if (/^(.)\1+$/.test(candidate.text)) return false;
    
    return true;
  }

  private calculateHybridRankScore(candidate: Candidate, cfg: AlgoConfig): number {
    const baseScore = candidate.totalScore || 0;
    const frequencyBoost = Math.min(candidate.frequency / 3, 1) * 0.2;
    const compoundBonus = candidate.compound && cfg.phase2.preferCompound ? 0.15 : 0;
    const lengthPenalty = candidate.length > 10 ? -0.1 : 0;
    const categoryBonus = cfg.phase2.cats.some(cat => candidate.text.includes(cat)) ? 0.1 : 0;
    
    return baseScore + frequencyBoost + compoundBonus + lengthPenalty + categoryBonus;
  }

  private fillTiersIntelligently(tiers: Tier[], sortedCandidates: Candidate[], maxTiers: number): void {
    // Try to ensure tier diversity (mix of compound and simple terms)
    const remainingCandidates = sortedCandidates.slice(tiers.length);
    
    while (tiers.length < maxTiers && remainingCandidates.length > 0) {
      let nextCandidate: Candidate | null = null;
      
      // Try to maintain balance between compound and simple terms
      const hasCompound = tiers.some(tier => tier.candidate.text.includes(" ") || tier.candidate.text.length > 4);
      const hasSimple = tiers.some(tier => !tier.candidate.text.includes(" ") && tier.candidate.text.length <= 4);
      
      if (!hasCompound) {
        nextCandidate = remainingCandidates.find(c => c.compound) || remainingCandidates[0];
      } else if (!hasSimple) {
        nextCandidate = remainingCandidates.find(c => !c.compound) || remainingCandidates[0];
      } else {
        nextCandidate = remainingCandidates[0];
      }
      
      if (nextCandidate) {
        tiers.push({
          tier: tiers.length + 1,
          candidate: nextCandidate,
          score: nextCandidate.totalScore || 0,
        });
        
        // Remove from remaining
        const index = remainingCandidates.indexOf(nextCandidate);
        remainingCandidates.splice(index, 1);
      } else {
        break;
      }
    }
    
    // Fill any remaining empty tiers
    while (tiers.length < maxTiers) {
      const emptyCandidate: Candidate = {
        text: "",
        frequency: 0,
        position: 0,
        length: 0,
        compound: false,
        volume: null,
        rank: null,
        totalScore: 0,
        eligible: true,
      };
      
      tiers.push({
        tier: tiers.length + 1,
        candidate: emptyCandidate,
        score: 0,
      });
    }
  }
}

export const hybridEngine = new HybridEngine();