/** POST /selection — receive a captured Figma selection from the plugin. */
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { ContextStore } from '../store/context-store.js';
import type { SseBroadcaster } from '../util/sse.js';
import type { Logger } from '../util/logger.js';
import { capturedSelectionSchema } from '../store/schema.js';
import { readJsonBody, sendJson, sendError } from '../util/http.js';

export async function handlePostSelection(
  req: IncomingMessage,
  res: ServerResponse,
  ctx: { store: ContextStore; sse: SseBroadcaster; log: Logger },
): Promise<void> {
  let raw: unknown;
  try {
    raw = await readJsonBody(req);
  } catch (err) {
    sendError(res, 400, 'invalid request body', String(err));
    return;
  }

  const parsed = capturedSelectionSchema.safeParse(raw);
  if (!parsed.success) {
    ctx.log.warn('selection payload rejected', { issues: parsed.error.issues });
    sendError(res, 422, 'selection payload failed validation', parsed.error.issues);
    return;
  }

  const summary = await ctx.store.setSelection(parsed.data);
  ctx.sse.broadcast({
    type: 'selection-change',
    data: {
      capturedAt: summary.capturedAt,
      fileKey: summary.fileKey,
      pageId: summary.pageId,
      selectionCount: summary.selectionCount,
    },
  });
  sendJson(res, 201, { ok: true, capturedAt: summary.capturedAt });
}
