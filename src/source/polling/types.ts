/**
 * Polling source contracts.
 *
 * A polling source pulls log records from an external system on a fixed
 * cadence. The source itself stays small: configure → start → emits records.
 * Retry, state persistence, and error classification are split into their own
 * helpers so each source implementation can stay focused on transport.
 */

export type SourceKind = 'http' | 'file' | 'database';

/**
 * Resumable position in the source. At least one field should be set so a
 * restart can pick up where the last run left off without duplicate reads.
 */
export interface PollingState {
  readonly lastTimestamp?: number;
  readonly lastOffset?: number;
  readonly lastEtag?: string;
}

export interface RetryConfig {
  readonly maxAttempts: number;
  readonly baseDelayMs: number;
  readonly maxDelayMs?: number;
  readonly jitter?: boolean;
}

export interface BasePollingConfig {
  readonly kind: SourceKind;
  readonly intervalMs: number;
  readonly retry?: RetryConfig;
}

export interface HttpPollingConfig extends BasePollingConfig {
  readonly kind: 'http';
  readonly url: string;
  readonly headers?: Readonly<Record<string, string>>;
  readonly timeoutMs?: number;
}

export interface FilePollingConfig extends BasePollingConfig {
  readonly kind: 'file';
  readonly path: string;
}

export interface DatabasePollingConfig extends BasePollingConfig {
  readonly kind: 'database';
  readonly connectionString: string;
  readonly query: string;
}

export type PollingConfig =
  | HttpPollingConfig
  | FilePollingConfig
  | DatabasePollingConfig;

/**
 * One record produced by a poll. The body is intentionally a string so
 * downstream parsers can decode (JSON / regex / structured logs) without the
 * source committing to a schema.
 */
export interface PolledRecord {
  readonly body: string;
  readonly timestamp: number;
  readonly offset?: number;
}

/**
 * Persistence boundary for `PollingState`. Implementations decide where to
 * write (memory, disk, Redis, ...). Default in-memory store ships in
 * `state-store.ts` for tests and ephemeral runs.
 */
export interface StateStore {
  load(sourceId: string): Promise<PollingState | null>;
  save(sourceId: string, state: PollingState): Promise<void>;
}

export interface PollResult {
  readonly records: ReadonlyArray<PolledRecord>;
  readonly nextState: PollingState;
}

/**
 * The lifecycle a polling source follows. Implementations emit zero or more
 * records per `pollOnce()` call and return the new state to persist.
 */
export interface PollingSource {
  readonly id: string;
  pollOnce(prev: PollingState | null): Promise<PollResult>;
}

export type ErrorKind = 'network' | 'not_found' | 'auth' | 'server' | 'unknown';

export interface ClassifiedError extends Error {
  readonly kind: ErrorKind;
  readonly retryable: boolean;
}
