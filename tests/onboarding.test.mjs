import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { buildApp } from '../apps/api/dist/app.js';
import { createDatabase } from '@edisco/database';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { fileURLToPath } from 'node:url';

test('Onboarding flow', async (t) => {
  const connectionString = process.env.DATABASE_URL;
  assert.ok(connectionString, 'Set DATABASE_URL to the local development database');

  const admin = createDatabase(connectionString);
  const databaseName = `edisco_test_onboarding_${randomUUID().replaceAll('-', '')}`;
  const testUrl = new URL(connectionString);
  testUrl.pathname = `/${databaseName}`;
  let database;

  t.after(async () => {
    try {
      if (database) await database.pool.end();
      await admin.pool.query(`DROP DATABASE "${databaseName}"`);
    } finally {
      await admin.pool.end();
    }
  });

  await admin.pool.query(`CREATE DATABASE "${databaseName}" TEMPLATE template0`);
  database = createDatabase(testUrl.toString());
  
  const migrationsFolder = fileURLToPath(new URL('../apps/api/drizzle/', import.meta.url));
  await migrate(database.db, { migrationsFolder });

  process.env.DATABASE_URL = testUrl.toString();
  process.env.JWT_SECRET = 'test-secret';
  const app = buildApp();
  
  t.after(async () => {
    await app.close();
  });

  let token;

  await t.test('Setup: Create user and login', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: 'onboarding@example.com',
        password: 'securepassword',
        name: 'Test Onboarder'
      }
    });
    assert.equal(res.statusCode, 201);
    token = res.json().token;
  });

  await t.test('PATCH /users/me/onboarding updates user preferences and sets credit', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/users/me/onboarding',
      headers: {
        authorization: `Bearer ${token}`
      },
      payload: {
        interests: ['Programming', 'Language'],
        pace: 'REGULAR'
      }
    });

    assert.equal(res.statusCode, 200);
    const body = res.json();
    assert.ok(body.userId);
    assert.equal(body.freeGenerationsLeft, 3);
    assert.ok(body.onboardingCompletedAt);

    // Verify GET /users/me reflects these changes
    const meRes = await app.inject({
      method: 'GET',
      url: '/users/me',
      headers: {
        authorization: `Bearer ${token}`
      }
    });
    const meBody = meRes.json();
    assert.equal(meBody.pace, 'REGULAR');
    assert.deepEqual(meBody.interests, ['Programming', 'Language']);
    assert.equal(meBody.freeGenerationsLeft, 3);
  });

  await t.test('PATCH /users/me/onboarding is idempotent if already completed', async () => {
    // Modify the DB directly to test idempotency, or just call it again
    const res = await app.inject({
      method: 'PATCH',
      url: '/users/me/onboarding',
      headers: {
        authorization: `Bearer ${token}`
      },
      payload: {
        interests: ['Math'], // New interests
        pace: 'INTENSIVE' // New pace
      }
    });

    assert.equal(res.statusCode, 200); // Idempotent 200

    // But it should NOT have changed anything because it was already completed
    const meRes = await app.inject({
      method: 'GET',
      url: '/users/me',
      headers: {
        authorization: `Bearer ${token}`
      }
    });
    const meBody = meRes.json();
    assert.equal(meBody.pace, 'REGULAR'); // Unchanged
    assert.deepEqual(meBody.interests, ['Programming', 'Language']); // Unchanged
    assert.equal(meBody.freeGenerationsLeft, 3); // Unchanged
  });

  await t.test('PATCH /users/me/onboarding rejects invalid payload', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/users/me/onboarding',
      headers: {
        authorization: `Bearer ${token}`
      },
      payload: {
        interests: [], // empty interests not allowed
        pace: 'SPEEDY' // invalid enum
      }
    });

    assert.equal(res.statusCode, 400);
    assert.equal(res.json().error, 'VALIDATION_ERROR');
  });
});

