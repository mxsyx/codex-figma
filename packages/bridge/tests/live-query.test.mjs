import assert from 'node:assert/strict';
import test from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createMcpServer } from '../src/mcp/server.ts';
import { PendingQueryRegistry } from '../src/store/pending-query.ts';
import { PendingDesignRegistry } from '../src/store/pending-design.ts';
import { PendingComponentsRegistry } from '../src/store/pending-components.ts';
import { renderQueryResult } from '../src/mcp/tools/live-nodes.ts';
import { queryNodes, documentId } from '../../figma-plugin/src/query-nodes.ts';
import { captureComponents } from '../../figma-plugin/src/extract/components-page.ts';
import { scene, installFigma, query, log } from './figma-fixture.mjs';

test('searches all pages and hidden descendants without a selection; returns ambiguity previews only', async (t) => {
  const hidden = scene('2:1', '登录页', { visible: false });
  const a = scene('1:1', '登录页');
  const figma = installFigma(t, [[a], [scene('2:0', 'Container', { children: [hidden] })]]);
  const result = await query({ operation: 'node' });
  assert.equal(figma.loads, 1);
  assert.equal(figma.skipInvisibleInstanceChildren, false);
  assert.equal(result.status, 'ambiguous');
  assert.equal(result.total, 2);
  assert.equal(result.node, undefined);
  assert.equal(result.image, undefined);
  assert.deepEqual(result.candidates[1].path, ['Page 2', 'Container', '登录页']);
  assert.ok(result.candidates.every((c) => c.screenshot?.base64));
  const rendered = renderQueryResult(result);
  assert.equal(rendered.content.filter((c) => c.type === 'image').length, 2);
  const metadata = JSON.parse(rendered.content[0].text);
  assert.match(metadata.instruction, /WAIT/);
  assert.equal(metadata.candidates[1].number, 2);
  assert.deepEqual(metadata.candidates[1].choice, { documentId, nodeId: hidden.id });
  assert.equal(metadata.candidates[0].screenshot, undefined);
});

test('pagination includes every duplicate and never treats a one-item page as unique', async (t) => {
  installFigma(t, [Array.from({ length: 7 }, (_, i) => scene(`1:${i}`, '登录页'))]);
  const first = await query();
  assert.equal(first.candidates.length, 6);
  assert.equal(first.nextOffset, 6);
  const last = await query({ offset: first.nextOffset });
  assert.equal(last.status, 'ambiguous');
  assert.equal(last.total, 7);
  assert.equal(last.candidates.length, 1);
  assert.equal(last.nextOffset, null);
  assert.equal(JSON.parse(renderQueryResult(last).content[0].text).candidates[0].number, 7);
});

test('confirmed choices read fresh trees and screenshots, including hidden children', async (t) => {
  const child = scene('2:2', 'Hidden child', { visible: false });
  const chosen = scene('2:1', '登录页', { children: [child] });
  const figma = installFigma(t, [[scene('1:1', '登录页')], [chosen]]);
  const choice = { documentId, nodeId: chosen.id };
  const first = await query({ operation: 'node', choice });
  assert.equal(first.node.id, chosen.id);
  assert.equal(first.node.children[0].visible, false);
  chosen.width = 420;
  const second = await query({ operation: 'node', choice });
  assert.equal(second.node.width, 420);
  assert.equal(first.node.width, 300);
  await query({ operation: 'screenshot', choice });
  await query({ operation: 'screenshot', choice });
  assert.equal(chosen.exports.length, 2);
  assert.equal(figma.loads, 4);
});

test('renamed, deleted or foreign-document choices cannot silently select another match', async (t) => {
  const chosen = scene('1:1', '登录页');
  const figma = installFigma(t, [[chosen, scene('1:2', '登录页')]]);
  const choice = { documentId, nodeId: chosen.id };
  chosen.name = 'Renamed';
  assert.equal((await query({ operation: 'node', choice })).status, 'stale_choice');
  chosen.name = '登录页';
  figma.root.children[0].children.shift();
  assert.equal((await query({ operation: 'node', choice })).status, 'stale_choice');
  assert.equal((await query({ choice: { ...choice, documentId: 'another-file' } })).status, 'stale_choice');
});

test('missing names, failed previews and failed page loading are explicit', async (t) => {
  const hidden = scene('1:1', '登录页', { async exportAsync() { throw new Error('cannot export'); } });
  const figma = installFigma(t, [[hidden]]);
  assert.equal((await query({ nodeName: '登录' })).status, 'not_found');
  const result = await query();
  assert.equal(result.total, 1);
  assert.equal(result.candidates[0].screenshot, null);
  assert.match(result.candidates[0].screenshotError, /export/);
  assert.equal((await query({ operation: 'screenshot' })).status, 'error');
  figma.loadAllPagesAsync = async () => { throw new Error('page load failed'); };
  assert.match((await query()).error, /page load failed/);
});

test('assets and variables are read live by name', async (t) => {
  const icon = scene('1:1', 'Icon', { type: 'VECTOR', boundVariables: { opacity: { type: 'VARIABLE_ALIAS', id: 'v1' } } });
  const figma = installFigma(t, [[icon]]);
  let value = 0.5;
  figma.variables = {
    async getVariableByIdAsync() { return { id: 'v1', name: 'opacity', variableCollectionId: 'c1', valuesByMode: { m1: value } }; },
    async getVariableCollectionByIdAsync() { return { id: 'c1', name: 'Tokens', defaultModeId: 'm1', modes: [{ modeId: 'm1', name: 'Default' }] }; },
  };
  const svg = await query({ operation: 'asset', nodeName: 'Icon' });
  assert.equal(Buffer.from(svg.image.base64, 'base64').toString(), '<svg/>');
  assert.equal((await query({ operation: 'variables', nodeName: 'Icon' })).variables[0].binding.resolvedValue, 0.5);
  value = 0.8;
  assert.equal((await query({ operation: 'variables', nodeName: 'Icon' })).variables[0].binding.resolvedValue, 0.8);
  assert.deepEqual((await query({ operation: 'variables', nodeName: 'Icon', collectionName: 'Other' })).variables, []);
});

test('pending requests reject mismatched/unsolicited/late results and release completed data', async () => {
  const pending = new PendingQueryRegistry();
  const request = { requestId: 'a', operation: 'resolve', nodeName: '登录页', offset: 0, limit: 6, depth: 5 };
  const result = { ...request, status: 'not_found', total: 0, nextOffset: null, candidates: [] };
  const waiting = pending.create(request, 100);
  assert.equal(pending.resolve({ ...result, nodeName: 'Other' }), false);
  assert.equal(pending.resolve({ ...result, operation: 'node' }), false);
  assert.equal(pending.size(), 1);
  assert.equal(pending.resolve(result), true);
  assert.equal(await waiting, result);
  assert.equal(pending.size(), 0);
  assert.equal(pending.resolve(result), false);
  const expired = await pending.create({ ...request, requestId: 'b' }, 5);
  assert.equal(expired.status, 'error');
  assert.match(expired.error, /timed out/);
  assert.equal(pending.size(), 0);
  assert.equal(pending.resolve({ ...result, requestId: 'b' }), false);
});

test('MCP exposes only live tools, requires names, and guards offline/multiple plugins', async (t) => {
  const node = scene('1:1', '登录页');
  installFigma(t, [[node]]);
  const pending = new PendingQueryRegistry();
  let connections = 1, calls = 0;
  const sse = { size: () => connections, broadcast(event) {
    calls++;
    assert.equal(pending.size(), 1, 'waiter must be registered before delivery');
    void queryNodes(event.data).then((result) => pending.resolve(result));
  } };
  const server = createMcpServer(sse, pending, new PendingDesignRegistry(log), new PendingComponentsRegistry(log), log);
  const client = new Client({ name: 'test', version: '1' });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(a);
  await client.connect(b);
  t.after(async () => { await client.close(); await server.close(); });
  const names = (await client.listTools()).tools.map((tool) => tool.name).sort();
  assert.deepEqual(names, ['generate_design', 'get_asset', 'get_node', 'get_screenshot', 'get_variables', 'list_components', 'resolve_node']);
  assert.equal((await client.callTool({ name: 'get_node', arguments: { nodeId: node.id } })).isError, true);
  assert.equal(calls, 0);
  const read = async () => JSON.parse((await client.callTool({ name: 'get_node', arguments: { nodeName: '登录页' } })).content[0].text);
  assert.equal((await read()).node.width, 300);
  node.width = 123;
  assert.equal((await read()).node.width, 123);
  assert.equal(calls, 2);
  for (connections of [0, 2]) {
    const result = await client.callTool({ name: 'get_node', arguments: { nodeName: '登录页' } });
    assert.equal(result.isError, true);
    const components = await client.callTool({ name: 'list_components', arguments: { pageName: 'Page 1' } });
    assert.equal(components.isError, true);
  }
  assert.equal(calls, 2);
  assert.equal(pending.size(), 0);
});

test('component discovery returns current metadata without serialized trees', async (t) => {
  const component = scene('1:1', 'Button', { type: 'COMPONENT', key: 'key1', description: '' });
  const figma = installFigma(t, [[component]]);
  const first = await captureComponents('a', 'Page 1');
  assert.equal(first.nodes, undefined);
  assert.equal(first.documentId, documentId);
  component.name = 'New button';
  const second = await captureComponents('b', 'Page 1');
  assert.equal(second.components[0].name, 'New button');
  assert.equal(figma.loads, 2);
});
