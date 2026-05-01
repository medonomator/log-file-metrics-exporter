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

## Polling Sources

Sources poll an external system (HTTP endpoint, file, database) and emit `PolledRecord`s. Built-ins live in `src/source/polling/`.

### Quick start

```ts
import {
  createPollingSource,
  withRetry,
  InMemoryStateStore,
  PollingError,
} from './source/polling';

const source = createPollingSource('app-log-1', {
  kind: 'file',
  intervalMs: 5000,
  path: '/var/log/app.log',
  retry: { maxAttempts: 3, baseDelayMs: 200 },
});
const store = new InMemoryStateStore();

try {
  const prev = await store.load(source.id);
  const { value } = await withRetry(
    () => source.pollOnce(prev),
    { maxAttempts: 3, baseDelayMs: 200 },
  );
  await store.save(source.id, value.nextState);
  console.log(value.records);
} catch (err) {
  if (err instanceof PollingError) {
    if (err.kind === 'not_found') {
      // permanent: the file or endpoint does not exist; stop polling this source
    } else if (err.kind === 'auth') {
      // permanent: rotate credentials before retrying
    } else {
      // network / server failures already exhausted retry budget; alert and back off
    }
  }
  throw err;
}
```

### Configuration

All sources share the base fields. Each `kind` adds its own:

| Field          | Type                              | Required | Notes                                                                        |
| -------------- | --------------------------------- | -------- | ---------------------------------------------------------------------------- |
| `kind`         | `'http' \| 'file' \| 'database'`  | yes      | Selects the implementation.                                                  |
| `intervalMs`   | `number`                          | yes      | Polling cadence used by the orchestrator. The source itself does not sleep. |
| `retry`        | `RetryConfig`                     | no       | Passed to `withRetry()`. See below.                                          |

HTTP-specific (`kind: 'http'`):

| Field       | Type                       | Required | Notes                                                              |
| ----------- | -------------------------- | -------- | ------------------------------------------------------------------ |
| `url`       | `string`                   | yes      | Endpoint to GET.                                                   |
| `headers`   | `Record<string, string>`   | no       | Merged with auto-added `If-None-Match` when an etag is cached.     |
| `timeoutMs` | `number`                   | no       | Default 10000.                                                     |

File-specific (`kind: 'file'`):

| Field  | Type     | Required | Notes                                                |
| ------ | -------- | -------- | ---------------------------------------------------- |
| `path` | `string` | yes      | Reads bytes after the last persisted offset.         |

Database-specific (`kind: 'database'`):

| Field              | Type     | Required | Notes                                          |
| ------------------ | -------- | -------- | ---------------------------------------------- |
| `connectionString` | `string` | yes      | Contract only. Bring your own driver.          |
| `query`            | `string` | yes      | Same: implementations decide how to parameterize. |

### Retry

`RetryConfig` controls `withRetry`:

| Field         | Default | Notes                                                  |
| ------------- | ------- | ------------------------------------------------------ |
| `maxAttempts` | `3`     | Total tries (not extra retries).                       |
| `baseDelayMs` | `200`   | Exponential base.                                      |
| `maxDelayMs`  | `10000` | Cap.                                                   |
| `jitter`      | `true`  | Multiplies delay by a random `[0.5, 1.0]` factor.      |

Errors are classified into one of:

| `kind`        | Triggered by                                               | Retryable |
| ------------- | ---------------------------------------------------------- | --------- |
| `network`     | `ECONNREFUSED`, `ETIMEDOUT`, `ENOTFOUND` (DNS / TCP fail)  | yes       |
| `server`      | HTTP 5xx response                                          | yes       |
| `not_found`   | HTTP 404, file `ENOENT`                                    | no        |
| `auth`        | HTTP 401 / 403                                             | no        |
| `unknown`     | Anything else (parse failures, unexpected throws)          | no        |

Only `network` and `server` are retried. `not_found` and `auth` short-circuit immediately so you do not hammer a misconfigured endpoint.

### State management

Every poll returns a `nextState` ( `lastTimestamp` / `lastOffset` / `lastEtag`). Persist it via a `StateStore` so a restart resumes without duplication. `InMemoryStateStore` ships for tests and ephemeral runs; production should plug in a Redis or filesystem store implementing the same interface.

### Extending

`createPollingSource` covers `http` and `file`. For `database` (or any other transport): write a class that implements `PollingSource` (`id` + `pollOnce(prev)`) and pass it where the orchestrator expects the interface. The retry helper, error classifier, and state store are reusable as-is.

When you add a custom source, **wire it into a `StateStore` immediately** (in-memory for tests, Redis or filesystem for prod). Without persistence, every restart re-reads from the beginning, which double-counts metrics and may overwhelm your downstream sink. The store is small (`load(id)` / `save(id, state)`) — implement it before going live.

### Tests

```sh
npm test
```

Vitest covers retry behaviour (success path, retryable failures, non-retryable short-circuit, exhaustion, exponential backoff) plus HTTP and file sources (200, 304, 404, 500, etag round-trip, file resume).

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

#### When to use `attributes`

`attributes` carries everything the parser surfaced beyond the core fields above. Use it for:

- **Numeric fields** the transform may turn into metric values: `duration_ms`, `bytes_sent`, `status_code`.
- **High-cardinality identifiers** that should NOT become metric dimensions: `request_id`, `trace_id`, `user_id`. Read them in code, but do not copy into `dimensions`.
- **Parser-specific extras**: regex named groups, JSON fields not part of the core shape.

Keep core fields (`timestamp`, `source`, `level`, `message`) at the top level, and put everything else under `attributes`. New parsers do not need to extend the interface.

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

