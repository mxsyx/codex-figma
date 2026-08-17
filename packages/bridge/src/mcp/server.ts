/**
 * Factory that wires a fresh McpServer with all six tools registered against
 * the shared ContextStore. Called once per MCP session by routes/mcp.ts.
 *
 * Tools:
 *   - get_selection   (no args)               → selection summary
 *   - get_node        (nodeId, depth, flags)  → serialized node tree
 *   - get_screenshot  (nodeId, format?)       → PNG image content
 *   - get_asset       (nodeId, format?)       → SVG/PNG image content (icons)
 *   - list_nodes      (type?, name?)          → search hits
 *   - get_variables   (collectionName?)       → design-token rows
 *
 * Also registers one resource: `figma://selection/current` — same payload as
 * `get_selection`, for clients that prefer the resource surface.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ContextStore } from "../store/context-store.js";
import type { SseBroadcaster } from "../util/sse.js";
import type { PendingFetchRegistry } from "../store/pending-fetch.js";
import type { Logger } from "../util/logger.js";
import { registerGetSelection } from "./tools/get-selection.js";
import { registerGetNode } from "./tools/get-node.js";
import { registerGetScreenshot } from "./tools/get-screenshot.js";
import { registerGetAsset } from "./tools/get-asset.js";
import { registerListNodes } from "./tools/list-nodes.js";
import { registerGetVariables } from "./tools/get-variables.js";
import { BRIDGE_VERSION } from "../routes/health.js";

export function createMcpServer(
  store: ContextStore,
  sse: SseBroadcaster,
  pendingFetch: PendingFetchRegistry,
  log: Logger,
): McpServer {
  const server = new McpServer(
    {
      name: "codex-figma-bridge",
      version: BRIDGE_VERSION,
    },
    {
      capabilities: {
        logging: {},
      },
      instructions:
        "This server exposes Figma design context captured by the Codex Figma plugin. " +
        "Call get_selection to see the current selection, or call get_node with any node id " +
        "to fetch it on demand (the plugin uses figma.getNodeByIdAsync to find and capture it). " +
        "get_node / get_screenshot / get_asset / list_nodes / get_variables all work on the " +
        'cached node tree. If a tool returns "plugin not connected", ask the user to open the ' +
        "Codex Figma Bridge plugin in Figma Desktop.",
    },
  );

  registerGetSelection(server, store);
  registerGetNode(server, store, sse, pendingFetch, log);
  registerGetScreenshot(server, store);
  registerGetAsset(server, store);
  registerListNodes(server, store);
  registerGetVariables(server, store);

  server.registerResource(
    "current-selection",
    "figma://selection/current",
    {
      title: "Current Figma selection",
      description:
        "The latest selection summary captured by the Codex Figma plugin.",
      mimeType: "application/json",
    },
    async () => {
      const summary = store.getSelection();
      return {
        contents: [
          {
            uri: "figma://selection/current",
            mimeType: "application/json",
            text: JSON.stringify(
              summary ?? { error: "no selection captured" },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  return server;
}
