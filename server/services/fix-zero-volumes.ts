/**
 * volume이 0인 키워드들을 일괄적으로 SearchAds API로 다시 조회해서 수정하는 서비스
 */

import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { eq, or, isNull, inArray } from 'drizzle-orm';
import { managedKeywords } from '../../shared/schema.js';
import { getVolumesWithHealth } from './externals-health.js';

export interface FixVolumeStats {
  totalZeroVolume: number;
  processed: number;
  fixed: number;
  stillZero: number;
  errors: number;
}

/**
 * volume이 0인 키워드들을 찾아서 SearchAds API로 다시 조회하고 업데이트
 */
export async function fixZeroVolumeKeywords(
  db: NodePgDatabase<any>,
  limit: number = 100
): Promise<FixVolumeStats> {
  console.log(`🔧 [Fix Zero Volumes] Starting batch fix for ${limit} keywords`);
  
  const stats: FixVolumeStats = {
    totalZeroVolume: 0,
    processed: 0,
    fixed: 0,
    stillZero: 0,
    errors: 0
  };

  try {
    // Step 1: volume이 0인 키워드들 조회
    const zeroVolumeKeywords = await db
      .select({
        id: managedKeywords.id,
        text: managedKeywords.text,
        raw_volume: managedKeywords.raw_volume,
        source: managedKeywords.source
      })
      .from(managedKeywords)
      .where(
        or(
          eq(managedKeywords.raw_volume, 0),
          eq(managedKeywords.volume, 0),
          isNull(managedKeywords.raw_volume)
        )
      )
      .limit(limit);

    stats.totalZeroVolume = zeroVolumeKeywords.length;
    console.log(`📊 [Fix Zero Volumes] Found ${stats.totalZeroVolume} keywords with zero volume`);

    if (stats.totalZeroVolume === 0) {
      console.log(`✅ [Fix Zero Volumes] No keywords to fix`);
      return stats;
    }

    // Step 2: 키워드 텍스트 추출
    const keywordTexts = zeroVolumeKeywords.map(k => k.text);
    console.log(`🔍 [Fix Zero Volumes] Processing keywords: ${keywordTexts.slice(0, 5).join(', ')}${keywordTexts.length > 5 ? '...' : ''}`);

    // Step 3: SearchAds API로 다시 조회
    try {
      const volumeData = await getVolumesWithHealth(db, keywordTexts);
      stats.processed = keywordTexts.length;

      console.log(`📞 [Fix Zero Volumes] API call completed - mode: ${volumeData.mode}`);
      console.log(`📊 [Fix Zero Volumes] Retrieved ${Object.keys(volumeData.volumes).length} volume entries`);

      // Step 4: 결과 분석 및 통계
      for (const keyword of zeroVolumeKeywords) {
        const keyRaw = keyword.text;
        const keyLC = keyRaw.toLowerCase().trim();
        const keyNrm = keyRaw.normalize('NFKC').toLowerCase().replace(/[\s\-_.]+/g, '');
        
        const volumeInfo = volumeData.volumes[keyRaw] || 
                          volumeData.volumes[keyLC] || 
                          volumeData.volumes[keyNrm];

        if (volumeInfo && volumeInfo.total > 0) {
          stats.fixed++;
          console.log(`   ✅ [Fixed] "${keyword.text}" → volume ${volumeInfo.total} (was ${keyword.raw_volume})`);
        } else {
          stats.stillZero++;
          console.log(`   ⚠️ [Still Zero] "${keyword.text}" → still no volume data`);
        }
      }

      console.log(`🎯 [Fix Zero Volumes] Results: ${stats.fixed} fixed, ${stats.stillZero} still zero`);

    } catch (error) {
      console.error(`❌ [Fix Zero Volumes] API call failed:`, error);
      stats.errors++;
    }

  } catch (error) {
    console.error(`❌ [Fix Zero Volumes] Database query failed:`, error);
    stats.errors++;
  }

  console.log(`🏁 [Fix Zero Volumes] Completed - Fixed: ${stats.fixed}/${stats.processed}`);
  return stats;
}

/**
 * 특정 키워드들을 대상으로 volume 수정
 */
export async function fixSpecificKeywords(
  db: NodePgDatabase<any>,
  keywords: string[]
): Promise<FixVolumeStats> {
  console.log(`🎯 [Fix Specific] Starting fix for ${keywords.length} specific keywords`);
  
  const stats: FixVolumeStats = {
    totalZeroVolume: keywords.length,
    processed: 0,
    fixed: 0,
    stillZero: 0,
    errors: 0
  };

  try {
    // Step 1: 현재 DB 상태 확인
    const currentKeywords = await db
      .select({
        text: managedKeywords.text,
        raw_volume: managedKeywords.raw_volume,
        volume: managedKeywords.volume
      })
      .from(managedKeywords)
      .where(inArray(managedKeywords.text, keywords));

    console.log(`📊 [Fix Specific] Current state in DB:`);
    currentKeywords.forEach(k => {
      console.log(`   "${k.text}": raw_volume=${k.raw_volume}, volume=${k.volume}`);
    });

    // Step 2: SearchAds API로 조회
    try {
      const volumeData = await getVolumesWithHealth(db, keywords);
      stats.processed = keywords.length;

      console.log(`📞 [Fix Specific] API call completed - mode: ${volumeData.mode}`);
      
      // Step 3: 결과 확인
      for (const keyword of keywords) {
        const keyRaw = keyword;
        const keyLC = keyRaw.toLowerCase().trim();
        const keyNrm = keyRaw.normalize('NFKC').toLowerCase().replace(/[\s\-_.]+/g, '');
        
        const volumeInfo = volumeData.volumes[keyRaw] || 
                          volumeData.volumes[keyLC] || 
                          volumeData.volumes[keyNrm];

        if (volumeInfo && volumeInfo.total > 0) {
          stats.fixed++;
          console.log(`   ✅ [Fixed] "${keyword}" → volume ${volumeInfo.total}`);
        } else {
          stats.stillZero++;
          console.log(`   ⚠️ [Still Zero] "${keyword}" → no volume data available`);
        }
      }

    } catch (error) {
      console.error(`❌ [Fix Specific] API call failed:`, error);
      stats.errors++;
    }

  } catch (error) {
    console.error(`❌ [Fix Specific] Operation failed:`, error);
    stats.errors++;
  }

  return stats;
}