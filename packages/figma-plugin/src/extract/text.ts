/** Extract text content + typography from a TEXT node. */
import type { TextInfo } from '../types.js';
import { safe, safeOptional } from './safe.js';

export function extractText(node: SceneNode): TextInfo | null {
  if (node.type !== 'TEXT') return null;
  const textNode = node as TextNode;
  return {
    characters: safe(() => textNode.characters, ''),
    fontName: safe(() => textNode.fontName as { family: string; style: string }, {
      family: 'unknown',
      style: 'unknown',
    }),
    fontSize: safe(() => (typeof textNode.fontSize === 'number' ? textNode.fontSize : 0), 0),
    fontWeight: safeOptional(() =>
      typeof textNode.fontWeight === 'number' ? textNode.fontWeight : undefined,
    ),
    lineHeight: safeOptional(() => textNode.lineHeight as TextInfo['lineHeight']),
    letterSpacing: safeOptional(() => textNode.letterSpacing as TextInfo['letterSpacing']),
    textCase: safeOptional(() => textNode.textCase as string),
    textDecoration: safeOptional(() => textNode.textDecoration as string),
    textAutoResize: safeOptional(() => textNode.textAutoResize as string),
    textAlignHorizontal: safeOptional(() => textNode.textAlignHorizontal as string),
    textAlignVertical: safeOptional(() => textNode.textAlignVertical as string),
  };
}
