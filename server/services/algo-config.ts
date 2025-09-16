import { AlgoConfig, defaultAlgoConfig } from "@shared/config-schema";
import { metaGet } from "../store/meta";
import { db } from "../db";

// Hot-reload cache system for algorithm configuration
interface CachedConfig {
  config: AlgoConfig;
  timestamp: number;
  version: number;
}

let configCache: CachedConfig | null = null;
const CACHE_TTL = 30 * 1000; // 30 seconds

/**
 * Get algorithm configuration with hot-reload support
 * Uses 30-second memory cache for performance
 */
export async function getAlgoConfig(): Promise<AlgoConfig> {
  const now = Date.now();
  
  // Check cache validity
  if (configCache && (now - configCache.timestamp) < CACHE_TTL) {
    if (defaultAlgoConfig.features?.log_calculations) {
      console.log(`🔥 [Hot-Reload] Using cached config (age: ${Math.round((now - configCache.timestamp) / 1000)}s)`);
    }
    return configCache.config;
  }
  
  try {
    // Load fresh config from database
    const storedConfig = await metaGet<AlgoConfig>(db, 'algo_config');
    
    let config: AlgoConfig;
    if (storedConfig) {
      config = storedConfig;
    } else {
      console.log(`⚙️ [Hot-Reload] No stored config found, using defaults`);
      config = defaultAlgoConfig;
    }
    
    // Update cache
    configCache = {
      config,
      timestamp: now,
      version: (config as any).metadata?.version || now
    };
    
    if (config.features?.log_calculations) {
      console.log(`🔥 [Hot-Reload] Loaded fresh config - Engine: ${config.phase2.engine}, Weights: vol=${config.weights.volume}`);
    }
    
    return config;
    
  } catch (error) {
    console.error(`❌ [Hot-Reload] Error loading config, using defaults:`, error);
    
    // Fallback to defaults and cache them
    configCache = {
      config: defaultAlgoConfig,
      timestamp: now,
      version: now
    };
    
    return defaultAlgoConfig;
  }
}

/**
 * Invalidate configuration cache
 * Call this after successful config updates to ensure hot-reload
 */
export function invalidateAlgoConfigCache(): void {
  if (configCache) {
    const age = Math.round((Date.now() - configCache.timestamp) / 1000);
    console.log(`🔄 [Hot-Reload] Cache invalidated (was ${age}s old)`);
  }
  configCache = null;
}

/**
 * Get cache status for debugging/monitoring
 */
export function getAlgoConfigCacheStatus(): {
  cached: boolean;
  age: number;
  version: number | null;
} {
  if (!configCache) {
    return { cached: false, age: 0, version: null };
  }
  
  const age = Math.round((Date.now() - configCache.timestamp) / 1000);
  return {
    cached: true,
    age,
    version: configCache.version
  };
}

/**
 * Warm up the config cache (useful for startup)
 */
export async function warmupAlgoConfig(): Promise<void> {
  console.log(`🔥 [Hot-Reload] Warming up algorithm configuration cache...`);
  await getAlgoConfig();
  console.log(`✅ [Hot-Reload] Cache warmed up successfully`);
}

/**
 * Force refresh the config cache
 */
export async function refreshAlgoConfig(): Promise<AlgoConfig> {
  console.log(`🔄 [Hot-Reload] Forcing config refresh...`);
  invalidateAlgoConfigCache();
  return await getAlgoConfig();
}

// Export for backward compatibility
export { defaultAlgoConfig };