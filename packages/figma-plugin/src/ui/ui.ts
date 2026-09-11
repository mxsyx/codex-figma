/**
 * Iframe UI script. Talks to the sandbox (code.ts) via postMessage; never
 * touches the figma global directly.
 *
 * Responsibilities:
 *   - Render config (bridge URL, auto-push toggle) and forward changes to code.
 *   - Trigger manual pushes ("Push now").
 *   - Mirror push results + bridge reachability to the user.
 */
import type { CodeToUIMessage, UIToCodeMessage } from '../messages.js';

// --- DOM handles ---------------------------------------------------------

const $ = (id: string) => document.getElementById(id) as HTMLElement;
const urlInput = $('bridge-url') as HTMLInputElement;
const autoPushToggle = $('auto-push-toggle');
const pushBtn = $('push-btn') as HTMLButtonElement;
const probeBtn = $('probe-btn') as HTMLButtonElement;
const statusPill = $('status-pill');
const statusText = $('status-text');
const lastPushBlock = $('last-push');
const pushTime = $('push-time');
const pushStats = $('push-stats');
const errorBox = $('error');
const componentsStatus = $('components-status');
const designRequest = $('design-request');
const designMeta = $('design-meta');
const generateDesignBtn = $('generate-design-btn') as HTMLButtonElement;

// --- Outbound message helper ---------------------------------------------

function sendToCode(msg: UIToCodeMessage): void {
  parent.postMessage({ pluginMessage: msg }, '*');
}

// --- SSE: listen for bridge → plugin commands (e.g. on-demand node fetch) ---

let eventSource: EventSource | null = null;
let pendingDesign: { requestId: string; design: import('../types.js').GeneratedDesign } | null = null;

function connectEvents(bridgeUrl: string): void {
  eventSource?.close();
  try {
    const base = bridgeUrl.replace(/\/+$/, '');
    eventSource = new EventSource(`${base}/events`);
    eventSource.addEventListener('fetch-node-request', (e) => {
      try {
        const data = JSON.parse((e as MessageEvent).data) as { requestId: string; nodeId: string };
        sendToCode({ kind: 'fetch-node', requestId: data.requestId, nodeId: data.nodeId });
      } catch {
        // Malformed event payload — ignore.
      }
    });
    eventSource.addEventListener('generate-design-request', (e) => {
      try {
        const data = JSON.parse((e as MessageEvent).data) as {
          requestId: string;
          design: import('../types.js').GeneratedDesign;
        };
        pendingDesign = { requestId: data.requestId, design: data.design };
        designMeta.textContent =
          `${data.design.name} · ${data.design.width}×${data.design.height} · ` +
          `${data.design.groups.length} business group${data.design.groups.length === 1 ? '' : 's'}`;
        designRequest.style.display = 'block';
        generateDesignBtn.disabled = false;
        generateDesignBtn.textContent = 'Generate design';
      } catch {
        // Malformed event payload — ignore.
      }
    });
    eventSource.addEventListener('list-components-request', (e) => {
      try {
        const data = JSON.parse((e as MessageEvent).data) as {
          requestId: string;
          pageName: string;
          query?: string;
        };
        componentsStatus.style.display = 'block';
        componentsStatus.textContent = `Scanning components on ${data.pageName}…`;
        sendToCode({ ...data, kind: 'list-components' });
      } catch {
        // Malformed event payload — ignore.
      }
    });
    // EventSource auto-reconnects on error; no manual retry needed.
  } catch {
    // EventSource unavailable or invalid URL — on-demand fetch won't work.
  }
}

// --- Event wiring --------------------------------------------------------

urlInput.addEventListener('change', () => {
  sendToCode({ kind: 'set-config', bridgeUrl: urlInput.value.trim(), autoPush: isAutoPushOn() });
});

autoPushToggle.addEventListener('click', () => {
  autoPushToggle.classList.toggle('on');
  sendToCode({ kind: 'set-config', bridgeUrl: urlInput.value.trim(), autoPush: isAutoPushOn() });
});

pushBtn.addEventListener('click', () => sendToCode({ kind: 'push-now' }));
probeBtn.addEventListener('click', () => sendToCode({ kind: 'probe-bridge' }));
generateDesignBtn.addEventListener('click', () => {
  if (!pendingDesign) return;
  generateDesignBtn.disabled = true;
  generateDesignBtn.innerHTML = '<span class="spinner"></span> Generating…';
  sendToCode({
    kind: 'generate-design',
    requestId: pendingDesign.requestId,
    design: pendingDesign.design,
  });
});

// --- Inbound message handler ---------------------------------------------

window.onmessage = (event: MessageEvent) => {
  const msg = (event.data.pluginMessage ?? undefined) as CodeToUIMessage | undefined;
  if (!msg) return;
  switch (msg.kind) {
    case 'config':
      urlInput.value = msg.bridgeUrl;
      setAutoPushOn(msg.autoPush);
      connectEvents(msg.bridgeUrl);
      break;
    case 'capturing':
      pushBtn.disabled = msg.isCapturing;
      pushBtn.innerHTML = msg.isCapturing
        ? '<span class="spinner"></span> Pushing…'
        : 'Push now';
      break;
    case 'push-result':
      renderPushResult(msg);
      break;
    case 'generate-design-result':
      if (msg.ok) {
        generateDesignBtn.textContent = 'Design generated';
        errorBox.style.display = 'none';
      } else {
        generateDesignBtn.disabled = false;
        generateDesignBtn.textContent = 'Retry generate';
        errorBox.style.display = 'block';
        errorBox.textContent = msg.error ?? 'unknown design generation error';
      }
      break;
    case 'components-result':
      componentsStatus.textContent = msg.ok
        ? `${msg.componentCount ?? 0} components cached from Figma`
        : (msg.error ?? 'component scan failed');
      break;
    case 'probe-result':
      renderStatusPill(msg.ok);
      break;
  }
};

// Request the current config from the sandbox on load.
sendToCode({ kind: 'get-config' });
sendToCode({ kind: 'probe-bridge' });

// --- Render helpers ------------------------------------------------------

function isAutoPushOn(): boolean {
  return autoPushToggle.classList.contains('on');
}

function setAutoPushOn(on: boolean): void {
  if (on) autoPushToggle.classList.add('on');
  else autoPushToggle.classList.remove('on');
}

function renderStatusPill(connected: boolean): void {
  if (connected) {
    statusPill.className = 'pill good';
    statusText.textContent = 'bridge up';
  } else {
    statusPill.className = 'pill bad';
    statusText.textContent = 'bridge down';
  }
}

function renderPushResult(msg: Extract<CodeToUIMessage, { kind: 'push-result' }>): void {
  if (msg.ok) {
    errorBox.style.display = 'none';
    errorBox.textContent = '';
    lastPushBlock.style.display = 'block';
    const date = new Date(msg.capturedAt ?? Date.now());
    pushTime.dataset.ts = String(date.getTime());
    pushTime.textContent = formatRelative(date);
    if (msg.stats) {
      const s = msg.stats;
      pushStats.textContent =
        `${s.selectionCount} selected · ${s.nodeCount} nodes · ` +
        `${s.pngCount} screenshot${s.pngCount === 1 ? '' : 's'} · ` +
        `${s.svgCount} icon${s.svgCount === 1 ? '' : 's'}` +
        (s.svgSkipped > 0 ? ` · ${s.svgSkipped} icons skipped (cap)` : '');
    }
    return;
  }
  errorBox.style.display = 'block';
  errorBox.textContent = msg.error ?? 'unknown error';
}

function formatRelative(d: Date): string {
  const diffMs = Date.now() - d.getTime();
  if (diffMs < 5_000) return 'just now';
  const sec = Math.floor(diffMs / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  return `${hr}h ago`;
}

// Refresh the "Xs ago" label every 5s while the panel is open.
setInterval(() => {
  if (lastPushBlock.style.display === 'block' && pushTime.textContent) {
    const ts = pushTime.dataset.ts;
    if (ts) pushTime.textContent = formatRelative(new Date(Number(ts)));
  }
}, 5000);
