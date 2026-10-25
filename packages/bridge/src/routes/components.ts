import type { IncomingMessage, ServerResponse } from 'node:http';
import type { PendingComponentsRegistry } from '../store/pending-components.js';
import type { Logger } from '../util/logger.js';
import { componentsResultSchema } from '../store/schema.js';
import { readJsonBody, sendError, sendJson } from '../util/http.js';

export async function handlePostComponents(
  req: IncomingMessage,
  res: ServerResponse,
  ctx: { pendingComponents: PendingComponentsRegistry; log: Logger },
): Promise<void> {
  let raw: unknown;
  try {
    raw = await readJsonBody(req);
  } catch (err) {
    sendError(res, 400, 'invalid request body', String(err));
    return;
  }

  const parsed = componentsResultSchema.safeParse(raw);
  if (!parsed.success) {
    ctx.log.warn('components payload rejected', { issues: parsed.error.issues });
    sendError(res, 422, 'components payload failed validation', parsed.error.issues);
    return;
  }

  if (!ctx.pendingComponents.resolve(parsed.data.requestId, parsed.data)) {
    sendError(res, 409, 'No pending component query.');
    return;
  }
  ctx.log.info('component query completed', {
    requestId: parsed.data.requestId,
    pageName: parsed.data.pageName,
    components: parsed.data.components.length,
  });
  sendJson(res, 200, { ok: true });
}
