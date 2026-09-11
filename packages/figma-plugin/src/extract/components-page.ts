import type { ComponentSummary, ComponentsResult, SerializedNode } from '../types.js';
import { serializeNodeTree } from './node-tree.js';

const MAX_COMPONENT_TREE_DEPTH = 10;

export async function captureComponents(
  requestId: string,
  pageName: string,
  query?: string,
): Promise<ComponentsResult> {
  const page = figma.root.children.find((candidate) => candidate.name === pageName);
  if (!page) {
    return {
      requestId,
      found: false,
      components: [],
      nodes: {},
      error: `Figma page "${pageName}" was not found.`,
    };
  }

  const components: ComponentSummary[] = [];
  const nodes: Record<string, SerializedNode> = {};
  const needle = query?.trim().toLowerCase();

  async function walk(node: SceneNode, includeChildren = false): Promise<void> {
    if (node.type === 'COMPONENT' || node.type === 'COMPONENT_SET') {
      const matches = includeChildren || !needle || node.name.toLowerCase().includes(needle);
      if (matches) {
        components.push(summarizeComponent(node));
        nodes[node.id] = await serializeNodeTree(node, MAX_COMPONENT_TREE_DEPTH);
      }

      if (node.type === 'COMPONENT_SET' && matches) {
        for (const child of node.children) {
          await walk(child, true);
        }
        return;
      }
    }

    if ('children' in node) {
      for (const child of node.children) {
        await walk(child as SceneNode);
      }
    }
  }

  for (const child of page.children) {
    await walk(child);
  }

  return {
    requestId,
    found: true,
    pageId: page.id,
    pageName: page.name,
    components,
    nodes,
  };
}

function summarizeComponent(node: ComponentNode | ComponentSetNode): ComponentSummary {
  return {
    id: node.id,
    name: node.name,
    type: node.type,
    componentKey: node.key,
    description: node.description ?? null,
    parentId: node.parent?.id ?? null,
    x: node.x,
    y: node.y,
    width: node.width,
    height: node.height,
  };
}
