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
    const base64 = bytesToBase64(bytes);
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
      base64: bytesToBase64(bytes),
      width: null,
      height: null,
    };
  } catch {
    return null;
  }
}

/** Figma returns Uint8Array; convert to base64 without blowing the call stack on large PNGs. */
function bytesToBase64(bytes: Uint8Array): string {
  // Chunk in 0x8000-byte runs to stay under String.fromCharCode arg limits.
  const CHUNK = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += CHUNK) {
    const slice = bytes.subarray(i, Math.min(i + CHUNK, bytes.length));
    binary += String.fromCharCode.apply(
      null,
      Array.from(slice) as unknown as number[],
    );
  }
  // btoa is available in the plugin sandbox.
  // eslint-disable-next-line no-undef
  return btoa(binary);
}
