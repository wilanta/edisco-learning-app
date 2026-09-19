import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { createDatabase } from '@edisco/database';
import {
  users,
  lessons,
  parts,
  tracks,
  userLessons,
  generationJobs,
  userPartProgress,
} from '@edisco/database/schema';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import {
  findReuseCandidate,
  contextKey,
  EMBEDDING_PROFILE,
} from '../apps/worker/dist/embedding/reuse.js';
import { processGeneration } from '../apps/worker/dist/generation.js';
import { buildApp } from '../apps/api/dist/app.js';
import { lessonFixture, responseFixture } from './support/lesson-fixture.mjs';

const vector = (x = 1, y = 0) => [x, y, ...Array(1534).fill(0)];

test('semantic reuse with actual pgvector and transactional generation', {
  timeout: 60000,
}, async (t) => {
  const original = { ...process.env };
  const name = `edisco_test_reuse_${randomUUID().replaceAll('-', '')}`;
  const admin = createDatabase(process.env.DATABASE_URL);
  const url = new URL(process.env.DATABASE_URL);
  url.pathname = `/${name}`;
  let database,
    created = false;
  t.after(async () => {
    await database?.pool.end();
    try {
      if (created) await admin.pool.query(`DROP DATABASE "${name}"`);
    } finally {
      await admin.pool.end();
      process.env = original;
    }
  });
  await admin.pool.query(`CREATE DATABASE "${name}" TEMPLATE template0`);
  created = true;
  database = createDatabase(url.toString());
  const { db, pool } = database;
  await migrate(db, {
    migrationsFolder: fileURLToPath(
      new URL('../apps/api/drizzle/', import.meta.url),
    ),
  });
  const [owner, other] = await db
    .insert(users)
    .values(
      ['owner', 'other'].map((name) => ({
        name,
        email: `${name}@reuse.test`,
        pace: 'REGULAR',
        onboardingCompletedAt: new Date(),
      })),
    )
    .returning();
  const criteria = {
    category: 'PROGRAMMING',
    pace: 'REGULAR',
    context: contextKey([]),
    trackId: null,
    embedding: vector(),
  };
  const content = lessonFixture();
  async function seed(values = {}) {
    const [lesson] = await db
      .insert(lessons)
      .values({
        trackTemplateTopic: 'python',
        category: 'PROGRAMMING',
        title: content.title,
        description: content.description,
        generatedByUserId: owner.id,
        embedding: vector(),
        embeddingProfile: EMBEDDING_PROFILE,
        generationPace: 'REGULAR',
        generationContext: contextKey([]),
        expiresAt: new Date(Date.now() + 86400000),
        ...values,
      })
      .returning();
    await db
      .insert(parts)
      .values(content.parts.map((part) => ({ ...part, lessonId: lesson.id })));
    return lesson;
  }
  async function job(userId = other.id, values = {}) {
    const [row] = await db
      .insert(generationJobs)
      .values({
        userId,
        requestedTopic: 'Python',
        category: 'PROGRAMMING',
        status: 'PENDING',
        ...values,
      })
      .returning();
    return row;
  }

  await t.test(
    'no candidates; lower/equal/higher distance boundary; actual nearest wins',
    async () => {
      assert.equal((await findReuseCandidate(db, criteria, 1)).lessonId, null);
      const candidate = await seed({ embedding: vector(0, 1) }); // Exactly orthogonal: distance 1.
      assert.equal(
        (await findReuseCandidate(db, criteria, 0.5)).lessonId,
        null,
      );
      assert.equal(
        (await findReuseCandidate(db, criteria, 1)).lessonId,
        candidate.id,
      );
      assert.equal(
        (await findReuseCandidate(db, criteria, 1.5)).lessonId,
        candidate.id,
      );
      const nearer = await seed({ embedding: vector() });
      assert.equal(
        (await findReuseCandidate(db, criteria, 0)).lessonId,
        nearer.id,
      );
      await db.update(lessons).set({ isExpiredForReuse: true });
    },
  );
  await t.test(
    'every eligibility filter runs before choosing top-1, including legacy metadata and expiry boundary',
    async () => {
      const [track] = await db
        .insert(tracks)
        .values({ userId: other.id, title: 'Python', category: 'PROGRAMMING' })
        .returning();
      const forbidden = [
        { category: 'MATH' },
        { isExpiredForReuse: true },
        { expiresAt: new Date(0) },
        { embedding: null },
        { embeddingProfile: 'another-model' },
        { embeddingProfile: null },
        { generationPace: 'CASUAL' },
        { generationPace: null },
        { generationContext: contextKey(['different']) },
        { generationContext: null },
        { contentVersion: 2 },
      ];
      for (const values of forbidden) await seed(values);
      const repeated = await seed();
      await db.insert(userLessons).values({
        userId: other.id,
        trackId: track.id,
        lessonId: repeated.id,
        orderInTrack: 1,
        status: 'COMPLETED',
        wasReused: true,
      });
      const allowed = await seed({ embedding: vector(0, 1) });
      assert.equal(
        (await findReuseCandidate(db, { ...criteria, trackId: track.id }, 1))
          .lessonId,
        allowed.id,
      );
      assert.equal(
        (await findReuseCandidate(db, criteria, 0)).lessonId,
        repeated.id,
      ); // Same-user reuse remains allowed for new tracks.
      await pool.query('UPDATE lessons SET expires_at = now() WHERE id = $1', [
        allowed.id,
      ]);
      assert.equal(
        (await findReuseCandidate(db, { ...criteria, trackId: track.id }, 1))
          .lessonId,
        null,
      );
      await db.update(lessons).set({ isExpiredForReuse: true });
    },
  );
  process.env.OPENAI_API_KEY = 'test-key-only';
  process.env.SIMILARITY_MAX_DISTANCE = '0';
  let embeddingCalls = 0,
    llmCalls = 0,
    failEmbedding = false;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    if (url === 'https://api.openai.com/v1/embeddings') {
      embeddingCalls++;
      if (failEmbedding) throw new Error('private embedding failure');
      const representation = JSON.parse(JSON.parse(options.body).input);
      assert.equal(representation.category, 'PROGRAMMING');
      assert.equal(representation.pace, 'REGULAR');
      return Response.json({
        model: 'text-embedding-3-small',
        data: [{ index: 0, embedding: vector() }],
      });
    }
    assert.equal(url, 'https://api.openai.com/v1/responses');
    llmCalls++;
    return Response.json(responseFixture());
  });
  let generated, reused;
  await t.test(
    'miss embeds then generates; hit only embeds and preserves shared content/provenance/expiry',
    async () => {
      generated = await job(owner.id);
      await processGeneration(db, generated.id, 'llm');
      const first = await db.query.generationJobs.findFirst({
        where: eq(generationJobs.id, generated.id),
      });
      const originalLesson = await db.query.lessons.findFirst({
        where: eq(lessons.id, first.resultLessonId),
      });
      assert.deepEqual(originalLesson.embedding, vector());
      assert.equal(originalLesson.embeddingProfile, EMBEDDING_PROFILE);
      assert.equal(originalLesson.generationPace, 'REGULAR');
      assert.equal(originalLesson.generationContext, contextKey([]));
      const originalAssignment = await db.query.userLessons.findFirst({
        where: eq(userLessons.lessonId, first.resultLessonId),
      });
      const originalPart = await db.query.parts.findFirst({
        where: eq(parts.lessonId, first.resultLessonId),
      });
      await db.insert(userPartProgress).values({
        userLessonId: originalAssignment.id,
        partId: originalPart.id,
        isCorrect: true,
        attempts: 1,
        xpEarned: 10,
      });
      reused = await job();
      await processGeneration(db, reused.id, 'llm');
      const second = await db.query.generationJobs.findFirst({
        where: eq(generationJobs.id, reused.id),
      });
      assert.equal(second.resultLessonId, first.resultLessonId);
      assert.notEqual(second.trackId, first.trackId);
      assert.equal(embeddingCalls, 2);
      assert.equal(llmCalls, 1);
      assert.deepEqual(
        await db.query.lessons.findFirst({
          where: eq(lessons.id, first.resultLessonId),
        }),
        originalLesson,
      );
      const assignments = await db
        .select()
        .from(userLessons)
        .where(eq(userLessons.lessonId, first.resultLessonId));
      assert.equal(assignments.length, 2);
      const progress = await db.select().from(userPartProgress);
      assert.equal(progress.length, 1);
      assert.equal(progress[0].userLessonId, originalAssignment.id);
      assert.equal(progress[0].xpEarned, 10);
      assert.deepEqual(assignments.map((a) => a.wasReused).sort(), [
        false,
        true,
      ]);
      assert.ok(
        assignments.every(
          (a) =>
            a.status === 'NOT_STARTED' &&
            a.startedAt === null &&
            a.completedAt === null,
        ),
      );

      await processGeneration(db, reused.id, 'llm');
      assert.equal(embeddingCalls, 2);
      assert.equal(llmCalls, 1);
    },
  );
  await t.test(
    'continuation context prevents repeating content and permits compatible cross-user continuation reuse',
    async () => {
      const first = await db.query.generationJobs.findFirst({
        where: eq(generationJobs.id, generated.id),
      });
      const second = await db.query.generationJobs.findFirst({
        where: eq(generationJobs.id, reused.id),
      });
      const next = await job(owner.id, { trackId: first.trackId });
      await processGeneration(db, next.id, 'llm');
      const nextOther = await job(other.id, { trackId: second.trackId });
      await processGeneration(db, nextOther.id, 'llm');
      const a = await db.query.generationJobs.findFirst({
        where: eq(generationJobs.id, next.id),
      });
      const b = await db.query.generationJobs.findFirst({
        where: eq(generationJobs.id, nextOther.id),
      });
      assert.notEqual(a.resultLessonId, first.resultLessonId);
      assert.equal(a.resultLessonId, b.resultLessonId);
      assert.equal(llmCalls, 2);
      assert.equal(
        (
          await db.query.lessons.findFirst({
            where: eq(lessons.id, a.resultLessonId),
          })
        ).generationContext,
        contextKey([first.resultLessonId]),
      );
    },
  );
  await t.test(
    'embedding failure fails the job without falling through to LLM, assignment, or quota change',
    async () => {
      failEmbedding = true;
      const before = (await pool.query('SELECT count(*) FROM user_lessons'))
        .rows[0].count;
      const failed = await job();
      await assert.rejects(
        processGeneration(db, failed.id, 'llm'),
        /Generation processing failed/,
      );
      const row = await db.query.generationJobs.findFirst({
        where: eq(generationJobs.id, failed.id),
      });
      assert.equal(row.status, 'FAILED');
      assert.equal(row.resultLessonId, null);
      assert.equal(row.errorMessage, 'Generation processing failed');
      assert.equal(llmCalls, 2);
      assert.equal(
        (await pool.query('SELECT count(*) FROM user_lessons')).rows[0].count,
        before,
      );

      failEmbedding = false;
    },
  );
  await t.test(
    'missing threshold or search failure cannot bypass reuse and call the LLM',
    async (t) => {
      const llmBefore = llmCalls,
        embeddingBefore = embeddingCalls;
      delete process.env.SIMILARITY_MAX_DISTANCE;
      const unconfigured = await job();
      await assert.rejects(processGeneration(db, unconfigured.id, 'llm'));
      assert.equal(embeddingCalls, embeddingBefore);
      process.env.SIMILARITY_MAX_DISTANCE = '0';
      t.mock.method(db, 'transaction', async () => {
        throw new Error('test search failure');
      });
      const failedSearch = await job();
      await assert.rejects(processGeneration(db, failedSearch.id, 'llm'));
      assert.equal(
        (
          await db.query.generationJobs.findFirst({
            where: eq(generationJobs.id, failedSearch.id),
          })
        ).status,
        'FAILED',
      );
      assert.equal(llmCalls, llmBefore);
    },
  );
  await t.test(
    'a candidate expiring after search is rejected at finalization without a new assignment',
    async (t) => {
      const originalTransaction = db.transaction.bind(db);
      let calls = 0;
      t.mock.method(db, 'transaction', async (...args) => {
        if (++calls === 2)
          await pool.query(
            'UPDATE lessons SET expires_at = now() WHERE NOT is_expired_for_reuse',
          );
        return originalTransaction(...args);
      });
      const before = (await pool.query('SELECT count(*) FROM user_lessons'))
        .rows[0].count;
      const pending = await job();
      await assert.rejects(
        processGeneration(db, pending.id, 'llm'),
        /Generation processing failed/,
      );
      assert.equal(
        (
          await db.query.generationJobs.findFirst({
            where: eq(generationJobs.id, pending.id),
          })
        ).status,
        'FAILED',
      );
      assert.equal(
        (await pool.query('SELECT count(*) FROM user_lessons')).rows[0].count,
        before,
      );
      assert.equal(llmCalls, 2);
    },
  );
  await t.test(
    'status API exposes identical safe result fields and preserves owner isolation for reuse',
    async () => {
      process.env.DATABASE_URL = url.toString();
      process.env.JWT_SECRET = 'reuse-test-only';
      const app = buildApp();
      try {
        await app.ready();
        const status = (userId) =>
          app.inject({
            method: 'GET',
            url: `/lessons/generate/${reused.id}`,
            headers: { authorization: `Bearer ${app.jwt.sign({ userId })}` },
          });
        const result = await status(other.id);
        assert.equal(result.statusCode, 200);
        assert.equal(result.json().status, 'DONE');
        assert.deepEqual(Object.keys(result.json()).sort(), [
          'errorMessage',
          'jobId',
          'resultLessonId',
          'resultUserLessonId',
          'status',
          'trackId',
        ]);
        assert.equal((await status(owner.id)).statusCode, 404);
      } finally {
        await app.close();
      }
    },
  );
  await t.test(
    'the actual filtered nearest-neighbor SQL uses HNSW with a 1000-lesson fixture',
    async () => {
      await pool.query(
        `INSERT INTO lessons (track_template_topic, category, title, description, generated_by_user_id, embedding, embedding_profile, generation_pace, generation_context, expires_at)
      SELECT 'index fixture', 'SCIENCE', 'Index fixture', 'Test only', $1,
        (ARRAY[cos(n::float8),sin(n::float8)] || array_fill(0::float8, ARRAY[1534]))::vector,
        $2, 'REGULAR', $3, now() + interval '1 day'
      FROM generate_series(1,1000) n`,
        [owner.id, EMBEDDING_PROFILE, contextKey([])],
      );
      await pool.query('ANALYZE lessons');
      let query;
      const observed = drizzle(pool, {
        logger: {
          logQuery(text, params) {
            if (text.startsWith('select') && text.includes('<=>'))
              query = { text, params };
          },
        },
      });
      const match = await findReuseCandidate(
        observed,
        { ...criteria, category: 'SCIENCE' },
        2,
      );
      assert.ok(match.lessonId);
      assert.ok(query);
      const connection = await pool.connect();
      try {
        await connection.query('BEGIN');
        await connection.query('SET LOCAL enable_sort = off');
        await connection.query(
          "SET LOCAL hnsw.iterative_scan = 'strict_order'",
        );
        const plan = (
          await connection.query(
            `EXPLAIN (ANALYZE, FORMAT JSON) ${query.text}`,
            query.params,
          )
        ).rows[0]['QUERY PLAN'];
        assert.match(JSON.stringify(plan), /lessons_embedding_hnsw_idx/);
        assert.doesNotMatch(JSON.stringify(plan), /Seq Scan/);
        assert.equal(plan[0].Plan['Actual Rows'], 5);
      } finally {
        await connection.query('ROLLBACK');
        connection.release();
      }
    },
  );
});
