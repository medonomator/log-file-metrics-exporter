/**
 * Example implementation of `SinkTransform`.
 *
 * Counts log records by level, emitting one counter sample per call. Kept small
 * on purpose: real transforms will pull values from `input.message` or
 * `input.attributes` and may emit several samples per record.
 *
 * How to extend:
 *  - To gate by level: filter on `input.level` and return [] for unwanted ones.
 *  - To add a latency histogram: read a number from `input.attributes.duration_ms`
 *    and append a second sample with `kind: "histogram"` to the returned array.
 *  - To add stable labels: extend `dimensions` with values from `input.attributes`
 *    that have low cardinality (host, region, service) and avoid raw user input.
 *  - To compose with other transforms: see `composeTransforms` below.
 */

import type {
  SinkTransform,
  SinkTransformInput,
  SinkTransformOutput,
} from './types';

export const logLevelCounter: SinkTransform = (
  input: SinkTransformInput,
): ReadonlyArray<SinkTransformOutput> => {
  return [
    {
      name: 'log_records_total',
      kind: 'counter',
      value: 1,
      timestamp: input.timestamp,
      dimensions: {
        source: input.source,
        level: input.level,
      },
      unit: '1',
    },
  ];
};

/**
 * Run several transforms over the same input and concatenate their samples.
 * Use this when one log record needs to feed multiple metric streams.
 */
export function composeTransforms(
  transforms: ReadonlyArray<SinkTransform>,
): SinkTransform {
  return (input) => transforms.flatMap((t) => t(input));
}
