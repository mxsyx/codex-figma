/**
 * Message protocol between the sandbox (code.ts) and the iframe UI (ui.ts).
 *
 * Sandbox → iframe:    CodeToUIMessage
 * Iframe → sandbox:    UIToCodeMessage (wrapped in { pluginMessage: ... })
 */

export type UIToCodeMessage =
  | { kind: 'push-now' }
  | { kind: 'set-config'; bridgeUrl: string; autoPush: boolean }
  | { kind: 'get-config' }
  | { kind: 'probe-bridge' }
  | { kind: 'fetch-node'; requestId: string; nodeId: string };

export type CodeToUIMessage =
  | { kind: 'config'; bridgeUrl: string; autoPush: boolean }
  | { kind: 'capturing'; isCapturing: boolean }
  | {
      kind: 'push-result';
      ok: boolean;
      capturedAt?: string;
      stats?: {
        selectionCount: number;
        nodeCount: number;
        pngCount: number;
        svgCount: number;
        svgSkipped: number;
      };
      error?: string;
      bridgeUrl?: string;
    }
  | { kind: 'probe-result'; ok: boolean }
  | { kind: 'fetch-node-result'; requestId: string; ok: boolean; error?: string };
