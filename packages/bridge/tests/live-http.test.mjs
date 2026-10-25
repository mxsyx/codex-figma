import assert from 'node:assert/strict';
import test from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { createServer } from '../src/server.ts';
import { McpRouteHandler } from '../src/routes/mcp.ts';
import { SseBroadcaster } from '../src/util/sse.ts';
import { PendingQueryRegistry } from '../src/store/pending-query.ts';
import { PendingDesignRegistry } from '../src/store/pending-design.ts';
import { PendingComponentsRegistry } from '../src/store/pending-components.ts';
import { queryNodes } from '../../figma-plugin/src/query-nodes.ts';
import { captureComponents } from '../../figma-plugin/src/extract/components-page.ts';
import { scene, installFigma, log } from './figma-fixture.mjs';

test('real HTTP MCP → SSE query → plugin handler → response, with no Push routes or stale results', async (t) => {
  const node = scene('1:1', '登录页');
  const component = scene('2:1', 'Button', { type: 'COMPONENT', key: 'key', description: '' });
  installFigma(t, [[node], [component]]);
  const sse = new SseBroadcaster();
  const pendingQuery = new PendingQueryRegistry();
  const pendingDesign = new PendingDesignRegistry(log);
  const pendingComponents = new PendingComponentsRegistry(log);
  const mcp = new McpRouteHandler(sse, pendingQuery, pendingDesign, pendingComponents, log);
  const server = createServer({ sse, pendingQuery, pendingDesign, pendingComponents, mcp, log });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const controller = new AbortController();
  const client = new Client({ name: 'http-test', version: '1' });
  let pump;
  t.after(async () => {
    controller.abort();
    await pump;
    await client.close();
    await mcp.closeAll();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  });
  const stream = await fetch(`${base}/events`, { signal: controller.signal });
  let requests = 0;
  const posts = [];
  pump = (async () => {
    const reader = stream.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let end;
        while ((end = buffer.indexOf('\n\n')) >= 0) {
          const frame = buffer.slice(0, end);
          buffer = buffer.slice(end + 2);
          const type = frame.match(/^event: (.+)$/m)?.[1];
          const data = JSON.parse(frame.match(/^data: (.+)$/m)?.[1] ?? '{}');
          let path, result;
          if (type === 'node-query-request') {
            requests++;
            path = '/query/result';
            result = await queryNodes(data);
          } else if (type === 'list-components-request') {
            path = '/components';
            result = await captureComponents(data.requestId, data.pageName, data.query);
          } else if (type === 'generate-design-request') {
            // Simulate the user's Generate click; actual Figma mutations are outside this transport test.
            path = '/design/result';
            result = { requestId: data.requestId, ok: true, rootId: 'new:1' };
          } else continue;
          const response = await fetch(base + path, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(result),
          });
          posts.push(response.status);
        }
      }
    } catch (err) { if (!controller.signal.aborted) throw err; }
    finally { reader.releaseLock(); }
  })();
  await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`)));
  const health = await (await fetch(`${base}/health`)).json();
  assert.equal(health.mode, 'live-name-query');
  assert.equal(health.connectedPlugins, 1);
  const read = async (name, args = {}) => client.callTool({ name, arguments: { nodeName: '登录页', ...args } });
  const resolved = await read('resolve_node');
  assert.equal(resolved.content.filter((c) => c.type === 'image').length, 1);
  const choice = JSON.parse(resolved.content[0].text).candidates[0].choice;
  assert.equal(JSON.parse((await read('get_node', { choice })).content[0].text).node.width, 300);
  node.width = 456;
  assert.equal(JSON.parse((await read('get_node', { choice })).content[0].text).node.width, 456);
  assert.equal(requests, 3);
  assert.equal(pendingQuery.size(), 0);
  const components = await client.callTool({ name: 'list_components', arguments: { pageName: 'Page 2' } });
  assert.equal(JSON.parse(components.content[0].text).components[0].name, 'Button');
  assert.equal(pendingComponents.size(), 0);
  const design = await client.callTool({ name: 'generate_design', arguments: { design: {
    name: 'Example', width: 100, height: 100,
    groups: [{ name: 'Body', children: [{ kind: 'rectangle', name: 'Box', box: { x: 0, y: 0, width: 10, height: 10 } }] }],
  } } });
  assert.equal(JSON.parse(design.content[0].text).rootId, 'new:1');
  assert.equal(pendingDesign.size(), 0);
  const unsolicited = await queryNodes({ requestId: 'expired', nodeName: '登录页', operation: 'resolve', offset: 0, limit: 6, depth: 5 });
  assert.equal((await fetch(`${base}/query/result`, { method: 'POST', body: JSON.stringify(unsolicited) })).status, 409);
  assert.equal((await fetch(`${base}/query/result`, { method: 'POST', body: '{}' })).status, 422);
  for (const path of ['/selection', '/node']) {
    assert.equal((await fetch(base + path, { method: 'POST', body: '{}' })).status, 404);
  }
  assert.deepEqual(posts, [200, 200, 200, 200, 200]);
  controller.abort();
  await pump;
  // Let the server observe the closed SSE socket before checking its connection guard.
  for (let i = 0; i < 50 && sse.size(); i++) await new Promise((resolve) => setTimeout(resolve, 10));
  const offline = await read('get_node', { choice });
  assert.equal(offline.isError, true);
  assert.match(offline.content[0].text, /not connected/);
});
