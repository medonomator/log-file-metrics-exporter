/**
 * Example implementation of `SinkTransform`.
 *
 * Counts log records by level, emitting one counter sample per call. This is
 * intentionally small — real transforms will pull values from `input.message`
 * or `input.attributes` and may emit multiple samples per record.
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
