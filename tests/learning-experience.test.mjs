import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { buildApp } from '../apps/api/dist/app.js';
import { createDatabase } from '@edisco/database';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { fileURLToPath } from 'node:url';
import { users, tracks, lessons, parts, userLessons, userPartProgress, generationJobs } from '@edisco/database/schema';
import { eq } from 'drizzle-orm';

test('Learning Experience API', async (t) => {
  const connectionString = process.env.DATABASE_URL;
  assert.ok(connectionString, 'Set DATABASE_URL to the local development database');

  const admin = createDatabase(connectionString);
  const databaseName = `edisco_test_${randomUUID().replaceAll('-', '')}`;
  const testUrl = new URL(connectionString);
  testUrl.pathname = `/${databaseName}`;
  let database;
  let app;
  let created = false;

  await admin.pool.query(`CREATE DATABASE "${databaseName}" TEMPLATE template0`);
  database = createDatabase(testUrl.toString());
  created = true;

  const migrationsFolder = fileURLToPath(new URL('../apps/api/drizzle/', import.meta.url));
  await migrate(database.db, { migrationsFolder });

  process.env.DATABASE_URL = testUrl.toString();
  process.env.JWT_SECRET = 'test-secret';
  app = buildApp();
  await app.ready();

  // Register user
  const regRes = await app.inject({
    method: 'POST',
    url: '/auth/register',
    payload: { email: `test-learn-${Date.now()}@example.com`, password: 'password', name: 'Tester' }
  });
  if (regRes.statusCode !== 201) throw new Error(`Register failed: ${regRes.payload}`);
  const regBody = regRes.json();
  const token = regBody.token;
  const userId = regBody.userId;
  
  // Complete onboarding
  const obRes = await app.inject({
    method: 'PATCH',
    url: '/users/me/onboarding',
    headers: { Authorization: `Bearer ${token}` },
    payload: { interests: ['PROGRAMMING'], pace: 'REGULAR' }
  });
  if (obRes.statusCode !== 200) throw new Error(`Onboarding failed: ${obRes.payload}`);

  let trackId = '';
  let lessonId = '';
  let userLessonId = '';
  let partId = '';

  await t.test('Seed test data', async () => {
    const [track] = await app.db.insert(tracks).values({
      userId,
      title: 'Test Track',
      category: 'PROGRAMMING'
    }).returning();
    trackId = track.id;

    const [lesson] = await app.db.insert(lessons).values({
      trackTemplateTopic: 'Topic',
      category: 'PROGRAMMING',
      title: 'Test Lesson',
      description: 'Desc',
      contentVersion: 1,
      generatedByUserId: userId,
      expiresAt: new Date(Date.now() + 1000000)
    }).returning();
    lessonId = lesson.id;

    const [ul] = await app.db.insert(userLessons).values({
      userId,
      trackId,
      lessonId,
      orderInTrack: 1,
      status: 'NOT_STARTED',
      wasReused: false
    }).returning();
    userLessonId = ul.id;

    for (let i = 1; i <= 5; i++) {
      const [p] = await app.db.insert(parts).values({
        lessonId,
        order: i,
        type: i === 1 ? 'MULTIPLE_CHOICE' : 'SHORT_ANSWER',
        promptContent: i === 1 
          ? { question: 'Q', options: ['A', 'B'], correctAnswer: 'A', explanation: 'exp' }
          : { question: 'Q', correctAnswer: 'A', explanation: 'exp' }
      }).returning();
      if (i === 1) partId = p.id;
    }
  });

  await t.test('GET /tracks', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/tracks',
      headers: { Authorization: `Bearer ${token}` }
    });
    assert.equal(res.statusCode, 200);
    const body = res.json();
    assert.equal(body.tracks.length, 1);
    assert.equal(body.tracks[0].lessonCount, 1);
  });

  await t.test('GET /tracks/:trackId', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/tracks/${trackId}`,
      headers: { Authorization: `Bearer ${token}` }
    });
    assert.equal(res.statusCode, 200);
    const body = res.json();
    assert.equal(body.id, trackId);
    assert.equal(body.lessons.length, 1);
    assert.equal(body.lessons[0].userLessonId, userLessonId);
  });

  await t.test('GET /lessons', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/lessons`,
      headers: { Authorization: `Bearer ${token}` }
    });
    assert.equal(res.statusCode, 200);
    const body = res.json();
    assert.equal(body.tracks.length, 1);
    assert.equal(body.tracks[0].trackId, trackId);
    assert.equal(body.tracks[0].lessons[0].userLessonId, userLessonId);
  });

  await t.test('GET /lessons/:userLessonId', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/lessons/${userLessonId}`,
      headers: { Authorization: `Bearer ${token}` }
    });
    assert.equal(res.statusCode, 200);
    const body = res.json();
    assert.equal(body.userLessonId, userLessonId);
    assert.equal(body.parts.length, 5);
    // Ensure private data is omitted
    assert.equal(body.parts[0].prompt.correctAnswer, undefined);
    assert.equal(body.parts[0].prompt.options.length, 2);
  });

  await t.test('POST /lessons/:userLessonId/parts/:partId/answer (Incorrect)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/lessons/${userLessonId}/parts/${partId}/answer`,
      headers: { Authorization: `Bearer ${token}` },
      payload: { answer: 'B' }
    });
    assert.equal(res.statusCode, 200);
    const body = res.json();
    assert.equal(body.isCorrect, false);
    assert.equal(body.lessonCompleted, false);

    const progress = await app.db.query.userPartProgress.findFirst({
      where: (p, { and, eq }) => and(eq(p.userLessonId, userLessonId), eq(p.partId, partId))
    });
    assert.equal(progress.attempts, 1);
    assert.equal(progress.isCorrect, false);
    assert.equal(progress.completedAt, null);
  });

  await t.test('POST /lessons/:userLessonId/parts/:partId/answer (Correct)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/lessons/${userLessonId}/parts/${partId}/answer`,
      headers: { Authorization: `Bearer ${token}` },
      payload: { answer: 'A' }
    });
    assert.equal(res.statusCode, 200);
    const body = res.json();
    assert.equal(body.isCorrect, true);
    assert.equal(body.lessonCompleted, false);

    const progress = await app.db.query.userPartProgress.findFirst({
      where: (p, { and, eq }) => and(eq(p.userLessonId, userLessonId), eq(p.partId, partId))
    });
    assert.equal(progress.attempts, 2);
    assert.equal(progress.isCorrect, true);
    assert.notEqual(progress.completedAt, null);
  });
  
  await t.test('GET /lessons/generate/:jobId returns resultUserLessonId on DONE', async () => {
    const [job] = await app.db.insert(generationJobs).values({
      userId,
      trackId,
      requestedTopic: 'Test',
      category: 'PROGRAMMING',
      status: 'DONE',
      resultLessonId: lessonId
    }).returning();

    const res = await app.inject({
      method: 'GET',
      url: `/lessons/generate/${job.id}`,
      headers: { Authorization: `Bearer ${token}` }
    });
    assert.equal(res.statusCode, 200);
    const body = res.json();
    assert.equal(body.status, 'DONE');
    assert.equal(body.resultLessonId, lessonId);
    assert.equal(body.resultUserLessonId, userLessonId);
  });

  // Cleanup
  try {
    await app?.close();
    if (database) await database.pool.end();
    if (created) await admin.pool.query(`DROP DATABASE "${databaseName}"`);
  } finally {
    await admin.pool.end();
  }
});
