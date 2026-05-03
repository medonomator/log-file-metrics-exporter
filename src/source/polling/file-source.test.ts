import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, writeFile, appendFile, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { FilePollingSource } from './file-source';

describe('FilePollingSource', () => {
  let dir: string;
  let logFile: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'log-poll-'));
    logFile = join(dir, 'app.log');
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('reads all lines on first poll and advances offset', async () => {
    await writeFile(logFile, 'line1\nline2\nline3\n');
    const source = new FilePollingSource('f1', {
      kind: 'file',
      intervalMs: 1000,
      path: logFile,
    });
    const result = await source.pollOnce(null);
    expect(result.records.map((r) => r.body)).toEqual(['line1', 'line2', 'line3']);
    expect(result.nextState.lastOffset).toBe(18);
  });

  it('returns only new lines on a follow-up poll', async () => {
    await writeFile(logFile, 'old\n');
    const source = new FilePollingSource('f2', {
      kind: 'file',
      intervalMs: 1000,
      path: logFile,
    });
    const first = await source.pollOnce(null);
    expect(first.records.map((r) => r.body)).toEqual(['old']);

    await appendFile(logFile, 'new1\nnew2\n');
    const second = await source.pollOnce(first.nextState);
    expect(second.records.map((r) => r.body)).toEqual(['new1', 'new2']);
  });

  it('throws not_found for a missing file (non-retryable)', async () => {
    const source = new FilePollingSource('f3', {
      kind: 'file',
      intervalMs: 1000,
      path: join(dir, 'does-not-exist.log'),
    });
    await expect(source.pollOnce(null)).rejects.toMatchObject({
      kind: 'not_found',
      retryable: false,
    });
  });

  it('detects truncation and reads from offset 0', async () => {
    await writeFile(logFile, 'a-very-long-first-line\n');
    const source = new FilePollingSource('f4', {
      kind: 'file',
      intervalMs: 1000,
      path: logFile,
    });
    const first = await source.pollOnce(null);
    expect(first.records.map((r) => r.body)).toEqual(['a-very-long-first-line']);

    await writeFile(logFile, 'short\n');
    const second = await source.pollOnce(first.nextState);
    expect(second.records.map((r) => r.body)).toEqual(['short']);
  });

  it('detects inode change vs prior state and reads from offset 0', async () => {
    await writeFile(logFile, 'whole-file-after-rotation\n');
    const source = new FilePollingSource('f5', {
      kind: 'file',
      intervalMs: 1000,
      path: logFile,
    });
    const fakePriorState = { lastOffset: 5, lastInode: -1 };
    const result = await source.pollOnce(fakePriorState);
    expect(result.records.map((r) => r.body)).toEqual([
      'whole-file-after-rotation',
    ]);
    expect(result.nextState.lastInode).not.toBe(-1);
  });
});
