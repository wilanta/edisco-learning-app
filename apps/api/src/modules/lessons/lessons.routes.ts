import { tracks, userLessons, lessons, parts, userPartProgress } from '@edisco/database/schema';
import { and, eq } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

const lessonsRoutes: FastifyPluginAsync = async (app) => {
  app.get('/', { preValidation: [app.authenticate] }, async (request, reply) => {
    const { userId } = request.user;
    
    const results = await app.db
      .select({
        trackId: tracks.id,
        trackTitle: tracks.title,
        userLessonId: userLessons.id,
        title: lessons.title,
        status: userLessons.status,
        order: userLessons.orderInTrack
      })
      .from(tracks)
      .innerJoin(userLessons, eq(tracks.id, userLessons.trackId))
      .innerJoin(lessons, eq(userLessons.lessonId, lessons.id))
      .where(eq(tracks.userId, userId))
      .orderBy(tracks.id, userLessons.orderInTrack);

    // Grouping by track
    const tracksMap = new Map<string, any>();
    for (const row of results) {
      if (!tracksMap.has(row.trackId)) {
        tracksMap.set(row.trackId, {
          trackId: row.trackId,
          trackTitle: row.trackTitle,
          lessons: []
        });
      }
      tracksMap.get(row.trackId).lessons.push({
        userLessonId: row.userLessonId,
        title: row.title,
        status: row.status,
        order: row.order
      });
    }

    return reply.code(200).send({ tracks: Array.from(tracksMap.values()) });
  });

  app.get<{ Params: { userLessonId: string } }>(
    '/:userLessonId',
    { preValidation: [app.authenticate] },
    async (request, reply) => {
      const { userId } = request.user;
      const { userLessonId } = request.params;
      
      if (!z.uuid().safeParse(userLessonId).success) {
        return reply.code(400).send({ error: 'VALIDATION_ERROR', message: 'Invalid lesson ID' });
      }

      const ul = await app.db
        .select({
          userLessonId: userLessons.id,
          lessonId: userLessons.lessonId,
          status: userLessons.status,
          title: lessons.title,
        })
        .from(userLessons)
        .innerJoin(lessons, eq(userLessons.lessonId, lessons.id))
        .where(and(eq(userLessons.id, userLessonId), eq(userLessons.userId, userId)))
        .limit(1)
        .then((res) => res[0]);

      if (!ul) {
        return reply.code(404).send({ error: 'NOT_FOUND', message: 'Lesson not found' });
      }

      const partsData = await app.db
        .select({
          partId: parts.id,
          order: parts.order,
          type: parts.type,
          promptContent: parts.promptContent,
          isCorrect: userPartProgress.isCorrect,
          attempts: userPartProgress.attempts
        })
        .from(parts)
        .leftJoin(userPartProgress, and(
          eq(parts.id, userPartProgress.partId),
          eq(userPartProgress.userLessonId, ul.userLessonId)
        ))
        .where(eq(parts.lessonId, ul.lessonId))
        .orderBy(parts.order);

      const formattedParts = partsData.map((p) => {
        // Remove private grading stuff from promptContent
        const content = p.promptContent as any;
        const safePrompt: any = { question: content.question, explanation: content.explanation };
        if (p.type === 'MULTIPLE_CHOICE') safePrompt.options = content.options;
        if (p.type === 'FILL_IN_BLANK') safePrompt.blanks = content.blanks?.map((b: any) => ({ id: b.id }));
        if (p.type === 'MATCHING') {
          safePrompt.leftOptions = content.leftOptions;
          safePrompt.rightOptions = content.rightOptions;
        }

        return {
          partId: p.partId,
          order: p.order,
          type: p.type,
          prompt: safePrompt,
          userProgress: {
            isCorrect: p.isCorrect ?? null,
            attempts: p.attempts ?? 0
          }
        };
      });

      return reply.code(200).send({
        userLessonId: ul.userLessonId,
        title: ul.title,
        status: ul.status,
        parts: formattedParts
      });
    }
  );

  app.post<{ Params: { userLessonId: string, partId: string }; Body: { answer: any } }>(
    '/:userLessonId/parts/:partId/answer',
    { preValidation: [app.authenticate] },
    async (request, reply) => {
      const { userId } = request.user;
      const { userLessonId, partId } = request.params;
      const { answer } = request.body;
      
      if (!z.uuid().safeParse(userLessonId).success || !z.uuid().safeParse(partId).success) {
        return reply.code(400).send({ error: 'VALIDATION_ERROR', message: 'Invalid ID' });
      }

      const ul = await app.db.query.userLessons.findFirst({
        where: and(eq(userLessons.id, userLessonId), eq(userLessons.userId, userId))
      });

      if (!ul) {
        return reply.code(404).send({ error: 'NOT_FOUND', message: 'Lesson not found' });
      }

      const part = await app.db.query.parts.findFirst({
        where: and(eq(parts.id, partId), eq(parts.lessonId, ul.lessonId))
      });

      if (!part) {
        return reply.code(404).send({ error: 'NOT_FOUND', message: 'Part not found' });
      }

      const content = part.promptContent as any;
      let isCorrect = false;

      // Grade answer based on part type
      if (part.type === 'MULTIPLE_CHOICE' || part.type === 'CODE_PREDICT' || part.type === 'TRANSLATE' || part.type === 'SHORT_ANSWER') {
        isCorrect = String(answer).trim() === String(content.correctAnswer).trim();
      } else if (part.type === 'TRUE_FALSE') {
        isCorrect = Boolean(answer) === Boolean(content.correctAnswer);
      } else if (part.type === 'FILL_IN_BLANK') {
        const providedAnswers = answer as Record<string, string>;
        const blanks = content.blanks as { id: string, correctAnswer: string }[];
        isCorrect = typeof providedAnswers === 'object' && blanks.every(b => String(providedAnswers[b.id]).trim() === String(b.correctAnswer).trim());
      } else if (part.type === 'MATCHING') {
        const pairs = answer as { left: string, right: string }[];
        const correctPairs = content.correctAnswer as { left: string, right: string }[];
        
        isCorrect = Array.isArray(pairs) && pairs.length === correctPairs.length && 
          pairs.every(p => correctPairs.some(cp => cp.left === p.left && cp.right === p.right));
      }

      // Record progress
      let currentProgress = await app.db.query.userPartProgress.findFirst({
        where: and(eq(userPartProgress.userLessonId, userLessonId), eq(userPartProgress.partId, partId))
      });

      // Transaction to safely update progress, lesson status, etc.
      const result = await app.db.transaction(async (tx) => {
        if (!currentProgress) {
          const [inserted] = await tx.insert(userPartProgress).values({
            userLessonId,
            partId,
            attempts: 1,
            isCorrect,
            completedAt: isCorrect ? new Date() : null,
            xpEarned: 0 // Placeholder for Phase 5
          }).returning();
          currentProgress = inserted;
        } else {
          // If already correct in the past, keep completedAt if we want, but schema allows us to just update
          // Actually, "DATA §6 isCorrect means latest attempt"
          // We will update attempts and isCorrect.
          // We preserve completedAt if it was already set? "completedAt is timestamp". Yes, if previously completed, keep it, or update it if newly correct.
          const [updated] = await tx.update(userPartProgress).set({
            attempts: currentProgress.attempts + 1,
            isCorrect,
            completedAt: (!currentProgress.completedAt && isCorrect) ? new Date() : currentProgress.completedAt
          }).where(eq(userPartProgress.id, currentProgress.id)).returning();
          currentProgress = updated;
        }

        // Check lesson completion
        const allProgress = await tx.select().from(userPartProgress).where(eq(userPartProgress.userLessonId, userLessonId));
        // A lesson is complete if all 5 parts are completed (i.e. have a completedAt)
        const completedPartsCount = allProgress.filter(p => p.completedAt !== null).length;
        
        let newLessonStatus = ul.status;
        let lessonCompletedAt = ul.completedAt;

        if (ul.status === 'NOT_STARTED') {
          newLessonStatus = 'IN_PROGRESS';
          await tx.update(userLessons).set({ status: 'IN_PROGRESS', startedAt: new Date() }).where(eq(userLessons.id, userLessonId));
        }

        if (completedPartsCount === 5 && ul.status !== 'COMPLETED') {
          newLessonStatus = 'COMPLETED';
          lessonCompletedAt = new Date();
          await tx.update(userLessons).set({ status: 'COMPLETED', completedAt: lessonCompletedAt }).where(eq(userLessons.id, userLessonId));
        }

        return { justCompleted: completedPartsCount === 5 };
      });

      return reply.code(200).send({
        isCorrect,
        xpEarned: 0,
        explanation: content.explanation,
        lessonCompleted: result.justCompleted
      });
    }
  );
};

export default lessonsRoutes;
