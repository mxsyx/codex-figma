import type { NodeQuery, NodeQueryResult } from './schema.js';

/** Only in-flight request correlation, never completed node data. */
export class PendingQueryRegistry {
  private pending = new Map<string, {
    query: NodeQuery;
    resolve: (result: NodeQueryResult) => void;
    timer: ReturnType<typeof setTimeout>;
  }>();

  create(query: NodeQuery, timeoutMs = 90_000): Promise<NodeQueryResult> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(query.requestId);
        resolve({ requestId: query.requestId, operation: query.operation, nodeName: query.nodeName,
          status: 'error', total: 0, offset: 0, nextOffset: null, candidates: [],
          error: 'Live Figma query timed out. Keep the plugin open and retry; no previous result is reused.' });
      }, timeoutMs);
      this.pending.set(query.requestId, { query, resolve, timer });
    });
  }

  resolve(result: NodeQueryResult): boolean {
    const entry = this.pending.get(result.requestId);
    if (!entry || entry.query.nodeName !== result.nodeName || entry.query.operation !== result.operation) return false;
    this.pending.delete(result.requestId);
    clearTimeout(entry.timer);
    entry.resolve(result);
    return true;
  }

  size(): number { return this.pending.size; }
}
