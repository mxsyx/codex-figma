/**
 * Export a node as PNG (always) and SVG (for vector leaves only).
 * PNG covers the visual source-of-truth for any node; SVG is the faithful
 * representation for icons and vector art.
 *
 * Returns null silently if export fails (e.g. node has zero size or is
 * hidden) — the caller should still ship the rest of the payload.
 */
import type { AssetPayload } from "../types.js";
import { isVectorLike } from "./safe.js";

const PNG_MIME = "image/png";
const SVG_MIME = "image/svg+xml";

export async function exportPng(
  node: SceneNode,
  scale = 2,
): Promise<AssetPayload | null> {
  try {
    const bytes = await node.exportAsync({
      format: "PNG",
      constraint: { type: "SCALE", value: scale },
    });
    const base64 = figma.base64Encode(bytes);
    const box = node.absoluteBoundingBox;
    return {
      format: "PNG",
      mime: PNG_MIME,
      base64,
      width: box?.width ?? null,
      height: box?.height ?? null,
    };
  } catch {
    return null;
  }
}

export async function exportSvg(node: SceneNode): Promise<AssetPayload | null> {
  if (!isVectorLike(node)) return null;
  try {
    const bytes = await node.exportAsync({ format: "SVG" });
    return {
      format: "SVG",
      mime: SVG_MIME,
      base64: figma.base64Encode(bytes),
      width: null,
      height: null,
    };
  } catch {
    return null;
  }
}
