import { userLessons, userPartProgress, users } from '@edisco/database/schema';
import bcrypt from 'bcryptjs';
import { and, eq, isNotNull, sql } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

const onboardingSchema = z.object({
  interests: z.array(z.string()).min(1),
  pace: z.enum(['CASUAL', 'REGULAR', 'INTENSIVE']),
});

const updateProfileSchema = z.object({
  interests: z.array(z.string()).min(1).optional(),
  pace: z.enum(['CASUAL', 'REGULAR', 'INTENSIVE']).optional(),
});

const avatarDataUrl = z
  .string()
  .max(500_000)
  .regex(/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/);

const accountSettingsSchema = z
  .object({
    email: z.string().trim().email().max(254).optional(),
    avatarUrl: avatarDataUrl.nullable().optional(),
    theme: z.enum(['LIGHT', 'DARK']).optional(),
  })
  .refine(
    (value) =>
      value.email !== undefined ||
      value.avatarUrl !== undefined ||
      value.theme !== undefined,
  );

const passwordSettingsSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(128),
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

      const [lessonStats] = await fastify.db
        .select({
          lessonCount: sql<number>`count(*)::int`,
          completedLessonCount: sql<number>`count(*) filter (where ${userLessons.status} = 'COMPLETED')::int`,
        })
        .from(userLessons)
        .where(eq(userLessons.userId, userId));
      const activity = await fastify.db
        .select({ completedAt: userPartProgress.completedAt })
        .from(userPartProgress)
        .innerJoin(
          userLessons,
          eq(userPartProgress.userLessonId, userLessons.id),
        )
        .where(
          and(
            eq(userLessons.userId, userId),
            isNotNull(userPartProgress.completedAt),
          ),
        );

      return reply.code(200).send({
        id: user.id,
        name: user.name,
        email: user.email,
        avatarUrl: user.avatarUrl,
        theme: user.theme,
        pace: user.pace ?? null,
        interests: user.interests ?? [],
        freeGenerationsLeft: user.freeGenerationsLeft,
        totalXp: user.totalXp,
        currentStreak: user.currentStreak,
        longestStreak: user.longestStreak,
        onboardingCompletedAt:
          user.onboardingCompletedAt?.toISOString() ?? null,
        createdAt: user.createdAt.toISOString(),
        lessonCount: lessonStats?.lessonCount ?? 0,
        completedLessonCount: lessonStats?.completedLessonCount ?? 0,
        activityDates: activity.flatMap((item) =>
          item.completedAt ? [item.completedAt.toISOString()] : [],
        ),
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

      const updates: {
        updatedAt: Date;
        interests?: string[];
        pace?: 'CASUAL' | 'REGULAR' | 'INTENSIVE';
      } = { updatedAt: new Date() };
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

  fastify.patch(
    '/me/account',
    {
      preValidation: [fastify.authenticate],
      bodyLimit: 600_000,
    },
    async (request, reply) => {
      const { userId } = request.user;
      const parseResult = accountSettingsSchema.safeParse(request.body);

      if (!parseResult.success) {
        return reply.code(400).send({
          error: 'VALIDATION_ERROR',
          message: 'Invalid account settings',
        });
      }

      const existingUser = await fastify.db.query.users.findFirst({
        where: eq(users.id, userId),
      });
      if (!existingUser) {
        return reply.code(404).send({
          error: 'NOT_FOUND',
          message: 'User not found',
        });
      }

      const { avatarUrl, theme } = parseResult.data;
      const email = parseResult.data.email?.toLowerCase();
      if (email && email !== existingUser.email) {
        const emailOwner = await fastify.db.query.users.findFirst({
          where: eq(users.email, email),
        });
        if (emailOwner && emailOwner.id !== userId) {
          return reply.code(409).send({
            error: 'CONFLICT',
            message: 'Email is already in use',
          });
        }
      }

      const updates: {
        updatedAt: Date;
        email?: string;
        avatarUrl?: string | null;
        theme?: 'LIGHT' | 'DARK';
      } = { updatedAt: new Date() };
      if (email !== undefined) updates.email = email;
      if (avatarUrl !== undefined) updates.avatarUrl = avatarUrl;
      if (theme !== undefined) updates.theme = theme;

      try {
        const [updatedUser] = await fastify.db
          .update(users)
          .set(updates)
          .where(eq(users.id, userId))
          .returning({
            id: users.id,
            email: users.email,
            avatarUrl: users.avatarUrl,
            theme: users.theme,
          });

        if (!updatedUser) throw new Error('Failed to update account');
        return reply.code(200).send(updatedUser);
      } catch (error) {
        if (
          typeof error === 'object' &&
          error !== null &&
          'code' in error &&
          error.code === '23505'
        ) {
          return reply.code(409).send({
            error: 'CONFLICT',
            message: 'Email is already in use',
          });
        }
        throw error;
      }
    },
  );

  fastify.patch(
    '/me/password',
    {
      preValidation: [fastify.authenticate],
    },
    async (request, reply) => {
      const { userId } = request.user;
      const parseResult = passwordSettingsSchema.safeParse(request.body);

      if (!parseResult.success) {
        return reply.code(400).send({
          error: 'VALIDATION_ERROR',
          message: 'New password must be between 8 and 128 characters',
        });
      }

      const user = await fastify.db.query.users.findFirst({
        where: eq(users.id, userId),
      });
      if (!user) {
        return reply.code(404).send({
          error: 'NOT_FOUND',
          message: 'User not found',
        });
      }
      if (
        !user.passwordHash ||
        !(await bcrypt.compare(
          parseResult.data.currentPassword,
          user.passwordHash,
        ))
      ) {
        return reply.code(401).send({
          error: 'UNAUTHORIZED',
          message: 'Current password is incorrect',
        });
      }

      const passwordHash = await bcrypt.hash(parseResult.data.newPassword, 10);
      await fastify.db
        .update(users)
        .set({ passwordHash, updatedAt: new Date() })
        .where(eq(users.id, userId));

      return reply.code(200).send({ passwordUpdated: true });
    },
  );
};

export default usersRoutes;
