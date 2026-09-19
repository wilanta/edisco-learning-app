import { z } from 'zod';
import { EMBEDDING_DIMENSIONS } from '@edisco/database/schema';
export { EMBEDDING_DIMENSIONS };

// These are a persisted vector-space contract, not independently tunable flags.
export const EMBEDDING_MODEL = 'text-embedding-3-small';
export const embeddingVector = z
  .array(z.number())
  .length(EMBEDDING_DIMENSIONS)
  .refine(
    (values) =>
      values.every((v) => Number.isFinite(Math.fround(v))) &&
      values.some((v) => Math.fround(v) !== 0),
    'Invalid vector',
  );

export async function createEmbedding(text: string) {
  const input = z.string().trim().min(1).max(8000).parse(text);
  const key = process.env.OPENAI_API_KEY;
  if (!key?.trim()) throw new Error('OpenAI is not configured');
  try {
    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      redirect: 'error',
      signal: AbortSignal.timeout(30000),
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: EMBEDDING_MODEL,
        dimensions: EMBEDDING_DIMENSIONS,
        encoding_format: 'float',
        input,
      }),
    });
    if (!response.ok) throw new Error('Provider request failed');
    const body = z
      .object({
        model: z.literal(EMBEDDING_MODEL),
        data: z.tuple([
          z.object({ index: z.literal(0), embedding: embeddingVector }),
        ]),
      })
      .parse(await response.json());
    return body.data[0].embedding;
  } catch {
    throw new Error('Embedding generation failed');
  }
}
