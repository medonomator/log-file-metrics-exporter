# Log to Metrics Exporter

This service ingests log data and exports it as metrics for monitoring and analysis. Key considerations include consistency of the exported metrics, throughput to handle high log volumes, and robustness against failures during processing.

## Constraints
- Ensure data consistency during metric aggregation.
- Optimize for high throughput to accommodate large log streams.
- Implement error handling to manage transient failures and ensure reliability.

## Running the Service
1. Install dependencies: `npm install`
2. Start the service: `npm run start`

Ensure environment variables are set as needed in a .env file.

## Sink Transform Contracts

The sink transform is the boundary between log ingestion and the storage layer. It takes a parsed log record and produces zero or more metric samples ready for downstream emission. Contracts live in `src/sink/transform/`.

### `SinkTransformInput`

One parsed log record handed to a transform.

| Field        | Type                                  | Required | Purpose                                          |
| ------------ | ------------------------------------- | -------- | ------------------------------------------------ |
| `timestamp`  | `Date`                                | yes      | Event time of the log record.                    |
| `source`     | `string`                              | yes      | Origin identifier (file path, stream name, ...). |
| `level`      | `LogLevel`                            | yes      | One of `trace`, `debug`, `info`, `warn`, `error`, `fatal`. |
| `message`    | `string`                              | yes      | Raw log message body.                            |
| `attributes` | `Record<string, AttributeValue>`      | no       | Open-ended bag for parser-supplied fields. Extend without changing the core shape. |

### `SinkTransformOutput`

One metric sample produced by a transform.

| Field        | Type                       | Required | Purpose                                                 |
| ------------ | -------------------------- | -------- | ------------------------------------------------------- |
| `name`       | `string`                   | yes      | Metric name (e.g. `log_records_total`).                 |
| `kind`       | `MetricKind`               | yes      | `counter`, `gauge`, or `histogram`.                     |
| `value`      | `number`                   | yes      | Numeric sample value.                                   |
| `timestamp`  | `Date`                     | yes      | Sample time, usually mirrors the input.                 |
| `dimensions` | `Record<string, string>`   | no       | Low-cardinality labels (host, region, service, level).  |
| `unit`       | `string`                   | no       | Optional unit hint (`1`, `ms`, `bytes`, ...).           |

### `SinkTransform`

Pure mapping function:

```ts
type SinkTransform = (input: SinkTransformInput) => ReadonlyArray<SinkTransformOutput>;
```

Returning `[]` drops the record. Returning multiple samples lets one log line fan out (e.g. a counter plus a latency histogram).

### Extensibility

- Add new fields to a record via `attributes` rather than mutating `SinkTransformInput`.
- Add new labels via `dimensions` rather than mutating `SinkTransformOutput`.
- Add new metric kinds by extending `MetricKind` (consumers must opt in).
- Compose transforms by mapping over arrays: `(in) => [...transformA(in), ...transformB(in)]`.

### Example

A minimal transform that counts log records by level lives in `src/sink/transform/example.ts`:

```ts
import type { SinkTransform } from './sink/transform';

export const logLevelCounter: SinkTransform = (input) => [
  {
    name: 'log_records_total',
    kind: 'counter',
    value: 1,
    timestamp: input.timestamp,
    dimensions: { source: input.source, level: input.level },
    unit: '1',
  },
];
```
