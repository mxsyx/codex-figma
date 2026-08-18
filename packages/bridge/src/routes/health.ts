/** GET /health — liveness + cache state probe. */
import { createRequire } from "node:module";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { ContextStore } from "../store/context-store.js";
import { sendJson } from "../util/http.js";

// Read version from package.json so changeset version bumps are reflected
// without manually syncing a hardcoded constant.
const pkg = createRequire(import.meta.url)("../../package.json");
export const BRIDGE_VERSION: string = pkg.version;

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
