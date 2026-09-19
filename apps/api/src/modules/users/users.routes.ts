import type { FastifyPluginAsync } from 'fastify';
import { users } from '@edisco/database/schema';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

const onboardingSchema = z.object({
  interests: z.array(z.string()).min(1),
  pace: z.enum(['CASUAL', 'REGULAR', 'INTENSIVE']),
});

const updateProfileSchema = z.object({
  interests: z.array(z.string()).min(1).optional(),
  pace: z.enum(['CASUAL', 'REGULAR', 'INTENSIVE']).optional(),
});

const usersRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get(
    '/me',
    {
      preValidation: [fastify.authenticate],
    },
    async (request, reply) => {
      const { userId } = request.user;

      const user = await fastify.db.query.users.findFirst({
        where: eq(users.id, userId),
      });

      if (!user) {
        return reply.code(404).send({
          error: 'NOT_FOUND',
          message: 'User not found',
        });
      }

      return reply.code(200).send({
        id: user.id,
        name: user.name,
        email: user.email,
        pace: user.pace ?? null,
        interests: user.interests ?? [],
        freeGenerationsLeft: user.freeGenerationsLeft,
        totalXp: user.totalXp,
        currentStreak: user.currentStreak,
        longestStreak: user.longestStreak,
      });
    },
  );

  fastify.patch(
    '/me/onboarding',
    {
      preValidation: [fastify.authenticate],
    },
    async (request, reply) => {
      const { userId } = request.user;
      const parseResult = onboardingSchema.safeParse(request.body);

      if (!parseResult.success) {
        return reply.code(400).send({
          error: 'VALIDATION_ERROR',
          message: 'Invalid input',
        });
      }

      const { interests, pace } = parseResult.data;

      const existingUser = await fastify.db.query.users.findFirst({
        where: eq(users.id, userId),
      });

      if (!existingUser) {
        return reply.code(404).send({
          error: 'NOT_FOUND',
          message: 'User not found',
        });
      }

      if (existingUser.onboardingCompletedAt) {
        return reply.code(200).send({
          userId: existingUser.id,
          freeGenerationsLeft: existingUser.freeGenerationsLeft,
          onboardingCompletedAt:
            existingUser.onboardingCompletedAt.toISOString(),
        });
      }

      const [updatedUser] = await fastify.db
        .update(users)
        .set({
          interests,
          pace,
          freeGenerationsLeft: 3,
          onboardingCompletedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(users.id, userId))
        .returning();

      if (!updatedUser) {
        throw new Error('Failed to update user');
      }

      return reply.code(200).send({
        userId: updatedUser.id,
        freeGenerationsLeft: updatedUser.freeGenerationsLeft,
        onboardingCompletedAt: updatedUser.onboardingCompletedAt?.toISOString(),
      });
    },
  );

  fastify.patch(
    '/me',
    {
      preValidation: [fastify.authenticate],
    },
    async (request, reply) => {
      const { userId } = request.user;
      const parseResult = updateProfileSchema.safeParse(request.body);

      if (!parseResult.success) {
        return reply.code(400).send({
          error: 'VALIDATION_ERROR',
          message: 'Invalid input',
        });
      }

      const { interests, pace } = parseResult.data;

      const existingUser = await fastify.db.query.users.findFirst({
        where: eq(users.id, userId),
      });

      if (!existingUser) {
        return reply.code(404).send({
          error: 'NOT_FOUND',
          message: 'User not found',
        });
      }

      const updates: any = { updatedAt: new Date() };
      if (interests !== undefined) updates.interests = interests;
      if (pace !== undefined) updates.pace = pace;

      const [updatedUser] = await fastify.db
        .update(users)
        .set(updates)
        .where(eq(users.id, userId))
        .returning();

      if (!updatedUser) {
        throw new Error('Failed to update user');
      }

      return reply.code(200).send({
        id: updatedUser.id,
        pace: updatedUser.pace,
        interests: updatedUser.interests,
      });
    },
  );
};

export default usersRoutes;
