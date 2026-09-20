import Fastify from 'fastify';
import cors from '@fastify/cors';
import type { HealthResponse } from '@edisco/shared-types';
import dbPlugin from './plugins/db.js';
import authPlugin from './plugins/auth.js';
import authRoutes from './modules/auth/auth.routes.js';
import usersRoutes from './modules/users/users.routes.js';
import generationRoutes from './modules/lessons/generation.routes.js';
import tracksRoutes from './modules/tracks/tracks.routes.js';
import lessonsRoutes from './modules/lessons/lessons.routes.js';
import leagueRoutes from './modules/league/league.routes.js';

export function buildApp() {
  const app = Fastify({ logger: true });

  // Enable CORS for development
  app.register(cors, {
    origin: 'http://localhost:3000',
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  });

  // Register DB
  app.register(dbPlugin);

  // Register Auth
  app.register(authPlugin);

  // Register Routes
  app.register(authRoutes, { prefix: '/auth' });
  app.register(usersRoutes, { prefix: '/users' });
  app.register(generationRoutes, { prefix: '/lessons/generate' });
  app.register(tracksRoutes, { prefix: '/tracks' });
  app.register(lessonsRoutes, { prefix: '/lessons' });
  app.register(leagueRoutes, { prefix: '/league' });

  app.get<{ Reply: HealthResponse }>('/health', async () => ({
    status: 'ok',
    service: 'api',
  }));

  app.setNotFoundHandler((_request, reply) =>
    reply.code(404).send({ error: 'NOT_FOUND', message: 'Route not found' }),
  );

  return app;
}
