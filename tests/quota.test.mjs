import test from 'node:test';
import assert from 'node:assert/strict';
import { createDatabase } from '@edisco/database';
import { users, generationJobs } from '@edisco/database/schema';
import { processGeneration } from '../apps/worker/dist/generation.js';
import { randomUUID } from 'node:crypto';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { eq } from 'drizzle-orm';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { responseFixture } from './support/lesson-fixture.mjs';

const connectionString =
  process.env.DATABASE_URL ||
  'postgresql://edisco:edisco_local_only@127.0.0.1:55432/edisco';

test('concurrent finalization strictly obeys quota constraint', async (t) => {
  process.env.SIMILARITY_MAX_DISTANCE = '0';
  process.env.OPENAI_API_KEY = 'test';
  
  const { db, pool } = createDatabase(connectionString);
  await migrate(db, {
    migrationsFolder: fileURLToPath(
      new URL('../apps/api/drizzle/', import.meta.url),
    ),
  });

  t.mock.method(globalThis, 'fetch', async (url) => {
    if (url === 'https://api.openai.com/v1/embeddings') {
      return Response.json({
        model: 'text-embedding-3-small',
        data: [{ index: 0, embedding: new Array(1536).fill(0.01) }],
        usage: { prompt_tokens: 5, total_tokens: 5 },
      });
    }
    if (url === 'https://api.openai.com/v1/responses') {
      return Response.json(responseFixture());
    }
    throw new Error('Unexpected fetch: ' + url);
  });

  const userId = randomUUID();
  await db.insert(users).values({
    id: userId,
    email: `concurrent-${userId}@example.com`,
    passwordHash: 'dummy',
    name: 'Quota User',
    freeGenerationsLeft: 1, // Only 1 credit
    pace: 'REGULAR',
    onboardingCompletedAt: new Date(),
  });

  const [job1] = await db.insert(generationJobs).values({
    userId,
    category: 'PROGRAMMING',
    requestedTopic: 'Topic A',
    status: 'PENDING'
  }).returning();
  
  const [job2] = await db.insert(generationJobs).values({
    userId,
    category: 'PROGRAMMING',
    requestedTopic: 'Topic B',
    status: 'PENDING'
  }).returning();

  const p1 = processGeneration(db, job1.id, 'llm').catch(() => {});
  const p2 = processGeneration(db, job2.id, 'llm').catch(() => {});
  
  await Promise.all([p1, p2]);

  const [finalJob1] = await db.select().from(generationJobs).where(eq(generationJobs.id, job1.id));
  const [finalJob2] = await db.select().from(generationJobs).where(eq(generationJobs.id, job2.id));
  console.log('Job 1:', finalJob1.status, finalJob1.errorMessage);
  console.log('Job 2:', finalJob2.status, finalJob2.errorMessage);
  console.log('Quota left:', (await db.select().from(users).where(eq(users.id, userId)))[0].freeGenerationsLeft);

  assert.equal(
    (finalJob1.status === 'DONE' && finalJob2.status === 'FAILED') ||
    (finalJob1.status === 'FAILED' && finalJob2.status === 'DONE'),
    true,
    'Exactly one job should succeed'
  );

  const failedJob = finalJob1.status === 'FAILED' ? finalJob1 : finalJob2;
  assert.equal(failedJob.errorMessage, 'Free generation quota has been used up');

  const [user] = await db.select().from(users).where(eq(users.id, userId));
  assert.equal(user.freeGenerationsLeft, 0, 'Quota should be exactly 0');

  await pool.end();
});
