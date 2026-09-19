import Fastify from 'fastify';
import type { HealthResponse } from '@edisco/shared-types';
import dbPlugin from './plugins/db.js';
import authPlugin from './plugins/auth.js';
import authRoutes from './modules/auth/auth.routes.js';
import usersRoutes from './modules/users/users.routes.js';
import generationRoutes from './modules/lessons/generation.routes.js';

export function buildApp() {
  const app = Fastify({ logger: true });

  // Register DB
  app.register(dbPlugin);

  // Register Auth
  app.register(authPlugin);

  // Register Routes
  app.register(authRoutes, { prefix: '/auth' });
  app.register(usersRoutes, { prefix: '/users' });
  app.register(generationRoutes, { prefix: '/lessons/generate' });

  app.get<{ Reply: HealthResponse }>('/health', async () => ({
    status: 'ok',
    service: 'api',
  }));

  app.setNotFoundHandler((_request, reply) =>
    reply.code(404).send({ error: 'NOT_FOUND', message: 'Route not found' }),
  );

  return app;
}
