/** `list_nodes` MCP tool — search cached trees by type or name substring. */
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ContextStore } from '../../store/context-store.js';

export function registerListNodes(server: McpServer, store: ContextStore): void {
  server.registerTool(
    'list_nodes',
    {
      title: 'Search captured Figma nodes by type or name',
      description:
        'Walks every cached node tree and returns matches by type and/or name substring. ' +
        'Useful for finding every TEXT node, every INSTANCE, every icon by name, etc. — without ' +
        're-fetching the full tree. Returns compact hits ({id, name, type, depth, parentId}).',
      inputSchema: {
        type: z
          .string()
          .optional()
          .describe('Exact node type to match, e.g. "TEXT", "INSTANCE", "VECTOR", "FRAME". Case-sensitive.'),
        name: z
          .string()
          .optional()
          .describe('Name substring to match (case-insensitive). E.g. "icon", "submit", "header".'),
      },
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (args) => {
      const hits = store.listNodes({ type: args.type, name: args.name });
      if (hits.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text:
                `No nodes matched { type: ${args.type ?? 'any'}, name: ${args.name ?? 'any'} }. ` +
                `Make sure get_selection has been called and the node is in the captured tree.`,
            },
          ],
        };
      }
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ count: hits.length, hits }, null, 2),
          },
        ],
      };
    },
  );
}
