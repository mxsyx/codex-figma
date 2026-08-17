/** `get_node` MCP tool — returns the serialized node tree for one node id. */
import { z } from "zod";
import { randomUUID } from "node:crypto";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ContextStore } from "../../store/context-store.js";
import type { SseBroadcaster } from "../../util/sse.js";
import type { PendingFetchRegistry } from "../../store/pending-fetch.js";
import type { Logger } from "../../util/logger.js";

const FETCH_TIMEOUT_MS = 15_000;

export function registerGetNode(
  server: McpServer,
  store: ContextStore,
  sse: SseBroadcaster,
  pendingFetch: PendingFetchRegistry,
  log: Logger,
): void {
  server.registerTool(
    "get_node",
    {
      title: "Get a Figma node tree",
      description:
        "Returns the full serialized node tree for a single Figma node id. " +
        "If the node is already cached (from a prior selection push), it is returned instantly. " +
        "If not cached, the bridge asks the Figma plugin to find the node by id " +
        "(via figma.getNodeByIdAsync) and capture it on demand — so any node id in the " +
        "current Figma file works, not just the current selection. " +
        "The tree includes layout (auto-layout + CSS hint), styles (fills/strokes/effects/corner radii), " +
        "text content + typography, bound variables, and component info for INSTANCE/COMPONENT nodes. " +
        "Use `depth` to cap recursion, and the `include*` flags to drop sections you don't need.",
      inputSchema: {
        nodeId: z
          .string()
          .describe(
            'Figma node id, e.g. "42:15" or "6552:15071". Can be any node in the current Figma file.',
          ),
        depth: z
          .number()
          .int()
          .min(0)
          .max(20)
          .optional()
          .describe(
            "Max depth of children to include. 0 = just this node; default 5.",
          ),
        includeStyles: z
          .boolean()
          .optional()
          .describe(
            "Include fills/strokes/effects/corner radii/opacity. Default true.",
          ),
        includeVariables: z
          .boolean()
          .optional()
          .describe(
            "Include bound design-token variables per node. Default true.",
          ),
        includeText: z
          .boolean()
          .optional()
          .describe(
            "Include text content + typography on TEXT nodes. Default true.",
          ),
      },
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (args) => {
      const opts = {
        depth: args.depth ?? 5,
        includeStyles: args.includeStyles ?? true,
        includeVariables: args.includeVariables ?? true,
        includeText: args.includeText ?? true,
      };

      // 1. Try the cache first — instant if the node was already captured.
      let node = store.getNode(args.nodeId, opts);
      if (node) {
        return {
          content: [
            { type: "text", text: JSON.stringify(node, null, 2) },
          ],
        };
      }

      // 2. Cache miss — ask the plugin to fetch it on demand.
      if (sse.size() === 0) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text:
                `No cached node with id "${args.nodeId}", and the Figma plugin is not connected. ` +
                `Open the Codex Figma Bridge plugin in Figma Desktop so it can fetch the node on demand.`,
            },
          ],
        };
      }

      const requestId = randomUUID();
      log.info('requesting on-demand node fetch', { requestId, nodeId: args.nodeId });

      sse.broadcast({
        type: 'fetch-node-request',
        data: { requestId, nodeId: args.nodeId },
      });

      const result = await pendingFetch.create(requestId, args.nodeId, FETCH_TIMEOUT_MS);

      if (!result.found) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text:
                result.error ??
                `Node "${args.nodeId}" could not be fetched from Figma.`,
            },
          ],
        };
      }

      // 3. Plugin responded — re-read from cache (it was incrementally stored).
      node = store.getNode(args.nodeId, opts);
      if (!node) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text:
                `Plugin reported node "${args.nodeId}" found, but it was not in the cache after fetch. ` +
                `This is likely a bug — please report it.`,
            },
          ],
        };
      }

      return {
        content: [
          { type: "text", text: JSON.stringify(node, null, 2) },
        ],
      };
    },
  );
}
