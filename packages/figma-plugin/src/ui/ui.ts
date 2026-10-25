/** Connection UI and relay for live bridge requests. */
import type { CodeToUIMessage, UIToCodeMessage } from '../messages.js';
import type { GeneratedDesign, NodeQuery } from '../types.js';
const $ = (id: string) => document.getElementById(id) as HTMLElement;
const urlInput = $('bridge-url') as HTMLInputElement;
const statusPill = $('status-pill');
const statusText = $('status-text');
const queryStatus = $('query-status');
const errorBox = $('error');
const designRequest = $('design-request');
const designMeta = $('design-meta');
const generateBtn = $('generate-design-btn') as HTMLButtonElement;
let events: EventSource | null = null;
let pendingDesign: { requestId: string; design: GeneratedDesign } | null = null;
let currentRequestId: string | null = null;
const send = (msg: UIToCodeMessage) => parent.postMessage({ pluginMessage: msg }, '*');

function connect(bridgeUrl: string) {
  events?.close();
  pendingDesign = null;
  designRequest.style.display = 'none';
  statusText.textContent = 'connecting…';
  statusPill.className = 'pill';
  try {
    events = new EventSource(`${bridgeUrl.replace(/\/+$/, '')}/events`);
    events.onopen = () => { statusText.textContent = 'bridge up'; statusPill.className = 'pill good'; };
    events.onerror = () => { statusText.textContent = 'reconnecting…'; statusPill.className = 'pill'; };
    events.addEventListener('node-query-request', (event) => {
      try {
        const query = JSON.parse((event as MessageEvent).data) as NodeQuery;
        send({ kind: 'node-query', query });
      } catch { errorBox.textContent = 'Invalid query request'; errorBox.style.display = 'block'; }
    });
    events.addEventListener('list-components-request', (event) => {
      try {
        const data = JSON.parse((event as MessageEvent).data) as { requestId: string; pageName: string; query?: string };
        queryStatus.textContent = `Reading components on ${data.pageName}…`;
        send({ kind: 'list-components', ...data });
      } catch { /* Ignore malformed request. */ }
    });
    events.addEventListener('generate-design-request', (event) => {
      try {
        pendingDesign = JSON.parse((event as MessageEvent).data);
        if (!pendingDesign) return;
        const { design } = pendingDesign;
        designMeta.textContent = `${design.name} · ${design.width} × ${design.height}`;
        designRequest.style.display = 'block';
        generateBtn.disabled = false;
        generateBtn.textContent = 'Generate design';
      } catch { /* Ignore malformed request. */ }
    });
  } catch { statusText.textContent = 'invalid bridge URL'; }
}

urlInput.addEventListener('change', () => send({ kind: 'set-config', bridgeUrl: urlInput.value.trim() }));
$('reconnect-btn').addEventListener('click', () => connect(urlInput.value.trim()));
generateBtn.addEventListener('click', () => {
  if (!pendingDesign) return;
  generateBtn.disabled = true;
  generateBtn.textContent = 'Generating…';
  send({ kind: 'generate-design', ...pendingDesign });
});
window.onmessage = (event: MessageEvent) => {
  const msg = event.data?.pluginMessage as CodeToUIMessage | undefined;
  if (!msg) return;
  if (msg.kind === 'config') { urlInput.value = msg.bridgeUrl; connect(msg.bridgeUrl); }
  if (msg.kind === 'query-status') {
    if (msg.ok === undefined) currentRequestId = msg.requestId;
    if (currentRequestId === msg.requestId) queryStatus.textContent = msg.message;
    if (msg.ok === false) { errorBox.textContent = msg.message; errorBox.style.display = 'block'; }
    else errorBox.style.display = 'none';
  }
  if (msg.kind === 'components-result') {
    queryStatus.textContent = msg.ok ? `${msg.componentCount} components returned` : msg.error ?? 'Component query failed';
  }
  if (msg.kind === 'generate-design-result') {
    if (pendingDesign?.requestId !== msg.requestId) return;
    pendingDesign = null;
    generateBtn.textContent = msg.ok ? 'Design generated' : 'Generation failed';
    if (!msg.ok) { errorBox.textContent = msg.error ?? 'Generation failed'; errorBox.style.display = 'block'; }
  }
};
send({ kind: 'get-config' });
