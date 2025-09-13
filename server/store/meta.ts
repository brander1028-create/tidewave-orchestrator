import { sql } from "drizzle-orm";
import { appMeta } from "@shared/schema";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

export async function metaGet<T = any>(db: NodePgDatabase<any>, key: string): Promise<T | null> {
  try {
    const result = await db.select({ value: appMeta.value })
      .from(appMeta)
      .where(sql`${appMeta.key} = ${key}`)
      .limit(1);
    
    if (result.length === 0) return null;
    return JSON.parse(result[0].value) as T;
  } catch (error) {
    console.error(`[meta] Failed to get ${key}:`, error);
    return null;
  }
}

export async function metaSet(db: NodePgDatabase<any>, key: string, value: any): Promise<void> {
  try {
    await db.insert(appMeta)
      .values({
        key,
        value: JSON.stringify(value),
        updatedAt: new Date()
      })
      .onConflictDoUpdate({
        target: appMeta.key,
        set: {
          value: JSON.stringify(value),
          updatedAt: new Date()
        }
      });
  } catch (error) {
    console.error(`[meta] Failed to set ${key}:`, error);
    throw error;
  }
}