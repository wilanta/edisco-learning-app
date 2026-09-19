import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { setTimeout } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { createDatabase } from '@edisco/database';
import * as schema from '@edisco/database/schema';
import { eq } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';

test('persistence migrations and relational integrity', async (t) => {
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
  let created = false;
  t.after(async () => {
    try {
      if (database) await database.pool.end();
      // Only remove the uniquely named database created by this test run.
      if (created && /^edisco_test_[a-f0-9]{32}$/.test(databaseName)) {
        await admin.pool.query(`DROP DATABASE "${databaseName}"`);
      }
    } finally {
      await admin.pool.end();
    }
  });
  await admin.pool.query(
    `CREATE DATABASE "${databaseName}" TEMPLATE template0`,
  );
  created = true;
  database = createDatabase(testUrl.toString());
  const { db, pool } = database;
  const migrationsFolder = fileURLToPath(
    new URL('../apps/api/drizzle/', import.meta.url),
  );
  const query = (sql, values) => pool.query(sql, values);
  const rejects = (sql, values, code) =>
    assert.rejects(query(sql, values), { code });

  await t.test(
    'clean migration, extension initialization, and repeat migration',
    async () => {
      assert.equal(
        (await query("SELECT * FROM pg_extension WHERE extname = 'vector'"))
          .rowCount,
        0,
      );
      await migrate(db, { migrationsFolder });
      await migrate(db, { migrationsFolder });
      const tables = (
        await query(
          "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename",
        )
      ).rows.map((r) => r.tablename);
      assert.deepEqual(tables, [
        'generation_jobs',
        'lessons',
        'parts',
        'tracks',
        'user_lessons',
        'user_part_progress',
        'users',
        'weekly_league_entries',
      ]);
      assert.equal(
        (await query('SELECT * FROM drizzle.__drizzle_migrations')).rowCount,
        6,
      );
      assert.equal(
        (await query("SELECT * FROM pg_extension WHERE extname = 'vector'"))
          .rowCount,
        1,
      );
      assert.equal(
        (
          await query(
            "SELECT * FROM pg_constraint WHERE contype = 'f' AND connamespace = 'public'::regnamespace",
          )
        ).rowCount,
        12,
      );
      assert.equal(
        (await query("SELECT * FROM pg_indexes WHERE schemaname = 'public'"))
          .rowCount,
        26,
      );
    },
  );

  const [alice, bob] = await db
    .insert(schema.users)
    .values([
      {
        email: 'alice@example.test',
        name: 'Alice',
        pace: 'CASUAL',
        interests: ['programming'],
      },
      {
        email: 'bob@example.test',
        name: 'Bob',
        pace: 'REGULAR',
        interests: ['math'],
      },
    ])
    .returning();
  const [aliceTrack, bobTrack] = await db
    .insert(schema.tracks)
    .values([
      { userId: alice.id, title: 'Python', category: 'PROGRAMMING' },
      { userId: bob.id, title: 'Python', category: 'PROGRAMMING' },
    ])
    .returning();
  const lessonValues = {
    trackTemplateTopic: 'python basics',
    category: 'PROGRAMMING',
    title: 'Variables',
    description: 'Smoke fixture',
    embedding: Array.from({ length: 1536 }, (_, i) => (i === 0 ? 1 : 0)),
    generatedByUserId: alice.id,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    expiresAt: new Date('2026-04-01T00:00:00Z'),
  };
  const [lesson, otherLesson] = await db
    .insert(schema.lessons)
    .values([
      lessonValues,
      {
        ...lessonValues,
        title: 'Other lesson',
        embedding: Array.from({ length: 1536 }, (_, i) => (i === 1 ? 1 : 0)),
      },
    ])
    .returning();
  const parts = await db
    .insert(schema.parts)
    .values(
      Array.from({ length: 5 }, (_, i) => ({
        lessonId: lesson.id,
        order: i + 1,
        type: 'MULTIPLE_CHOICE',
        promptContent: {
          question: 'Smoke only',
          options: ['a', 'b'],
          correctAnswer: 'a',
        },
      })),
    )
    .returning();
  const [otherPart] = await db
    .insert(schema.parts)
    .values({
      lessonId: otherLesson.id,
      order: 1,
      type: 'TRUE_FALSE',
      promptContent: {},
    })
    .returning();
  const [aliceLesson, bobLesson] = await db
    .insert(schema.userLessons)
    .values([
      {
        userId: alice.id,
        trackId: aliceTrack.id,
        lessonId: lesson.id,
        orderInTrack: 1,
        status: 'NOT_STARTED',
        wasReused: false,
      },
      {
        userId: bob.id,
        trackId: bobTrack.id,
        lessonId: lesson.id,
        orderInTrack: 1,
        status: 'NOT_STARTED',
        wasReused: true,
      },
    ])
    .returning();
  const [aliceProgress, bobProgress] = await db
    .insert(schema.userPartProgress)
    .values([
      {
        userLessonId: aliceLesson.id,
        partId: parts[0].id,
        attempts: 1,
        xpEarned: 10,
        isCorrect: true,
      },
      { userLessonId: bobLesson.id, partId: parts[0].id },
    ])
    .returning();

  await t.test(
    'defaults, nullable fields, dates, JSON, vectors, and separate progress',
    async () => {
      assert.equal(alice.freeGenerationsLeft, 3);
      assert.equal(alice.totalXp, 0);
      assert.equal(alice.currentStreak, 0);
      assert.equal(alice.longestStreak, 0);
      assert.equal(alice.passwordHash, null);
      const [newAccount] = await db
        .insert(schema.users)
        .values({
          email: 'before-onboarding@example.test',
          name: 'New account',
        })
        .returning();
      assert.equal(newAccount.pace, null);
      assert.equal(newAccount.interests, null);
      assert.equal(alice.onboardingCompletedAt, null);
      assert.equal(alice.lastActivityDate, null);
      assert.ok(alice.createdAt instanceof Date);
      assert.ok(alice.updatedAt instanceof Date);
      assert.equal(lesson.contentVersion, 1);
      assert.equal(lesson.isExpiredForReuse, false);
      assert.deepEqual(lesson.embedding, lessonValues.embedding);
      assert.equal(otherLesson.embedding.length, 1536);
      assert.equal(otherLesson.embedding[1], 1);
      assert.equal(parts[0].promptContent.correctAnswer, 'a');
      assert.equal(aliceProgress.xpEarned, 10);
      assert.equal(bobProgress.attempts, 0);
      assert.equal(bobProgress.xpEarned, 0);
      assert.equal(bobProgress.isCorrect, null);
      assert.equal(bobProgress.completedAt, null);
      await query('UPDATE users SET last_activity_date = $1 WHERE id = $2', [
        '2026-09-19',
        alice.id,
      ]);
      const [user] = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.id, alice.id));
      assert.equal(user.lastActivityDate, '2026-09-19');
      const [job] = await db
        .insert(schema.generationJobs)
        .values({
          userId: alice.id,
          requestedTopic: 'Python',
          category: 'PROGRAMMING',
          status: 'PENDING',
        })
        .returning();
      assert.equal(job.trackId, null);
      assert.equal(job.resultLessonId, null);
      assert.equal(job.errorMessage, null);
      await db
        .update(schema.generationJobs)
        .set({
          trackId: aliceTrack.id,
          resultLessonId: lesson.id,
          status: 'DONE',
        })
        .where(eq(schema.generationJobs.id, job.id));
      await rejects(
        'UPDATE generation_jobs SET track_id = $1 WHERE id = $2',
        [bobTrack.id, job.id],
        '23503',
      );
      await rejects(
        'UPDATE generation_jobs SET result_lesson_id = $1 WHERE id = $2',
        [randomUUID(), job.id],
        '23503',
      );
    },
  );

  await t.test(
    'required fields, enum values, uniqueness, checks, and foreign keys',
    async () => {
      for (const [sql, values, code] of [
        [
          'UPDATE lessons SET embedding = $1 WHERE id = $2',
          ['[1,0]', lesson.id],
          '22000',
        ],
        [
          'UPDATE users SET email = $1 WHERE id = $2',
          [alice.email, bob.id],
          '23505',
        ],
        [
          "UPDATE users SET pace = 'UNKNOWN' WHERE id = $1",
          [alice.id],
          '22P02',
        ],
        [
          'UPDATE users SET free_generations_left = -1 WHERE id = $1',
          [alice.id],
          '23514',
        ],
        [
          'UPDATE tracks SET user_id = $1 WHERE id = $2',
          [randomUUID(), aliceTrack.id],
          '23503',
        ],
        [
          'UPDATE user_lessons SET track_id = $1, order_in_track = 3 WHERE id = $2',
          [bobTrack.id, aliceLesson.id],
          '23503',
        ],
        [
          'UPDATE user_lessons SET order_in_track = 0 WHERE id = $1',
          [aliceLesson.id],
          '23514',
        ],
        ['UPDATE parts SET "order" = 6 WHERE id = $1', [parts[0].id], '23514'],
        ['UPDATE parts SET "order" = 0 WHERE id = $1', [parts[0].id], '23514'],
        ['UPDATE parts SET "order" = 2 WHERE id = $1', [parts[0].id], '23505'],
        [
          'UPDATE user_part_progress SET attempts = -1 WHERE id = $1',
          [aliceProgress.id],
          '23514',
        ],
        [
          'UPDATE user_part_progress SET xp_earned = -1 WHERE id = $1',
          [aliceProgress.id],
          '23514',
        ],
        [
          'UPDATE lessons SET expires_at = NULL WHERE id = $1',
          [lesson.id],
          '23502',
        ],
        ['DELETE FROM lessons WHERE id = $1', [lesson.id], '23503'],
        ['DELETE FROM users WHERE id = $1', [alice.id], '23503'],
      ])
        await rejects(sql, values, code);
      await rejects(
        'INSERT INTO user_part_progress (user_lesson_id, part_id) VALUES ($1, $2)',
        [aliceLesson.id, parts[0].id],
        '23505',
      );
    },
  );

  await t.test(
    'cross-lesson progress and parent reassignment are rejected',
    async () => {
      await rejects(
        'INSERT INTO user_part_progress (user_lesson_id, part_id) VALUES ($1, $2)',
        [aliceLesson.id, otherPart.id],
        '23503',
      );
      await rejects(
        'UPDATE user_part_progress SET part_id = $1 WHERE id = $2',
        [otherPart.id, aliceProgress.id],
        '23503',
      );
      await rejects(
        'UPDATE parts SET lesson_id = $1 WHERE id = $2',
        [otherLesson.id, parts[0].id],
        '23503',
      );
      await rejects(
        'UPDATE user_lessons SET lesson_id = $1 WHERE id = $2',
        [otherLesson.id, aliceLesson.id],
        '23503',
      );
      await rejects(
        'INSERT INTO user_part_progress (user_lesson_id, part_id) VALUES ($1, $2)',
        [randomUUID(), parts[0].id],
        '23503',
      );
    },
  );

  await t.test(
    'concurrent ordering and league uniqueness; repeat content remains permitted',
    async () => {
      const assignment = {
        userId: alice.id,
        trackId: aliceTrack.id,
        lessonId: lesson.id,
        orderInTrack: 2,
        status: 'NOT_STARTED',
        wasReused: true,
      };
      const assignments = await Promise.allSettled([
        db.insert(schema.userLessons).values(assignment),
        db.insert(schema.userLessons).values(assignment),
      ]);
      assert.equal(
        assignments.filter((r) => r.status === 'fulfilled').length,
        1,
      );
      assert.equal(
        assignments.find((r) => r.status === 'rejected').reason.cause.code,
        '23505',
      );
      const leagueSql =
        'INSERT INTO weekly_league_entries (user_id, week_start_date) VALUES ($1, $2) RETURNING *';
      const entries = await Promise.allSettled([
        query(leagueSql, [alice.id, '2026-09-14']),
        query(leagueSql, [alice.id, '2026-09-14']),
      ]);
      assert.equal(entries.filter((r) => r.status === 'fulfilled').length, 1);
      assert.equal(
        entries.find((r) => r.status === 'rejected').reason.code,
        '23505',
      );
      const entry = entries.find((r) => r.status === 'fulfilled').value.rows[0];
      assert.equal(entry.xp_this_week, 0);
      assert.equal(entry.rank, null);
      await rejects(leagueSql, [bob.id, '2026-09-15'], '23514');
      await rejects(
        'UPDATE weekly_league_entries SET xp_this_week = -1 WHERE id = $1',
        [entry.id],
        '23514',
      );
      await rejects(
        'UPDATE weekly_league_entries SET rank = 0 WHERE id = $1',
        [entry.id],
        '23514',
      );
    },
  );

  await t.test(
    'a concurrent parent change cannot admit mismatched progress',
    async () => {
      const writer = await pool.connect();
      const reader = await pool.connect();
      let pending;
      try {
        await writer.query('BEGIN');
        await writer.query('UPDATE parts SET lesson_id = $1 WHERE id = $2', [
          otherLesson.id,
          parts[4].id,
        ]);
        await reader.query("SET statement_timeout = '5s'");
        const {
          rows: [{ pid }],
        } = await reader.query('SELECT pg_backend_pid() AS pid');
        pending = reader
          .query(
            'INSERT INTO user_part_progress (user_lesson_id, part_id) VALUES ($1, $2)',
            [aliceLesson.id, parts[4].id],
          )
          .then(
            () => null,
            (error) => error,
          );
        let blocked = false;
        for (let attempt = 0; attempt < 100 && !blocked; attempt++) {
          blocked =
            (
              await query(
                'SELECT 1 FROM pg_locks WHERE pid = $1 AND NOT granted',
                [pid],
              )
            ).rowCount > 0;
          if (!blocked) await setTimeout(20);
        }
        assert.ok(blocked, 'Progress insert must wait for the parent change');
        await writer.query('COMMIT');
        assert.equal((await pending)?.code, '23503');
      } finally {
        await writer.query('ROLLBACK');
        if (pending) await pending;
        await reader.query('RESET statement_timeout');
        writer.release();
        reader.release();
      }
    },
  );

  await t.test(
    'transaction rollback and expired shared content retention',
    async () => {
      await assert.rejects(
        db.transaction(async (tx) => {
          await tx
            .update(schema.users)
            .set({ freeGenerationsLeft: 2 })
            .where(eq(schema.users.id, alice.id));
          await tx.insert(schema.tracks).values({
            userId: alice.id,
            title: 'Rolled back',
            category: 'GENERAL',
          });
          throw new Error('rollback probe');
        }),
        /rollback probe/,
      );
      const [user] = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.id, alice.id));
      assert.equal(user.freeGenerationsLeft, 3);
      assert.equal(
        (await query("SELECT * FROM tracks WHERE title = 'Rolled back'"))
          .rowCount,
        0,
      );
      await db
        .update(schema.lessons)
        .set({ isExpiredForReuse: true })
        .where(eq(schema.lessons.id, lesson.id));
      assert.equal(
        (
          await query(
            'SELECT * FROM user_lessons ul JOIN lessons l ON l.id = ul.lesson_id WHERE l.id = $1 AND l.is_expired_for_reuse',
            [lesson.id],
          )
        ).rowCount,
        3,
      );
      assert.throws(
        () => createDatabase('https://secret.example'),
        /valid PostgreSQL DATABASE_URL/,
      );
    },
  );
});
