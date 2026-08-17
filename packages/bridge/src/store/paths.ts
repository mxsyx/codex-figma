/**
 * Cache directory layout for the bridge.
 *
 * Layout (under <root>):
 *   current-selection.json   — latest snapshot metadata + selection summary
 *   nodes/<safe-id>.json     — one file per captured node tree root
 *   assets/<safe-id>.<ext>   — PNG / SVG bytes for screenshots and icons
 *   events.jsonl             — append-only event log (debugging)
 *   bridge.log               — structured logs (written by util/logger)
 *
 * <root> defaults to the OS cache dir + "codex-figma-bridge"; override with
 * CODEX_FIGMA_BRIDGE_ROOT.
 */
import { homedir, platform } from 'node:os';
import { join, resolve } from 'node:path';
import { mkdirSync } from 'node:fs';

export interface BridgePaths {
  root: string;
  currentSelection: string;
  nodesDir: string;
  assetsDir: string;
  eventsLog: string;
  bridgeLog: string;
}

function defaultRoot(): string {
  const envRoot = process.env.CODEX_FIGMA_BRIDGE_ROOT;
  if (envRoot && envRoot.length > 0) return resolve(expandTilde(envRoot));

  const home = homedir();
  const isMac = platform() === 'darwin';
  const base = isMac
    ? join(home, 'Library', 'Caches')
    : process.env.XDG_CACHE_HOME ?? join(home, '.cache');
  return join(base, 'codex-figma-bridge');
}

function expandTilde(p: string): string {
  if (p.startsWith('~/')) return join(homedir(), p.slice(2));
  return p;
}

/**
 * Figma node ids look like "42:15" or "I1:42:15;3:2". They are safe as
 * path segments once colons and semicolons are replaced, but we still
 * restrict to a tight character set to keep cache listings scannable.
 */
export function safeNodeId(id: string): string {
  return id.replace(/[^A-Za-z0-9_-]/g, '_');
}

export function assetFileName(nodeId: string, format: 'PNG' | 'SVG'): string {
  return `${safeNodeId(nodeId)}.${format.toLowerCase()}`;
}

export function makePaths(rootOverride?: string): BridgePaths {
  const root = rootOverride ?? defaultRoot();
  const nodesDir = join(root, 'nodes');
  const assetsDir = join(root, 'assets');
  for (const dir of [root, nodesDir, assetsDir]) {
    mkdirSync(dir, { recursive: true });
  }
  return {
    root,
    currentSelection: join(root, 'current-selection.json'),
    nodesDir,
    assetsDir,
    eventsLog: join(root, 'events.jsonl'),
    bridgeLog: join(root, 'bridge.log'),
  };
}
