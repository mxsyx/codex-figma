import { randomUUID } from 'node:crypto';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { SseBroadcaster } from '../../util/sse.js';
import type { PendingComponentsRegistry } from '../../store/pending-components.js';
import type { Logger } from '../../util/logger.js';

const COMPONENT_SCAN_TIMEOUT_MS = 60_000;

export function registerListComponents(
  server: McpServer,
  sse: SseBroadcaster,
  pendingComponents: PendingComponentsRegistry,
  log: Logger,
): void {
  server.registerTool(
    'list_components',
    {
      title: 'List components on a Figma page',
      description:
        'Scans every COMPONENT and COMPONENT_SET node on a named Figma page, caches their serialized node trees, and returns component metadata. Use the returned node ids with get_node to inspect a specific component. Use query to filter by component name substring.',
      inputSchema: {
        pageName: z.string().min(1).max(160).describe('Exact Figma page name, e.g. "Polaris".'),
        query: z.string().min(1).max(160).optional().describe('Case-insensitive component name substring.'),
      },
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ pageName, query }) => {
      if (sse.size() === 0) {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: 'Figma plugin is not connected. Open the Codex Figma Bridge plugin in Figma Desktop.',
            },
          ],
        };
      }

      const requestId = randomUUID();
      const resultPromise = pendingComponents.create(requestId, COMPONENT_SCAN_TIMEOUT_MS);
      sse.broadcast({
        type: 'list-components-request',
        data: { requestId, pageName, query },
      });
      log.info('component scan requested', { requestId, pageName, query });

      const result = await resultPromise;
      if (!result.found) {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: result.error ?? `Figma page "${pageName}" was not found.`,
            },
          ],
        };
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                pageId: result.pageId,
                pageName: result.pageName,
                componentCount: result.components.length,
                components: result.components,
                nextStep: 'Call get_node with any component id to inspect its full serialized tree.',
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );
}
