/** `get_variables` MCP tool — list design-token variables seen across the cached trees. */
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ContextStore } from '../../store/context-store.js';

export function registerGetVariables(server: McpServer, store: ContextStore): void {
  server.registerTool(
    'get_variables',
    {
      title: 'List Figma design-token variables in the current selection',
      description:
        'Collects every bound design-token variable across all cached node trees and returns one ' +
        'row per (node, property, variable) binding. Each row includes the variable name, ' +
        'collection name, mode name, resolved value, and the alias chain (aliasOf) when the ' +
        'variable references another variable. Use this to map Figma tokens onto the project\'s ' +
        'token system (CSS variables, Tailwind theme, design-tokens.json).',
      inputSchema: {
        collectionName: z
          .string()
          .optional()
          .describe('Filter to a specific variable collection name (e.g. "Color/Primitive", "Size/Spacing").'),
      },
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (args) => {
      const rows = store.getVariables({ collectionName: args.collectionName });
      if (rows.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text:
                `No bound variables found${args.collectionName ? ` in collection "${args.collectionName}"` : ''}. ` +
                `Either no variables are bound in the selection, or get_selection has not been called yet.`,
            },
          ],
        };
      }
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ count: rows.length, variables: rows }, null, 2),
          },
        ],
      };
    },
  );
}
