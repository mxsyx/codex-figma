/**
 * Bridge CLI entry point. Parses environment, wires up live query routing + SSE
 * broadcaster + McpRouteHandler, and starts the HTTP server.
 *
 * Env:
 *   CODEX_FIGMA_BRIDGE_PORT         — port (default 11111)
 *   CODEX_FIGMA_BRIDGE_HOST         — host (default 127.0.0.1)
 *   CODEX_FIGMA_BRIDGE_LOG_DIR      — operational log directory
 *   CODEX_FIGMA_BRIDGE_LOG_LEVEL    — debug | info | warn | error (default info)
 */
import { createServer } from './server.js';
import { makeLogPaths } from './util/paths.js';
import { createLogger, type LogLevel } from './util/logger.js';
import { SseBroadcaster } from './util/sse.js';
import { PendingQueryRegistry } from './store/pending-query.js';
import { PendingDesignRegistry } from './store/pending-design.js';
import { PendingComponentsRegistry } from './store/pending-components.js';
import { McpRouteHandler } from './routes/mcp.js';
import { BRIDGE_VERSION } from './routes/health.js';

function parsePort(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0 || n > 65535) {
    throw new Error(`invalid port: ${raw}`);
  }
  return n;
}

function parseLogLevel(raw: string | undefined): LogLevel {
  if (raw === 'debug' || raw === 'info' || raw === 'warn' || raw === 'error') return raw;
  return 'info';
}

async function main(): Promise<void> {
  const port = parsePort(process.env.CODEX_FIGMA_BRIDGE_PORT, 11111);
  const host = process.env.CODEX_FIGMA_BRIDGE_HOST ?? '127.0.0.1';
  const paths = makeLogPaths();
  const log = createLogger(paths, parseLogLevel(process.env.CODEX_FIGMA_BRIDGE_LOG_LEVEL));

  log.info('starting codex-figma-bridge', { version: BRIDGE_VERSION, logRoot: paths.root });

  const sse = new SseBroadcaster();
  const pendingQuery = new PendingQueryRegistry();
  const pendingDesign = new PendingDesignRegistry(log);
  const pendingComponents = new PendingComponentsRegistry(log);
  const mcp = new McpRouteHandler(sse, pendingQuery, pendingDesign, pendingComponents, log);
  const server = createServer({
    sse,
    pendingQuery,
    pendingDesign,
    pendingComponents,
    log,
    mcp,
  });

  server.on('error', (err) => {
    const code = (err as NodeJS.ErrnoException).code;
    log.error(`http server error: ${err.message}`, { error: String(err), code, host, port });
    if (code === 'EADDRINUSE') {
      log.error(
        `Port ${port} on ${host} is already in use. Stop the conflicting service or set ` +
          'CODEX_FIGMA_BRIDGE_PORT to a free port, then update the Figma plugin Bridge URL, ' +
          'manifest networkAccess.allowedDomains, and Codex MCP URL to match.',
      );
    }
    if (!server.listening) process.exitCode = 1;
  });

  server.listen(port, host, () => {
    log.info('bridge listening', {
      host,
      port,
      endpoints: {
        health: `http://${host}:${port}/health`,
        queryResult: `http://${host}:${port}/query/result`,
        designResult: `http://${host}:${port}/design/result`,
        components: `http://${host}:${port}/components`,
        events: `http://${host}:${port}/events`,
        mcp: `http://${host}:${port}/mcp`,
      },
    });
    // eslint-disable-next-line no-console
    console.log(`codex-figma-bridge v${BRIDGE_VERSION} listening on http://${host}:${port}`);
    // eslint-disable-next-line no-console
    console.log(`  logs:  ${paths.root}`);
    // eslint-disable-next-line no-console
    console.log(`  mcp:   http://${host}:${port}/mcp`);
  });

  const shutdown = async (signal: string) => {
    log.info('shutting down', { signal });
    await mcp.closeAll();
    server.close(() => process.exit(0));
    // Force-exit after 5s if server.close hangs (open SSE streams, etc.).
    setTimeout(() => process.exit(1), 5000).unref();
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('fatal:', err);
  process.exit(1);
});
