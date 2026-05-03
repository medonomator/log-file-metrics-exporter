import { describe, it, expect, vi } from 'vitest';
import { HttpPollingSource } from './http-source';

function makeResponse(
  init: { status?: number; body?: string; headers?: Record<string, string> } = {},
): Response {
  return new Response(init.body ?? '', {
    status: init.status ?? 200,
    headers: init.headers ?? {},
  });
}

describe('HttpPollingSource', () => {
  it('emits one record on a 200 response', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(makeResponse({ body: 'log line', headers: { etag: 'v1' } }));
    const source = new HttpPollingSource(
      's1',
      { kind: 'http', intervalMs: 1000, url: 'http://example.test/logs' },
      fetchImpl as unknown as typeof fetch,
    );
    const result = await source.pollOnce(null);
    expect(result.records).toHaveLength(1);
    expect(result.records[0].body).toBe('log line');
    expect(result.nextState.lastEtag).toBe('v1');
    expect(typeof result.nextState.lastTimestamp).toBe('number');
  });

  it('returns no records on 304 Not Modified and preserves state', async () => {
    const notModified = new Response(null, { status: 304 });
    const fetchImpl = vi.fn().mockResolvedValue(notModified);
    const source = new HttpPollingSource(
      's2',
      { kind: 'http', intervalMs: 1000, url: 'http://example.test/logs' },
      fetchImpl as unknown as typeof fetch,
    );
    const prev = { lastEtag: 'cached', lastTimestamp: 42 };
    const result = await source.pollOnce(prev);
    expect(result.records).toHaveLength(0);
    expect(result.nextState).toEqual(prev);
  });

  it('classifies 404 as not_found and not retryable', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(makeResponse({ status: 404 }));
    const source = new HttpPollingSource(
      's3',
      { kind: 'http', intervalMs: 1000, url: 'http://example.test/missing' },
      fetchImpl as unknown as typeof fetch,
    );
    await expect(source.pollOnce(null)).rejects.toMatchObject({
      kind: 'not_found',
      retryable: false,
    });
  });

  it('classifies 500 as server and retryable', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(makeResponse({ status: 500 }));
    const source = new HttpPollingSource(
      's4',
      { kind: 'http', intervalMs: 1000, url: 'http://example.test/down' },
      fetchImpl as unknown as typeof fetch,
    );
    await expect(source.pollOnce(null)).rejects.toMatchObject({
      kind: 'server',
      retryable: true,
    });
  });

  it('sends If-None-Match when prior etag is in state', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(makeResponse({ body: 'x' }));
    const source = new HttpPollingSource(
      's5',
      { kind: 'http', intervalMs: 1000, url: 'http://example.test/logs' },
      fetchImpl as unknown as typeof fetch,
    );
    await source.pollOnce({ lastEtag: 'abc' });
    const init = fetchImpl.mock.calls[0][1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers['If-None-Match']).toBe('abc');
  });
});
