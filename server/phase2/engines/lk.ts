import { Phase2Engine, Phase2Context, Candidate, Tier } from "../types";
import { AlgoConfig } from "@shared/config-schema";

// LK (Local + Keyword) Engine - based on existing title extraction logic
export class LKEngine implements Phase2Engine {
  name = "lk" as const;

  generateCandidates(ctx: Phase2Context, cfg: AlgoConfig): Candidate[] {
    const { title } = ctx;
    const { preferCompound, allowThreeGram, cats, banSingles, VOL_MIN } = cfg.phase2;
    
    const candidates: Candidate[] = [];
    const words = title.split(/\s+/);
    
    // Generate 1-gram candidates
    words.forEach((word, index) => {
      const cleanWord = this.cleanWord(word);
      if (cleanWord && !banSingles.includes(cleanWord)) {
        candidates.push({
          text: cleanWord,
          frequency: 1,
          position: index,
          length: cleanWord.length,
          compound: false,
        });
      }
    });

    // Generate 2-gram candidates
    for (let i = 0; i < words.length - 1; i++) {
      const bigram = words.slice(i, i + 2).join(" ");
      const cleanBigram = this.cleanWord(bigram);
      if (cleanBigram) {
        candidates.push({
          text: cleanBigram,
          frequency: 1,
          position: i,
          length: cleanBigram.length,
          compound: true,
        });
      }
    }

    // Generate 3-gram candidates if allowed
    if (allowThreeGram) {
      for (let i = 0; i < words.length - 2; i++) {
        const trigram = words.slice(i, i + 3).join(" ");
        const cleanTrigram = this.cleanWord(trigram);
        if (cleanTrigram) {
          candidates.push({
            text: cleanTrigram,
            frequency: 1,
            position: i,
            length: cleanTrigram.length,
            compound: true,
          });
        }
      }
    }

    // Category classification
    candidates.forEach(candidate => {
      candidate.category = this.classifyCategory(candidate.text, cats);
    });

    // Apply preferCompound preference
    if (preferCompound) {
      candidates.forEach(candidate => {
        if (candidate.compound) {
          candidate.frequency += 0.5; // Boost compound candidates
        }
      });
    }

    return this.deduplicateCandidates(candidates);
  }

  async enrichAndScore(candidates: Candidate[], cfg: AlgoConfig): Promise<Candidate[]> {
    // This would be implemented to call the existing volume enrichment logic
    // For now, return candidates with mock scores
    return candidates.map(candidate => ({
      ...candidate,
      volume: candidate.volume || null,
      totalScore: this.calculateTotalScore(candidate, cfg),
    }));
  }

  assignTiers(candidates: Candidate[], cfg: AlgoConfig): Tier[] {
    const { tiersPerPost } = cfg.phase2;
    
    // Sort candidates by total score (descending)
    const sorted = [...candidates].sort((a, b) => (b.totalScore || 0) - (a.totalScore || 0));
    
    const tiers: Tier[] = [];
    
    for (let i = 0; i < Math.min(tiersPerPost, sorted.length); i++) {
      const candidate = sorted[i];
      tiers.push({
        tier: i + 1,
        text: candidate.text,
        volume: candidate.volume || null,
        rank: candidate.rank || null,
        score: candidate.totalScore || 0,
        eligible: candidate.eligible,
        adScore: candidate.adScore,
        skipReason: candidate.skipReason,
      });
    }

    // Fill empty tiers if needed and tierAutoFill is enabled
    if (cfg.features.tierAutoFill) {
      while (tiers.length < tiersPerPost) {
        tiers.push({
          tier: tiers.length + 1,
          text: "",
          volume: null,
          rank: null,
          score: 0,
        });
      }
    }

    return tiers;
  }

  private cleanWord(word: string): string {
    // Remove special characters, keep Korean and English
    const cleaned = word.replace(/[^\w가-힣\s]/g, "").trim();
    return cleaned.length >= 2 ? cleaned : "";
  }

  private classifyCategory(text: string, categories: string[]): string {
    for (const category of categories) {
      if (text.includes(category)) {
        return category;
      }
    }
    return "기타";
  }

  private calculateTotalScore(candidate: Candidate, cfg: AlgoConfig): number {
    const volumeScore = (candidate.volume || 0) / 100000; // Normalize volume
    const positionScore = 1 - (candidate.position / 10); // Earlier position = higher score
    const lengthScore = Math.min(candidate.length / 10, 1); // Longer text = higher score
    const compoundBonus = candidate.compound ? 0.2 : 0;
    
    return volumeScore * cfg.weights.volume + 
           (positionScore * cfg.contentWeights.pos + 
            lengthScore * cfg.contentWeights.len + 
            candidate.frequency * cfg.contentWeights.freq) * cfg.weights.content +
           compoundBonus;
  }

  private deduplicateCandidates(candidates: Candidate[]): Candidate[] {
    const seen = new Set<string>();
    return candidates.filter(candidate => {
      const normalized = candidate.text.toLowerCase().trim();
      if (seen.has(normalized)) {
        return false;
      }
      seen.add(normalized);
      return true;
    });
  }
}

export const lkEngine = new LKEngine();