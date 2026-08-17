/** POST /node — receive an on-demand fetched node from the plugin. */
import { z } from "zod";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { ContextStore } from "../store/context-store.js";
import type { PendingFetchRegistry } from "../store/pending-fetch.js";
import type { Logger } from "../util/logger.js";
import { serializedNodeSchema, assetPayloadSchema } from "../store/schema.js";
import { readJsonBody, sendJson, sendError } from "../util/http.js";

const nodePayloadSchema = z.object({
  requestId: z.string(),
  nodeId: z.string(),
  found: z.boolean(),
  node: serializedNodeSchema.optional(),
  assets: z.record(z.string(), assetPayloadSchema).optional(),
});

export async function handlePostNode(
  req: IncomingMessage,
  res: ServerResponse,
  ctx: { store: ContextStore; pendingFetch: PendingFetchRegistry; log: Logger },
): Promise<void> {
  let raw: unknown;
  try {
    raw = await readJsonBody(req);
  } catch (err) {
    sendError(res, 400, "invalid request body", String(err));
    return;
  }

  const parsed = nodePayloadSchema.safeParse(raw);
  if (!parsed.success) {
    ctx.log.warn("node payload rejected", { issues: parsed.error.issues });
    sendError(res, 422, "node payload failed validation", parsed.error.issues);
    return;
  }

  const { requestId, nodeId, found, node, assets } = parsed.data;

  if (found && node) {
    await ctx.store.addNode(nodeId, node);
    if (assets && Object.keys(assets).length > 0) {
      await ctx.store.addAssets(assets);
    }
    ctx.log.info("on-demand node stored", {
      requestId,
      nodeId,
      assets: Object.keys(assets ?? {}).length,
    });
  } else {
    ctx.log.info("on-demand node not found by plugin", { requestId, nodeId });
  }

  ctx.pendingFetch.resolve(requestId, {
    found,
    nodeId,
    error: found ? undefined : `node "${nodeId}" not found in the Figma file`,
  });

  sendJson(res, 200, { ok: true });
}
