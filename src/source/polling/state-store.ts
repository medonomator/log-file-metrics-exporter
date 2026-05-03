import type { PollingState, StateStore } from './types';

/**
 * In-memory state store. Loses everything on process exit, so it is suitable
 * only for tests and single-process runs without durability requirements.
 *
 * Production deployments MUST provide a durable implementation. See the
 * `StateStore` interface for delivery-semantics contract (at-least-once:
 * downstream consumers must dedupe by `(source, offset)` or be idempotent).
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
