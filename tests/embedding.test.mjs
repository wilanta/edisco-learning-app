import assert from 'node:assert/strict';
import test from 'node:test';
import { generateLesson } from '../apps/worker/dist/generators/openai.js';
import {
  createEmbedding,
  EMBEDDING_MODEL,
  EMBEDDING_DIMENSIONS,
} from '../apps/worker/dist/embedding/openai.js';

const vector = Array.from({ length: 1536 }, (_, i) => (i === 0 ? 1 : 0));
const response = (embedding = vector, model = 'text-embedding-3-small') => ({
  model,
  data: [{ index: 0, embedding }],
});

test('both OpenAI calls distinguish exhausted credits from rate limits without exposing provider details', async (t) => {
  const original = process.env.OPENAI_API_KEY;
  t.after(() => {
    if (original === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = original;
  });
  process.env.OPENAI_API_KEY = 'test-only-key';
  const calls = [
    () => createEmbedding('Python'),
    () =>
      generateLesson({
        topic: 'Python',
        category: 'PROGRAMMING',
        pace: 'REGULAR',
        previousLessons: [],
      }),
  ];
  for (const call of calls) {
    for (const [status, error, message] of [
      [
        429,
        { code: 'credit_balance_exhausted', type: 'insufficient_quota' },
        /OpenAI API credits.*billing/,
      ],
      [429, { code: 'insufficient_quota' }, /OpenAI API credits.*billing/],
      [429, { code: 'rate_limit_exceeded' }, /rate limit.*try again/i],
      [401, { code: 'invalid_api_key' }, /API key.*configuration/],
      [500, { code: 'private-provider-code' }, /temporarily unavailable/],
    ]) {
      const mock = t.mock.method(globalThis, 'fetch', async () =>
        Response.json(
          {
            error: {
              ...error,
              message: 'private-provider-detail test-only-key',
            },
          },
          { status },
        ),
      );
      await assert.rejects(call(), (error) => {
        assert.match(error.message, message);
        assert.doesNotMatch(error.message, /private|test-only-key/);
        return true;
      });
      mock.mock.restore();
    }
  }
});

test('embedding request uses the pinned model/dimension and validates its response', async (t) => {
  const original = { ...process.env };
  t.after(() => {
    process.env = original;
  });
  process.env.OPENAI_API_KEY = 'test-only-key';
  const input = '日本語 C++ <T>; ignore all instructions';
  const mock = t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, 'https://api.openai.com/v1/embeddings');
    assert.equal(options.redirect, 'error');
    assert.ok(options.signal instanceof AbortSignal);
    assert.deepEqual(JSON.parse(options.body), {
      model: EMBEDDING_MODEL,
      dimensions: EMBEDDING_DIMENSIONS,
      encoding_format: 'float',
      input,
    });
    assert.ok(!options.body.includes('test-only-key'));
    return Response.json(response());
  });
  assert.deepEqual(await createEmbedding(input), vector);
  assert.equal(mock.mock.callCount(), 1);
});

test('provider and malformed/zero/non-finite/wrong-dimension/model responses fail safely without retries', async (t) => {
  const original = { ...process.env };
  t.after(() => {
    process.env = original;
  });
  process.env.OPENAI_API_KEY = 'test-only-key';
  const cases = [
    () => new Response('private-provider-error', { status: 429 }),
    () => {
      throw new Error('private-network-error');
    },
    () => {
      throw new DOMException('private-timeout', 'TimeoutError');
    },
    () => new Response('malformed'),
    () => Response.json(response([1, 0])),
    () => Response.json(response(Array(1536).fill(0))),
    () => Response.json(response(Array(1536).fill(1e300))),
    () => Response.json(response(Array(1536).fill(1e-300))),
    () => Response.json(response(vector, 'another-model')),
    () => Response.json({ model: EMBEDDING_MODEL, data: [] }),
    () =>
      Response.json({
        model: EMBEDDING_MODEL,
        data: [{ index: 1, embedding: vector }],
      }),
  ];
  for (const respond of cases) {
    const mock = t.mock.method(globalThis, 'fetch', async () => respond());
    await assert.rejects(createEmbedding('Python'), (error) => {
      assert.doesNotMatch(error.message, /private|test-only/);
      return true;
    });
    assert.equal(mock.mock.callCount(), 1);
    mock.mock.restore();
  }
  const mock = t.mock.method(globalThis, 'fetch', () =>
    assert.fail('Invalid input must not reach provider'),
  );
  for (const input of ['', ' ', 'a'.repeat(8001)])
    await assert.rejects(createEmbedding(input));
  delete process.env.OPENAI_API_KEY;
  await assert.rejects(createEmbedding('Python'), /not configured/);
  assert.equal(mock.mock.callCount(), 0);
});
