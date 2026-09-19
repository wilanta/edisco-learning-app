import fp from 'fastify-plugin';
import { createDatabase } from '@edisco/database';
import type { FastifyPluginAsync } from 'fastify';

const dbPlugin: FastifyPluginAsync = async (fastify) => {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not set');
  }
  const { db, pool } = createDatabase(process.env.DATABASE_URL);

  fastify.decorate('db', db);

  fastify.addHook('onClose', async () => {
    await pool.end();
  });
};

export default fp(dbPlugin, { name: 'db' });

// Add types for fastify instance
declare module 'fastify' {
  interface FastifyInstance {
    db: ReturnType<typeof createDatabase>['db'];
  }
}
