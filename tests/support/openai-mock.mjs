// Loaded only by integration-test subprocesses; production has no mock switch.
import assert from 'node:assert/strict';
import { lessonFixture, responseFixture } from './lesson-fixture.mjs';

let embeddingCalls = 0;
globalThis.fetch = async (url, options) => {
  if (url === 'https://api.openai.com/v1/embeddings') {
    // Distinct vectors keep existing Phase 4B tests on the cache-miss branch.
    const topic = JSON.parse(JSON.parse(options.body).input).topic;
    const index =
      topic === 'Reuse end-to-end fixture' ? 1500 : embeddingCalls++;
    return Response.json({
      model: 'text-embedding-3-small',
      data: [
        {
          index: 0,
          embedding: Array.from({ length: 1536 }, (_, i) =>
            i === index ? 1 : 0,
          ),
        },
      ],
    });
  }
  assert.equal(url, 'https://api.openai.com/v1/responses');
  const request = JSON.parse(options.body);
  const input = JSON.parse(request.input[0].content);
  assert.equal(input.pace, 'CASUAL');
  assert.equal(input.category, 'PROGRAMMING');
  if (input.topic === 'Provider failure fixture')
    throw new Error('private provider diagnostic');
  if (input.topic === 'Invalid content fixture')
    return Response.json(responseFixture({ title: 'Invalid' }));
  const lesson = lessonFixture();
  if (input.previousLessons.length)
    lesson.title = `Continued after ${input.previousLessons.at(-1).title}`;
  return Response.json(responseFixture(lesson));
};
