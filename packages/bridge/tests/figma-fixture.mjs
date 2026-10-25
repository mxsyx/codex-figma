import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { nodeQuerySchema, nodeQueryResultSchema } from '../src/store/schema.ts';
import { queryNodes } from '../../figma-plugin/src/query-nodes.ts';

export const log = { info() {}, warn() {}, error() {}, debug() {} };
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');

export function scene(id, name, overrides = {}) {
  const node = { id, name, type: 'FRAME', visible: true, x: 0, y: 0, width: 300, height: 600,
    children: [], exports: [],
    async exportAsync(options) { this.exports.push(options); return options.format === 'SVG' ? Buffer.from('<svg/>') : png; },
    ...overrides };
  for (const child of node.children) child.parent = node;
  return node;
}

export function installFigma(t, pageChildren) {
  const before = globalThis.figma;
  const root = { type: 'DOCUMENT', name: 'Test file', children: [] };
  root.children = pageChildren.map((children, i) => {
    const page = { id: `page:${i}`, type: 'PAGE', name: `Page ${i + 1}`, parent: root, children,
      findAll(predicate) {
        const matches = [];
        const walk = (node) => { if (predicate(node)) matches.push(node); node.children?.forEach(walk); };
        this.children.forEach(walk);
        return matches;
      } };
    children.forEach((node) => { node.parent = page; });
    return page;
  });
  const figma = { root, fileKey: undefined, currentPage: root.children[0], skipInvisibleInstanceChildren: true,
    loads: 0, async loadAllPagesAsync() { this.loads++; },
    base64Encode(bytes) { return Buffer.from(bytes).toString('base64'); },
    getNodeByIdAsync() { assert.fail('Read queries must search names, never fetch by ID'); },
  };
  globalThis.figma = figma;
  t.after(() => { globalThis.figma = before; });
  return figma;
}

export async function query(overrides = {}) {
  const request = nodeQuerySchema.parse({ requestId: randomUUID(), operation: 'resolve', nodeName: '登录页', ...overrides });
  const response = await queryNodes(request);
  // Cross-package compatibility: JSON serialization must satisfy the actual bridge contract.
  return nodeQueryResultSchema.parse(JSON.parse(JSON.stringify(response)));
}
