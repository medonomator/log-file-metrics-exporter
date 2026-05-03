import type { ClassifiedError, ErrorKind } from './types';

/**
 * Classification policy:
 *
 * - `network` (retryable): well-known transient TCP/DNS codes — `ECONNREFUSED`,
 *   `ETIMEDOUT`, `ENOTFOUND`. These typically clear on their own.
 * - `unknown` (NON-retryable): everything else, including parse errors,
 *   programming mistakes, and unexpected throws. Retrying these would burn
 *   the budget on errors that will not resolve themselves and risks masking
 *   real bugs. Callers who know an `unknown`-classified failure is in fact
 *   transient should re-throw a `PollingError` with `retryable: true`.
 *
 * HTTP status codes go through `classifyHttpStatus` instead — see there.
 */
export function classifyError(err: unknown): ClassifiedError {
  if (err instanceof PollingError) return err;

  if (err instanceof Error) {
    const code = readErrorCode(err);
    if (code === 'ECONNREFUSED' || code === 'ETIMEDOUT' || code === 'ENOTFOUND') {
      return new PollingError(err.message, 'network', true);
    }
    return new PollingError(err.message, 'unknown', false);
  }
  return new PollingError(String(err), 'unknown', false);
}

export function classifyHttpStatus(status: number, message: string): ClassifiedError {
  if (status === 404) return new PollingError(message, 'not_found', false);
  if (status === 401 || status === 403) {
    return new PollingError(message, 'auth', false);
  }
  if (status >= 500) return new PollingError(message, 'server', true);
  return new PollingError(message, 'unknown', false);
}

export class PollingError extends Error implements ClassifiedError {
  readonly kind: ErrorKind;
  readonly retryable: boolean;

  constructor(message: string, kind: ErrorKind, retryable: boolean) {
    super(message);
    this.name = 'PollingError';
    this.kind = kind;
    this.retryable = retryable;
  }
}

function readErrorCode(err: Error): string | null {
  const candidate = (err as unknown as { code?: unknown }).code;
  return typeof candidate === 'string' ? candidate : null;
}
