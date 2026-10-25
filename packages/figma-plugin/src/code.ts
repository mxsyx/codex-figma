/** Live request handler. Node data exists only while serving the current request. */
import { queryNodes } from './query-nodes.js';
import { postQueryResult, postDesignResult, postComponents } from './bridge-client.js';
import { generateDesign } from './generate-design.js';
import { captureComponents } from './extract/components-page.js';
import type { UIToCodeMessage } from './messages.js';

const DEFAULT_BRIDGE_URL = 'http://localhost:11111';
const URL_KEY = 'codexFigmaBridge.url';
let bridgeUrl = DEFAULT_BRIDGE_URL;
figma.showUI(__html__, { width: 360, height: 400, themeColors: true });
const initialized = (async () => {
  const saved = await figma.clientStorage.getAsync(URL_KEY);
  if (typeof saved === 'string' && saved) bridgeUrl = saved;
})();
const sendConfig = () => figma.ui.postMessage({ kind: 'config', bridgeUrl });

figma.ui.onmessage = async (msg: UIToCodeMessage) => {
  await initialized;
  switch (msg.kind) {
    case 'get-config': sendConfig(); break;
    case 'set-config':
      bridgeUrl = msg.bridgeUrl || DEFAULT_BRIDGE_URL;
      await figma.clientStorage.setAsync(URL_KEY, bridgeUrl);
      sendConfig();
      break;
    case 'node-query': {
      const replyUrl = bridgeUrl;
      figma.ui.postMessage({ kind: 'query-status', requestId: msg.query.requestId, message: `Querying “${msg.query.nodeName}” across all pages…` });
      const result = await queryNodes(msg.query);
      const delivered = await postQueryResult(replyUrl, result);
      figma.ui.postMessage({ kind: 'query-status', requestId: msg.query.requestId,
        ok: delivered && result.status !== 'error',
        message: !delivered ? 'Query response was rejected or could not reach the bridge.'
          : result.error ?? `${result.total} matching node(s) · ${result.status}` });
      break;
    }
    case 'generate-design': {
      const replyUrl = bridgeUrl;
      try {
        const rootId = await generateDesign(msg.design);
        const posted = await postDesignResult(replyUrl, msg.requestId, { ok: true, rootId });
        figma.ui.postMessage({ kind: 'generate-design-result', requestId: msg.requestId,
          ok: posted, rootId, error: posted ? undefined : 'Design created, but the bridge could not be notified.' });
      } catch (err) {
        const error = String(err instanceof Error ? err.message : err);
        await postDesignResult(replyUrl, msg.requestId, { ok: false, error });
        figma.ui.postMessage({ kind: 'generate-design-result', requestId: msg.requestId, ok: false, error });
      }
      break;
    }
    case 'list-components': {
      const replyUrl = bridgeUrl;
      const result = await captureComponents(msg.requestId, msg.pageName, msg.query).catch((err) => ({
        requestId: msg.requestId, found: false, components: [], error: String(err),
      }));
      const posted = await postComponents(replyUrl, result);
      figma.ui.postMessage({ kind: 'components-result', requestId: msg.requestId,
        ok: posted && result.found, componentCount: result.components.length,
        error: posted ? result.error : 'Component response could not reach the bridge.' });
      break;
    }
  }
};
