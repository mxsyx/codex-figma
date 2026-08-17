/**
 * Bridge CLI entry point. Parses environment, wires up ContextStore + SSE
 * broadcaster + McpRouteHandler, and starts the HTTP server.
 *
 * Env:
 *   CODEX_FIGMA_BRIDGE_PORT         — port (default 3845)
 *   CODEX_FIGMA_BRIDGE_HOST         — host (default 127.0.0.1)
 *   CODEX_FIGMA_BRIDGE_ROOT         — cache root (default OS cache dir)
 *   CODEX_FIGMA_BRIDGE_LOG_LEVEL    — debug | info | warn | error (default info)
 */
import { createServer } from './server.js';
import { makePaths } from './store/paths.js';
import { ContextStore } from './store/context-store.js';
import { createLogger, type LogLevel } from './util/logger.js';
import { SseBroadcaster } from './util/sse.js';
import { PendingFetchRegistry } from './store/pending-fetch.js';
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
  const port = parsePort(process.env.CODEX_FIGMA_BRIDGE_PORT, 3845);
  const host = process.env.CODEX_FIGMA_BRIDGE_HOST ?? '127.0.0.1';
  const paths = makePaths(process.env.CODEX_FIGMA_BRIDGE_ROOT);
  const log = createLogger(paths, parseLogLevel(process.env.CODEX_FIGMA_BRIDGE_LOG_LEVEL));

  log.info('starting codex-figma-bridge', { version: BRIDGE_VERSION, cacheRoot: paths.root });

  const store = new ContextStore(paths, log);
  const sse = new SseBroadcaster();
  const pendingFetch = new PendingFetchRegistry(log);
  const mcp = new McpRouteHandler(store, sse, pendingFetch, log);
  const server = createServer({ store, sse, pendingFetch, log, mcp });

  server.on('error', (err) => {
    log.error('http server error', { error: String(err) });
  });

  server.listen(port, host, () => {
    log.info('bridge listening', {
      host,
      port,
      endpoints: {
        health: `http://${host}:${port}/health`,
        selection: `http://${host}:${port}/selection`,
        node: `http://${host}:${port}/node`,
        events: `http://${host}:${port}/events`,
        mcp: `http://${host}:${port}/mcp`,
      },
    });
    // eslint-disable-next-line no-console
    console.log(`codex-figma-bridge v${BRIDGE_VERSION} listening on http://${host}:${port}`);
    // eslint-disable-next-line no-console
    console.log(`  cache: ${paths.root}`);
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
