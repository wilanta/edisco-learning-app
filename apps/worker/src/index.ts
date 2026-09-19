import { createDatabase } from '@edisco/database';
import { Worker } from 'bullmq';
import { Redis } from 'ioredis';
import type { HealthResponse } from '@edisco/shared-types';
import { failGeneration, processGeneration } from './generation.js';

const redisUrl = process.env.REDIS_URL;
if (
  !redisUrl ||
  !URL.canParse(redisUrl) ||
  !['redis:', 'rediss:'].includes(new URL(redisUrl).protocol)
) {
  throw new Error('REDIS_URL must use redis:// or rediss://');
}

if (process.env.GENERATION_PLACEHOLDER_ENABLED !== 'true') {
  throw new Error(
    'Set GENERATION_PLACEHOLDER_ENABLED=true for the Phase 4A smoke processor',
  );
}
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set');
const { db, pool } = createDatabase(process.env.DATABASE_URL);
const connection = new Redis(redisUrl, {
  maxRetriesPerRequest: null,
  connectTimeout: 5000,
});
connection.on('error', () => console.error('Worker Redis connection failed'));
pool.on('error', () => console.error('Worker database connection failed'));
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const worker = new Worker(
  'edisco-generation',
  async (job) => {
    // Payload carries only the durable ID; inputs/ownership come from PostgreSQL.
    if (
      job.name !== 'generate' ||
      job.data.jobId !== job.id ||
      !uuid.test(job.id ?? '')
    ) {
      throw new Error('Invalid generation queue job');
    }
    return processGeneration(db, job.id as string);
  },
  { connection, prefix: process.env.GENERATION_QUEUE_PREFIX ?? 'bull' },
);
worker.on('error', () => console.error('Generation worker error'));
worker.on('failed', (job) => {
  // Covers terminal stalled-job failures; raw errors never reach the status API.
  if (job && uuid.test(job.id ?? '')) {
    void failGeneration(db, job.id as string).catch(() =>
      console.error('Could not persist failed generation status'),
    );
  }
});
async function close() {
  await worker.close();
  connection.disconnect();
  await pool.end();
}
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(
    signal,
    () =>
      void close().catch(() => {
        process.exitCode = 1;
      }),
  );
}
await worker.waitUntilReady();
console.info({ status: 'ok', service: 'worker' } satisfies HealthResponse);
