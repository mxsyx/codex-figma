/**
 * Recursively walk a Figma node subtree and produce a JSON-safe SerializedNode
 * tree. Depth-capped to keep payloads reasonable for large frames; hidden
 * subtrees are pruned (we still emit the hidden root, but don't recurse).
 *
 * The walker is async because variable resolution requires `await`. Children
 * are processed in parallel where possible.
 */
import type { SerializedNode } from '../types.js';
import { safe, safeOptional } from './safe.js';
import { extractLayout } from './layout.js';
import { extractStyles } from './styles.js';
import { extractText } from './text.js';
import { extractComponent } from './components.js';
import { extractVariables } from './variables.js';

const DEFAULT_MAX_DEPTH = 6;

export async function serializeNodeTree(
  root: SceneNode,
  maxDepth: number = DEFAULT_MAX_DEPTH,
): Promise<SerializedNode> {
  return serialize(root, 0, maxDepth);
}

async function serialize(node: SceneNode, depth: number, maxDepth: number): Promise<SerializedNode> {
  const visible = safe(() => node.visible, true);
  const variables = await extractVariables(node);

  let children: SerializedNode[] | null = null;
  const childNodes = safeOptional(() => (node as { children?: readonly SceneNode[] }).children);
  if (childNodes && Array.isArray(childNodes) && depth < maxDepth) {
    // Only recurse into visible subtrees — hidden ones can't affect layout.
    const visibleChildren = visible ? childNodes : [];
    children = await Promise.all(
      visibleChildren.map((c) => serialize(c as SceneNode, depth + 1, maxDepth)),
    );
  }

  return {
    id: node.id,
    name: node.name,
    type: node.type,
    visible,
    x: safe(() => node.x, 0),
    y: safe(() => node.y, 0),
    width: safe(() => node.width, 0),
    height: safe(() => node.height, 0),
    rotation: safe(() => (node as SceneNode & { rotation?: number }).rotation ?? 0, 0),
    depth,
    layout: extractLayout(node),
    styles: extractStyles(node),
    text: extractText(node),
    variables,
    component: extractComponent(node),
    children,
  };
}
