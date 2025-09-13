import { db } from '../db';
import { managedKeywords } from '../../shared/schema';
import { eq, sql, desc, asc } from 'drizzle-orm';
import type { ManagedKeyword, InsertManagedKeyword } from '../../shared/schema';
import type { SearchAdResponse } from '../types';
import { getVolumes } from '../services/searchad';

/**
 * Ping Keywords DB to test connection
 */
export async function pingKeywordsDB(): Promise<void> {
  await db.execute(sql`SELECT 1`);
  
  // Ensure the managed_keywords table exists
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS managed_keywords (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      text TEXT NOT NULL UNIQUE,
      raw_volume INTEGER NOT NULL DEFAULT 0,
      volume INTEGER NOT NULL DEFAULT 0,
      grade TEXT NOT NULL DEFAULT 'C',
      commerciality INTEGER NOT NULL DEFAULT 0,
      difficulty INTEGER NOT NULL DEFAULT 0,
      excluded BOOLEAN NOT NULL DEFAULT false,
      source TEXT NOT NULL DEFAULT 'searchads',
      updated_at TIMESTAMP DEFAULT NOW(),
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
  
  // Create index for performance
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_managed_keywords_excluded_volume 
    ON managed_keywords (excluded, raw_volume DESC)
  `);
}

/**
 * Get total keywords count
 */
export async function keywordsCount(): Promise<number> {
  const result = await db.select({ count: sql<number>`COUNT(*)` }).from(managedKeywords);
  return result[0]?.count || 0;
}

/**
 * Upsert multiple keywords with volume data
 */
export async function upsertMany(keywords: Partial<InsertManagedKeyword>[]): Promise<number> {
  if (keywords.length === 0) return 0;
  
  let insertedCount = 0;
  
  for (const keyword of keywords) {
    try {
      await db.insert(managedKeywords)
        .values({
          text: keyword.text!,
          raw_volume: keyword.raw_volume || 0,
          volume: keyword.volume || 0,
          grade: keyword.grade || 'C',
          commerciality: keyword.commerciality || 0,
          difficulty: keyword.difficulty || 0,
          source: keyword.source || 'searchads',
        })
        .onConflictDoUpdate({
          target: managedKeywords.text,
          set: {
            raw_volume: keyword.raw_volume || 0,
            volume: keyword.volume || 0,
            grade: keyword.grade || 'C',
            commerciality: keyword.commerciality || 0,
            difficulty: keyword.difficulty || 0,
            updated_at: sql`NOW()`,
          }
        });
      insertedCount++;
    } catch (error) {
      console.error(`Failed to upsert keyword "${keyword.text}":`, error);
    }
  }
  
  return insertedCount;
}

/**
 * List keywords with filtering and sorting
 */
export async function listKeywords(opts: {
  excluded: boolean;
  orderBy: 'raw_volume' | 'text';
  dir: 'asc' | 'desc';
}): Promise<ManagedKeyword[]> {
  const orderField = opts.orderBy === 'raw_volume' ? managedKeywords.raw_volume : managedKeywords.text;
  const orderDir = opts.dir === 'desc' ? desc(orderField) : asc(orderField);
  
  return await db.select()
    .from(managedKeywords)
    .where(eq(managedKeywords.excluded, opts.excluded))
    .orderBy(orderDir)
    .limit(1000); // Reasonable limit
}

/**
 * Find a keyword by text
 */
export async function findKeywordByText(text: string): Promise<ManagedKeyword | undefined> {
  const results = await db.select()
    .from(managedKeywords)
    .where(eq(managedKeywords.text, text))
    .limit(1);
  
  return results[0] || undefined;
}

/**
 * Delete all keywords (for replace mode)
 */
export async function deleteAllKeywords(): Promise<number> {
  const result = await db.delete(managedKeywords);
  return result.rowCount || 0;
}

/**
 * Set keyword excluded status
 */
export async function setKeywordExcluded(id: string, excluded: boolean): Promise<void> {
  await db.update(managedKeywords)
    .set({ 
      excluded, 
      updated_at: sql`NOW()` 
    })
    .where(eq(managedKeywords.id, id));
}

/**
 * List only excluded keywords
 */
export async function listExcluded(): Promise<ManagedKeyword[]> {
  return await db.select()
    .from(managedKeywords)
    .where(eq(managedKeywords.excluded, true))
    .orderBy(desc(managedKeywords.updated_at));
}

/**
 * Get raw volume mapping for keywords (for results API)
 */
export async function getKeywordVolumeMap(keywordTexts: string[]): Promise<Record<string, number>> {
  if (keywordTexts.length === 0) return {};
  
  const results = await db.select({
    text: managedKeywords.text,
    raw_volume: managedKeywords.raw_volume
  })
    .from(managedKeywords)
    .where(sql`${managedKeywords.text} = ANY(${keywordTexts})`);
    
  const volumeMap: Record<string, number> = {};
  for (const result of results) {
    volumeMap[result.text] = result.raw_volume;
  }
  
  // Fill missing keywords with 0
  for (const text of keywordTexts) {
    if (!(text in volumeMap)) {
      volumeMap[text] = 0;
    }
  }
  
  return volumeMap;
}

/**
 * Fetch keywords from SearchAds API and store them
 */
export async function upsertKeywordsFromSearchAds(
  baseKeyword: string, 
  limit: number = 300
): Promise<{ mode: string; stats: any; count: number }> {
  console.log(`📝 Fetching keywords from SearchAds API for base: "${baseKeyword}", limit: ${limit}`);
  
  // Get related keywords from SearchAds API using base keyword
  const relatedKeywords = await generateRelatedKeywords(baseKeyword, limit);
  const result = await getVolumes(relatedKeywords) as SearchAdResponse;
  
  // Process and grade the keywords
  const keywordsToUpsert: Partial<InsertManagedKeyword>[] = [];
  
  for (const [text, volumeData] of Object.entries(result.volumes)) {
    const raw_volume = volumeData.total;
    const volume = Math.round(raw_volume * 0.8); // Apply some processing
    
    // Grade based on volume
    let grade: 'A' | 'B' | 'C' = 'C';
    if (raw_volume >= 10000) grade = 'A';
    else if (raw_volume >= 1000) grade = 'B';
    
    // Estimate commerciality and difficulty (simplified)
    const commerciality = Math.min(100, Math.round((raw_volume / 1000) * 10));
    const difficulty = Math.min(100, Math.round((raw_volume / 500) * 8));
    
    keywordsToUpsert.push({
      text,
      raw_volume,
      volume,
      grade,
      commerciality,
      difficulty,
      source: 'searchads'
    });
  }
  
  const insertedCount = await upsertMany(keywordsToUpsert);
  
  console.log(`📝 Upserted ${insertedCount} keywords to database`);
  
  return {
    mode: result.mode,
    stats: result.stats,
    count: insertedCount
  };
}

/**
 * Generate related keywords for a base keyword (simplified implementation)
 */
async function generateRelatedKeywords(baseKeyword: string, limit: number): Promise<string[]> {
  // This is a simplified implementation - in production you might use more sophisticated methods
  const variations = [
    baseKeyword,
    `${baseKeyword} 효능`,
    `${baseKeyword} 추천`,
    `${baseKeyword} 후기`,
    `${baseKeyword} 가격`,
    `${baseKeyword} 구매`,
    `${baseKeyword} 비교`,
    `${baseKeyword} 순위`,
    `${baseKeyword} 제품`,
    `${baseKeyword} 브랜드`,
    `${baseKeyword} 성분`,
    `${baseKeyword} 복용법`,
    `${baseKeyword} 부작용`,
    `${baseKeyword} 선택`,
    `${baseKeyword} 정보`,
  ];
  
  return variations.slice(0, Math.min(limit, variations.length));
}