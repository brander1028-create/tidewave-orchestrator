import { pgTable, text, varchar, integer, timestamp, jsonb, boolean, real } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { createInsertSchema } from 'drizzle-zod';

// 1. 검색 작업
export const searchJobs = pgTable('search_jobs', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  keyword: text('keyword').notNull(),
  status: text('status').notNull().default('pending'),
  progress: integer('progress').default(0),
  currentStage: text('current_stage'),
  totalBlogs: integer('total_blogs').default(0),
  processedBlogs: integer('processed_blogs').default(0),
  totalKeywords: integer('total_keywords').default(0),
  processedKeywords: integer('processed_keywords').default(0),
  errorMessage: text('error_message'),
  createdAt: timestamp('created_at').defaultNow(),
  completedAt: timestamp('completed_at')
});

// (나머지 테이블 정의는 이미 작성된 파일과 동일)