/** Responses to bridge requests only. No selection uploads or periodic design sync. */
import type { ComponentsResult, NodeQueryResult } from './types.js';

async function postResult(bridgeUrl: string, path: string, payload: unknown): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const response = await Promise.race([
      fetch(`${bridgeUrl.replace(/\/+$/, '')}${path}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      }),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('response delivery timed out')), 15_000); }),
    ]);
    return response.ok;
  } catch { return false; }
  finally { if (timer) clearTimeout(timer); }
}

export const postQueryResult = (bridgeUrl: string, result: NodeQueryResult) => postResult(bridgeUrl, '/query/result', result);
export const postComponents = (bridgeUrl: string, result: ComponentsResult) => postResult(bridgeUrl, '/components', result);
export const postDesignResult = (bridgeUrl: string, requestId: string, result: { ok: boolean; rootId?: string; error?: string }) =>
  postResult(bridgeUrl, '/design/result', { requestId, ...result });
