import { classifyHttpStatus } from './errors';
import type {
  HttpPollingConfig,
  PolledRecord,
  PollingSource,
  PollingState,
  PollResult,
} from './types';

const DEFAULT_TIMEOUT_MS = 10_000;

export class HttpPollingSource implements PollingSource {
  readonly id: string;
  private readonly config: HttpPollingConfig;
  private readonly fetchImpl: typeof fetch;

  constructor(
    id: string,
    config: HttpPollingConfig,
    fetchImpl: typeof fetch = fetch,
  ) {
    this.id = id;
    this.config = config;
    this.fetchImpl = fetchImpl;
  }

  async pollOnce(prev: PollingState | null): Promise<PollResult> {
    const headers = buildHeaders(this.config.headers, prev);
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      this.config.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    );

    let response: Response;
    try {
      response = await this.fetchImpl(this.config.url, {
        headers,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    if (response.status === 304) {
      return { records: [], nextState: prev ?? {} };
    }
    if (!response.ok) {
      throw classifyHttpStatus(
        response.status,
        `HTTP ${response.status} from ${this.config.url}`,
      );
    }

    const body = await response.text();
    const now = Date.now();
    const records: PolledRecord[] = body.length
      ? [{ body, timestamp: now }]
      : [];
    const etag = response.headers.get('etag');
    return {
      records,
      nextState: {
        ...(prev ?? {}),
        lastTimestamp: now,
        ...(etag ? { lastEtag: etag } : {}),
      },
    };
  }
}

function buildHeaders(
  base: Readonly<Record<string, string>> | undefined,
  prev: PollingState | null,
): Record<string, string> {
  const headers: Record<string, string> = { ...(base ?? {}) };
  if (prev?.lastEtag) headers['If-None-Match'] = prev.lastEtag;
  return headers;
}
