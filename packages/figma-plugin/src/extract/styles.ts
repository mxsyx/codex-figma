/** Extract fills, strokes, effects, corner radii, opacity, blend mode. */
import type { Color, CornerRadius, Effect, Paint, StylesInfo } from '../types.js';
import { safe, safeOptional } from './safe.js';

interface MinimalStylableNode {
  fills?: ReadonlyArray<Paint> | symbol;
  strokes?: ReadonlyArray<Paint> | symbol;
  effects?: ReadonlyArray<Effect> | symbol;
  strokeWeight?: number | ReadonlyArray<number>;
  strokeAlign?: string;
  strokeCap?: string;
  strokeJoin?: string;
  cornerRadius?: number | CornerRadius;
  cornerRadiusTopLeft?: number;
  cornerRadiusTopRight?: number;
  cornerRadiusBottomLeft?: number;
  cornerRadiusBottomRight?: number;
  opacity?: number;
  blendMode?: string;
  backgroundColor?: Color;
}

export function extractStyles(node: SceneNode): StylesInfo | null {
  const stylable = node as unknown as MinimalStylableNode;
  const fills = safeOptional(() => stylable.fills);
  const strokes = safeOptional(() => stylable.strokes);
  const effects = safeOptional(() => stylable.effects);

  const cornerRadius = extractCornerRadius(stylable);

  return {
    fills: Array.isArray(fills) ? Array.from(fills).map(normalizePaint) : undefined,
    strokes: Array.isArray(strokes) ? Array.from(strokes).map(normalizePaint) : undefined,
    strokeWeight: normalizeStrokeWeight(safeOptional(() => stylable.strokeWeight)),
    strokeAlign: safeOptional(() => stylable.strokeAlign as string),
    strokeCap: safeOptional(() => stylable.strokeCap as string),
    strokeJoin: safeOptional(() => stylable.strokeJoin as string),
    effects: Array.isArray(effects) ? Array.from(effects).map(normalizeEffect) : undefined,
    cornerRadius,
    opacity: safe(() => stylable.opacity ?? 1, 1),
    blendMode: safeOptional(() => stylable.blendMode as string),
    backgroundColor: extractBackgroundColor(stylable),
  };
}

function extractCornerRadius(node: MinimalStylableNode): CornerRadius | undefined {
  const single = safeOptional(() => node.cornerRadius);
  if (typeof single === 'number') return single;
  const per = {
    topLeft: safeOptional(() => node.cornerRadiusTopLeft),
    topRight: safeOptional(() => node.cornerRadiusTopRight),
    bottomLeft: safeOptional(() => node.cornerRadiusBottomLeft),
    bottomRight: safeOptional(() => node.cornerRadiusBottomRight),
  };
  if (
    typeof per.topLeft === 'number' ||
    typeof per.topRight === 'number' ||
    typeof per.bottomLeft === 'number' ||
    typeof per.bottomRight === 'number'
  ) {
    return {
      topLeft: per.topLeft ?? 0,
      topRight: per.topRight ?? 0,
      bottomLeft: per.bottomLeft ?? 0,
      bottomRight: per.bottomRight ?? 0,
    };
  }
  return undefined;
}

function extractBackgroundColor(node: MinimalStylableNode): Color | null {
  const bg = safeOptional(() => node.backgroundColor);
  return bg ?? null;
}

function normalizeStrokeWeight(value: number | ReadonlyArray<number> | undefined): number | number[] | undefined {
  if (value === undefined) return undefined;
  if (typeof value === 'number') return value;
  return Array.from(value);
}

function normalizePaint(paint: Paint): Paint {
  // Pass through — Figma's paint objects are already JSON-serializable.
  return paint;
}

function normalizeEffect(effect: Effect): Effect {
  return effect;
}
