import { Phase2Engine, Phase2Context, Candidate, Tier, applyScoreFirstGate } from "../types";
import { AlgoConfig } from "@shared/config-schema";

// NGrams Engine - pure N-gram based keyword extraction
export class NgramsEngine implements Phase2Engine {
  name = "ngrams" as const;

  generateCandidates(ctx: Phase2Context, cfg: AlgoConfig): Candidate[] {
    const { title } = ctx;
    const { allowThreeGram, banSingles } = cfg.phase2;
    
    const candidates: Candidate[] = [];
    const chars = title.replace(/\s+/g, ''); // Remove spaces for character-level n-grams
    
    // Generate character-level n-grams (2-5 chars)
    for (let n = 2; n <= 5; n++) {
      for (let i = 0; i <= chars.length - n; i++) {
        const ngram = chars.substring(i, i + n);
        if (this.isValidNgram(ngram) && !banSingles.includes(ngram)) {
          const existing = candidates.find(c => c.text === ngram);
          if (existing) {
            existing.frequency += 1;
          } else {
            candidates.push({
              text: ngram,
              frequency: 1,
              position: i,
              length: n,
              compound: n > 2,
            });
          }
        }
      }
    }

    // Generate word-level n-grams
    const words = title.split(/\s+/);
    for (let n = 1; n <= (allowThreeGram ? 3 : 2); n++) {
      for (let i = 0; i <= words.length - n; i++) {
        const ngram = words.slice(i, i + n).join("");
        if (this.isValidNgram(ngram) && !banSingles.includes(ngram)) {
          const existing = candidates.find(c => c.text === ngram);
          if (existing) {
            existing.frequency += 1;
          } else {
            candidates.push({
              text: ngram,
              frequency: 1,
              position: i,
              length: ngram.length,
              compound: n > 1,
            });
          }
        }
      }
    }

    return this.filterAndRankCandidates(candidates, cfg);
  }

  async enrichAndScore(candidates: Candidate[], cfg: AlgoConfig): Promise<Candidate[]> {
    const enrichedCandidates: Candidate[] = [];
    
    for (const candidate of candidates) {
      // Apply Score-First Gate
      const gatedCandidate = await applyScoreFirstGate(candidate, cfg);
      
      // Calculate N-gram specific score
      gatedCandidate.totalScore = this.calculateNgramScore(gatedCandidate, cfg);
      
      enrichedCandidates.push(gatedCandidate);
    }
    
    return enrichedCandidates;
  }

  assignTiers(candidates: Candidate[], cfg: AlgoConfig): Tier[] {
    const { tiersPerPost } = cfg.phase2;
    
    // Sort by frequency and score
    const sorted = [...candidates].sort((a, b) => {
      const scoreA = (a.totalScore || 0) + (a.frequency * 0.1);
      const scoreB = (b.totalScore || 0) + (b.frequency * 0.1);
      return scoreB - scoreA;
    });
    
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

    // Fill empty tiers if needed
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

  private isValidNgram(ngram: string): boolean {
    // Must contain at least one Korean character
    if (!/[가-힣]/.test(ngram)) return false;
    
    // Must be at least 2 characters
    if (ngram.length < 2) return false;
    
    // Must not be all numbers or special characters
    if (/^[0-9\W]+$/.test(ngram)) return false;
    
    return true;
  }

  private filterAndRankCandidates(candidates: Candidate[], cfg: AlgoConfig): Candidate[] {
    // Filter by minimum frequency and length
    const filtered = candidates.filter(candidate => {
      return candidate.frequency >= 1 && 
             candidate.length >= 2 && 
             candidate.length <= 10;
    });

    // Deduplicate similar n-grams
    return this.deduplicateBySubstring(filtered);
  }

  private deduplicateBySubstring(candidates: Candidate[]): Candidate[] {
    const result: Candidate[] = [];
    const sorted = [...candidates].sort((a, b) => b.frequency - a.frequency);

    for (const candidate of sorted) {
      const isDuplicate = result.some(existing => 
        existing.text.includes(candidate.text) || 
        candidate.text.includes(existing.text)
      );
      
      if (!isDuplicate) {
        result.push(candidate);
      }
    }

    return result;
  }

  private calculateNgramScore(candidate: Candidate, cfg: AlgoConfig): number {
    const frequencyScore = Math.min(candidate.frequency / 5, 1); // Normalize frequency
    const lengthScore = this.getLengthScore(candidate.length);
    const positionScore = 1 - (candidate.position / 20); // Earlier position = higher score
    
    return frequencyScore * cfg.contentWeights.freq + 
           lengthScore * cfg.contentWeights.len + 
           positionScore * cfg.contentWeights.pos;
  }

  private getLengthScore(length: number): number {
    // Optimal length for Korean keywords is 2-4 characters
    if (length >= 2 && length <= 4) return 1.0;
    if (length === 5) return 0.8;
    if (length === 6) return 0.6;
    return 0.4;
  }
}

export const ngramsEngine = new NgramsEngine();