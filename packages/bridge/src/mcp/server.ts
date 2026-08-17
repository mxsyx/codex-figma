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
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ContextStore } from '../store/context-store.js';
import { registerGetSelection } from './tools/get-selection.js';
import { registerGetNode } from './tools/get-node.js';
import { registerGetScreenshot } from './tools/get-screenshot.js';
import { registerGetAsset } from './tools/get-asset.js';
import { registerListNodes } from './tools/list-nodes.js';
import { registerGetVariables } from './tools/get-variables.js';
import { BRIDGE_VERSION } from '../routes/health.js';

export function createMcpServer(store: ContextStore): McpServer {
  const server = new McpServer({
    name: 'codex-figma-bridge',
    version: BRIDGE_VERSION,
  }, {
    capabilities: {
      logging: {},
    },
    instructions:
      'This server exposes the user\'s live Figma selection captured by the Codex Figma plugin. ' +
      'Always call get_selection first to see what\'s selected, then get_node / get_screenshot / ' +
      'get_asset for details. Tools are read-only and reflect the most recent push from Figma — ' +
      'they do NOT re-query Figma in real time. If a tool returns "no selection captured", ask ' +
      'the user to select a frame in Figma Desktop and click "Push now" in the plugin UI.',
  });

  registerGetSelection(server, store);
  registerGetNode(server, store);
  registerGetScreenshot(server, store);
  registerGetAsset(server, store);
  registerListNodes(server, store);
  registerGetVariables(server, store);

  server.registerResource(
    'current-selection',
    'figma://selection/current',
    {
      title: 'Current Figma selection',
      description: 'The latest selection summary captured by the Codex Figma plugin.',
      mimeType: 'application/json',
    },
    async () => {
      const summary = store.getSelection();
      return {
        contents: [
          {
            uri: 'figma://selection/current',
            mimeType: 'application/json',
            text: JSON.stringify(summary ?? { error: 'no selection captured' }, null, 2),
          },
        ],
      };
    },
  );

  return server;
}
