# Codex Figma Bridge — Local Bridge

Always-on HTTP server + MCP server that sits between the Figma plugin and Codex CLI.

```
Figma Plugin ──POST /selection──▶ Bridge ──MCP (POST /mcp)──▶ Codex CLI
                                  │
                                  └── caches to disk:
                                      current-selection.json
                                      nodes/<id>.json
                                      assets/<id>.{png,svg}
```

## Run

```bash
npm install
npm start
```

Dev mode (hot reload):

```bash
npm run dev
```

## HTTP endpoints

| Method + path | Purpose |
|---------------|---------|
| `GET /health` | Liveness + cache state. Returns `{ ok, version, capturedAt, fileKey, pageName, selectionCount, rootCount }`. |
| `POST /selection` | Receive a captured selection from the Figma plugin. Body validated against the zod schema in `src/store/schema.ts`. |
| `GET /events` | Server-Sent Events stream of `selection-change` events. Useful for a future live-preview UI. |
| `POST /mcp` | MCP Streamable HTTP — JSON-RPC requests (initialize, tools/call, etc.). |
| `GET /mcp` | MCP SSE stream for server-initiated notifications (requires `mcp-session-id` header). |
| `DELETE /mcp` | Close an MCP session. |

## MCP tools

| Tool | Input | Output |
|------|-------|--------|
| `get_selection` | (none) | Latest selection summary. |
| `get_node` | `{ nodeId, depth?, includeStyles?, includeVariables?, includeText? }` | Serialized node tree. |
| `get_screenshot` | `{ nodeId, format? }` | PNG image content. |
| `get_asset` | `{ nodeId, format? }` | SVG (preferred) or PNG image content. |
| `list_nodes` | `{ type?, name? }` | Search hits. |
| `get_variables` | `{ collectionName? }` | Bound variable rows. |

Plus the MCP resource `figma://selection/current`.

## Configuration

| Env var | Default | Notes |
|---------|---------|-------|
| `CODEX_FIGMA_BRIDGE_PORT` | `3845` | Port to listen on. |
| `CODEX_FIGMA_BRIDGE_HOST` | `127.0.0.1` | Bind address. |
| `CODEX_FIGMA_BRIDGE_ROOT` | OS cache dir + `codex-figma-bridge` | Cache directory. |
| `CODEX_FIGMA_BRIDGE_LOG_LEVEL` | `info` | `debug` / `info` / `warn` / `error`. |

## Architecture

The bridge is a thin Node.js `http` server with no external HTTP framework. State lives in three places:

- **`ContextStore`** (`src/store/context-store.ts`) — in-memory mirror of the latest payload, with on-disk persistence under `<root>/`. The single source of truth for MCP tool reads.
- **`SseBroadcaster`** (`src/util/sse.ts`) — fan-out for `selection-change` events.
- **`McpRouteHandler`** (`src/routes/mcp.ts`) — per-session map of `(sessionId → { transport, server })` for stateful MCP. The same `ContextStore` is shared across all sessions.

MCP transport is **Streamable HTTP** (stateful). Each Codex client gets one session id via the `mcp-session-id` header; the session lives until the client sends `DELETE /mcp` or the bridge restarts.

## Testing

Smoke-test the bridge:

```bash
npm start &
sleep 1
curl http://localhost:3845/health
# → {"ok":true,"version":"0.1.0","capturedAt":null,...}
```

Inspect with the MCP Inspector:

```bash
npx @modelcontextprotocol/inspector http://localhost:3845/mcp
```
