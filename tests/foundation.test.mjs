import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { buildApp } from '../apps/api/dist/app.js';

test('foundation health and invalid configuration', async () => {
  process.env.JWT_SECRET = 'foundation-test-only';
  const app = buildApp();
  try {
    const health = await app.inject({ method: 'GET', url: '/health' });
    assert.equal(health.statusCode, 200);
    assert.deepEqual(health.json(), { status: 'ok', service: 'api' });
    const missing = await app.inject({ method: 'GET', url: '/lessons' });
    assert.equal(missing.statusCode, 404);
    assert.equal(missing.json().error, 'NOT_FOUND');

    const invalid = spawnSync(process.execPath, ['apps/api/dist/server.js'], {
      env: { ...process.env, PORT: 'not-a-port' },
      encoding: 'utf8',
      timeout: 5000,
    });
    assert.equal(invalid.status, 1);
    assert.match(invalid.stderr, /PORT must be an integer/);

    for (const redisUrl of [
      '',
      'invalid secret-marker',
      'https://secret-marker',
    ]) {
      const worker = spawnSync(
        process.execPath,
        ['apps/worker/dist/index.js'],
        {
          env: { ...process.env, REDIS_URL: redisUrl },
          encoding: 'utf8',
          timeout: 5000,
        },
      );
      assert.equal(worker.status, 1);
      assert.match(worker.stderr, /REDIS_URL must use/);
      assert.doesNotMatch(worker.stderr, /secret-marker/);
    }
  } finally {
    await app.close();
  }
});
