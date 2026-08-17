/** Extract auto-layout + absolute box + a CSS hint string from a frame-like node. */
import type { LayoutInfo } from '../types.js';
import { safe, safeOptional, isFrameLike } from './safe.js';

type LayoutMode = 'NONE' | 'HORIZONTAL' | 'VERTICAL' | 'GRID';

export function extractLayout(node: SceneNode): LayoutInfo | null {
  if (!isFrameLike(node)) {
    // Non-frame nodes have no auto-layout; still surface their box via cssHint.
    return null;
  }

  const layoutMode = safe<LayoutMode>(() => node.layoutMode as LayoutMode, 'NONE');
  const padding = {
    paddingTop: safeOptional(() => node.paddingTop),
    paddingRight: safeOptional(() => node.paddingRight),
    paddingBottom: safeOptional(() => node.paddingBottom),
    paddingLeft: safeOptional(() => node.paddingLeft),
  };
  const itemSpacing = safeOptional(() => node.itemSpacing);
  const counterAxisSpacing = safeOptional(() => node.counterAxisSpacing);

  // Build a CSS hint string that mirrors the most common Flexbox idioms.
  const cssParts: string[] = [];
  if (layoutMode === 'HORIZONTAL' || layoutMode === 'VERTICAL') {
    cssParts.push('display:flex');
    cssParts.push(`flex-direction:${layoutMode === 'HORIZONTAL' ? 'row' : 'column'}`);
    const wrap = safeOptional(() => node.layoutWrap);
    if (wrap === 'WRAP') cssParts.push('flex-wrap:wrap');
    if (typeof itemSpacing === 'number' && itemSpacing > 0) {
      cssParts.push(`gap:${itemSpacing}px`);
    }
    const paddingVals = [padding.paddingTop, padding.paddingRight, padding.paddingBottom, padding.paddingLeft];
    if (paddingVals.some((v) => typeof v === 'number')) {
      const t = padding.paddingTop ?? 0;
      const r = padding.paddingRight ?? 0;
      const b = padding.paddingBottom ?? 0;
      const l = padding.paddingLeft ?? 0;
      if (t === r && r === b && b === l) {
        cssParts.push(`padding:${t}px`);
      } else {
        cssParts.push(`padding:${t}px ${r}px ${b}px ${l}px`);
      }
    }
    const primaryAlign = safeOptional(() => node.primaryAxisAlignItems);
    const counterAlign = safeOptional(() => node.counterAxisAlignItems);
    const justify = mapAxisAlign(primaryAlign);
    const alignItems = mapAxisAlign(counterAlign);
    if (justify) cssParts.push(`justify-content:${justify}`);
    if (alignItems) cssParts.push(`align-items:${alignItems}`);
  } else {
    // NONE or GRID — fall back to absolute positioning for the hint.
    cssParts.push(`position:absolute;left:${Math.round(safe(() => node.x, 0))}px;top:${Math.round(safe(() => node.y, 0))}px`);
    cssParts.push(`width:${Math.round(safe(() => node.width, 0))}px`);
    cssParts.push(`height:${Math.round(safe(() => node.height, 0))}px`);
  }

  return {
    layoutMode,
    primaryAxisSizingMode: safeOptional(() => node.primaryAxisSizingMode),
    counterAxisSizingMode: safeOptional(() => node.counterAxisSizingMode),
    primaryAxisAlignItems: safeOptional(() => node.primaryAxisAlignItems),
    counterAxisAlignItems: safeOptional(() => node.counterAxisAlignItems),
    ...padding,
    itemSpacing,
    itemReverseZIndex: safeOptional(() => node.itemReverseZIndex),
    layoutWrap: safeOptional(() => node.layoutWrap),
    counterAxisSpacing,
    layoutAlign: safeOptional(() => node.layoutAlign),
    layoutGrow: safeOptional(() => node.layoutGrow),
    layoutPositioning: safeOptional(() => node.layoutPositioning),
    absoluteBoundingBox: {
      x: safe(() => node.absoluteBoundingBox?.x ?? node.x, 0),
      y: safe(() => node.absoluteBoundingBox?.y ?? node.y, 0),
      width: safe(() => node.absoluteBoundingBox?.width ?? node.width, 0),
      height: safe(() => node.absoluteBoundingBox?.height ?? node.height, 0),
    },
    cssHint: cssParts.join(';'),
  };
}

function mapAxisAlign(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const map: Record<string, string> = {
    MIN: 'flex-start',
    CENTER: 'center',
    MAX: 'flex-end',
    SPACE_BETWEEN: 'space-between',
    BASELINE: 'baseline',
  };
  return map[value];
}
