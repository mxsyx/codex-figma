/** Capture the current selection summary + file/page context. */
import type { SelectionEntry } from '../types.js';
import { safe } from './safe.js';

export function captureSelectionSummary(): {
  fileKey: string;
  fileName: string;
  pageId: string;
  pageName: string;
  selection: SelectionEntry[];
} {
  const file = figma.root;
  const page = figma.currentPage;
  const selection = page.selection;

  const entries: SelectionEntry[] = selection.map((node) => ({
    id: node.id,
    name: node.name,
    type: node.type,
    x: safe(() => node.x, 0),
    y: safe(() => node.y, 0),
    width: safe(() => node.width, 0),
    height: safe(() => node.height, 0),
    parentId: safe(() => node.parent?.id ?? null, null),
    visible: safe(() => node.visible, true),
  }));

  return {
    fileKey: safe(() => figma.fileKey ?? 'local', 'local'),
    fileName: file.name,
    pageId: page.id,
    pageName: page.name,
    selection: entries,
  };
}
