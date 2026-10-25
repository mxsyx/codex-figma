import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { SseBroadcaster } from '../util/sse.js';
import type { PendingQueryRegistry } from '../store/pending-query.js';
import type { PendingDesignRegistry } from '../store/pending-design.js';
import type { PendingComponentsRegistry } from '../store/pending-components.js';
import type { Logger } from '../util/logger.js';
import { registerLiveNodeTools } from './tools/live-nodes.js';
import { registerGenerateDesign } from './tools/generate-design.js';
import { registerListComponents } from './tools/list-components.js';
import { BRIDGE_VERSION } from '../routes/health.js';

export function createMcpServer(
  sse: SseBroadcaster,
  pendingQuery: PendingQueryRegistry,
  pendingDesign: PendingDesignRegistry,
  pendingComponents: PendingComponentsRegistry,
  log: Logger,
): McpServer {
  const server = new McpServer({ name: 'codex-figma-bridge', version: BRIDGE_VERSION }, {
    instructions: 'Implement requests such as “实现 figma 节点「登录页」” by calling resolve_node with the exact name. ' +
      'Every read queries the connected Figma file live, across all pages, including hidden and unselected nodes. ' +
      'There is no Push workflow or design cache. For duplicate names, show all candidate screenshots with page/layer paths ' +
      'and wait for the user to choose. Carry the confirmed choice internally and keep querying by nodeName. ' +
      'Do not look up nodes by ID or pick a duplicate automatically. If the plugin is disconnected, ask the user to open it. ' +
      'list_components queries a component library live; generate_design retains one-click generation in the plugin.',
  });
  registerLiveNodeTools(server, sse, pendingQuery);
  registerGenerateDesign(server, sse, pendingDesign, log);
  registerListComponents(server, sse, pendingComponents, log);
  return server;
}
