import type { IncomingMessage, ServerResponse } from 'node:http';
import type { ContextStore } from '../store/context-store.js';
import type { PendingComponentsRegistry } from '../store/pending-components.js';
import type { Logger } from '../util/logger.js';
import { componentsResultSchema } from '../store/schema.js';
import { readJsonBody, sendError, sendJson } from '../util/http.js';

export async function handlePostComponents(
  req: IncomingMessage,
  res: ServerResponse,
  ctx: { store: ContextStore; pendingComponents: PendingComponentsRegistry; log: Logger },
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

  for (const [nodeId, node] of Object.entries(parsed.data.nodes)) {
    await ctx.store.addNode(nodeId, node);
  }

  ctx.pendingComponents.resolve(parsed.data.requestId, parsed.data);
  ctx.log.info('components stored', {
    requestId: parsed.data.requestId,
    pageName: parsed.data.pageName,
    components: parsed.data.components.length,
    nodes: Object.keys(parsed.data.nodes).length,
  });
  sendJson(res, 200, { ok: true });
}
