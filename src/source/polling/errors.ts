import type { ClassifiedError, ErrorKind } from './types';

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
