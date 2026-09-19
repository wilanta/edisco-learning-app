import type { createDatabase } from '@edisco/database';
import {
  generationJobs,
  lessons,
  parts,
  tracks,
  userLessons,
  users,
} from '@edisco/database/schema';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { generateLesson } from './generators/openai.js';
import { generationInput } from './generators/content.js';
import { createEmbedding } from './embedding/openai.js';
import {
  contextKey,
  EMBEDDING_PROFILE,
  findReuseCandidate,
  readReuseThreshold,
  reuseEligibility,
} from './embedding/reuse.js';

type Database = ReturnType<typeof createDatabase>['db'];

export async function failGeneration(
  db: Database,
  jobId: string,
  errorMessage = 'Generation processing failed',
) {
  await db
    .update(generationJobs)
    .set({
      status: 'FAILED',
      errorMessage,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(generationJobs.id, jobId),
        inArray(generationJobs.status, ['PENDING', 'PROCESSING']),
      ),
    );
}

export async function processGeneration(
  db: Database,
  jobId: string,
  mode: 'placeholder' | 'llm',
) {
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
    if (mode === 'llm') {
      const maximumDistance = readReuseThreshold();
      const user = await db.query.users.findFirst({
        where: eq(users.id, job.userId),
      });
      if (!user?.pace || !user.onboardingCompletedAt)
        throw new Error('User is not ready');
      const previousLessons = job.trackId
        ? await db
            .select({
              id: lessons.id,
              title: lessons.title,
              description: lessons.description,
            })
            .from(userLessons)
            .innerJoin(lessons, eq(lessons.id, userLessons.lessonId))
            .where(
              and(
                eq(userLessons.trackId, job.trackId),
                eq(userLessons.userId, job.userId),
              ),
            )
            .orderBy(desc(userLessons.orderInTrack))
            .limit(5)
        : [];
      previousLessons.reverse();
      const input = generationInput.parse({
        topic: job.requestedTopic,
        category: job.category,
        pace: user.pace,
        previousLessons: previousLessons.map(({ title, description }) => ({
          title,
          description,
        })),
      });
      const embedding = await createEmbedding(
        JSON.stringify({
          topic: input.topic,
          category: input.category,
          pace: input.pace,
        }),
      );
      const criteria = {
        category: input.category,
        pace: input.pace,
        context: contextKey(previousLessons.map((l) => l.id)),
        trackId: job.trackId,
        embedding,
      };
      const match = await findReuseCandidate(db, criteria, maximumDistance);
      console.info({
        event: 'reuse_decision',
        jobId: job.id,
        decision: match.lessonId ? 'reuse' : 'generate',
        distance: match.distance,
        maximumDistance,
        embeddingProfile: EMBEDDING_PROFILE,
      });
      const content = match.lessonId ? null : await generateLesson(input);
      // No database locks during the network call. Lock finalization to prevent
      // a replay from publishing a second lesson/assignment for the same job.
      return await db.transaction(async (tx) => {
        const [current] = await tx
          .select()
          .from(generationJobs)
          .where(eq(generationJobs.id, job.id))
          .for('update');
        if (current?.status !== 'PROCESSING') return;
        let trackId = job.trackId;
        if (trackId) {
          const [track] = await tx
            .select()
            .from(tracks)
            .where(and(eq(tracks.id, trackId), eq(tracks.userId, job.userId)))
            .for('update');
          if (!track || track.category !== job.category)
            throw new Error('Invalid track');
        } else {
          const [track] = await tx
            .insert(tracks)
            .values({
              userId: job.userId,
              title: job.requestedTopic.trim(),
              category: job.category,
            })
            .returning();
          if (!track) throw new Error('Track insert failed');
          trackId = track.id;
        }
        let lessonId = match.lessonId;
        if (lessonId) {
          // Recheck after the track lock: expiry, metadata and membership can change.
          const [eligible] = await tx
            .select({ id: lessons.id })
            .from(lessons)
            .where(
              and(
                eq(lessons.id, lessonId),
                reuseEligibility(criteria),
                sql`${lessons.embedding} <=> ${JSON.stringify(embedding)}::vector <= ${maximumDistance}`,
              ),
            )
            .for('share');
          if (!eligible)
            throw new Error('Reuse candidate is no longer eligible');
          if (job.trackId) {
            const currentContext = await tx
              .select({ id: userLessons.lessonId })
              .from(userLessons)
              .where(eq(userLessons.trackId, job.trackId))
              .orderBy(desc(userLessons.orderInTrack))
              .limit(5);
            if (
              contextKey(currentContext.reverse().map((l) => l.id)) !==
              criteria.context
            )
              throw new Error('Continuation context changed');
          }
        } else {
          if (!content) throw new Error('Generated content is missing');
          const [lesson] = await tx
            .insert(lessons)
            .values({
              trackTemplateTopic: job.requestedTopic
                .trim()
                .toLowerCase()
                .replace(/\s+/g, ' '),
              category: job.category,
              title: content.title,
              description: content.description,
              generatedByUserId: job.userId,
              embedding,
              embeddingProfile: EMBEDDING_PROFILE,
              generationPace: input.pace,
              generationContext: criteria.context,
              // Preserve the original creation-based expiry when this is reused.
              expiresAt: sql`((now() AT TIME ZONE 'UTC') + interval '3 months') AT TIME ZONE 'UTC'`,
            })
            .returning();
          if (!lesson) throw new Error('Lesson insert failed');
          lessonId = lesson.id;
          await tx
            .insert(parts)
            .values(
              content.parts.map((part) => ({ ...part, lessonId: lesson.id })),
            );
        }
        const [position] = await tx
          .select({
            next: sql<number>`coalesce(max(${userLessons.orderInTrack}), 0) + 1`,
          })
          .from(userLessons)
          .where(eq(userLessons.trackId, trackId));
        await tx.insert(userLessons).values({
          userId: job.userId,
          lessonId,
          trackId,
          orderInTrack: position?.next ?? 1,
          status: 'NOT_STARTED',
          wasReused: Boolean(match.lessonId),
        });
        const [updatedUser] = await tx
          .update(users)
          .set({ freeGenerationsLeft: sql`${users.freeGenerationsLeft} - 1` })
          .where(
            and(
              eq(users.id, job.userId),
              sql`${users.freeGenerationsLeft} > 0`,
            ),
          )
          .returning();
        if (!updatedUser) {
          throw new Error('QUOTA_EXCEEDED');
        }
        await tx
          .update(generationJobs)
          .set({
            status: 'DONE',
            trackId,
            resultLessonId: lessonId,
            errorMessage: null,
            updatedAt: new Date(),
          })
          .where(eq(generationJobs.id, job.id));
        return { lessonId, trackId };
      });
    }
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
    console.error('Generation Error:', error);
    let message = 'Generation processing failed';
    if (error instanceof Error && error.message === 'QUOTA_EXCEEDED') {
      message = 'Free generation quota has been used up';
    }
    await failGeneration(db, job.id, message);
    throw new Error('Generation processing failed');
  }
}
