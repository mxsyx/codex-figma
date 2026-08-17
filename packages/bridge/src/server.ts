/**
 * Composes the route handlers into a single Node http.Server. The server
 * holds no state of its own — all state lives in ContextStore, the SSE
 * broadcaster, and the McpRouteHandler session map.
 */
import { createServer as createHttpServer, type IncomingMessage, ServerResponse } from 'node:http';
import type { ContextStore } from './store/context-store.js';
import type { SseBroadcaster } from './util/sse.js';
import type { PendingFetchRegistry } from './store/pending-fetch.js';
import type { Logger } from './util/logger.js';
import { handleHealth, BRIDGE_VERSION } from './routes/health.js';
import { handlePostSelection } from './routes/selection.js';
import { handlePostNode } from './routes/node.js';
import { handleEvents } from './routes/events.js';
import { McpRouteHandler } from './routes/mcp.js';
import { handlePreflight, applyCorsHeaders } from './util/cors.js';
import { sendJson, sendError } from './util/http.js';

export interface ServerDeps {
  store: ContextStore;
  sse: SseBroadcaster;
  pendingFetch: PendingFetchRegistry;
  log: Logger;
  mcp: McpRouteHandler;
}

export function createServer(deps: ServerDeps): ReturnType<typeof createHttpServer> {
  const { store, sse, pendingFetch, log, mcp } = deps;

  const server = createHttpServer(async (req, res) => {
    // CORS preflight — answer before routing.
    if (req.method === 'OPTIONS') {
      handlePreflight(req, res);
      return;
    }

    const url = new URL(req.url ?? '/', 'http://localhost');
    const path = url.pathname;

    try {
      switch (true) {
        case path === '/health' && req.method === 'GET':
          handleHealth(req, res, store);
          return;

        case path === '/selection' && req.method === 'POST':
          await handlePostSelection(req, res, { store, sse, log });
          return;

        case path === '/node' && req.method === 'POST':
          await handlePostNode(req, res, { store, pendingFetch, log });
          return;

        case path === '/events' && req.method === 'GET':
          handleEvents(req, res, { store, sse });
          return;

        case path === '/mcp':
          await mcp.handle(req, res);
          return;

        case path === '/' && req.method === 'GET':
          sendJson(res, 200, {
            name: 'codex-figma-bridge',
            version: BRIDGE_VERSION,
            endpoints: {
              health: 'GET /health',
              selection: 'POST /selection',
              node: 'POST /node',
              events: 'GET /events (SSE)',
              mcp: 'POST /mcp · GET /mcp · DELETE /mcp',
            },
          });
          return;

        default:
          applyCorsHeaders(res);
          sendError(res, 404, `not found: ${req.method} ${path}`);
      }
    } catch (err) {
      log.error('unhandled route error', { path, method: req.method, error: String(err) });
      if (!res.headersSent) sendError(res, 500, 'internal error', String(err));
    }
  });

  return server;
}
