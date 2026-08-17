/**
 * Shared TypeScript types for the captured payload. These mirror the zod
 * schemas in bridge/src/store/schema.ts — keep the two in sync when you
 * change either side.
 *
 * The Figma plugin produces a CapturedSelection; the bridge validates it
 * against the zod schema and persists it.
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

export interface SelectionEntry {
  id: string;
  name: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  parentId: string | null;
  visible: boolean;
}

export interface AssetPayload {
  format: 'PNG' | 'SVG';
  mime: string;
  base64: string;
  width?: number | null;
  height?: number | null;
}

export interface CapturedSelection {
  fileKey: string;
  fileName: string;
  pageId: string;
  pageName: string;
  capturedAt: string;
  pluginVersion: string;
  selection: SelectionEntry[];
  nodes: Record<string, SerializedNode>;
  assets: Record<string, AssetPayload>;
}

export const PLUGIN_VERSION = '0.1.0';
