/**
 * Composes the route handlers into a single Node http.Server. The server
 * only tracks connections and pending requests. No design data is cached.
 */
import {
  createServer as createHttpServer,
  type IncomingMessage,
  ServerResponse,
} from "node:http";
import type { SseBroadcaster } from "./util/sse.js";
import type { PendingQueryRegistry } from "./store/pending-query.js";
import type { PendingDesignRegistry } from "./store/pending-design.js";
import type { PendingComponentsRegistry } from "./store/pending-components.js";
import type { Logger } from "./util/logger.js";
import { handleHealth, BRIDGE_VERSION } from "./routes/health.js";
import { handleQueryResult } from "./routes/query-result.js";
import { handlePostDesignResult } from "./routes/design-result.js";
import { handlePostComponents } from "./routes/components.js";
import { handleEvents } from "./routes/events.js";
import { McpRouteHandler } from "./routes/mcp.js";
import { handlePreflight, applyCorsHeaders } from "./util/cors.js";
import { sendJson, sendError } from "./util/http.js";

export interface ServerDeps {
  sse: SseBroadcaster;
  pendingQuery: PendingQueryRegistry;
  pendingDesign: PendingDesignRegistry;
  pendingComponents: PendingComponentsRegistry;
  log: Logger;
  mcp: McpRouteHandler;
}

export function createServer(
  deps: ServerDeps,
): ReturnType<typeof createHttpServer> {
  const {
    sse,
    pendingQuery,
    pendingDesign,
    pendingComponents,
    log,
    mcp,
  } = deps;

  const server = createHttpServer(async (req, res) => {
    // CORS preflight — answer before routing.
    if (req.method === "OPTIONS") {
      handlePreflight(req, res);
      return;
    }

    const url = new URL(req.url ?? "/", "http://localhost");
    const path = url.pathname;

    try {
      switch (true) {
        case path === "/health" && req.method === "GET":
          handleHealth(req, res, sse);
          return;

        case path === "/query/result" && req.method === "POST":
          await handleQueryResult(req, res, pendingQuery);
          return;

        case path === "/design/result" && req.method === "POST":
          await handlePostDesignResult(req, res, { pendingDesign, log });
          return;

        case path === "/components" && req.method === "POST":
          await handlePostComponents(req, res, {
            pendingComponents,
            log,
          });
          return;

        case path === "/events" && req.method === "GET":
          handleEvents(req, res, sse);
          return;

        case path === "/mcp":
          await mcp.handle(req, res);
          return;

        case path === "/" && req.method === "GET":
          sendJson(res, 200, {
            name: "codex-figma-bridge",
            version: BRIDGE_VERSION,
            endpoints: {
              health: "GET /health",
              queryResult: "POST /query/result",
              designResult: "POST /design/result",
              components: "POST /components",
              events: "GET /events (SSE)",
              mcp: "POST /mcp · GET /mcp · DELETE /mcp",
            },
          });
          return;

        default:
          applyCorsHeaders(res);
          sendError(res, 404, `not found: ${req.method} ${path}`);
      }
    } catch (err) {
      log.error("unhandled route error", {
        path,
        method: req.method,
        error: String(err),
      });
      if (!res.headersSent) sendError(res, 500, "internal error", String(err));
    }
  });

  return server;
}
