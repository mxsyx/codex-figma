/**
 * Shared payload schemas that define the wire contract between the Figma
 * plugin (producer) and the bridge (consumer). The Figma plugin POSTs a
 * `CapturedSelection` to `POST /selection`; the bridge validates it against
 * `capturedSelectionSchema` before persisting.
 *
 * Keep this file dependency-free except for zod so it stays easy to reason
 * about. Derived TypeScript types are exported alongside the schemas.
 */
import { z } from "zod";

// --- Primitives -----------------------------------------------------------

export const colorSchema = z.object({
  r: z.number(),
  g: z.number(),
  b: z.number(),
  a: z.number().optional(),
});

export const solidPaintSchema = z.object({
  type: z.literal("SOLID"),
  color: colorSchema,
  opacity: z.number().optional(),
  visible: z.boolean().optional(),
});

export const paintSchema = z.union([
  solidPaintSchema,
  z.object({ type: z.string() }).passthrough(), // gradient / image / video — keep raw
]);

export const effectSchema = z
  .object({
    type: z.string(),
    visible: z.boolean().optional(),
    radius: z.number().optional(),
    color: colorSchema.optional(),
    offset: z.object({ x: z.number(), y: z.number() }).optional(),
    spread: z.number().optional(),
    blendMode: z.string().optional(),
  })
  .passthrough();

export const cornerRadiusSchema = z.union([
  z.number(),
  z.object({
    topLeft: z.number(),
    topRight: z.number(),
    bottomLeft: z.number(),
    bottomRight: z.number(),
  }),
]);

// --- Node tree ------------------------------------------------------------

export const layoutInfoSchema = z
  .object({
    layoutMode: z.enum(["NONE", "HORIZONTAL", "VERTICAL", "GRID"]),
    primaryAxisSizingMode: z.string().optional(),
    counterAxisSizingMode: z.string().optional(),
    primaryAxisAlignItems: z.string().optional(),
    counterAxisAlignItems: z.string().optional(),
    paddingTop: z.number().optional(),
    paddingRight: z.number().optional(),
    paddingBottom: z.number().optional(),
    paddingLeft: z.number().optional(),
    itemSpacing: z.number().optional(),
    itemReverseZIndex: z.boolean().optional(),
    layoutWrap: z.string().optional(),
    counterAxisSpacing: z.number().optional(),
    layoutAlign: z.string().optional(),
    layoutGrow: z.number().optional(),
    layoutPositioning: z.string().optional(),
    absoluteBoundingBox: z
      .object({
        x: z.number(),
        y: z.number(),
        width: z.number(),
        height: z.number(),
      })
      .optional(),
    cssHint: z.string(),
  })
  .passthrough();

export const stylesInfoSchema = z
  .object({
    fills: z.array(paintSchema).optional(),
    strokes: z.array(paintSchema).optional(),
    strokeWeight: z.union([z.number(), z.array(z.number())]).optional(),
    strokeAlign: z.string().optional(),
    strokeCap: z.string().optional(),
    strokeJoin: z.string().optional(),
    effects: z.array(effectSchema).optional(),
    cornerRadius: cornerRadiusSchema.optional(),
    opacity: z.number().optional(),
    blendMode: z.string().optional(),
    backgroundColor: colorSchema.nullable().optional(),
  })
  .passthrough();

export const textInfoSchema = z
  .object({
    characters: z.string(),
    // Figma returns null for fontName/fontSize when a TEXT node has mixed fonts;
    // the plugin's safe() may omit the field entirely (undefined) when null.
    fontName: z.object({ family: z.string(), style: z.string() }).nullish(),
    fontSize: z.number().nullish(),
    fontWeight: z.number().nullish(),
    lineHeight: z
      .union([
        z.object({ unit: z.string(), value: z.number().optional() }),
        z.string(),
      ])
      .nullable()
      .optional(),
    letterSpacing: z
      .union([
        z.object({ unit: z.string(), value: z.number().optional() }),
        z.string(),
      ])
      .nullable()
      .optional(),
    textCase: z.string().optional(),
    textDecoration: z.string().optional(),
    textAutoResize: z.string().optional(),
    textAlignHorizontal: z.string().optional(),
    textAlignVertical: z.string().optional(),
  })
  .passthrough();

export const boundVariableSchema = z
  .object({
    property: z.string(),
    variableId: z.string(),
    name: z.string(),
    collectionId: z.string().optional(),
    collectionName: z.string().optional(),
    modeId: z.string().nullable().optional(),
    modeName: z.string().nullable().optional(),
    resolvedValue: z.unknown(),
    aliasOf: z.string().nullable().optional(),
  })
  .passthrough();

export const componentInfoSchema = z
  .object({
    kind: z.enum(["COMPONENT", "INSTANCE", "COMPONENT_SET"]),
    mainComponent: z
      .object({
        id: z.string(),
        name: z.string(),
        key: z.string().optional(),
      })
      .nullable(),
    componentPropertyDefinitions: z
      .record(z.string(), z.unknown())
      .nullable()
      .optional(),
    componentPropertyReferences: z
      .record(z.string(), z.string())
      .nullable()
      .optional(),
    overrides: z
      .array(
        z.object({
          property: z.string(),
          oldValue: z.unknown(),
          newValue: z.unknown(),
        }),
      )
      .nullable()
      .optional(),
  })
  .passthrough();

// Recursive schema — declared lazily so the type matches the runtime tree.
export type SerializedNode = {
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
  layout: z.infer<typeof layoutInfoSchema> | null;
  styles: z.infer<typeof stylesInfoSchema> | null;
  text: z.infer<typeof textInfoSchema> | null;
  variables: z.infer<typeof boundVariableSchema>[];
  component: z.infer<typeof componentInfoSchema> | null;
  children: SerializedNode[] | null;
};

export const serializedNodeSchema: z.ZodType<SerializedNode> = z.lazy(() =>
  z
    .object({
      id: z.string(),
      name: z.string(),
      type: z.string(),
      visible: z.boolean(),
      x: z.number(),
      y: z.number(),
      width: z.number(),
      height: z.number(),
      rotation: z.number(),
      depth: z.number(),
      layout: layoutInfoSchema.nullable(),
      styles: stylesInfoSchema.nullable(),
      text: textInfoSchema.nullable(),
      variables: z.array(boundVariableSchema),
      component: componentInfoSchema.nullable(),
      children: z.array(serializedNodeSchema).nullable(),
    })
    .passthrough(),
);

// --- Assets ---------------------------------------------------------------

export const assetPayloadSchema = z.object({
  format: z.enum(["PNG", "SVG"]),
  mime: z.string(),
  base64: z.string(),
  width: z.number().nullable().optional(),
  height: z.number().nullable().optional(),
});

// --- Selection summary ----------------------------------------------------

export const selectionEntrySchema = z
  .object({
    id: z.string(),
    name: z.string(),
    type: z.string(),
    x: z.number(),
    y: z.number(),
    width: z.number(),
    height: z.number(),
    parentId: z.string().nullable(),
    visible: z.boolean(),
  })
  .passthrough();

// --- Top-level payload ----------------------------------------------------

export const capturedSelectionSchema = z
  .object({
    fileKey: z.string(),
    fileName: z.string(),
    pageId: z.string(),
    pageName: z.string(),
    capturedAt: z.string(),
    pluginVersion: z.string(),
    selection: z.array(selectionEntrySchema),
    nodes: z.record(z.string(), serializedNodeSchema),
    assets: z.record(z.string(), assetPayloadSchema),
  })
  .passthrough();

export type CapturedSelection = z.infer<typeof capturedSelectionSchema>;
export type SelectionEntry = z.infer<typeof selectionEntrySchema>;
export type AssetPayload = z.infer<typeof assetPayloadSchema>;
export type BoundVariable = z.infer<typeof boundVariableSchema>;
