import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { buildApp } from '../apps/api/dist/app.js';
import { createDatabase } from '@edisco/database';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { fileURLToPath } from 'node:url';
import {
  users,
  tracks,
  lessons,
  parts,
  userLessons,
  userPartProgress,
  weeklyLeagueEntries,
} from '@edisco/database/schema';
import { eq } from 'drizzle-orm';

test('Gamification API', async (t) => {
  const connectionString = process.env.DATABASE_URL;
  assert.ok(
    connectionString,
    'Set DATABASE_URL to the local development database',
  );

  const admin = createDatabase(connectionString);
  const databaseName = `edisco_test_${randomUUID().replaceAll('-', '')}`;
  const testUrl = new URL(connectionString);
  testUrl.pathname = `/${databaseName}`;
  let database;
  let app;
  let created = false;

  await admin.pool.query(
    `CREATE DATABASE "${databaseName}" TEMPLATE template0`,
  );
  database = createDatabase(testUrl.toString());
  created = true;

  const migrationsFolder = fileURLToPath(
    new URL('../apps/api/drizzle/', import.meta.url),
  );
  await migrate(database.db, { migrationsFolder });

  process.env.DATABASE_URL = testUrl.toString();
  process.env.JWT_SECRET = 'test-secret';
  app = buildApp();
  await app.ready();

  let token = '';
  let userId = '';
  let trackId = '';
  let lessonId = '';
  let userLessonId = '';
  let partIds = [];

  await t.test('Seed user and track', async () => {
    const regRes = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: `test-gami-${Date.now()}@example.com`,
        password: 'password',
        name: 'Tester G',
      },
    });
    const regBody = regRes.json();
    token = regBody.token;
    userId = regBody.userId;

    await app.inject({
      method: 'PATCH',
      url: '/users/me/onboarding',
      headers: { Authorization: `Bearer ${token}` },
      payload: { interests: ['PROGRAMMING'], pace: 'REGULAR' },
    });

    const [track] = await app.db
      .insert(tracks)
      .values({
        userId,
        title: 'Gamification Track',
        category: 'PROGRAMMING',
      })
      .returning();
    trackId = track.id;

    const [lesson] = await app.db
      .insert(lessons)
      .values({
        trackTemplateTopic: 'Topic',
        category: 'PROGRAMMING',
        title: 'Gamification Lesson',
        description: 'Desc',
        contentVersion: 1,
        generatedByUserId: userId,
        expiresAt: new Date(Date.now() + 1000000),
      })
      .returning();
    lessonId = lesson.id;

    const [ul] = await app.db
      .insert(userLessons)
      .values({
        userId,
        trackId,
        lessonId,
        orderInTrack: 1,
        status: 'NOT_STARTED',
        wasReused: false,
      })
      .returning();
    userLessonId = ul.id;

    for (let i = 1; i <= 5; i++) {
      const [p] = await app.db
        .insert(parts)
        .values({
          lessonId,
          order: i,
          type: 'MULTIPLE_CHOICE',
          promptContent: {
            question: `Q${i}`,
            options: ['A', 'B'],
            correctAnswer: 'A',
            explanation: 'exp',
          },
        })
        .returning();
      partIds.push(p.id);
    }
  });

  await t.test('Submit wrong answer (0 XP)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/lessons/${userLessonId}/parts/${partIds[0]}/answer`,
      headers: { Authorization: `Bearer ${token}` },
      payload: { answer: 'B' }, // wrong
    });
    const body = res.json();
    assert.equal(body.isCorrect, false);
    assert.equal(body.xpEarned, 0);
  });

  await t.test(
    'Submit correct answer on retry (5 XP for part, 5 XP for streak = 10 XP)',
    async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/lessons/${userLessonId}/parts/${partIds[0]}/answer`,
        headers: { Authorization: `Bearer ${token}` },
        payload: { answer: 'A' }, // correct
      });
      const body = res.json();
      assert.equal(body.isCorrect, true);
      assert.equal(body.xpEarned, 10); // 5 XP (retry) + 5 XP (streak)
    },
  );

  await t.test(
    'Submit correct answer on first try (10 XP for part, no streak bonus = 10 XP)',
    async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/lessons/${userLessonId}/parts/${partIds[1]}/answer`,
        headers: { Authorization: `Bearer ${token}` },
        payload: { answer: 'A' }, // correct
      });
      const body = res.json();
      assert.equal(body.isCorrect, true);
      assert.equal(body.xpEarned, 10); // 10 XP (first try) + 0 XP (streak already given)
    },
  );

  await t.test('Complete lesson (bonus 20 XP)', async () => {
    // Answer part 3
    await app.inject({
      method: 'POST',
      url: `/lessons/${userLessonId}/parts/${partIds[2]}/answer`,
      headers: { Authorization: `Bearer ${token}` },
      payload: { answer: 'A' },
    });
    // Answer part 4
    await app.inject({
      method: 'POST',
      url: `/lessons/${userLessonId}/parts/${partIds[3]}/answer`,
      headers: { Authorization: `Bearer ${token}` },
      payload: { answer: 'A' },
    });

    // Answer part 5 to complete
    const res = await app.inject({
      method: 'POST',
      url: `/lessons/${userLessonId}/parts/${partIds[4]}/answer`,
      headers: { Authorization: `Bearer ${token}` },
      payload: { answer: 'A' }, // correct
    });
    const body = res.json();
    assert.equal(body.isCorrect, true);
    assert.equal(body.lessonCompleted, true);
    // 10 XP (first try) + 20 XP (lesson completion) = 30 XP
    assert.equal(body.xpEarned, 30);
  });

  await t.test('Check user profile XP and Streak', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/users/me',
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = res.json();
    // Total XP:
    // Part 1: 5 (retry) + 5 (streak) = 10
    // Part 2: 10
    // Part 3: 10
    // Part 4: 10
    // Part 5: 10 (part) + 20 (lesson) = 30
    // Total = 10 + 10 + 10 + 10 + 30 = 70 XP
    assert.equal(body.totalXp, 70);
    assert.equal(body.currentStreak, 1);
    assert.equal(body.longestStreak, 1);
  });

  await t.test('GET /league/weekly', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/league/weekly',
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(res.statusCode, 200);
    const body = res.json();
    assert.equal(body.leaderboard.length, 1);
    assert.equal(body.leaderboard[0].xp, 70);
    assert.equal(body.myXp, 70);
    assert.equal(body.myRank, 1);
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
