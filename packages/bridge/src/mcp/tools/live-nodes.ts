import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { SseBroadcaster } from '../../util/sse.js';
import type { PendingQueryRegistry } from '../../store/pending-query.js';
import { nodeChoiceSchema, type NodeQuery, type NodeQueryResult } from '../../store/schema.js';

const tools: Array<{ name: string; operation: NodeQuery['operation']; description: string }> = [
  { name: 'resolve_node', operation: 'resolve', description: 'Search every page of the connected Figma file by exact node name. Returns all matches, with paginated screenshots.' },
  { name: 'get_node', operation: 'node', description: 'Search the live file by nodeName and read the chosen node tree. Never reads a stored snapshot.' },
  { name: 'get_screenshot', operation: 'screenshot', description: 'Search the live file by nodeName and export a fresh PNG screenshot of the chosen node.' },
  { name: 'get_asset', operation: 'asset', description: 'Search the live file by nodeName and export fresh SVG or PNG bytes of the chosen node.' },
  { name: 'get_variables', operation: 'variables', description: 'Search the live file by nodeName and read the chosen subtree\'s current variable bindings.' },
];

export function registerLiveNodeTools(server: McpServer, sse: SseBroadcaster, pending: PendingQueryRegistry): void {
  for (const tool of tools) {
    server.registerTool(tool.name, {
      title: tool.name.replaceAll('_', ' '),
      description: tool.description + ' The user can say “实现 figma 节点「登录页」”. ' +
        'If names repeat, show every numbered screenshot and page/layer path and WAIT for the user to choose. ' +
        'choice is only for a previously confirmed candidate; every call still searches by name and verifies it. Never choose the first match.',
      inputSchema: {
        nodeName: z.string().min(1).describe('Exact full Figma node name, e.g. 登录页. Users do not need to write parameter names or IDs.'),
        choice: nodeChoiceSchema.optional().describe('Internal identity {documentId, nodeId} of the uniquely resolved or user-confirmed candidate. Never guess it.'),
        offset: z.number().int().min(0).default(0),
        limit: z.number().int().min(1).max(6).default(6),
        depth: z.number().int().min(0).max(20).default(5),
        format: z.enum(['PNG', 'SVG']).optional(),
        collectionName: z.string().optional(),
      },
      annotations: { readOnlyHint: true, idempotentHint: false, openWorldHint: false },
    }, async (args): Promise<CallToolResult> => {
      if (sse.size() !== 1) return { isError: true, content: [{ type: 'text', text: sse.size() === 0
        ? 'Figma plugin is not connected. Open it in the target Figma file; no Push is needed.'
        : 'Multiple Figma plugins are connected. Keep only the target file connected so the query cannot read the wrong document.' }] };
      const query: NodeQuery = { ...args, requestId: randomUUID(), operation: tool.operation };
      const response = pending.create(query);
      // Register before delivery: even an immediate plugin response must find its waiter.
      sse.broadcast({ type: 'node-query-request', data: query });
      return renderQueryResult(await response);
    });
  }
}

export function renderQueryResult(result: NodeQueryResult): CallToolResult {
  const { candidates, image, ...metadata } = result;
  const instruction = result.status === 'ambiguous'
    ? 'STOP implementation. Fetch all candidate pages, show their numbered screenshots, page paths and dimensions, ask which one the user means, and WAIT. Preserve number → choice mapping.'
    : result.status === 'stale_choice'
      ? 'The chosen node was renamed, removed, or the document changed. Resolve the name again and ask the user; do not substitute another match.'
      : result.status === 'not_found' ? 'No exact match in any page of this file. Ask for the correct name or file; do not guess.'
        : 'Use nodeName on every subsequent call. Pass the confirmed choice to disambiguate; data is fetched live each time.';
  const content: CallToolResult['content'] = [{ type: 'text', text: JSON.stringify({
    ...metadata, instruction,
    candidates: candidates.map(({ screenshot, ...candidate }, i) => ({
      ...candidate, number: result.offset + i + 1,
      choice: { documentId: result.document?.id, nodeId: candidate.nodeId },
      screenshotAvailable: !!screenshot,
    })),
    ...(image ? { image: { format: image.format, mime: image.mime, width: image.width, height: image.height } } : {}),
  }, null, 2) }];
  for (const [i, candidate] of candidates.entries()) {
    content.push({ type: 'text', text: `Candidate ${result.offset + i + 1}: ${candidate.path.join(' / ')} (${candidate.width} × ${candidate.height})` });
    if (candidate.screenshot) content.push({ type: 'image', data: candidate.screenshot.base64, mimeType: 'image/png' });
  }
  if (image) {
    if (image.format === 'SVG') content.push({ type: 'text', text: Buffer.from(image.base64, 'base64').toString('utf8') });
    else content.push({ type: 'image', data: image.base64, mimeType: image.mime });
  }
  return { isError: result.status === 'error' || result.status === 'stale_choice', content };
}
