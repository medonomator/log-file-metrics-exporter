/**
 * Sink transform contracts.
 *
 * The sink transform is the boundary between log ingestion and the storage
 * layer. It takes a parsed log record (`SinkTransformInput`) and produces a
 * metric sample (`SinkTransformOutput`) ready for downstream emission.
 *
 * Both interfaces are designed to be extensible: callers and implementations
 * may attach domain-specific fields under `attributes` / `dimensions` without
 * changing the core contract.
 */

export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

export type MetricKind = 'counter' | 'gauge' | 'histogram';

export type AttributeValue = string | number | boolean | null;

/**
 * One parsed log record handed to the transform.
 *
 * `attributes` is the open-ended bag for fields not captured by the core
 * shape — extend it with whatever the upstream parser surfaced.
 */
export interface SinkTransformInput {
  readonly timestamp: Date;
  readonly source: string;
  readonly level: LogLevel;
  readonly message: string;
  readonly attributes?: Readonly<Record<string, AttributeValue>>;
}

/**
 * One metric sample produced by the transform, ready to be sent to the sink.
 *
 * `dimensions` carries low-cardinality labels (host, region, service, ...).
 * Add new dimensions without breaking older consumers.
 */
export interface SinkTransformOutput {
  readonly name: string;
  readonly kind: MetricKind;
  readonly value: number;
  readonly timestamp: Date;
  readonly dimensions?: Readonly<Record<string, string>>;
  readonly unit?: string;
}

/**
 * Pure mapping from one log record to zero, one, or many metric samples.
 *
 * Returning an array lets a single record fan out (e.g. one log line emitting
 * both a counter and a latency histogram). Returning `[]` is a valid "drop".
 */
export type SinkTransform = (
  input: SinkTransformInput,
) => ReadonlyArray<SinkTransformOutput>;
