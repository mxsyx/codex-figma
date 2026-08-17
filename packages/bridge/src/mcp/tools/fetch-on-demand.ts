/**
 * Shared on-demand fetch helper. When get_node / get_screenshot / get_asset
 * have a cache miss, this asks the Figma plugin to find the node by id and
 * capture it (node tree + PNG screenshot + SVG assets). After a successful
 * fetch, all three data types are in the ContextStore cache.
 */
import { randomUUID } from "node:crypto";
import type { ContextStore } from "../../store/context-store.js";
import type { SseBroadcaster } from "../../util/sse.js";
import type { PendingFetchRegistry } from "../../store/pending-fetch.js";
import type { Logger } from "../../util/logger.js";

const FETCH_TIMEOUT_MS = 15_000;

export interface OnDemandFetchResult {
  ok: boolean;
  error?: string;
}

export async function fetchNodeOnDemand(
  nodeId: string,
  store: ContextStore,
  sse: SseBroadcaster,
  pendingFetch: PendingFetchRegistry,
  log: Logger,
): Promise<OnDemandFetchResult> {
  if (sse.size() === 0) {
    return {
      ok: false,
      error:
        `Figma plugin is not connected. Open the Codex Figma Bridge plugin ` +
        `in Figma Desktop so it can fetch node "${nodeId}" on demand.`,
    };
  }

  // If the node is already cached (e.g. another tool just fetched it), skip.
  if (store.getNode(nodeId)) {
    return { ok: true };
  }

  const requestId = randomUUID();
  log.info("requesting on-demand node fetch", {
    requestId,
    nodeId,
    caller: "on-demand",
  });

  sse.broadcast({
    type: "fetch-node-request",
    data: { requestId, nodeId },
  });

  const result = await pendingFetch.create(requestId, nodeId, FETCH_TIMEOUT_MS);

  if (!result.found) {
    return {
      ok: false,
      error:
        result.error ?? `Node "${nodeId}" could not be fetched from Figma.`,
    };
  }

  return { ok: true };
}
