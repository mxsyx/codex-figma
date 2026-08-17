/**
 * Figma plugin sandbox entry. Owns the selectionchange listener, runs the
 * capture orchestrator, POSTs the result to the bridge, and mirrors status
 * to the iframe UI.
 *
 * Sandbox-side state is just config + a debounce timer. All payload state
 * lives in the capture orchestrator and is shipped to the bridge per push.
 */
import { captureSelection, captureNode } from './capture.js';
import { postSelection, postNode, probeBridge } from './bridge-client.js';
import type { UIToCodeMessage } from './messages.js';

const DEFAULT_BRIDGE_URL = 'http://localhost:3845';
const DEBOUNCE_MS = 500;
const CLIENT_STORAGE_KEYS = {
  bridgeUrl: 'codexFigmaBridge.url',
  autoPush: 'codexFigmaBridge.autoPush',
};

figma.showUI(__html__, { width: 360, height: 480, themeColors: true });

let bridgeUrl = DEFAULT_BRIDGE_URL;
let autoPush = true;
let isCapturing = false;
let lastPushAt = 0;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

// --- Boot: load persisted config -----------------------------------------

(async () => {
  const [savedUrl, savedAutoPush] = await Promise.all([
    figma.clientStorage.getAsync(CLIENT_STORAGE_KEYS.bridgeUrl),
    figma.clientStorage.getAsync(CLIENT_STORAGE_KEYS.autoPush),
  ]);
  if (typeof savedUrl === 'string' && savedUrl.length > 0) bridgeUrl = savedUrl;
  if (typeof savedAutoPush === 'boolean') autoPush = savedAutoPush;
  sendConfigToUI();
  // Probe the bridge so the UI shows a real connected/disconnected state on load.
  const ok = await probeBridge(bridgeUrl);
  figma.ui.postMessage({ kind: 'probe-result', ok });
})();

// --- Selection listener --------------------------------------------------

figma.on('selectionchange', () => {
  if (!autoPush) return;
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    void pushNow();
  }, DEBOUNCE_MS);
});

// --- UI message handler --------------------------------------------------

figma.ui.onmessage = async (msg: UIToCodeMessage) => {
  switch (msg.kind) {
    case 'push-now':
      await pushNow();
      break;
    case 'set-config':
      bridgeUrl = msg.bridgeUrl || DEFAULT_BRIDGE_URL;
      autoPush = !!msg.autoPush;
      await Promise.all([
        figma.clientStorage.setAsync(CLIENT_STORAGE_KEYS.bridgeUrl, bridgeUrl),
        figma.clientStorage.setAsync(CLIENT_STORAGE_KEYS.autoPush, autoPush),
      ]);
      sendConfigToUI();
      const ok = await probeBridge(bridgeUrl);
      figma.ui.postMessage({ kind: 'probe-result', ok });
      break;
    case 'get-config':
      sendConfigToUI();
      break;
    case 'probe-bridge':
      const okProbe = await probeBridge(bridgeUrl);
      figma.ui.postMessage({ kind: 'probe-result', ok: okProbe });
      break;
    case 'fetch-node': {
      const result = await captureNode(msg.nodeId);
      const ok = await postNode(bridgeUrl, msg.requestId, msg.nodeId, result);
      figma.ui.postMessage({
        kind: 'fetch-node-result',
        requestId: msg.requestId,
        ok,
        error: ok ? undefined : 'failed to POST node to bridge',
      });
      break;
    }
  }
};

// --- Core: capture + POST ------------------------------------------------

async function pushNow(): Promise<void> {
  if (isCapturing) return;
  isCapturing = true;
  figma.ui.postMessage({ kind: 'capturing', isCapturing: true });
  try {
    const { payload, stats } = await captureSelection();
    if (payload.selection.length === 0) {
      figma.ui.postMessage({
        kind: 'push-result',
        ok: false,
        error: 'Nothing selected. Select a frame, component, or node in Figma first.',
      });
      return;
    }
    const result = await postSelection(bridgeUrl, payload);
    lastPushAt = Date.now();
    figma.ui.postMessage({
      kind: 'push-result',
      ok: result.ok,
      capturedAt: result.capturedAt ?? payload.capturedAt,
      stats,
      error: result.error,
      bridgeUrl,
    });
  } catch (err) {
    figma.ui.postMessage({
      kind: 'push-result',
      ok: false,
      error: String(err instanceof Error ? err.message : err),
    });
  } finally {
    isCapturing = false;
    figma.ui.postMessage({ kind: 'capturing', isCapturing: false });
  }
}

function sendConfigToUI(): void {
  figma.ui.postMessage({ kind: 'config', bridgeUrl, autoPush });
}
