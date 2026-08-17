/**
 * MCP Streamable HTTP route. Stateful mode — each Codex client gets one
 * session id and one (transport, server) pair. The shared ContextStore is
 * the same across all sessions, so multiple clients can read the same
 * captured selection.
 *
 * Routes:
 *   POST   /mcp  — JSON-RPC request (initialize, tools/call, etc.)
 *   GET    /mcp  — SSE stream for server-to-client notifications
 *   DELETE /mcp  — close a session
 */
import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ContextStore } from '../store/context-store.js';
import type { SseBroadcaster } from '../util/sse.js';
import type { PendingFetchRegistry } from '../store/pending-fetch.js';
import type { Logger } from '../util/logger.js';
import { readJsonBody, sendError } from '../util/http.js';
import { applyCorsHeaders } from '../util/cors.js';
import { createMcpServer } from '../mcp/server.js';

interface Session {
  id: string;
  transport: StreamableHTTPServerTransport;
  server: McpServer;
}

export class McpRouteHandler {
  private sessions = new Map<string, Session>();

  constructor(
    private readonly store: ContextStore,
    private readonly sse: SseBroadcaster,
    private readonly pendingFetch: PendingFetchRegistry,
    private readonly log: Logger,
  ) {}

  async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (req.method === 'POST') return this.handlePost(req, res);
    if (req.method === 'GET') return this.handleGet(req, res);
    if (req.method === 'DELETE') return this.handleDelete(req, res);
    sendError(res, 405, `method ${req.method} not allowed on /mcp`);
  }

  private async handlePost(req: IncomingMessage, res: ServerResponse): Promise<void> {
    let body: unknown;
    try {
      body = await readJsonBody(req);
    } catch (err) {
      sendError(res, 400, 'invalid JSON body', String(err));
      return;
    }

    const sessionId = req.headers['mcp-session-id'] as string | undefined;

    // Existing session — dispatch.
    if (sessionId) {
      const session = this.sessions.get(sessionId);
      if (!session) {
        sendError(res, 404, `unknown mcp-session-id ${sessionId}`);
        return;
      }
      try {
        await session.transport.handleRequest(req, res, body);
      } catch (err) {
        this.log.error('mcp request failed', { sessionId, error: String(err) });
        if (!res.headersSent) sendError(res, 500, 'mcp request failed', String(err));
      }
      return;
    }

    // New session — only accept on `initialize` requests.
    if (!isInitializeRequest(body)) {
      sendError(res, 400, 'missing mcp-session-id header for non-initialize request');
      return;
    }

    const id = randomUUID();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => id,
    });
    const server = createMcpServer(this.store, this.sse, this.pendingFetch, this.log);
    transport.onclose = () => {
      this.log.debug('mcp session closed', { sessionId: id });
      this.sessions.delete(id);
    };
    transport.onerror = (err) => {
      this.log.error('mcp transport error', { sessionId: id, error: String(err) });
    };

    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, body);
      this.sessions.set(id, { id, transport, server });
      this.log.info('mcp session initialized', { sessionId: id, sessions: this.sessions.size });
    } catch (err) {
      this.log.error('mcp initialize failed', { sessionId: id, error: String(err) });
      if (!res.headersSent) sendError(res, 500, 'mcp initialize failed', String(err));
      try {
        await server.close();
      } catch {
        // Ignore.
      }
    }
  }

  private async handleGet(req: IncomingMessage, res: ServerResponse): Promise<void> {
    // GET /mcp opens an SSE stream for server-initiated notifications.
    // Stateless clients (most CLI tools) won't open this — return 405 if no
    // session id is provided to discourage polling.
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    if (!sessionId) {
      applyCorsHeaders(res);
      res.statusCode = 405;
      res.setHeader('Allow', 'POST, DELETE');
      res.end(
        JSON.stringify({
          error:
            'GET /mcp requires an mcp-session-id header (SSE for server-initiated notifications). Use POST for tool calls.',
        }),
      );
      return;
    }
    const session = this.sessions.get(sessionId);
    if (!session) {
      sendError(res, 404, `unknown mcp-session-id ${sessionId}`);
      return;
    }
    try {
      await session.transport.handleRequest(req, res);
    } catch (err) {
      this.log.error('mcp sse stream failed', { sessionId, error: String(err) });
      if (!res.headersSent) sendError(res, 500, 'mcp sse stream failed', String(err));
    }
  }

  private async handleDelete(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    if (!sessionId) {
      sendError(res, 400, 'missing mcp-session-id header for DELETE');
      return;
    }
    const session = this.sessions.get(sessionId);
    if (!session) {
      sendError(res, 404, `unknown mcp-session-id ${sessionId}`);
      return;
    }
    try {
      await session.server.close();
    } catch {
      // Ignore.
    }
    this.sessions.delete(sessionId);
    applyCorsHeaders(res);
    res.statusCode = 204;
    res.end();
    this.log.info('mcp session deleted', { sessionId });
  }

  async closeAll(): Promise<void> {
    for (const [id, session] of this.sessions) {
      try {
        await session.server.close();
      } catch {
        // Ignore.
      }
      this.sessions.delete(id);
    }
  }

  sessionCount(): number {
    return this.sessions.size;
  }
}

function isInitializeRequest(body: unknown): boolean {
  if (!body || typeof body !== 'object') return false;
  const maybe = body as { method?: unknown };
  return maybe.method === 'initialize';
}
