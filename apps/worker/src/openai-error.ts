import { z } from 'zod';

// Only these fixed messages may cross the worker/status API boundary.
export class OpenAIRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'OpenAIRequestError';
  }
}

export async function rejectOpenAIResponse(response: Response): Promise<never> {
  const body = await response.json().catch(() => null);
  const error = z
    .object({
      error: z.object({
        code: z.string().nullish(),
        type: z.string().nullish(),
      }),
    })
    .safeParse(body).data?.error;
  let message =
    'OpenAI rejected the generation request. Check the worker configuration.';
  if (response.status === 429) {
    message =
      error?.type === 'insufficient_quota' ||
      error?.code === 'insufficient_quota' ||
      error?.code === 'credit_balance_exhausted'
        ? 'OpenAI API credits are exhausted. Check API billing and project limits before trying again.'
        : 'OpenAI rate limit reached. Please try again shortly.';
  } else if (response.status === 401 || response.status === 403) {
    message =
      'OpenAI API key was rejected or lacks access. Check the worker configuration.';
  } else if (response.status >= 500) {
    message = 'OpenAI is temporarily unavailable. Please try again shortly.';
  }
  throw new OpenAIRequestError(message, response.status);
}
