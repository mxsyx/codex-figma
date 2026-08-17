/**
 * Capture orchestrator — runs all extractors on the current selection and
 * assembles a CapturedSelection payload ready to POST to the bridge.
 *
 * Captures:
 *   - selection summary (file, page, selected node ids + boxes)
 *   - full node tree per selected root (depth-capped)
 *   - PNG screenshot per selected root
 *   - SVG export per vector-leaf descendant of each root (capped)
 */
import type { AssetPayload, CapturedSelection, SerializedNode } from './types.js';
import { PLUGIN_VERSION } from './types.js';
import { captureSelectionSummary } from './extract/selection.js';
import { serializeNodeTree } from './extract/node-tree.js';
import { exportPng, exportSvg } from './extract/screenshot.js';

const MAX_TREE_DEPTH = 8;
const MAX_SVG_ASSETS = 50;

export interface CaptureResult {
  payload: CapturedSelection;
  stats: {
    selectionCount: number;
    nodeCount: number;
    pngCount: number;
    svgCount: number;
    svgSkipped: number;
  };
}

export async function captureSelection(): Promise<CaptureResult> {
  const summary = captureSelectionSummary();
  const nodes: Record<string, SerializedNode> = {};
  const assets: Record<string, AssetPayload> = {};

  let nodeCount = 0;
  let pngCount = 0;
  let svgCount = 0;
  let svgSkipped = 0;

  for (const entry of summary.selection) {
    const node = await figma.getNodeByIdAsync(entry.id);
    if (!node || !('type' in node)) continue;

    // 1. Serialize the tree.
    const tree = await serializeNodeTree(node as SceneNode, MAX_TREE_DEPTH);
    nodes[entry.id] = tree;
    nodeCount += countNodes(tree);

    // 2. PNG screenshot of the root.
    const png = await exportPng(node as SceneNode, 2);
    if (png) {
      assets[entry.id] = png;
      pngCount += 1;
    }

    // 3. SVG exports of vector-leaf descendants (icons, vector art).
    const vectorLeaves = collectVectorLeaves(tree, []);
    for (const leafId of vectorLeaves) {
      if (svgCount >= MAX_SVG_ASSETS) {
        svgSkipped += vectorLeaves.length - svgCount;
        break;
      }
      const leaf = await figma.getNodeByIdAsync(leafId);
      if (!leaf || !('type' in leaf)) continue;
      const svg = await exportSvg(leaf as SceneNode);
      if (svg) {
        assets[leafId] = svg;
        svgCount += 1;
      }
    }
  }

  const payload: CapturedSelection = {
    fileKey: summary.fileKey,
    fileName: summary.fileName,
    pageId: summary.pageId,
    pageName: summary.pageName,
    capturedAt: new Date().toISOString(),
    pluginVersion: PLUGIN_VERSION,
    selection: summary.selection,
    nodes,
    assets,
  };

  return {
    payload,
    stats: {
      selectionCount: summary.selection.length,
      nodeCount,
      pngCount,
      svgCount,
      svgSkipped,
    },
  };
}

/**
 * Capture a single node by id (on-demand fetch). Reuses the same extractors
 * as captureSelection but does NOT depend on the current selection — the
 * node is found via figma.getNodeByIdAsync, so any node in the file works.
 *
 * Used when the bridge receives a get_node request for a node that isn't in
 * the selection cache: the bridge broadcasts a fetch-node-request SSE event,
 * the UI forwards it here, and the result is POSTed back to /node.
 */
export async function captureNode(nodeId: string): Promise<{
  found: boolean;
  node?: SerializedNode;
  assets: Record<string, AssetPayload>;
}> {
  const node = await figma.getNodeByIdAsync(nodeId);
  if (!node || !('type' in node)) {
    return { found: false, assets: {} };
  }

  const sceneNode = node as SceneNode;
  const assets: Record<string, AssetPayload> = {};

  // 1. Serialize the tree.
  const tree = await serializeNodeTree(sceneNode, MAX_TREE_DEPTH);

  // 2. PNG screenshot of the root.
  const png = await exportPng(sceneNode, 2);
  if (png) {
    assets[nodeId] = png;
  }

  // 3. SVG exports of vector-leaf descendants (icons, vector art).
  const vectorLeaves = collectVectorLeaves(tree, []);
  let svgCount = 0;
  for (const leafId of vectorLeaves) {
    if (svgCount >= MAX_SVG_ASSETS) break;
    const leaf = await figma.getNodeByIdAsync(leafId);
    if (!leaf || !('type' in leaf)) continue;
    const svg = await exportSvg(leaf as SceneNode);
    if (svg) {
      assets[leafId] = svg;
      svgCount += 1;
    }
  }

  return { found: true, node: tree, assets };
}

function countNodes(node: SerializedNode): number {
  let n = 1;
  if (node.children) {
    for (const c of node.children) n += countNodes(c);
  }
  return n;
}

function collectVectorLeaves(
  node: SerializedNode,
  accumulator: string[],
): string[] {
  // VECTOR + BOOLEAN_OPERATION are typical icon leaves.
  if (node.type === 'VECTOR' || node.type === 'BOOLEAN_OPERATION') {
    accumulator.push(node.id);
  }
  if (node.children) {
    for (const c of node.children) collectVectorLeaves(c, accumulator);
  }
  return accumulator;
}
