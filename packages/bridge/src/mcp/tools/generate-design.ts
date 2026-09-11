import { randomUUID } from 'node:crypto';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { SseBroadcaster } from '../../util/sse.js';
import type { PendingDesignRegistry } from '../../store/pending-design.js';
import type { Logger } from '../../util/logger.js';
import { generatedDesignSchema } from '../../store/schema.js';

export function registerGenerateDesign(
  server: McpServer,
  sse: SseBroadcaster,
  pendingDesign: PendingDesignRegistry,
  log: Logger,
): void {
  server.registerTool(
    'generate_design',
    {
      title: 'Generate a Figma design',
      description:
        'Sends a structured design specification to the connected Figma plugin. The user clicks "Generate" in the plugin to create the design. Use this after translating a natural-language product intent into the required design JSON schema.',
      inputSchema: {
        design: generatedDesignSchema.describe(
          'Structured Figma design specification derived from the user intent.',
        ),
      },
      annotations: {
        readOnlyHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ design }) => {
      const parsed = generatedDesignSchema.safeParse(design);
      if (!parsed.success) {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: `Invalid design specification: ${parsed.error.message}`,
            },
          ],
        };
      }

      const requestId = randomUUID();
      const resultPromise = pendingDesign.create(requestId);
      sse.broadcast({
        type: 'generate-design-request',
        data: { requestId, design: parsed.data },
      });
      log.info('design generation requested', {
        requestId,
        name: parsed.data.name,
        groups: parsed.data.groups.length,
      });

      const result = await resultPromise;
      return {
        isError: !result.ok,
        content: [
          {
            type: 'text',
            text: result.ok
              ? JSON.stringify({ ok: true, requestId, rootId: result.rootId })
              : JSON.stringify({ ok: false, requestId, error: result.error }),
          },
        ],
      };
    },
  );
}
