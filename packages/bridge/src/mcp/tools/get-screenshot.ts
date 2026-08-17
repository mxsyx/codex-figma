/** `get_screenshot` MCP tool — returns a PNG screenshot of one node as MCP image content. */
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ContextStore } from '../../store/context-store.js';

export function registerGetScreenshot(server: McpServer, store: ContextStore): void {
  server.registerTool(
    'get_screenshot',
    {
      title: 'Get a screenshot of a Figma node',
      description:
        'Returns a PNG screenshot of the given Figma node, captured by the plugin via ' +
        '`node.exportAsync({ format: "PNG" })`. The image is the visual source of truth for ' +
        'parity — always fetch it before writing UI code so you can compare your implementation ' +
        'against the design. Returns MCP image content (base64 PNG).',
      inputSchema: {
        nodeId: z
          .string()
          .describe('Figma node id to screenshot. Must be a root id from get_selection or a child id from list_nodes.'),
        format: z
          .enum(['PNG', 'SVG'])
          .optional()
          .describe('Image format. Default PNG. SVG only exists for vector leaf nodes (icons); falls back to PNG if absent.'),
      },
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (args) => {
      const format = args.format ?? 'PNG';
      const asset = store.getScreenshot(args.nodeId, format);
      if (!asset) {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text:
                `No screenshot cached for node "${args.nodeId}". Re-run the plugin's "Push now" ` +
                `button with the node selected, or call list_nodes to verify the id.`,
            },
          ],
        };
      }
      return {
        content: [
          {
            type: 'image',
            data: asset.base64,
            mimeType: asset.mime,
          },
          {
            type: 'text',
            text: `Screenshot of node ${args.nodeId} (${asset.format}, ${asset.width ?? '?'}x${asset.height ?? '?'}).`,
          },
        ],
      };
    },
  );
}
