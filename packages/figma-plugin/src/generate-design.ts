import type { DesignColor, DesignNode, GeneratedDesign } from './types.js';

const TEXT_FONT_FAMILY = 'Inter';
type DesignSceneNode =
  | FrameNode
  | RectangleNode
  | EllipseNode
  | TextNode
  | InstanceNode;
type StyledDesignSceneNode = FrameNode | RectangleNode | EllipseNode;

export async function generateDesign(design: GeneratedDesign): Promise<string> {
  const targetPage = resolveTargetPage(design.targetPage);
  await figma.setCurrentPageAsync(targetPage);
  const root = figma.createFrame();
  root.name = design.name;
  root.resize(design.width, design.height);
  root.x = 0;
  root.y = 0;
  root.fills = design.background ? [solidPaint(design.background)] : [];
  targetPage.appendChild(root);

  for (const group of design.groups) {
    const children: SceneNode[] = [];
    for (const child of group.children) {
      children.push(await createNode(child, root));
    }
    const groupNode = figma.group(children, root);
    groupNode.name = group.name;
  }

  targetPage.selection = [root];
  figma.viewport.scrollAndZoomIntoView([root]);
  return root.id;
}

async function createNode(
  spec: DesignNode,
  parent: BaseNode & ChildrenMixin,
): Promise<SceneNode> {
  switch (spec.kind) {
    case 'frame': {
      const node = figma.createFrame();
      applyBox(node, spec);
      applyVisualStyle(node, spec);
      parent.appendChild(node);
      for (const child of spec.children ?? []) {
        node.appendChild(await createNode(child, node));
      }
      return node;
    }
    case 'rectangle': {
      const node = figma.createRectangle();
      applyBox(node, spec);
      applyVisualStyle(node, spec);
      parent.appendChild(node);
      return node;
    }
    case 'ellipse': {
      const node = figma.createEllipse();
      applyBox(node, spec);
      applyVisualStyle(node, spec);
      parent.appendChild(node);
      return node;
    }
    case 'component': {
      if (!spec.componentId) {
        throw new Error(`Component node "${spec.name}" is missing componentId.`);
      }
      const source = await figma.getNodeByIdAsync(spec.componentId);
      if (!source || source.type !== 'COMPONENT') {
        throw new Error(`Component "${spec.componentId}" was not found on the component library page.`);
      }
      const node = source.createInstance();
      applyBox(node, spec);
      if (spec.properties) node.setProperties(spec.properties);
      applyCommonStyle(node, spec);
      parent.appendChild(node);
      return node;
    }
    case 'text': {
      const node = figma.createText();
      applyBox(node, spec);
      node.fontName = await loadTextFont(spec.fontWeight ?? 400);
      node.characters = spec.characters ?? '';
      if (spec.fontSize) node.fontSize = spec.fontSize;
      if (spec.color) node.fills = [solidPaint(spec.color)];
      if (spec.textAlignHorizontal) node.textAlignHorizontal = spec.textAlignHorizontal;
      applyCommonStyle(node, spec);
      parent.appendChild(node);
      return node;
    }
  }
}

function resolveTargetPage(pageName?: string): PageNode {
  if (!pageName) return figma.currentPage;
  const existingPage = figma.root.children.find((page) => page.name === pageName);
  if (existingPage) return existingPage;
  const page = figma.createPage();
  page.name = pageName;
  return page;
}

function applyBox(
  node: DesignSceneNode,
  spec: DesignNode,
): void {
  node.name = spec.name;
  node.resize(spec.box.width, spec.box.height);
  node.x = spec.box.x;
  node.y = spec.box.y;
  if (spec.rotation) node.rotation = spec.rotation;
}

function applyVisualStyle(
  node: StyledDesignSceneNode,
  spec: DesignNode,
): void {
  if ('fills' in node && spec.fill) node.fills = [solidPaint(spec.fill)];
  if ('strokes' in node && spec.stroke) {
    node.strokes = [solidPaint(spec.stroke)];
    if (spec.strokeWeight && 'strokeWeight' in node) node.strokeWeight = spec.strokeWeight;
  }
  if ('cornerRadius' in node && spec.cornerRadius) {
    node.cornerRadius = spec.cornerRadius;
  }
  applyCommonStyle(node, spec);
}

function applyCommonStyle(node: SceneNode, spec: DesignNode): void {
  if (spec.opacity !== undefined) node.opacity = spec.opacity;
}

function solidPaint(color: DesignColor): SolidPaint {
  return {
    type: 'SOLID',
    color: { r: color.r, g: color.g, b: color.b },
    opacity: color.a ?? 1,
  };
}

async function loadTextFont(weight = 400): Promise<FontName> {
  const style = fontWeightStyle(weight);
  const requested = { family: TEXT_FONT_FAMILY, style };
  try {
    await figma.loadFontAsync(requested);
    return requested;
  } catch {
    const fallbacks = [
      { family: TEXT_FONT_FAMILY, style: 'Regular' },
      { family: 'Roboto', style: 'Regular' },
    ];
    for (const fallback of fallbacks) {
      try {
        await figma.loadFontAsync(fallback);
        return fallback;
      } catch {
        // Try the next font that is available in the user's Figma environment.
      }
    }
    throw new Error('No supported text font is available in Figma.');
  }
}

function fontWeightStyle(weight: number): string {
  if (weight <= 400) return 'Regular';
  if (weight <= 500) return 'Medium';
  if (weight <= 600) return 'Semi Bold';
  if (weight <= 700) return 'Bold';
  return 'Black';
}
