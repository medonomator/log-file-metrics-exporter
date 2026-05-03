/**
 * Polling source contracts.
 *
 * A polling source pulls log records from an external system on a fixed
 * cadence. The source itself stays small: configure → start → emits records.
 * Retry, state persistence, and error classification are split into their own
 * helpers so each source implementation can stay focused on transport.
 */

/**
 * Built-in source kinds. Anything else (database, message queue, S3, ...) is
 * an extension point: implement `PollingSource` directly and pass it to the
 * orchestrator. The factory in `index.ts` only handles the kinds listed here,
 * so the public API and the implementation stay in lockstep.
 */
export type SourceKind = 'http' | 'file';

/**
 * Resumable position in the source. At least one field should be set so a
 * restart can pick up where the last run left off without duplicate reads.
 *
 * `lastInode` lets file sources detect rotation/truncation and reset the
 * offset instead of reading garbage or skipping new content.
 */
export interface PollingState {
  readonly lastTimestamp?: number;
  readonly lastOffset?: number;
  readonly lastEtag?: string;
  readonly lastInode?: number;
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

export type PollingConfig = HttpPollingConfig | FilePollingConfig;

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
 * `state-store.ts` and is suitable only for tests and single-process runs
 * without durability needs - production deployments MUST provide a durable
 * implementation (Redis, Postgres, file with fsync, ...).
 *
 * Delivery semantics: the orchestrator emits records first, THEN calls
 * `save(nextState)`. A crash between those two steps replays the most recent
 * batch on restart, so the contract is at-least-once. Downstream consumers
 * must be idempotent or deduplicate (e.g. by `(source, offset)` pair).
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
