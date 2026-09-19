import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { buildApp } from '../apps/api/dist/app.js';
import { createDatabase } from '@edisco/database';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { fileURLToPath } from 'node:url';

test('Authentication flow', async (t) => {
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

  t.after(async () => {
    try {
      if (database) await database.pool.end();
      await admin.pool.query(`DROP DATABASE "${databaseName}"`);
    } finally {
      await admin.pool.end();
    }
  });

  await admin.pool.query(
    `CREATE DATABASE "${databaseName}" TEMPLATE template0`,
  );
  database = createDatabase(testUrl.toString());

  const migrationsFolder = fileURLToPath(
    new URL('../apps/api/drizzle/', import.meta.url),
  );
  await migrate(database.db, { migrationsFolder });

  process.env.DATABASE_URL = testUrl.toString();
  process.env.JWT_SECRET = 'test-secret';
  const app = buildApp();

  t.after(async () => {
    await app.close();
  });

  await t.test(
    'POST /auth/register creates user and returns token',
    async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: {
          email: 'test@example.com',
          password: 'securepassword',
          name: 'Test User',
        },
      });

      assert.equal(res.statusCode, 201);
      const body = res.json();
      assert.ok(body.userId);
      assert.ok(body.token);

      const dupRes = await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: {
          email: 'test@example.com',
          password: 'securepassword',
          name: 'Test User 2',
        },
      });
      assert.equal(dupRes.statusCode, 409);
      assert.equal(dupRes.json().error, 'CONFLICT');
    },
  );

  await t.test(
    'POST /auth/login returns token for valid credentials',
    async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: {
          email: 'test@example.com',
          password: 'securepassword',
        },
      });

      assert.equal(res.statusCode, 200);
      const body = res.json();
      assert.ok(body.userId);
      assert.ok(body.token);

      const token = body.token;

      // Test protected route GET /users/me
      const meRes = await app.inject({
        method: 'GET',
        url: '/users/me',
        headers: {
          authorization: `Bearer ${token}`,
        },
      });
      assert.equal(meRes.statusCode, 200);
      const meBody = meRes.json();
      assert.equal(meBody.email, 'test@example.com');
      assert.equal(meBody.name, 'Test User');
      assert.equal(meBody.pace, null); // Since onboarding not completed
      assert.deepEqual(meBody.interests, []);
    },
  );

  await t.test('POST /auth/login rejects invalid password', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: {
        email: 'test@example.com',
        password: 'wrongpassword',
      },
    });

    assert.equal(res.statusCode, 401);
    assert.equal(res.json().error, 'UNAUTHORIZED');
  });

  await t.test('POST /auth/login rejects non-existent email', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: {
        email: 'nobody@example.com',
        password: 'password',
      },
    });

    assert.equal(res.statusCode, 401);
    assert.equal(res.json().error, 'UNAUTHORIZED');
  });

  await t.test('GET /users/me rejects missing authentication', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/users/me',
    });

    assert.equal(res.statusCode, 401);
    assert.equal(res.json().error, 'UNAUTHORIZED');
  });

  await t.test('GET /users/me rejects invalid token', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/users/me',
      headers: {
        authorization: `Bearer invalid.token.here`,
      },
    });

    assert.equal(res.statusCode, 401);
    assert.equal(res.json().error, 'UNAUTHORIZED');
  });
});
