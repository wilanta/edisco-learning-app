import test from 'node:test';
import assert from 'node:assert/strict';
import { createDatabase } from '@edisco/database';
import { users, lessons } from '@edisco/database/schema';
import { expireLessons } from '../apps/worker/dist/jobs/expire-lessons.js';
import { randomUUID } from 'node:crypto';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { eq, sql } from 'drizzle-orm';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const connectionString =
  process.env.DATABASE_URL ||
  'postgresql://edisco:edisco_local_only@127.0.0.1:55432/edisco';

test('expireLessons flags expired lessons and is idempotent', async (t) => {
  const { db, pool } = createDatabase(connectionString);
  await migrate(db, {
    migrationsFolder: fileURLToPath(
      new URL('../apps/api/drizzle/', import.meta.url),
    ),
  });

  const userId = randomUUID();
  await db.insert(users).values({
    id: userId,
    email: `test-${userId}@example.com`,
    passwordHash: 'dummy',
    name: 'Expiry Test User',
    freeGenerationsLeft: 3,
  });

  // Insert an expired lesson
  const expiredLesson = await db
    .insert(lessons)
    .values({
      trackTemplateTopic: 'expired topic',
      category: 'PROGRAMMING',
      title: 'Expired',
      description: 'Expired lesson',
      generatedByUserId: userId,
      expiresAt: sql`(now() - interval '1 day')`,
      isExpiredForReuse: false,
    })
    .returning();

  // Insert a fresh lesson
  const freshLesson = await db
    .insert(lessons)
    .values({
      trackTemplateTopic: 'fresh topic',
      category: 'PROGRAMMING',
      title: 'Fresh',
      description: 'Fresh lesson',
      generatedByUserId: userId,
      expiresAt: sql`(now() + interval '1 day')`,
      isExpiredForReuse: false,
    })
    .returning();

  // Run expiry
  const result1 = await expireLessons(db);
  assert.equal(result1.updated, 1, 'Should expire exactly one lesson');

  const [checkExpired] = await db
    .select()
    .from(lessons)
    .where(eq(lessons.id, expiredLesson[0].id));
  assert.equal(
    checkExpired.isExpiredForReuse,
    true,
    'Expired lesson should be flagged',
  );

  const [checkFresh] = await db
    .select()
    .from(lessons)
    .where(eq(lessons.id, freshLesson[0].id));
  assert.equal(
    checkFresh.isExpiredForReuse,
    false,
    'Fresh lesson should not be flagged',
  );

  // Run expiry again to test idempotency
  const result2 = await expireLessons(db);
  assert.equal(
    result2.updated,
    0,
    'Should not update any lessons on second run',
  );

  await pool.end();
});
