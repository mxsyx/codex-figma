import type { IncomingMessage, ServerResponse } from 'node:http';
import type { PendingQueryRegistry } from '../store/pending-query.js';
import { nodeQueryResultSchema } from '../store/schema.js';
import { readJsonBody, sendError, sendJson } from '../util/http.js';

export async function handleQueryResult(req: IncomingMessage, res: ServerResponse, pending: PendingQueryRegistry): Promise<void> {
  let raw: unknown;
  try { raw = await readJsonBody(req); }
  catch (err) { sendError(res, 400, 'invalid query response', String(err)); return; }
  const parsed = nodeQueryResultSchema.safeParse(raw);
  if (!parsed.success) { sendError(res, 422, 'query response failed validation', parsed.error.issues); return; }
  if (!pending.resolve(parsed.data)) {
    sendError(res, 409, 'No matching live request; expired or unsolicited results are discarded.');
    return;
  }
  sendJson(res, 200, { ok: true });
}
