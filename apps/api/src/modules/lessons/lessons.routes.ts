import {
  tracks,
  userLessons,
  lessons,
  parts,
  userPartProgress,
  users,
  weeklyLeagueEntries,
} from '@edisco/database/schema';
import { and, eq } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

const lessonsRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    '/',
    { preValidation: [app.authenticate] },
    async (request, reply) => {
      const { userId } = request.user;

      const results = await app.db
        .select({
          trackId: tracks.id,
          trackTitle: tracks.title,
          userLessonId: userLessons.id,
          title: lessons.title,
          status: userLessons.status,
          order: userLessons.orderInTrack,
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
            lessons: [],
          });
        }
        tracksMap.get(row.trackId).lessons.push({
          userLessonId: row.userLessonId,
          title: row.title,
          status: row.status,
          order: row.order,
        });
      }

      return reply.code(200).send({ tracks: Array.from(tracksMap.values()) });
    },
  );

  app.get<{ Params: { userLessonId: string } }>(
    '/:userLessonId',
    { preValidation: [app.authenticate] },
    async (request, reply) => {
      const { userId } = request.user;
      const { userLessonId } = request.params;

      if (!z.uuid().safeParse(userLessonId).success) {
        return reply
          .code(400)
          .send({ error: 'VALIDATION_ERROR', message: 'Invalid lesson ID' });
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
        .where(
          and(eq(userLessons.id, userLessonId), eq(userLessons.userId, userId)),
        )
        .limit(1)
        .then((res) => res[0]);

      if (!ul) {
        return reply
          .code(404)
          .send({ error: 'NOT_FOUND', message: 'Lesson not found' });
      }

      const partsData = await app.db
        .select({
          partId: parts.id,
          order: parts.order,
          type: parts.type,
          promptContent: parts.promptContent,
          isCorrect: userPartProgress.isCorrect,
          attempts: userPartProgress.attempts,
        })
        .from(parts)
        .leftJoin(
          userPartProgress,
          and(
            eq(parts.id, userPartProgress.partId),
            eq(userPartProgress.userLessonId, ul.userLessonId),
          ),
        )
        .where(eq(parts.lessonId, ul.lessonId))
        .orderBy(parts.order);

      const formattedParts = partsData.map((p) => {
        // Remove private grading stuff from promptContent
        const content = p.promptContent as any;
        const safePrompt: any = {
          question: content.question,
          explanation: content.explanation,
        };
        if (p.type === 'MULTIPLE_CHOICE') safePrompt.options = content.options;
        if (p.type === 'FILL_IN_BLANK')
          safePrompt.blanks = content.blanks?.map((b: any) => ({ id: b.id }));
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
            attempts: p.attempts ?? 0,
          },
        };
      });

      return reply.code(200).send({
        userLessonId: ul.userLessonId,
        title: ul.title,
        status: ul.status,
        parts: formattedParts,
      });
    },
  );

  app.post<{
    Params: { userLessonId: string; partId: string };
    Body: { answer: any };
  }>(
    '/:userLessonId/parts/:partId/answer',
    { preValidation: [app.authenticate] },
    async (request, reply) => {
      const { userId } = request.user;
      const { userLessonId, partId } = request.params;
      const { answer } = request.body;

      if (
        !z.uuid().safeParse(userLessonId).success ||
        !z.uuid().safeParse(partId).success
      ) {
        return reply
          .code(400)
          .send({ error: 'VALIDATION_ERROR', message: 'Invalid ID' });
      }

      const ul = await app.db.query.userLessons.findFirst({
        where: and(
          eq(userLessons.id, userLessonId),
          eq(userLessons.userId, userId),
        ),
      });

      if (!ul) {
        return reply
          .code(404)
          .send({ error: 'NOT_FOUND', message: 'Lesson not found' });
      }

      const part = await app.db.query.parts.findFirst({
        where: and(eq(parts.id, partId), eq(parts.lessonId, ul.lessonId)),
      });

      if (!part) {
        return reply
          .code(404)
          .send({ error: 'NOT_FOUND', message: 'Part not found' });
      }

      const content = part.promptContent as any;
      let isCorrect = false;

      // Grade answer based on part type
      if (
        part.type === 'MULTIPLE_CHOICE' ||
        part.type === 'CODE_PREDICT' ||
        part.type === 'TRANSLATE' ||
        part.type === 'SHORT_ANSWER'
      ) {
        isCorrect =
          String(answer).trim() === String(content.correctAnswer).trim();
      } else if (part.type === 'TRUE_FALSE') {
        isCorrect = Boolean(answer) === Boolean(content.correctAnswer);
      } else if (part.type === 'FILL_IN_BLANK') {
        const providedAnswers = answer as Record<string, string>;
        const blanks = content.blanks as {
          id: string;
          correctAnswer: string;
        }[];
        isCorrect =
          typeof providedAnswers === 'object' &&
          blanks.every(
            (b) =>
              String(providedAnswers[b.id]).trim() ===
              String(b.correctAnswer).trim(),
          );
      } else if (part.type === 'MATCHING') {
        const pairs = answer as { left: string; right: string }[];
        const correctPairs = content.correctAnswer as {
          left: string;
          right: string;
        }[];

        isCorrect =
          Array.isArray(pairs) &&
          pairs.length === correctPairs.length &&
          pairs.every((p) =>
            correctPairs.some(
              (cp) => cp.left === p.left && cp.right === p.right,
            ),
          );
      }

      // Record progress
      let currentProgress = await app.db.query.userPartProgress.findFirst({
        where: and(
          eq(userPartProgress.userLessonId, userLessonId),
          eq(userPartProgress.partId, partId),
        ),
      });

      // Transaction to safely update progress, lesson status, gamification, etc.
      const result = await app.db.transaction(async (tx) => {
        const [user] = await tx
          .select()
          .from(users)
          .where(eq(users.id, userId));
        if (!user) throw new Error('User not found');

        let earnedXpForPart = 0;
        let earnedXpForLesson = 0;
        let streakBonusXp = 0;

        const isNewlyCompleted = isCorrect && !currentProgress?.completedAt;

        if (isNewlyCompleted) {
          const isFirstAttempt = !currentProgress;
          earnedXpForPart = isFirstAttempt ? 10 : 5;
        }

        let newProgress;

        if (!currentProgress) {
          const [inserted] = await tx
            .insert(userPartProgress)
            .values({
              userLessonId,
              partId,
              attempts: 1,
              isCorrect,
              completedAt: isCorrect ? new Date() : null,
              xpEarned: earnedXpForPart,
            })
            .returning();
          newProgress = inserted;
        } else {
          const [updated] = await tx
            .update(userPartProgress)
            .set({
              attempts: currentProgress.attempts + 1,
              isCorrect,
              completedAt: isNewlyCompleted
                ? new Date()
                : currentProgress.completedAt,
              xpEarned: currentProgress.xpEarned + earnedXpForPart,
            })
            .where(eq(userPartProgress.id, currentProgress.id))
            .returning();
          newProgress = updated;
        }

        // Check lesson completion
        const allProgress = await tx
          .select()
          .from(userPartProgress)
          .where(eq(userPartProgress.userLessonId, userLessonId));
        const completedPartsCount = allProgress.filter(
          (p) => p.completedAt !== null,
        ).length;

        const justCompletedLesson =
          completedPartsCount === 5 && ul.status !== 'COMPLETED';

        if (ul.status === 'NOT_STARTED') {
          await tx
            .update(userLessons)
            .set({ status: 'IN_PROGRESS', startedAt: new Date() })
            .where(eq(userLessons.id, userLessonId));
        }

        if (justCompletedLesson) {
          await tx
            .update(userLessons)
            .set({ status: 'COMPLETED', completedAt: new Date() })
            .where(eq(userLessons.id, userLessonId));
          earnedXpForLesson = 20;
        }

        let newCurrentStreak = user.currentStreak;
        let newLongestStreak = user.longestStreak;
        let newLastActivityDate: string | null = user.lastActivityDate
          ? String(user.lastActivityDate)
          : null;
        const now = new Date();
        const todayStr = new Date(
          Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
        )
          .toISOString()
          .substring(0, 10);
        const todayTime = new Date(todayStr).getTime();

        if (isNewlyCompleted) {
          const lastActivityTime = newLastActivityDate
            ? new Date(newLastActivityDate).getTime()
            : null;

          if (!lastActivityTime) {
            newCurrentStreak = 1;
            newLongestStreak = Math.max(1, user.longestStreak);
            streakBonusXp = 5;
            newLastActivityDate = todayStr;
          } else {
            const diffDays = Math.round(
              (todayTime - lastActivityTime) / (1000 * 60 * 60 * 24),
            );
            if (diffDays === 1) {
              newCurrentStreak += 1;
              newLongestStreak = Math.max(newCurrentStreak, user.longestStreak);
              streakBonusXp = 5;
              newLastActivityDate = todayStr;
            } else if (diffDays > 1) {
              newCurrentStreak = 1;
              newLongestStreak = Math.max(newCurrentStreak, user.longestStreak);
              streakBonusXp = 5;
              newLastActivityDate = todayStr;
            }
          }
        }

        const totalEarnedXp =
          earnedXpForPart + earnedXpForLesson + streakBonusXp;

        if (totalEarnedXp > 0 || isNewlyCompleted) {
          await tx
            .update(users)
            .set({
              totalXp: user.totalXp + totalEarnedXp,
              currentStreak: newCurrentStreak,
              longestStreak: newLongestStreak,
              lastActivityDate: newLastActivityDate,
            })
            .where(eq(users.id, userId));
        }

        if (totalEarnedXp > 0) {
          function getMonday(d: Date): string {
            const date = new Date(
              Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
            );
            const day = date.getUTCDay();
            const diff = date.getUTCDate() - day + (day === 0 ? -6 : 1);
            return new Date(
              Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), diff),
            )
              .toISOString()
              .substring(0, 10);
          }
          const weekStartDateStr = getMonday(now);

          const existingLeague = await tx
            .select()
            .from(weeklyLeagueEntries)
            .where(
              and(
                eq(weeklyLeagueEntries.userId, userId),
                eq(weeklyLeagueEntries.weekStartDate, weekStartDateStr),
              ),
            )
            .limit(1);

          if (existingLeague.length === 0) {
            await tx.insert(weeklyLeagueEntries).values({
              userId,
              weekStartDate: weekStartDateStr,
              xpThisWeek: totalEarnedXp,
            });
          } else {
            const leagueEntry = existingLeague[0]!;
            await tx
              .update(weeklyLeagueEntries)
              .set({
                xpThisWeek: leagueEntry.xpThisWeek + totalEarnedXp,
                updatedAt: new Date(),
              })
              .where(eq(weeklyLeagueEntries.id, leagueEntry.id));
          }
        }

        return { justCompletedLesson, totalEarnedXp };
      });

      return reply.code(200).send({
        isCorrect,
        xpEarned: result.totalEarnedXp,
        explanation: content.explanation,
        lessonCompleted: result.justCompletedLesson,
      });
    },
  );
};

export default lessonsRoutes;
