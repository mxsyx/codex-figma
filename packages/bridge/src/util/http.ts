/** Small HTTP helpers — read JSON body, send JSON, send errors. No deps. */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { applyCorsHeaders } from './cors.js';

export async function readJsonBody<T = unknown>(req: IncomingMessage, limitBytes = 64 * 1024 * 1024): Promise<T> {
  // The Figma plugin can ship multi-megabyte screenshots (PNG of a full
  // frame at 2x), so the default cap is generous.
  const chunks: Buffer[] = [];
  let received = 0;
  for await (const chunk of req) {
    received += chunk.length;
    if (received > limitBytes) {
      throw new Error(`request body exceeds ${limitBytes} bytes`);
    }
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const text = Buffer.concat(chunks).toString('utf-8');
  if (text.length === 0) return {} as T;
  return JSON.parse(text) as T;
}

export function sendJson(res: ServerResponse, status: number, body: unknown): void {
  applyCorsHeaders(res);
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

export function sendError(res: ServerResponse, status: number, message: string, details?: unknown): void {
  sendJson(res, status, { error: message, details });
}

export function sendText(res: ServerResponse, status: number, body: string): void {
  applyCorsHeaders(res);
  res.statusCode = status;
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.end(body);
}
