import { describe, it, expect, vi } from 'vitest';
import { withRetry } from './retry';
import { PollingError } from './errors';

describe('withRetry', () => {
  it('returns the value on first success', async () => {
    const op = vi.fn().mockResolvedValue('ok');
    const result = await withRetry(op);
    expect(result.value).toBe('ok');
    expect(result.attempts).toBe(1);
    expect(op).toHaveBeenCalledTimes(1);
  });

  it('retries retryable errors up to maxAttempts', async () => {
    let calls = 0;
    const op = vi.fn().mockImplementation(async () => {
      calls += 1;
      if (calls < 3) throw new PollingError('flaky', 'network', true);
      return 'recovered';
    });
    const sleep = vi.fn().mockResolvedValue(undefined);
    const result = await withRetry(
      op,
      { maxAttempts: 3, baseDelayMs: 1, jitter: false },
      sleep,
    );
    expect(result.value).toBe('recovered');
    expect(result.attempts).toBe(3);
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  it('throws immediately on a non-retryable error', async () => {
    const op = vi.fn().mockRejectedValue(
      new PollingError('forbidden', 'auth', false),
    );
    const sleep = vi.fn();
    await expect(
      withRetry(op, { maxAttempts: 5, baseDelayMs: 1 }, sleep),
    ).rejects.toMatchObject({ kind: 'auth' });
    expect(op).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('throws after exhausting attempts on retryable failures', async () => {
    const op = vi.fn().mockRejectedValue(
      new PollingError('5xx', 'server', true),
    );
    const sleep = vi.fn().mockResolvedValue(undefined);
    await expect(
      withRetry(op, { maxAttempts: 2, baseDelayMs: 1, jitter: false }, sleep),
    ).rejects.toMatchObject({ kind: 'server' });
    expect(op).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledTimes(1);
  });

  it('uses exponential backoff without jitter', async () => {
    const calls: number[] = [];
    const sleep = vi.fn().mockImplementation(async (ms: number) => {
      calls.push(ms);
    });
    const op = vi
      .fn()
      .mockRejectedValueOnce(new PollingError('a', 'network', true))
      .mockRejectedValueOnce(new PollingError('b', 'network', true))
      .mockResolvedValue('done');
    await withRetry(
      op,
      { maxAttempts: 3, baseDelayMs: 100, jitter: false },
      sleep,
    );
    expect(calls).toEqual([100, 200]);
  });
});
