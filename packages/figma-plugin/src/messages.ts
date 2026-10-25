import type { GeneratedDesign, NodeQuery } from './types.js';

export type UIToCodeMessage =
  | { kind: 'set-config'; bridgeUrl: string }
  | { kind: 'get-config' }
  | { kind: 'node-query'; query: NodeQuery }
  | { kind: 'generate-design'; requestId: string; design: GeneratedDesign }
  | { kind: 'list-components'; requestId: string; pageName: string; query?: string };

export type CodeToUIMessage =
  | { kind: 'config'; bridgeUrl: string }
  | { kind: 'query-status'; requestId: string; message: string; ok?: boolean }
  | { kind: 'generate-design-result'; requestId: string; ok: boolean; rootId?: string; error?: string }
  | { kind: 'components-result'; requestId: string; ok: boolean; componentCount?: number; error?: string };
