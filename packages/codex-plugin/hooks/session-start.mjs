// No stdout on success: SessionStart stdout becomes model context.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, openSync, closeSync } from 'node:fs';
import { homedir, platform } from 'node:os';
import { dirname, isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

const STARTUP_TIMEOUT_MS = 12_000;

async function main() {
  const rawPort = process.env.CODEX_FIGMA_BRIDGE_PORT ?? '11111';
  const port = Number(rawPort);
  if (!/^\d+$/.test(rawPort) || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid CODEX_FIGMA_BRIDGE_PORT: ${rawPort}`);
  }
  const host = process.env.CODEX_FIGMA_BRIDGE_HOST ?? '127.0.0.1';
  const probeHost = host === '0.0.0.0' ? '127.0.0.1' : host === '::' ? '::1' : host;
  const url = `http://${probeHost.includes(':') ? `[${probeHost}]` : probeHost}:${port}/health`;

  async function isReady() {
    let response;
    try {
      response = await fetch(url, { signal: AbortSignal.timeout(500), redirect: 'error' });
    } catch {
      return false;
    }
    let body;
    try { body = await response.json(); } catch { /* Not a bridge health response. */ }
    if (response.ok && body?.ok === true && body?.service === 'codex-figma-bridge' && body?.mode === 'live-name-query') return true;
    throw new Error(`${url} is occupied by another service or an outdated bridge. Stop or upgrade it first.`);
  }

  // This also reuses manually started bridges, across plugin versions and sessions.
  if (await isReady()) return;

  const override = process.env.CODEX_FIGMA_BRIDGE_ENTRY || undefined;
  if (override && (!isAbsolute(override) || !existsSync(override))) {
    throw new Error('CODEX_FIGMA_BRIDGE_ENTRY must be an existing absolute path to codex-figma-bridge.mjs.');
  }
  const checkoutEntry = fileURLToPath(new URL('../../bridge/bin/codex-figma-bridge.mjs', import.meta.url));
  const entry = override ?? (existsSync(checkoutEntry) ? checkoutEntry : undefined);
  const logBase = platform() === 'darwin'
    ? join(homedir(), 'Library', 'Logs')
    : process.env.XDG_STATE_HOME ?? join(homedir(), '.local', 'state');
  const logRoot = process.env.PLUGIN_DATA ?? join(logBase, 'codex-figma-bridge');
  mkdirSync(logRoot, { recursive: true });
  const logPath = join(logRoot, 'startup.log');
  const logFd = openSync(logPath, 'a', 0o600);
  let child;
  try {
    child = spawn(entry ? process.execPath : 'codex-figma-bridge', entry ? [entry] : [], {
      cwd: entry ? dirname(entry) : logRoot,
      env: { ...process.env, CODEX_FIGMA_BRIDGE_HOST: host, CODEX_FIGMA_BRIDGE_PORT: String(port) },
      detached: true,
      stdio: ['ignore', logFd, logFd],
    });
  } finally {
    closeSync(logFd);
  }
  let spawnError;
  child.on('error', (err) => { spawnError = err; });
  child.unref();

  try {
    const deadline = Date.now() + STARTUP_TIMEOUT_MS;
    while (Date.now() < deadline) {
      if (await isReady()) return;
      if (spawnError) {
        throw new Error(`Cannot start the bridge: ${spawnError.message}. Build/install codex-figma-bridge on PATH, or set CODEX_FIGMA_BRIDGE_ENTRY to its absolute .mjs path.`);
      }
      // Concurrent sessions may both observe a closed port. The OS grants one
      // listener; the losing bridge exits on EADDRINUSE. Wait for the winner's
      // health response even when our own child has already exited.
      await delay(100);
    }
    throw new Error(`Bridge did not become ready at ${url}. See ${logPath}.`);
  } catch (err) {
    // Only stop the process this invocation started, never an existing bridge.
    if (child.exitCode === null && child.signalCode === null && child.pid) child.kill('SIGTERM');
    throw err;
  }
}

main().catch((err) => {
  console.error(`[codex-figma-bridge] ${err.message}`);
  process.exitCode = 1;
});
