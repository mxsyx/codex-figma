/** GET /health — process liveness and plugin connection count. */
import { createRequire } from "node:module";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { SseBroadcaster } from "../util/sse.js";
import { sendJson } from "../util/http.js";

// The standalone plugin build injects this from the bridge package manifest.
// Normal source/tsc builds read the same manifest at runtime.
declare const __BRIDGE_VERSION__: string;
export const BRIDGE_VERSION: string = typeof __BRIDGE_VERSION__ !== 'undefined'
  ? __BRIDGE_VERSION__
  : createRequire(import.meta.url)("../../package.json").version;

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
