/** GET /health — liveness + cache state probe. */
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { ContextStore } from '../store/context-store.js';
import { sendJson } from '../util/http.js';

export const BRIDGE_VERSION = '0.1.0';

export function handleHealth(
  _req: IncomingMessage,
  res: ServerResponse,
  store: ContextStore,
): void {
  const summary = store.getSelection();
  sendJson(res, 200, {
    ok: true,
    version: BRIDGE_VERSION,
    capturedAt: summary?.capturedAt ?? null,
    fileKey: summary?.fileKey ?? null,
    pageName: summary?.pageName ?? null,
    selectionCount: summary?.selectionCount ?? 0,
    rootCount: store.listRoots().length,
  });
}
