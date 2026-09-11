import type { Logger } from '../util/logger.js';
import type { ComponentsResult } from './schema.js';

type PendingEntry = {
  resolve: (result: ComponentsResult) => void;
  timer: ReturnType<typeof setTimeout>;
};

export class PendingComponentsRegistry {
  private pending = new Map<string, PendingEntry>();

  constructor(private readonly log: Logger) {}

  create(requestId: string, timeoutMs = 60_000): Promise<ComponentsResult> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        if (this.pending.delete(requestId)) {
          this.log.warn('component scan timed out', { requestId, timeoutMs });
          resolve({
            requestId,
            found: false,
            components: [],
            nodes: {},
            error: `plugin did not scan components within ${timeoutMs}ms — is the Figma plugin UI open?`,
          });
        }
      }, timeoutMs);

      this.pending.set(requestId, { resolve, timer });
    });
  }

  resolve(requestId: string, result: ComponentsResult): void {
    const entry = this.pending.get(requestId);
    if (!entry) return;
    clearTimeout(entry.timer);
    this.pending.delete(requestId);
    entry.resolve(result);
  }

  size(): number {
    return this.pending.size;
  }
}
