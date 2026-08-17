/** `get_selection` MCP tool — returns the latest Figma selection summary. */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ContextStore } from "../../store/context-store.js";

export function registerGetSelection(
  server: McpServer,
  store: ContextStore,
): void {
  server.registerTool(
    "get_selection",
    {
      title: "Get current Figma selection",
      description:
        "Returns the user's current Figma selection as captured by the Codex Figma plugin. " +
        "Always call this FIRST before any other Figma tool — it tells you what the user has " +
        "selected right now (file, page, selected node ids + names + types + bounding boxes). " +
        "If `selectionCount` is 0, ask the user to select a frame or node in Figma Desktop and " +
        'click "Push now" in the plugin UI.',
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async () => {
      const summary = store.getSelection();
      if (!summary) {
        return {
          content: [
            {
              type: "text",
              text:
                "No Figma selection has been captured yet. Open Figma Desktop, select a frame, " +
                "and ensure the Codex Figma plugin is running and connected to this bridge.",
            },
          ],
        };
      }
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(summary, null, 2),
          },
        ],
      };
    },
  );
}
