/**
 * Registry for design generation requests sent from Codex to the Figma plugin.
 *
 * The MCP tool creates a pending request and broadcasts an SSE event. The
 * plugin renders the design after the user clicks "Generate", then POSTs the
 * result to /design/result. This registry connects the two sides.
 */
import type { Logger } from '../util/logger.js';

export interface DesignGenerationResult {
  ok: boolean;
  rootId?: string;
  error?: string;
}

interface PendingEntry {
  resolve: (result: DesignGenerationResult) => void;
  timer: ReturnType<typeof setTimeout>;
}

export class PendingDesignRegistry {
  private pending = new Map<string, PendingEntry>();

  constructor(private readonly log: Logger) {}

  create(requestId: string, timeoutMs = 120_000): Promise<DesignGenerationResult> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        if (this.pending.delete(requestId)) {
          this.log.warn('design generation timed out', { requestId, timeoutMs });
          resolve({
            ok: false,
            error: `plugin did not generate the design within ${timeoutMs}ms — is the Figma plugin UI open?`,
          });
        }
      }, timeoutMs);

      this.pending.set(requestId, { resolve, timer });
    });
  }

  resolve(requestId: string, result: DesignGenerationResult): void {
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
