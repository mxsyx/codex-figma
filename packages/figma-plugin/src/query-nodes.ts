import type { NodeCandidate, NodeQuery, NodeQueryResult, SerializedNode, AssetPayload } from './types.js';
import { serializeNodeTree } from './extract/node-tree.js';
import { exportPng, exportSvg } from './extract/screenshot.js';

/** Identifies this open plugin/document, not a stored design snapshot. */
export const documentId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

export async function queryNodes(query: NodeQuery): Promise<NodeQueryResult> {
  const result: NodeQueryResult = {
    requestId: query.requestId, operation: query.operation, nodeName: query.nodeName,
    status: 'error', total: 0, offset: query.offset, nextOffset: null, candidates: [],
    document: { id: documentId, fileKey: figma.fileKey ?? null, fileName: figma.root.name },
  };
  try {
    if (query.choice && query.choice.documentId !== documentId) {
      return { ...result, status: 'stale_choice', error: 'The Figma document/plugin changed. Resolve the name again.' };
    }
    await figma.loadAllPagesAsync();
    figma.skipInvisibleInstanceChildren = false;
    // Every invocation scans live pages; no ID lookup, memoization, or result store.
    const matches = figma.root.children.flatMap((page) =>
      page.findAll((node) => node.name === query.nodeName).map((node) => ({ page, node })),
    ).sort((a, b) => a.node.id.localeCompare(b.node.id));
    result.total = matches.length;
    if (query.choice && !matches.some(({ node }) => node.id === query.choice!.nodeId)) {
      return { ...result, status: 'stale_choice', error: 'The chosen node no longer matches this name. It may have been renamed or removed.' };
    }
    if (matches.length === 0) return { ...result, status: 'not_found' };

    const selected = query.choice ? matches.filter(({ node }) => node.id === query.choice!.nodeId) : matches;
    const ambiguous = selected.length > 1;
    result.status = ambiguous ? 'ambiguous' : 'unique';
    const page = ambiguous ? selected.slice(query.offset, query.offset + query.limit) : selected;
    result.offset = ambiguous ? query.offset : 0;
    result.nextOffset = ambiguous && query.offset + page.length < selected.length ? query.offset + page.length : null;
    let previewBytes = 0;
    for (const { node, page: figmaPage } of page) {
      const path: string[] = [];
      let parent: BaseNode | null = node;
      while (parent && parent.type !== 'DOCUMENT') { path.unshift(parent.name); parent = parent.parent; }
      const candidate: NodeCandidate = {
        nodeId: node.id, nodeName: node.name, type: node.type,
        pageId: figmaPage.id, pageName: figmaPage.name, path,
        x: node.x, y: node.y, width: node.width, height: node.height, screenshot: null,
      };
      // Only discovery/ambiguity needs candidate previews. Read operations return their own data.
      if (ambiguous || query.operation === 'resolve') {
        candidate.screenshot = await pngFor(node, 640);
        previewBytes += candidate.screenshot?.base64.length ?? 0;
        if (previewBytes > 32 * 1024 * 1024) {
          candidate.screenshot = null;
          candidate.screenshotError = 'Preview response limit reached. Request a smaller candidate page.';
        } else if (!candidate.screenshot) {
          candidate.screenshotError = 'Figma could not export this preview (hidden, zero-size, or export error). Candidate is still included.';
        }
      }
      result.candidates.push(candidate);
    }
    // A name collision never causes a full tree/asset/variable read without a choice.
    if (ambiguous || query.operation === 'resolve') return result;
    const node = selected[0].node;
    if (query.operation === 'node' || query.operation === 'variables') {
      const tree = await serializeNodeTree(node, query.depth);
      if (query.operation === 'node') result.node = tree;
      else {
        result.variables = [];
        const walk = (n: SerializedNode) => {
          for (const binding of n.variables) {
            if (!query.collectionName || binding.collectionName === query.collectionName) {
              result.variables!.push({ nodeId: n.id, nodeName: n.name, binding });
            }
          }
          for (const child of n.children ?? []) walk(child);
        };
        walk(tree);
      }
    } else {
      const format = query.operation === 'screenshot' ? 'PNG' : query.format ?? 'SVG';
      const image = format === 'SVG' ? await exportSvg(node) : await pngFor(node, 1600);
      if (!image) return { ...result, status: 'error', error: `Figma could not export ${format} for this node. Try PNG for non-vector nodes.` };
      if (image.base64.length > 32 * 1024 * 1024) return { ...result, status: 'error', error: 'Export exceeds the response limit.' };
      result.image = image;
    }
    return result;
  } catch (err) {
    return { ...result, status: 'error', error: String(err instanceof Error ? err.message : err) };
  }
}

async function pngFor(node: SceneNode, maxSide: number): Promise<AssetPayload | null> {
  if (!(node.width > 0 && node.height > 0)) return null;
  return exportPng(node, Math.min(2, maxSide / Math.max(node.width, node.height)));
}
