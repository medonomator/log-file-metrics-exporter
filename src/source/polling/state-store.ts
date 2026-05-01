import type { PollingState, StateStore } from './types';

/**
 * In-memory state store. Suitable for tests, single-process runs without
 * persistence requirements, or as a base class for richer stores.
 */
export class InMemoryStateStore implements StateStore {
  private readonly map = new Map<string, PollingState>();

  async load(sourceId: string): Promise<PollingState | null> {
    return this.map.get(sourceId) ?? null;
  }

  async save(sourceId: string, state: PollingState): Promise<void> {
    this.map.set(sourceId, state);
  }
}
