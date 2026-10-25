/** GET /events — Server-Sent Events stream of requests to the Figma plugin. */
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { SseBroadcaster } from '../util/sse.js';

export function handleEvents(
  _req: IncomingMessage,
  res: ServerResponse,
  sse: SseBroadcaster,
): void {
  sse.add(res);
}
