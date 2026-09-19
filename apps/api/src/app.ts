import Fastify from 'fastify';
import type { HealthResponse } from '@edisco/shared-types';

export function buildApp() {
  const app = Fastify({ logger: true });

  app.get<{ Reply: HealthResponse }>('/health', async () => ({
    status: 'ok',
    service: 'api',
  }));
  app.setNotFoundHandler((_request, reply) =>
    reply.code(404).send({ error: 'NOT_FOUND', message: 'Route not found' }),
  );

  return app;
}
