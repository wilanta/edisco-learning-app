import { users } from '@edisco/database/schema';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

const registerSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(6),
  name: z.string().min(1),
});

const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
});

const authRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post('/register', async (request, reply) => {
    const parseResult = registerSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.code(400).send({
        error: 'VALIDATION_ERROR',
        message: 'Invalid input',
      });
    }

    const { password, name } = parseResult.data;
    const email = parseResult.data.email.toLowerCase();

    const existingUser = await fastify.db.query.users.findFirst({
      where: eq(users.email, email),
    });

    if (existingUser) {
      return reply.code(409).send({
        error: 'CONFLICT',
        message: 'User already exists',
      });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const [newUser] = await fastify.db
      .insert(users)
      .values({
        email,
        passwordHash,
        name,
        // pace and interests are nullable now, handled by schema
      })
      .returning({ id: users.id });

    if (!newUser) {
      throw new Error('Failed to create user');
    }

    const token = fastify.jwt.sign({ userId: newUser.id });

    return reply.code(201).send({
      userId: newUser.id,
      token,
    });
  });

  fastify.post('/login', async (request, reply) => {
    const parseResult = loginSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.code(400).send({
        error: 'VALIDATION_ERROR',
        message: 'Invalid input',
      });
    }

    const { password } = parseResult.data;
    const email = parseResult.data.email.toLowerCase();

    const user = await fastify.db.query.users.findFirst({
      where: eq(users.email, email),
    });

    if (!user || !user.passwordHash) {
      return reply.code(401).send({
        error: 'UNAUTHORIZED',
        message: 'Invalid email or password',
      });
    }

    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) {
      return reply.code(401).send({
        error: 'UNAUTHORIZED',
        message: 'Invalid email or password',
      });
    }

    const token = fastify.jwt.sign({ userId: user.id });

    return reply.code(200).send({
      userId: user.id,
      token,
    });
  });
};

export default authRoutes;
