/**
 * Permissive CORS for the Figma plugin iframe + MCP clients running on
 * localhost. The bridge is intentionally local-only; tightening the origin
 * is a future concern.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';

export const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers':
    'Content-Type, Accept, mcp-session-id, last-event-id, mcp-protocol-version',
  'Access-Control-Expose-Headers': 'mcp-session-id, mcp-protocol-version',
  'Access-Control-Max-Age': '86400',
} as const;

export function applyCorsHeaders(res: ServerResponse): void {
  for (const [k, v] of Object.entries(CORS_HEADERS)) {
    res.setHeader(k, v);
  }
}

export function isPreflight(req: IncomingMessage): boolean {
  return req.method === 'OPTIONS';
}

export function handlePreflight(_req: IncomingMessage, res: ServerResponse): void {
  applyCorsHeaders(res);
  res.statusCode = 204;
  res.end();
}
