import type { ComponentSummary, ComponentsResult } from '../types.js';
import { documentId } from '../query-nodes.js';
export async function captureComponents(
  requestId: string,
  pageName: string,
  query?: string,
): Promise<ComponentsResult> {
  try {
    await figma.loadAllPagesAsync();
    figma.skipInvisibleInstanceChildren = false;
  } catch (err) {
    return { requestId, found: false, components: [], error: String(err) };
  }
  const pages = figma.root.children.filter((candidate) => candidate.name === pageName);
  if (pages.length > 1) return { requestId, found: false, components: [], error: `Multiple pages are named "${pageName}". Rename a page before querying the library.` };
  const page = pages[0];
  if (!page) {
    return {
      requestId,
      found: false,
      components: [],
      error: `Figma page "${pageName}" was not found.`,
    };
  }

  const components: ComponentSummary[] = [];
  const needle = query?.trim().toLowerCase();

  async function walk(node: SceneNode, includeChildren = false): Promise<void> {
    if (node.type === 'COMPONENT' || node.type === 'COMPONENT_SET') {
      const matches = includeChildren || !needle || node.name.toLowerCase().includes(needle);
      if (matches) {
        components.push(summarizeComponent(node));
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
    documentId,
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
