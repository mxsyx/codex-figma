/** `get_asset` MCP tool — returns SVG/PNG bytes for icons and illustrations. */
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ContextStore } from '../../store/context-store.js';

export function registerGetAsset(server: McpServer, store: ContextStore): void {
  server.registerTool(
    'get_asset',
    {
      title: 'Get a Figma asset (SVG/PNG)',
      description:
        'Returns raw image bytes (SVG preferred for icons, PNG for illustrations/photos) for a ' +
        'single Figma node, captured by the plugin via `node.exportAsync`. Use this to render ' +
        'icons and images faithfully — never hand-write SVG or substitute an icon library. ' +
        'Commit the returned bytes to the repo (the asset URL is local-only and won\'t be ' +
        'available to the running app). Returns MCP image content (base64).',
      inputSchema: {
        nodeId: z
          .string()
          .describe('Figma node id to export. Use list_nodes with type=VECTOR or type=INSTANCE to find icons.'),
        format: z
          .enum(['PNG', 'SVG'])
          .optional()
          .describe('Preferred format. Default SVG (best for icons). Falls back to PNG if SVG is not cached.'),
      },
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (args) => {
      const format = args.format ?? 'SVG';
      const asset = store.getAsset(args.nodeId, format);
      if (!asset) {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text:
                `No asset cached for node "${args.nodeId}". Re-run the plugin\'s "Push now" button ` +
                `with the node selected. Note: SVG assets are only captured for vector leaf nodes.`,
            },
          ],
        };
      }
      const textPart =
        asset.format === 'SVG'
          ? {
              type: 'text' as const,
              text: Buffer.from(asset.base64, 'base64').toString('utf-8'),
            }
          : null;

      return {
        content: [
          {
            type: 'image',
            data: asset.base64,
            mimeType: asset.mime,
          },
          ...(textPart
            ? [
                textPart,
                {
                  type: 'text' as const,
                  text:
                    `SVG source for node ${args.nodeId}. Save this as a .svg file in the project's ` +
                    `assets directory; do not inline a modified version.`,
                },
              ]
            : [
                {
                  type: 'text' as const,
                  text: `PNG asset for node ${args.nodeId} (${asset.width ?? '?'}x${asset.height ?? '?'}).`,
                },
              ]),
        ],
      };
    },
  );
}
