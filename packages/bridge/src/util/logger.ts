/**
 * Tiny structured logger — writes JSONL to <root>/bridge.log and mirrors
 * human-readable lines to stdout. No external deps; the bridge's surface
 * is small enough that pino would be overkill.
 */
import { appendFileSync } from 'node:fs';
import type { BridgePaths } from '../store/paths.js';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface Logger {
  debug(msg: string, fields?: Record<string, unknown>): void;
  info(msg: string, fields?: Record<string, unknown>): void;
  warn(msg: string, fields?: Record<string, unknown>): void;
  error(msg: string, fields?: Record<string, unknown>): void;
}

export function createLogger(paths: BridgePaths, minLevel: LogLevel = 'info'): Logger {
  const order: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

  function write(level: LogLevel, msg: string, fields?: Record<string, unknown>): void {
    if (order[level] < order[minLevel]) return;
    const line = JSON.stringify({ ts: new Date().toISOString(), level, msg, ...fields });
    try {
      appendFileSync(paths.bridgeLog, line + '\n');
    } catch {
      // Logging must never throw.
    }
    const prefix = level === 'error' ? '[err] ' : level === 'warn' ? '[warn] ' : '';
    // stderr so it doesn't interfere with stdio MCP transports if we ever add one.
    // eslint-disable-next-line no-console
    console[level === 'error' ? 'error' : 'log'](`${prefix}${msg}`);
  }

  return {
    debug: (m, f) => write('debug', m, f),
    info: (m, f) => write('info', m, f),
    warn: (m, f) => write('warn', m, f),
    error: (m, f) => write('error', m, f),
  };
}
