import { stat, open } from 'fs/promises';
import { classifyError, PollingError } from './errors';
import type {
  FilePollingConfig,
  PolledRecord,
  PollingSource,
  PollingState,
  PollResult,
} from './types';

export class FilePollingSource implements PollingSource {
  readonly id: string;
  private readonly config: FilePollingConfig;

  constructor(id: string, config: FilePollingConfig) {
    this.id = id;
    this.config = config;
  }

  async pollOnce(prev: PollingState | null): Promise<PollResult> {
    let size: number;
    let inode: number;
    try {
      const info = await stat(this.config.path);
      size = info.size;
      inode = info.ino;
    } catch (err) {
      const code = readErrorCode(err);
      if (code === 'ENOENT') {
        throw new PollingError(
          `File not found: ${this.config.path}`,
          'not_found',
          false,
        );
      }
      throw classifyError(err);
    }

    const rotated = prev?.lastInode != null && prev.lastInode !== inode;
    const truncated = prev?.lastOffset != null && size < prev.lastOffset;
    const resumeFromZero = rotated || truncated;
    const startOffset = resumeFromZero ? 0 : Math.min(prev?.lastOffset ?? 0, size);

    if (startOffset >= size) {
      return {
        records: [],
        nextState: { ...(prev ?? {}), lastOffset: size, lastInode: inode },
      };
    }

    const handle = await open(this.config.path, 'r');
    try {
      const length = size - startOffset;
      const buffer = Buffer.alloc(length);
      await handle.read(buffer, 0, length, startOffset);
      const text = buffer.toString('utf-8');
      const records = splitLines(text, startOffset);
      return {
        records,
        nextState: {
          ...(prev ?? {}),
          lastOffset: size,
          lastInode: inode,
        },
      };
    } finally {
      await handle.close();
    }
  }
}

function splitLines(text: string, baseOffset: number): PolledRecord[] {
  if (text.length === 0) return [];
  const out: PolledRecord[] = [];
  const now = Date.now();
  let cursor = 0;
  for (const line of text.split('\n')) {
    if (line.length > 0) {
      out.push({ body: line, timestamp: now, offset: baseOffset + cursor });
    }
    cursor += line.length + 1;
  }
  return out;
}

function readErrorCode(err: unknown): string | null {
  if (!(err instanceof Error)) return null;
  const candidate = (err as unknown as { code?: unknown }).code;
  return typeof candidate === 'string' ? candidate : null;
}
