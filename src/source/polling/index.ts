/**
 * Polling sources public API.
 *
 * `createPollingSource` is the simple factory for built-in `http` and `file`
 * kinds. `database` is part of the contract but not implemented in this
 * package — wire your own driver and pass an instance that satisfies
 * `PollingSource`. The orchestrator only sees the interface.
 */

import { HttpPollingSource } from './http-source';
import { FilePollingSource } from './file-source';
import type { PollingConfig, PollingSource } from './types';

export type {
  ClassifiedError,
  DatabasePollingConfig,
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
  throw new Error(
    `kind="${config.kind}" is not built in. Provide your own PollingSource implementation.`,
  );
}
