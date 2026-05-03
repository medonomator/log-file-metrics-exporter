/**
 * Polling sources public API.
 *
 * `createPollingSource` is the simple factory for built-in `http` and `file`
 * kinds. Other transports (database, message queue, S3, ...) are extension
 * points: implement `PollingSource` directly and pass the instance to the
 * orchestrator. The orchestrator only sees the interface.
 */

import { HttpPollingSource } from './http-source';
import { FilePollingSource } from './file-source';
import type { PollingConfig, PollingSource } from './types';

export type {
  ClassifiedError,
  ErrorKind,
  FilePollingConfig,
  HttpPollingConfig,
  PolledRecord,
  PollingConfig,
  PollingSource,
  PollingState,
  PollResult,
  RetryConfig,
  SourceKind,
  StateStore,
} from './types';

export { withRetry, type RetryOutcome } from './retry';
export { PollingError, classifyError, classifyHttpStatus } from './errors';
export { InMemoryStateStore } from './state-store';
export { HttpPollingSource } from './http-source';
export { FilePollingSource } from './file-source';

export function createPollingSource(
  id: string,
  config: PollingConfig,
): PollingSource {
  if (config.kind === 'http') return new HttpPollingSource(id, config);
  if (config.kind === 'file') return new FilePollingSource(id, config);
  // Exhaustiveness guard — `SourceKind` is a closed union of `http | file`.
  // If a future kind is added to the type, TypeScript will flag this branch.
  const _exhaustive: never = config;
  throw new Error(
    `kind="${(_exhaustive as PollingConfig).kind}" is not built in. Provide your own PollingSource implementation.`,
  );
}
