import { homedir, platform } from 'node:os';
import { join, resolve } from 'node:path';
import { mkdirSync } from 'node:fs';

export interface LogPaths { root: string; bridgeLog: string }

/** Operational logs only. No node, asset, selection or response directories. */
export function makeLogPaths(): LogPaths {
  const base = platform() === 'darwin' ? join(homedir(), 'Library', 'Logs')
    : process.env.XDG_STATE_HOME ?? join(homedir(), '.local', 'state');
  const root = resolve(process.env.CODEX_FIGMA_BRIDGE_LOG_DIR ?? join(base, 'codex-figma-bridge'));
  mkdirSync(root, { recursive: true });
  return { root, bridgeLog: join(root, 'bridge.log') };
}
