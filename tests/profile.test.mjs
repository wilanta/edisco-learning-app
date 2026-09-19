import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { buildApp } from '../apps/api/dist/app.js';
import { createDatabase } from '@edisco/database';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { fileURLToPath } from 'node:url';

test('Profile API', async (t) => {
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

  await t.test('Seed user', async () => {
    const regRes = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: `test-prof-${Date.now()}@example.com`,
        password: 'password',
        name: 'Tester P',
      },
    });
    const regBody = regRes.json();
    token = regBody.token;

    // Do onboarding
    await app.inject({
      method: 'PATCH',
      url: '/users/me/onboarding',
      headers: { Authorization: `Bearer ${token}` },
      payload: { interests: ['PROGRAMMING'], pace: 'REGULAR' },
    });
  });

  await t.test('GET /users/me - read profile', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/users/me',
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(res.statusCode, 200);
    const body = res.json();
    assert.equal(body.name, 'Tester P');
    assert.equal(body.pace, 'REGULAR');
    assert.deepEqual(body.interests, ['PROGRAMMING']);
    assert.ok('freeGenerationsLeft' in body);
    assert.ok('totalXp' in body);
  });

  await t.test('PATCH /users/me - update pace and interests', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/users/me',
      headers: { Authorization: `Bearer ${token}` },
      payload: { pace: 'INTENSIVE', interests: ['MATH', 'Other Interest'] },
    });
    assert.equal(res.statusCode, 200);
    const body = res.json();
    assert.equal(body.pace, 'INTENSIVE');
    assert.deepEqual(body.interests, ['MATH', 'Other Interest']);
  });

  await t.test(
    'PATCH /users/me - should ignore uneditable fields (e.g. email, totalXp)',
    async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: '/users/me',
        headers: { Authorization: `Bearer ${token}` },
        payload: { email: 'hacked@example.com', totalXp: 9999 },
      });
      // Zod strip makes this valid (ignores extra) or just success but no email/totalXp change
      assert.equal(res.statusCode, 200);

      const getRes = await app.inject({
        method: 'GET',
        url: '/users/me',
        headers: { Authorization: `Bearer ${token}` },
      });
      const body = getRes.json();
      assert.notEqual(body.email, 'hacked@example.com');
      assert.notEqual(body.totalXp, 9999);
    },
  );

  await t.test('PATCH /users/me - unauthorized fails', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/users/me',
      payload: { pace: 'CASUAL' },
    });
    assert.equal(res.statusCode, 401);
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
