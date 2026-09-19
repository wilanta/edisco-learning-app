import {
  category,
  generationJobs,
  tracks,
  users,
} from '@edisco/database/schema';
import type { GenerationStatusResponse } from '@edisco/shared-types';
import { Queue } from 'bullmq';
import { and, eq } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import { Redis } from 'ioredis';
import { z } from 'zod';

const inputSchema = z
  .object({
    topic: z
      .string()
      .trim()
      .min(1)
      .max(2000)
      // biome-ignore lint/suspicious/noControlCharactersInRegex: Reject controls while allowing tab/newline in topic text.
      .regex(/^[^\x00-\x08\x0b\x0c\x0e-\x1f\x7f]*$/)
      .optional(),
    category: z.enum(category.enumValues),
    trackId: z.uuid().optional(),
  })
  .strict()
  .refine((input) => input.trackId || input.topic);

const generationRoutes: FastifyPluginAsync = async (app) => {
  let queue: Queue | undefined;
  let connection: Redis | undefined;
  function getQueue() {
    if (queue) return queue;
    const url = process.env.REDIS_URL;
    if (
      !url ||
      !URL.canParse(url) ||
      !['redis:', 'rediss:'].includes(new URL(url).protocol)
    ) {
      throw new Error('REDIS_URL must use redis:// or rediss://');
    }
    connection = new Redis(url, {
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      connectTimeout: 5000,
      commandTimeout: 5000,
      retryStrategy: () => null,
    });
    connection.on('error', () =>
      app.log.error('Generation Redis connection failed'),
    );
    queue = new Queue('edisco-generation', {
      connection,
      prefix: process.env.GENERATION_QUEUE_PREFIX ?? 'bull',
    });
    queue.on('error', () => app.log.error('Generation queue unavailable'));
    return queue;
  }
  app.addHook('onClose', async () => {
    try {
      await queue?.close();
    } finally {
      connection?.disconnect();
    }
  });

  app.post(
    '/',
    { preValidation: [app.authenticate] },
    async (request, reply) => {
      const parsed = inputSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({
          error: 'VALIDATION_ERROR',
          message:
            'Provide a topic and category, or an owned track and category',
        });
      }
      const user = await app.db.query.users.findFirst({
        where: eq(users.id, request.user.userId),
      });
      if (!user)
        return reply
          .code(401)
          .send({ error: 'UNAUTHORIZED', message: 'User not found' });
      if (!user.onboardingCompletedAt || !user.pace) {
        return reply.code(403).send({
          error: 'VALIDATION_ERROR',
          message: 'Complete onboarding before generating',
        });
      }
      if (user.freeGenerationsLeft <= 0) {
        return reply.code(403).send({
          error: 'QUOTA_EXCEEDED',
          message: 'Free generation quota has been used up',
        });
      }
      const input = parsed.data;
      let topic = input.topic;
      if (input.trackId) {
        const track = await app.db.query.tracks.findFirst({
          where: and(eq(tracks.id, input.trackId), eq(tracks.userId, user.id)),
        });
        if (!track)
          return reply
            .code(404)
            .send({ error: 'NOT_FOUND', message: 'Track not found' });
        if (input.category !== track.category) {
          return reply.code(400).send({
            error: 'VALIDATION_ERROR',
            message: 'Category must match the track',
          });
        }
        topic ??= track.title;
      }
      if (
        (process.env.GENERATION_PLACEHOLDER_ENABLED === 'true') ===
        (process.env.GENERATION_LLM_ENABLED === 'true')
      ) {
        return reply.code(503).send({
          error: 'GENERATION_FAILED',
          message: 'Enable exactly one generation mode',
        });
      }
      const [job] = await app.db
        .insert(generationJobs)
        .values({
          userId: user.id,
          trackId: input.trackId ?? null,
          requestedTopic: topic as string,
          category: input.category,
          status: 'PENDING',
        })
        .returning();
      if (!job) throw new Error('Generation job insert failed');
      try {
        await getQueue().add(
          'generate',
          { jobId: job.id },
          { jobId: job.id, attempts: 1 },
        );
      } catch {
        await app.db
          .update(generationJobs)
          .set({
            status: 'FAILED',
            errorMessage: 'Generation queue unavailable',
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(generationJobs.id, job.id),
              eq(generationJobs.status, 'PENDING'),
            ),
          );
        return reply.code(503).send({
          error: 'GENERATION_FAILED',
          message: 'Generation queue unavailable',
        });
      }
      return reply.code(202).send({ jobId: job.id, status: 'PENDING' });
    },
  );

  app.get<{
    Params: { jobId: string };
    Reply: GenerationStatusResponse | { error: string; message: string };
  }>(
    '/:jobId',
    { preValidation: [app.authenticate] },
    async (request, reply) => {
      if (!z.uuid().safeParse(request.params.jobId).success) {
        return reply
          .code(400)
          .send({ error: 'VALIDATION_ERROR', message: 'Invalid job ID' });
      }
      const job = await app.db.query.generationJobs.findFirst({
        where: and(
          eq(generationJobs.id, request.params.jobId),
          eq(generationJobs.userId, request.user.userId),
        ),
      });
      if (!job)
        return reply
          .code(404)
          .send({ error: 'NOT_FOUND', message: 'Generation job not found' });
      return {
        jobId: job.id,
        status: job.status,
        resultLessonId: job.resultLessonId,
        trackId: job.trackId,
        errorMessage: job.errorMessage,
      };
    },
  );
};

export default generationRoutes;
