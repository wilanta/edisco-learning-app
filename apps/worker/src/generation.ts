import type { createDatabase } from '@edisco/database';
import { generationJobs } from '@edisco/database/schema';
import { and, eq, inArray } from 'drizzle-orm';

type Database = ReturnType<typeof createDatabase>['db'];

export async function failGeneration(db: Database, jobId: string) {
  await db
    .update(generationJobs)
    .set({
      status: 'FAILED',
      errorMessage: 'Generation processing failed',
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(generationJobs.id, jobId),
        inArray(generationJobs.status, ['PENDING', 'PROCESSING']),
      ),
    );
}

export async function processGeneration(db: Database, jobId: string) {
  const [job] = await db
    .update(generationJobs)
    .set({
      status: 'PROCESSING',
      errorMessage: null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(generationJobs.id, jobId),
        inArray(generationJobs.status, ['PENDING', 'PROCESSING']),
      ),
    )
    .returning();
  if (!job) return; // Never reopen a terminal job on redelivery.
  try {
    // Placeholder only: no content, vectors, assignments, expiry, or quota writes.
    if (!job.requestedTopic.trim())
      throw new Error('Generation topic is empty');
    await db
      .update(generationJobs)
      .set({ status: 'DONE', updatedAt: new Date() })
      .where(
        and(
          eq(generationJobs.id, job.id),
          eq(generationJobs.status, 'PROCESSING'),
        ),
      );
    return { placeholder: true, jobId: job.id };
  } catch (error) {
    await failGeneration(db, job.id);
    throw error;
  }
}
