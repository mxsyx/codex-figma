/** `get_node` MCP tool — returns the cached serialized node tree for one node id. */
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ContextStore } from "../../store/context-store.js";

export function registerGetNode(server: McpServer, store: ContextStore): void {
  server.registerTool(
    "get_node",
    {
      title: "Get a Figma node tree",
      description:
        "Returns the full serialized node tree for a single Figma node id (typically one of the " +
        "roots returned by `get_selection`). The tree includes layout (auto-layout + CSS hint), " +
        "styles (fills/strokes/effects/corner radii), text content + typography, bound variables, " +
        "and component info for INSTANCE/COMPONENT nodes. Use `depth` to cap recursion, and the " +
        "`include*` flags to drop sections you don't need (smaller payload, faster parsing).",
      inputSchema: {
        nodeId: z
          .string()
          .describe(
            'Figma node id, e.g. "42:15". Must be a root id from get_selection or a child id discovered via list_nodes.',
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
      const node = store.getNode(args.nodeId, {
        depth: args.depth ?? 5,
        includeStyles: args.includeStyles ?? true,
        includeVariables: args.includeVariables ?? true,
        includeText: args.includeText ?? true,
      });
      if (!node) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text:
                `No cached node with id "${args.nodeId}". Run get_selection first to capture the ` +
                `current Figma selection, or call list_nodes to discover available ids.`,
            },
          ],
        };
      }
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(node, null, 2),
          },
        ],
      };
    },
  );
}
