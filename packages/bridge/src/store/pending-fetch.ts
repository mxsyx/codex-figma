/**
 * Registry for in-flight on-demand node fetch requests.
 *
 * When `get_node` has a cache miss, it broadcasts a `fetch-node-request` SSE
 * event to the Figma plugin UI and creates a pending entry here. When the
 * plugin POSTs the node back to `/node`, the route handler resolves the
 * pending promise. If the plugin doesn't respond within the timeout, the
 * promise resolves with a timeout error so the MCP tool can return a clear
 * message instead of hanging.
 */
import type { Logger } from '../util/logger.js';

export interface FetchResult {
  found: boolean;
  nodeId: string;
  error?: string;
}

interface PendingEntry {
  resolve: (result: FetchResult) => void;
  timer: ReturnType<typeof setTimeout>;
}

export class PendingFetchRegistry {
  private pending = new Map<string, PendingEntry>();

  constructor(private readonly log: Logger) {}

  /**
   * Create a pending fetch request. Returns a promise that resolves when the
   * plugin responds (via `resolve()`) or when the timeout elapses.
   */
  create(requestId: string, nodeId: string, timeoutMs = 15_000): Promise<FetchResult> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        if (this.pending.delete(requestId)) {
          this.log.warn('node fetch timed out', { requestId, nodeId, timeoutMs });
          resolve({
            found: false,
            nodeId,
            error: `plugin did not respond within ${timeoutMs}ms — is the Figma plugin UI open?`,
          });
        }
      }, timeoutMs);

      this.pending.set(requestId, { resolve, timer });
    });
  }

  /**
   * Resolve a pending fetch request. No-op if the requestId is unknown
   * (already timed out or never created).
   */
  resolve(requestId: string, result: FetchResult): void {
    const entry = this.pending.get(requestId);
    if (!entry) return;
    clearTimeout(entry.timer);
    this.pending.delete(requestId);
    entry.resolve(result);
  }

  /** Number of in-flight requests (useful for diagnostics). */
  size(): number {
    return this.pending.size;
  }
}
