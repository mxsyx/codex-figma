import { z } from 'zod';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { PendingDesignRegistry } from '../store/pending-design.js';
import type { Logger } from '../util/logger.js';
import { readJsonBody, sendError, sendJson } from '../util/http.js';

const resultSchema = z.object({
  requestId: z.string().min(1),
  ok: z.boolean(),
  rootId: z.string().min(1).optional(),
  error: z.string().max(2000).optional(),
});

export async function handlePostDesignResult(
  req: IncomingMessage,
  res: ServerResponse,
  ctx: { pendingDesign: PendingDesignRegistry; log: Logger },
): Promise<void> {
  let raw: unknown;
  try {
    raw = await readJsonBody(req);
  } catch (err) {
    sendError(res, 400, 'invalid request body', String(err));
    return;
  }

  const parsed = resultSchema.safeParse(raw);
  if (!parsed.success) {
    ctx.log.warn('design result rejected', { issues: parsed.error.issues });
    sendError(res, 422, 'design result failed validation', parsed.error.issues);
    return;
  }

  const { requestId, ok, rootId, error } = parsed.data;
  ctx.pendingDesign.resolve(requestId, { ok, rootId, error });
  sendJson(res, 200, { ok: true });
}
