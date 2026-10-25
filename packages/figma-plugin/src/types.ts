/**
 * Shared TypeScript types for live requests and responses. These mirror the zod
 * schemas in bridge/src/store/schema.ts — keep the two in sync when you
 * change either side.
 *
 * The Figma plugin returns live query results; the bridge validates them
 * against the zod schema and delivers them to the waiting caller.
 */

export interface Color {
  r: number;
  g: number;
  b: number;
  a?: number;
}

export interface SolidPaint {
  type: 'SOLID';
  color: Color;
  opacity?: number;
  visible?: boolean;
}

export type Paint = SolidPaint | { type: string; [k: string]: unknown };

export interface Effect {
  type: string;
  visible?: boolean;
  radius?: number;
  color?: Color;
  offset?: { x: number; y: number };
  spread?: number;
  blendMode?: string;
  [k: string]: unknown;
}

export type CornerRadius = number | {
  topLeft: number;
  topRight: number;
  bottomLeft: number;
  bottomRight: number;
};

export interface LayoutInfo {
  layoutMode: 'NONE' | 'HORIZONTAL' | 'VERTICAL' | 'GRID';
  primaryAxisSizingMode?: string;
  counterAxisSizingMode?: string;
  primaryAxisAlignItems?: string;
  counterAxisAlignItems?: string;
  paddingTop?: number;
  paddingRight?: number;
  paddingBottom?: number;
  paddingLeft?: number;
  itemSpacing?: number;
  itemReverseZIndex?: boolean;
  layoutWrap?: string;
  counterAxisSpacing?: number;
  layoutAlign?: string;
  layoutGrow?: number;
  layoutPositioning?: string;
  absoluteBoundingBox?: { x: number; y: number; width: number; height: number };
  cssHint: string;
  [k: string]: unknown;
}

export interface StylesInfo {
  fills?: Paint[];
  strokes?: Paint[];
  strokeWeight?: number | number[];
  strokeAlign?: string;
  strokeCap?: string;
  strokeJoin?: string;
  effects?: Effect[];
  cornerRadius?: CornerRadius;
  opacity?: number;
  blendMode?: string;
  backgroundColor?: Color | null;
  [k: string]: unknown;
}

export interface TextInfo {
  characters: string;
  fontName: { family: string; style: string };
  fontSize: number;
  fontWeight?: number;
  lineHeight?: { unit: string; value?: number } | string | null;
  letterSpacing?: { unit: string; value?: number } | string | null;
  textCase?: string;
  textDecoration?: string;
  textAutoResize?: string;
  textAlignHorizontal?: string;
  textAlignVertical?: string;
  [k: string]: unknown;
}

export interface BoundVariableInfo {
  property: string;
  variableId: string;
  name: string;
  collectionId?: string;
  collectionName?: string;
  modeId?: string | null;
  modeName?: string | null;
  resolvedValue: unknown;
  aliasOf?: string | null;
}

export interface ComponentInfo {
  kind: 'COMPONENT' | 'INSTANCE' | 'COMPONENT_SET';
  mainComponent: { id: string; name: string; key?: string } | null;
  componentPropertyDefinitions?: Record<string, unknown> | null;
  componentPropertyReferences?: Record<string, string> | null;
  overrides?: Array<{ property: string; oldValue: unknown; newValue: unknown }> | null;
}

export interface SerializedNode {
  id: string;
  name: string;
  type: string;
  visible: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  depth: number;
  layout: LayoutInfo | null;
  styles: StylesInfo | null;
  text: TextInfo | null;
  variables: BoundVariableInfo[];
  component: ComponentInfo | null;
  children: SerializedNode[] | null;
}

export interface AssetPayload {
  format: 'PNG' | 'SVG';
  mime: string;
  base64: string;
  width?: number | null;
  height?: number | null;
}

export interface NodeQuery {
  requestId: string;
  operation: 'resolve' | 'node' | 'screenshot' | 'asset' | 'variables';
  nodeName: string;
  choice?: { documentId: string; nodeId: string };
  offset: number;
  limit: number;
  depth: number;
  format?: 'PNG' | 'SVG';
  collectionName?: string;
}
export interface NodeCandidate {
  nodeId: string; nodeName: string; type: string;
  pageId: string; pageName: string; path: string[];
  x: number; y: number; width: number; height: number;
  screenshot: AssetPayload | null;
  screenshotError?: string;
}
export interface NodeQueryResult {
  requestId: string; operation: NodeQuery['operation']; nodeName: string;
  status: 'unique' | 'ambiguous' | 'not_found' | 'stale_choice' | 'error';
  document?: { id: string; fileKey: string | null; fileName: string };
  total: number; offset: number; nextOffset: number | null;
  candidates: NodeCandidate[];
  node?: SerializedNode;
  image?: AssetPayload;
  variables?: Array<{ nodeId: string; nodeName: string; binding: BoundVariableInfo }>;
  error?: string;
}

export interface DesignColor {
  r: number;
  g: number;
  b: number;
  a?: number;
}

export interface DesignBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DesignNode {
  kind: 'frame' | 'rectangle' | 'ellipse' | 'component' | 'text';
  name: string;
  box: DesignBox;
  rotation?: number;
  opacity?: number;
  fill?: DesignColor;
  stroke?: DesignColor;
  strokeWeight?: number;
  cornerRadius?: number;
  componentId?: string;
  componentKey?: string;
  properties?: Record<string, string | boolean>;
  children?: DesignNode[];
  characters?: string;
  fontSize?: number;
  fontWeight?: number;
  color?: DesignColor;
  textAlignHorizontal?: 'LEFT' | 'CENTER' | 'RIGHT' | 'JUSTIFIED';
}

export interface DesignGroup {
  name: string;
  description?: string;
  children: DesignNode[];
}

export interface GeneratedDesign {
  name: string;
  description?: string;
  width: number;
  height: number;
  background?: DesignColor;
  targetPage?: string;
  groups: DesignGroup[];
}

export interface ComponentSummary {
  id: string;
  name: string;
  type: 'COMPONENT' | 'COMPONENT_SET';
  componentKey: string | null;
  description: string | null;
  parentId: string | null;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ComponentsResult {
  requestId: string;
  found: boolean;
  pageId?: string;
  pageName?: string;
  components: ComponentSummary[];
  documentId?: string;
  error?: string;
}
