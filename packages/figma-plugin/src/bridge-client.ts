/**
 * HTTP client for posting a captured selection to the local bridge.
 *
 * Retries with exponential backoff because the bridge may be starting up
 * (or briefly unreachable while the user re-runs `npm start`).
 *
 * Note: uses Promise.race for timeouts instead of AbortController, because
 * the Figma plugin sandbox does not expose AbortController as a global.
 */
import type { CapturedSelection } from './types.js';

const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_RETRIES = 2;

export interface PostSelectionResult {
  ok: boolean;
  status: number;
  capturedAt?: string;
  error?: string;
}

export async function postSelection(
  bridgeUrl: string,
  payload: CapturedSelection,
  options: { timeoutMs?: number; retries?: number } = {},
): Promise<PostSelectionResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxRetries = options.retries ?? MAX_RETRIES;
  const url = joinUrl(bridgeUrl, '/selection');

  let lastError: string | undefined;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      await sleep(Math.min(500 * 2 ** (attempt - 1), 2000));
    }
    try {
      const res = await withTimeout(
        fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }),
        timeoutMs,
      );

      const text = await res.text();
      let parsed: unknown = null;
      try {
        parsed = JSON.parse(text);
      } catch {
        // Non-JSON response — fall through with the raw text.
      }

      if (res.ok) {
        const ok = (parsed as { ok?: boolean } | null)?.ok ?? true;
        const capturedAt = (parsed as { capturedAt?: string } | null)?.capturedAt;
        return { ok, status: res.status, capturedAt };
      }
      lastError =
        (parsed as { error?: string } | null)?.error ?? `HTTP ${res.status}: ${text.slice(0, 200)}`;
      // Don't retry on 4xx — the payload is malformed, not the network.
      if (res.status >= 400 && res.status < 500) break;
    } catch (err) {
      lastError = String(err instanceof Error ? err.message : err);
    }
  }
  return { ok: false, status: 0, error: lastError ?? 'unknown error' };
}

/** Light health probe used by the UI to show connected/disconnected state. */
export async function probeBridge(bridgeUrl: string, timeoutMs = 2000): Promise<boolean> {
  const url = joinUrl(bridgeUrl, '/health');
  try {
    const res = await withTimeout(fetch(url), timeoutMs);
    return res.ok;
  } catch {
    return false;
  }
}

/** Race a promise against a timeout — AbortController is unavailable in the Figma sandbox. */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`timeout after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function joinUrl(base: string, path: string): string {
  const trimmed = base.replace(/\/+$/, '');
  return `${trimmed}${path}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
