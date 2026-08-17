/** GET /events — Server-Sent Events stream of selection-change events. */
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { SseBroadcaster } from '../util/sse.js';
import type { ContextStore } from '../store/context-store.js';

export function handleEvents(
  _req: IncomingMessage,
  res: ServerResponse,
  ctx: { store: ContextStore; sse: SseBroadcaster },
): void {
  ctx.sse.add(res);
}
