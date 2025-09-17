import { Phase2Engine, Phase2Context, Candidate, Tier, applyScoreFirstGate } from "../types";
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
    const enrichedCandidates: Candidate[] = [];
    
    for (const candidate of candidates) {
      // Apply Score-First Gate
      const gatedCandidate = await applyScoreFirstGate(candidate, cfg);
      
      // Calculate final score
      gatedCandidate.totalScore = this.calculateTotalScore(gatedCandidate, cfg);
      
      enrichedCandidates.push(gatedCandidate);
    }
    
    return enrichedCandidates;
  }

  assignTiers(candidates: Candidate[], cfg: AlgoConfig): Tier[] {
    const { tiersPerPost } = cfg.phase2;
    
    // Sort candidates by total score (descending)
    const sorted = [...candidates].sort((a, b) => (b.totalScore || 0) - (a.totalScore || 0));
    
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
    console.log(`📊 [LK Engine] Returning ${tiers.length}/${tiersPerPost} actual candidate tiers`);

    return tiers.filter(tier => tier.candidate && tier.candidate.text && tier.candidate.text.trim().length > 0);
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
    // In Score-First Gate system, use AdScore as primary score if available
    if (candidate.adScore !== undefined && candidate.adScore > 0) {
      return candidate.adScore;
    }
    
    // Fallback to legacy content-based scoring
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