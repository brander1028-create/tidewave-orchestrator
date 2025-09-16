import { z } from "zod";

// v17: Algo config schema with pluggable Phase2 engines
export const algoConfigSchema = z.object({
  phase2: z.object({
    engine: z.enum(["lk", "ngrams", "hybrid"]),
    postsPerBlog: z.number().int().min(1).max(50).default(10),
    tiersPerPost: z.number().int().min(1).max(10).default(4),
    preferCompound: z.boolean().default(true),
    allowThreeGram: z.boolean().default(true),
    cats: z.array(z.string()).default(["성분","효과","복용법","비교","가격","부작용"]),
    banSingles: z.array(z.string()).default(["맛집","추천","방법","정리","여자","남자","바르"]),
    VOL_MIN: z.number().int().min(0).default(600),
  }),
  
  weights: z.object({
    volume: z.number().min(0).max(1),
    content: z.number().min(0).max(1),
  }).refine(data => Math.abs((data.volume + data.content) - 1.0) < 0.001, {
    message: "Volume and content weights must sum to 1.0",
  }),
  
  contentWeights: z.object({
    freq: z.number().min(0).max(1),
    pos: z.number().min(0).max(1),
    len: z.number().min(0).max(1),
  }).refine(data => Math.abs((data.freq + data.pos + data.len) - 1.0) < 0.001, {
    message: "Content weights (freq + pos + len) must sum to 1.0",
  }),
  
  adscore: z.object({
    wVolume: z.number().min(0).max(1),
    wCompetition: z.number().min(0).max(1),
    wAdDepth: z.number().min(0).max(1),
    wCpc: z.number().min(0).max(1),
    SCORE_MIN: z.number().min(0).max(1).default(0.55),
    VOL_MIN: z.number().int().min(0).default(600),
    AD_DEPTH_MIN: z.number().min(0).default(1),
    CPC_MIN: z.number().min(0).default(0),
    mode: z.enum(["hard", "soft"]).default("hard"),
    forceFill: z.boolean().default(true),
  }).refine(data => Math.abs((data.wVolume + data.wCompetition + data.wAdDepth + data.wCpc) - 1.0) < 0.001, {
    message: "AdScore weights (wVolume + wCompetition + wAdDepth + wCpc) must sum to 1.0",
  }),
  
  features: z.object({
    preEnrich: z.boolean().default(true),
    scoreFirstGate: z.boolean().default(true),
    tierAutoFill: z.boolean().default(true),
    log_calculations: z.boolean().default(true),
    canary: z.object({
      enabled: z.boolean().default(false),
      ratio: z.number().min(0).max(1).default(0.2),
      keywords: z.array(z.string()).default([]),
    }),
  }),
});

export type AlgoConfig = z.infer<typeof algoConfigSchema>;

// Default configuration based on v17 requirements
export const defaultAlgoConfig: AlgoConfig = {
  phase2: {
    engine: "lk",
    postsPerBlog: 10,
    tiersPerPost: 4,
    preferCompound: true,
    allowThreeGram: true,
    cats: ["성분","효과","복용법","비교","가격","부작용"],
    banSingles: ["맛집","추천","방법","정리","여자","남자","바르"],
    VOL_MIN: 600,
  },
  weights: {
    volume: 0.70,
    content: 0.30,
  },
  contentWeights: {
    freq: 0.5,
    pos: 0.3,
    len: 0.2,
  },
  adscore: {
    wVolume: 0.35,
    wCompetition: 0.35,
    wAdDepth: 0.20,
    wCpc: 0.10,
    SCORE_MIN: 0.55,
    VOL_MIN: 600,
    AD_DEPTH_MIN: 1,
    CPC_MIN: 0,
    mode: "hard",
    forceFill: true,
  },
  features: {
    preEnrich: true,
    scoreFirstGate: true,
    tierAutoFill: true,
    log_calculations: true,
    canary: {
      enabled: false,
      ratio: 0.2,
      keywords: [],
    },
  },
};

// Settings API schemas
export const updateSettingsSchema = z.object({
  json: algoConfigSchema,
  updatedBy: z.string().default("admin"),
  note: z.string().optional(),
});

export const rollbackSettingsSchema = z.object({
  key: z.string(),
  version: z.number().int().min(1),
});

export type UpdateSettingsRequest = z.infer<typeof updateSettingsSchema>;
export type RollbackSettingsRequest = z.infer<typeof rollbackSettingsSchema>;