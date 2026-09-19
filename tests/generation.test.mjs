import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { setTimeout } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { createDatabase } from '@edisco/database';
import { users, tracks } from '@edisco/database/schema';
import { Queue } from 'bullmq';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Redis } from 'ioredis';
import { buildApp } from '../apps/api/dist/app.js';

async function eventually(read, matches) {
  for (let i = 0; i < 150; i++) {
    const value = await read();
    if (matches(value)) return value;
    await setTimeout(50);
  }
  assert.fail('Expected pipeline state was not reached');
}

test('generation API -> PostgreSQL -> Redis -> worker -> status', {
  timeout: 30000,
}, async (t) => {
  assert.ok(process.env.DATABASE_URL);
  assert.ok(process.env.REDIS_URL);
  const originalEnv = { ...process.env };
  const name = `edisco_test_generation_${randomUUID().replaceAll('-', '')}`;
  const prefix = name;
  const admin = createDatabase(process.env.DATABASE_URL);
  const url = new URL(process.env.DATABASE_URL);
  url.pathname = `/${name}`;
  let created = false;
  let database, app, queue, redis, worker, lock;
  t.after(async () => {
    if (lock) {
      await lock.query('SELECT pg_advisory_unlock_all()');
      lock.release();
    }
    if (worker && worker.exitCode === null) {
      const exited = once(worker, 'exit');
      worker.kill();
      await exited;
    }
    await app?.close();
    if (queue) {
      assert.match(prefix, /^edisco_test_generation_[a-f0-9]{32}$/);
      await queue.obliterate({ force: true });
      await queue.close();
    }
    redis?.disconnect();
    await database?.pool.end();
    try {
      if (created) await admin.pool.query(`DROP DATABASE "${name}"`);
    } finally {
      await admin.pool.end();
      process.env = originalEnv;
    }
  });
  await admin.pool.query(`CREATE DATABASE "${name}" TEMPLATE template0`);
  created = true;
  database = createDatabase(url.toString());
  await migrate(database.db, {
    migrationsFolder: fileURLToPath(
      new URL('../apps/api/drizzle/', import.meta.url),
    ),
  });
  process.env.DATABASE_URL = url.toString();
  process.env.JWT_SECRET = 'generation-integration-test-only';
  process.env.GENERATION_PLACEHOLDER_ENABLED = 'true';
  process.env.GENERATION_QUEUE_PREFIX = prefix;
  app = buildApp();
  await app.ready();
  redis = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: 1 });
  queue = new Queue('edisco-generation', { connection: redis, prefix });
  await queue.waitUntilReady();
  const [owner, stranger, incomplete, exhausted] = await database.db
    .insert(users)
    .values([
      {
        email: 'owner@example.test',
        name: 'Owner',
        pace: 'CASUAL',
        interests: ['programming'],
        onboardingCompletedAt: new Date(),
        freeGenerationsLeft: 100,
      },
      {
        email: 'stranger@example.test',
        name: 'Stranger',
        pace: 'REGULAR',
        interests: ['math'],
        onboardingCompletedAt: new Date(),
      },
      { email: 'incomplete@example.test', name: 'Incomplete' },
      {
        email: 'exhausted@example.test',
        name: 'Exhausted',
        pace: 'REGULAR',
        onboardingCompletedAt: new Date(),
        freeGenerationsLeft: 0,
      },
    ])
    .returning();
  const [track] = await database.db
    .insert(tracks)
    .values({
      userId: owner.id,
      title: 'Python basics',
      category: 'PROGRAMMING',
    })
    .returning();
  const headers = (user = owner) => ({
    authorization: `Bearer ${app.jwt.sign({ userId: user.id })}`,
  });
  const post = (payload, user = owner, instance = app) =>
    instance.inject({
      method: 'POST',
      url: '/lessons/generate',
      headers: headers(user),
      payload,
    });
  const status = (id, user = owner) =>
    app.inject({
      method: 'GET',
      url: `/lessons/generate/${id}`,
      headers: headers(user),
    });
  const payload = { topic: 'Python basics', category: 'PROGRAMMING' };

  await t.test(
    'guards reject unauthorized, invalid, incomplete, exhausted, and foreign-track requests',
    async () => {
      assert.equal(
        (
          await app.inject({
            method: 'POST',
            url: '/lessons/generate',
            payload,
          })
        ).statusCode,
        401,
      );
      assert.equal((await post({ category: 'PROGRAMMING' })).statusCode, 400);
      assert.equal(
        (await post({ ...payload, category: 'INVALID' })).statusCode,
        400,
      );
      assert.equal((await post(payload, incomplete)).statusCode, 403);
      assert.equal(
        (await post(payload, exhausted)).json().error,
        'QUOTA_EXCEEDED',
      );
      assert.equal(
        (await post({ category: 'PROGRAMMING', trackId: track.id }, stranger))
          .statusCode,
        404,
      );
      assert.equal(
        (await post({ category: 'MATH', trackId: track.id })).statusCode,
        400,
      );
      process.env.GENERATION_PLACEHOLDER_ENABLED = 'false';
      assert.equal((await post(payload)).statusCode, 503);
      process.env.GENERATION_PLACEHOLDER_ENABLED = 'true';
      assert.equal(
        (await database.pool.query('SELECT * FROM generation_jobs')).rowCount,
        0,
      );
    },
  );

  const accepted = await post(payload);
  assert.equal(accepted.statusCode, 202);
  const jobId = accepted.json().jobId;
  await t.test(
    'PENDING is persisted and queued with the same ID; polling is owner-only',
    async () => {
      assert.equal(accepted.json().status, 'PENDING');
      const job = await queue.getJob(jobId);
      assert.equal(await job.getState(), 'waiting');
      assert.deepEqual(job.data, { jobId });
      assert.deepEqual((await status(jobId)).json(), {
        jobId,
        status: 'PENDING',
        resultLessonId: null,
        resultUserLessonId: null,
        trackId: null,
        errorMessage: null,
      });
      assert.equal((await status(jobId, stranger)).statusCode, 404);
      assert.equal((await status(randomUUID())).statusCode, 404);
      assert.equal((await status('invalid')).statusCode, 400);
      assert.equal(
        (await app.inject({ method: 'GET', url: `/lessons/generate/${jobId}` }))
          .statusCode,
        401,
      );
      await queue.add('generate', { jobId }, { jobId });
      assert.equal(await queue.getWaitingCount(), 1);
    },
  );
  const failedId = (
    await post({ ...payload, topic: 'Corrupted fixture' })
  ).json().jobId;
  // Fault injection stays entirely in the test: no public failure switch or magic topic.
  await database.pool.query(
    'UPDATE generation_jobs SET requested_topic = $1 WHERE id = $2',
    ['', failedId],
  );
  const continued = await post({ category: 'PROGRAMMING', trackId: track.id });
  assert.equal(continued.statusCode, 202);

  // Hold DONE at a database barrier to observe real PROCESSING without timing sleeps.
  await database.pool.query(`CREATE FUNCTION test_hold_done() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN IF NEW.status = 'DONE' THEN PERFORM pg_advisory_xact_lock(4141); END IF; RETURN NEW; END $$;
    CREATE TRIGGER test_hold_done BEFORE UPDATE ON generation_jobs FOR EACH ROW EXECUTE FUNCTION test_hold_done();`);
  lock = await database.pool.connect();
  await lock.query('SELECT pg_advisory_lock(4141)');
  worker = spawn(process.execPath, ['apps/worker/dist/index.js'], {
    env: process.env,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  worker.stdout.on('data', (chunk) => {
    output += chunk;
  });
  worker.stderr.on('data', (chunk) => {
    output += chunk;
  });
  await t.test(
    'separate worker receives the job and exposes PROCESSING then DONE',
    async () => {
      await eventually(
        () => output,
        (value) => value.includes("service: 'worker'"),
      );
      await eventually(
        async () => (await status(jobId)).json(),
        (body) => body.status === 'PROCESSING',
      );
      await lock.query('SELECT pg_advisory_unlock_all()');
      lock.release();
      lock = undefined;
      const body = await eventually(
        async () => (await status(jobId)).json(),
        (value) => value.status === 'DONE',
      );
      assert.equal(body.resultLessonId, null);
      assert.equal(body.errorMessage, null);
      await eventually(
        async () => (await queue.getJob(jobId)).getState(),
        (state) => state === 'completed',
      );
      assert.deepEqual((await queue.getJob(jobId)).returnvalue, {
        placeholder: true,
        jobId,
      });
    },
  );
  await t.test(
    'processor failure is persisted and continuation preserves its track',
    async () => {
      const failed = await eventually(
        async () => (await status(failedId)).json(),
        (body) => body.status === 'FAILED',
      );
      assert.equal(failed.errorMessage, 'Generation processing failed');
      assert.equal(failed.resultLessonId, null);
      await eventually(
        async () => (await queue.getJob(failedId)).getState(),
        (value) => value === 'failed',
      );
      const next = await eventually(
        async () => (await status(continued.json().jobId)).json(),
        (body) => body.status === 'DONE',
      );
      assert.equal(next.trackId, track.id);
    },
  );
  await t.test(
    'terminal redelivery does not change state or quota or create content',
    async () => {
      const before = (
        await database.pool.query(
          'SELECT * FROM generation_jobs WHERE id = $1',
          [jobId],
        )
      ).rows[0];
      await (await queue.getJob(jobId)).remove();
      await queue.add('generate', { jobId }, { jobId });
      await eventually(
        async () => (await queue.getJob(jobId)).getState(),
        (value) => value === 'completed',
      );
      assert.deepEqual(
        (
          await database.pool.query(
            'SELECT * FROM generation_jobs WHERE id = $1',
            [jobId],
          )
        ).rows[0],
        before,
      );
      assert.equal(
        (
          await database.pool.query(
            'SELECT free_generations_left FROM users WHERE id = $1',
            [owner.id],
          )
        ).rows[0].free_generations_left,
        100,
      );
      assert.equal(
        (await database.pool.query('SELECT * FROM lessons')).rowCount,
        0,
      );
      assert.equal(
        (await database.pool.query('SELECT * FROM parts')).rowCount,
        0,
      );
      assert.equal(
        (await database.pool.query('SELECT * FROM user_lessons')).rowCount,
        0,
      );
      assert.equal(
        (await database.pool.query('SELECT * FROM tracks')).rowCount,
        1,
      );
    },
  );
  await t.test(
    'queue submission failure returns a safe error and records FAILED',
    async () => {
      const redisUrl = process.env.REDIS_URL;
      process.env.REDIS_URL = 'redis://127.0.0.1:1';
      const unavailable = buildApp();
      try {
        const result = await post(
          { ...payload, topic: 'Queue unavailable fixture' },
          owner,
          unavailable,
        );
        assert.equal(result.statusCode, 503);
        assert.equal(result.json().error, 'GENERATION_FAILED');
        const {
          rows: [job],
        } = await database.pool.query(
          'SELECT * FROM generation_jobs WHERE requested_topic = $1',
          ['Queue unavailable fixture'],
        );
        assert.equal(job.status, 'FAILED');
        assert.equal(
          (await status(job.id)).json().errorMessage,
          'Generation queue unavailable',
        );
      } finally {
        await unavailable.close();
        process.env.REDIS_URL = redisUrl;
      }
    },
  );
});
