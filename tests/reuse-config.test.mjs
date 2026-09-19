import assert from 'node:assert/strict';
import test from 'node:test';
import { readReuseThreshold } from '../apps/worker/dist/embedding/reuse.js';

test('cosine distance maximum is explicit, finite, bounded, and re-read per job', (t) => {
  const original = { ...process.env };
  t.after(() => {
    process.env = original;
  });
  delete process.env.SIMILARITY_MAX_DISTANCE;
  assert.throws(readReuseThreshold);
  for (const value of ['', ' ', 'NaN', 'Infinity', '-0.1', '2.1', 'invalid']) {
    process.env.SIMILARITY_MAX_DISTANCE = value;
    assert.throws(readReuseThreshold);
  }
  for (const value of ['0', '0.125', '1', '2']) {
    process.env.SIMILARITY_MAX_DISTANCE = value;
    assert.equal(readReuseThreshold(), Number(value));
  }
});
