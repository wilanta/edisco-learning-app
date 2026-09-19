import { RedisConnection } from 'bullmq';
import { Redis } from 'ioredis';
import type { HealthResponse } from '@edisco/shared-types';

const redisUrl = process.env.REDIS_URL;
if (
  !redisUrl ||
  !URL.canParse(redisUrl) ||
  !['redis:', 'rediss:'].includes(new URL(redisUrl).protocol)
) {
  throw new Error('REDIS_URL must use redis:// or rediss://');
}

const redis = new Redis(redisUrl, {
  lazyConnect: true,
  maxRetriesPerRequest: null,
  connectTimeout: 5000,
  // ponytail: fail fast; job recovery/retry policy belongs to Phase 4A.
  retryStrategy: () => null,
});
const connection = new RedisConnection(redis);
connection.on('error', () => {
  console.error('Worker Redis connection failed');
  process.exitCode = 1;
  void connection.close(true);
});
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => void connection.close());
}

try {
  await connection.client;
  console.info({ status: 'ok', service: 'worker' } satisfies HealthResponse);
  // No queue or processor until Phase 4A; this process only holds a verified connection.
} catch {
  await connection.close(true);
  process.exitCode = 1;
}
