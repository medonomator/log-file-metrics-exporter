import { classifyError } from './errors';
import type { ClassifiedError, RetryConfig } from './types';

const DEFAULT_RETRY: Required<Omit<RetryConfig, 'maxDelayMs' | 'jitter'>> & {
  maxDelayMs: number;
  jitter: boolean;
} = {
  maxAttempts: 3,
  baseDelayMs: 200,
  maxDelayMs: 10_000,
  jitter: true,
};

export interface RetryOutcome<T> {
  readonly value: T;
  readonly attempts: number;
}

/**
 * Run `op` with exponential backoff. Re-throws the last classified error after
 * the final attempt, or earlier if the error is non-retryable (auth, 404, ...).
 *
 * `sleep` is injectable for deterministic tests.
 */
export async function withRetry<T>(
  op: () => Promise<T>,
  config: RetryConfig | undefined = undefined,
  sleep: (ms: number) => Promise<void> = defaultSleep,
): Promise<RetryOutcome<T>> {
  const cfg = mergeRetry(config);

  let lastError: ClassifiedError | null = null;
  for (let attempt = 1; attempt <= cfg.maxAttempts; attempt += 1) {
    try {
      const value = await op();
      return { value, attempts: attempt };
    } catch (err) {
      const classified = classifyError(err);
      lastError = classified;
      if (!classified.retryable || attempt === cfg.maxAttempts) {
        throw classified;
      }
      const delay = backoffDelay(attempt, cfg);
      await sleep(delay);
    }
  }

  throw lastError ?? new Error('withRetry exhausted with no error captured');
}

function mergeRetry(config: RetryConfig | undefined): typeof DEFAULT_RETRY {
  if (!config) return DEFAULT_RETRY;
  return {
    maxAttempts: Math.max(1, config.maxAttempts),
    baseDelayMs: Math.max(0, config.baseDelayMs),
    maxDelayMs: config.maxDelayMs ?? DEFAULT_RETRY.maxDelayMs,
    jitter: config.jitter ?? DEFAULT_RETRY.jitter,
  };
}

function backoffDelay(attempt: number, cfg: typeof DEFAULT_RETRY): number {
  const exp = cfg.baseDelayMs * 2 ** (attempt - 1);
  const capped = Math.min(exp, cfg.maxDelayMs);
  if (!cfg.jitter) return capped;
  const factor = 0.5 + Math.random() * 0.5;
  return Math.round(capped * factor);
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
