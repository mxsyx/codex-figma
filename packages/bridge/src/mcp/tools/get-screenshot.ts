/** `get_screenshot` MCP tool — returns a PNG screenshot of one node as MCP image content. */
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ContextStore } from '../../store/context-store.js';
import type { SseBroadcaster } from '../../util/sse.js';
import type { PendingFetchRegistry } from '../../store/pending-fetch.js';
import type { Logger } from '../../util/logger.js';
import { fetchNodeOnDemand } from './fetch-on-demand.js';

export function registerGetScreenshot(
  server: McpServer,
  store: ContextStore,
  sse: SseBroadcaster,
  pendingFetch: PendingFetchRegistry,
  log: Logger,
): void {
  server.registerTool(
    'get_screenshot',
    {
      title: 'Get a screenshot of a Figma node',
      description:
        'Returns a PNG screenshot of the given Figma node, captured by the plugin via ' +
        '`node.exportAsync({ format: "PNG" })`. The image is your visual reference for ' +
        'spacing, color, hierarchy, and composition. If the node is not cached, the bridge ' +
        'asks the plugin to fetch it on demand (same as get_node). Returns MCP image content (base64 PNG).',
      inputSchema: {
        nodeId: z
          .string()
          .describe('Figma node id, e.g. "42:15" or "6552:15071". Can be any node in the current Figma file.'),
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
      let asset = store.getScreenshot(args.nodeId, format);

      // Cache miss — ask the plugin to fetch the node on demand.
      // captureNode() captures PNG + SVG assets, so after this the screenshot is cached.
      if (!asset) {
        const fetchResult = await fetchNodeOnDemand(args.nodeId, store, sse, pendingFetch, log);
        if (!fetchResult.ok) {
          return {
            isError: true,
            content: [{ type: 'text', text: fetchResult.error! }],
          };
        }
        asset = store.getScreenshot(args.nodeId, format);
      }

      if (!asset) {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text:
                `Node "${args.nodeId}" was fetched but no ${format} screenshot was captured. ` +
                `This can happen if the node has zero size or is hidden.`,
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
