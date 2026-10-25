/** GET /health — process liveness and plugin connection count. */
import { createRequire } from "node:module";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { SseBroadcaster } from "../util/sse.js";
import { sendJson } from "../util/http.js";

// Read version from package.json so changeset version bumps are reflected
// without manually syncing a hardcoded constant.
const pkg = createRequire(import.meta.url)("../../package.json");
export const BRIDGE_VERSION: string = pkg.version;

export function handleHealth(
  _req: IncomingMessage,
  res: ServerResponse,
  sse: SseBroadcaster,
): void {
  sendJson(res, 200, {
    ok: true,
    service: 'codex-figma-bridge',
    version: BRIDGE_VERSION,
    mode: 'live-name-query',
    connectedPlugins: sse.size(),
  });
}
