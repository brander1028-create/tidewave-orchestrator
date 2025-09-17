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
    // Previously tierAutoFill would create empty candidates with text=""
    // Now we only return actual candidates found, vFinal pipeline handles missing tiers
    console.log(`📊 [N-grams Engine] Returning ${tiers.length}/${tiersPerPost} actual candidate tiers`);

    return tiers.filter(tier => tier.candidate && tier.candidate.text && tier.candidate.text.trim().length > 0);
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