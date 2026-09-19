import { z } from 'zod';
import { createHash } from 'node:crypto';
import type { createDatabase } from '@edisco/database';
import { lessons, userLessons } from '@edisco/database/schema';
import { and, eq, isNotNull, sql } from 'drizzle-orm';
import type { GenerationInput } from '../generators/content.js';
import {
  EMBEDDING_MODEL,
  EMBEDDING_DIMENSIONS,
  embeddingVector,
} from './openai.js';

export const EMBEDDING_PROFILE = `openai:${EMBEDDING_MODEL}:${EMBEDDING_DIMENSIONS}:topic-category-pace:v1`;
type Database = ReturnType<typeof createDatabase>['db'];
export type ReuseCriteria = {
  category: GenerationInput['category'];
  pace: GenerationInput['pace'];
  context: string;
  trackId: string | null;
  embedding: number[];
};

export function contextKey(lessonIds: string[]) {
  // Same ordered, bounded context as the content prompt. IDs survive cross-user reuse.
  return createHash('sha256').update(JSON.stringify(lessonIds)).digest('hex');
}

export function reuseEligibility(input: ReuseCriteria) {
  return and(
    eq(lessons.category, input.category),
    eq(lessons.isExpiredForReuse, false),
    sql`${lessons.expiresAt} > clock_timestamp()`,
    isNotNull(lessons.embedding),
    eq(lessons.embeddingProfile, EMBEDDING_PROFILE),
    eq(lessons.contentVersion, 1),
    eq(lessons.generationPace, input.pace),
    eq(lessons.generationContext, input.context),
    input.trackId
      ? sql`NOT EXISTS (SELECT 1 FROM ${userLessons} WHERE ${userLessons.trackId} = ${input.trackId} AND ${userLessons.lessonId} = ${lessons.id})`
      : undefined,
  );
}

export async function findReuseCandidate(
  db: Database,
  input: ReuseCriteria,
  maximumDistance: number,
) {
  const embedding = embeddingVector.parse(input.embedding);
  z.number().min(0).max(2).parse(maximumDistance);
  const distance = sql<number>`${lessons.embedding} <=> ${JSON.stringify(embedding)}::vector`;
  const candidates = await db.transaction(async (tx) => {
    // Filtered HNSW scans must continue past ineligible neighbors (pgvector >=0.8).
    await tx.execute(sql`SET LOCAL hnsw.iterative_scan = 'strict_order'`);
    // Prefer the ordered vector index over a category index followed by sorting
    // every candidate. This planner setting is confined to this transaction.
    await tx.execute(sql`SET LOCAL enable_sort = off`);
    return tx
      .select({ id: lessons.id, distance })
      .from(lessons)
      .where(reuseEligibility(input))
      .orderBy(distance)
      .limit(5);
  });
  const top = candidates[0];
  return {
    lessonId: top && top.distance <= maximumDistance ? top.id : null,
    distance: top?.distance ?? null,
  };
}

export function readReuseThreshold() {
  const raw = process.env.SIMILARITY_MAX_DISTANCE;
  if (!raw?.trim())
    throw new Error('SIMILARITY_MAX_DISTANCE must be configured');
  return z.coerce.number().min(0).max(2).parse(raw);
}
