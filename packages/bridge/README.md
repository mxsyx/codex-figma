# codex-figma-bridge

A local HTTP/MCP bridge for live queries against an open Figma file. Ask Codex:

> 实现 figma 节点「登录页」

The Figma plugin searches all pages by exact node name and returns current data. Duplicate names produce numbered screenshots and page/layer paths; Codex waits for the user's choice. Every subsequent read searches by name again, verifying the internal document/node choice. No node data, screenshots, selection state or completed responses are cached on disk or in a shared store.

## Run

Requires Node.js 20+. In the monorepo:

```bash
pnpm install
pnpm --filter @codex-figma/bridge build
pnpm --filter @codex-figma/bridge start
```

Normal users install only the [Codex plugin](../codex-plugin), which bundles the Bridge and all npm runtime dependencies and starts/reuses it through SessionStart. The commands above are for standalone Bridge development or manual MCP setups. A compiled bridge takes precedence over the source fallback; rebuild after source changes. Use `pnpm --filter @codex-figma/bridge dev` for development.

The Figma plugin must remain open and connected. Exactly one Figma plugin connection is required; multiple Codex sessions may share it.

## Configuration

| Variable | Default |
| --- | --- |
| `CODEX_FIGMA_BRIDGE_PORT` | `11111` |
| `CODEX_FIGMA_BRIDGE_HOST` | `127.0.0.1` |
| `CODEX_FIGMA_BRIDGE_LOG_LEVEL` | `info` |
| `CODEX_FIGMA_BRIDGE_LOG_DIR` | macOS: `~/Library/Logs/codex-figma-bridge`; Linux: `${XDG_STATE_HOME:-~/.local/state}/codex-figma-bridge` |

The directory contains operational `bridge.log` only. `CODEX_FIGMA_BRIDGE_ROOT` and the former design cache are no longer used. Old cache files are not automatically deleted.

Changing the host/port also requires updating the Codex MCP URL, Figma plugin URL and manifest network domains.

## HTTP protocol

| Endpoint | Purpose |
| --- | --- |
| `GET /health` | Service identity, `mode: live-name-query`, connected plugin count |
| `GET /events` | SSE requests to the Figma plugin |
| `POST /query/result` | Validated response to an outstanding name query |
| `POST /components` | Response to an outstanding component scan |
| `POST /design/result` | Result of requested one-click design generation |
| `/mcp` | Streamable HTTP MCP transport |

`POST /selection` and `POST /node` have been removed. Unsolicited or expired query/component responses return 409. No background push or selection resource exists.

A node call sends `node-query-request` with `requestId`, `operation`, `nodeName`, `offset`, `limit`, `depth` and optional `choice`, `format`, `collectionName`. The plugin loads all pages and scans names every time. Replies include document identity, `unique`/`ambiguous`/`not_found`/`stale_choice`/`error` status, candidates and operation-specific data. The bridge retains only the pending request until delivery or timeout (90 seconds for node queries).

## MCP tools

| Tool | Input / behavior |
| --- | --- |
| `resolve_node` | `nodeName`; previews for every exact match, paginated |
| `get_node` | `nodeName`, optional confirmed `choice`, `depth` (default 5, 0–20) |
| `get_screenshot` | `nodeName`, optional `choice`; fresh PNG |
| `get_asset` | `nodeName`, optional `choice`, `format` (`SVG` default, or `PNG`) |
| `get_variables` | `nodeName`, optional `choice`, `depth`, `collectionName` |
| `list_components` | `pageName`, optional substring `query`; live library metadata |
| `generate_design` | Structured `design`; waits for the plugin's Generate click |

Node reads accept `offset` (default 0) and `limit` (default/max 6) for ambiguous results. A `choice` is `{documentId, nodeId}` from a resolved/user-confirmed candidate; it never enables ID-only lookup. Ambiguity returns candidate previews without reading a full tree or arbitrary asset. Missing previews retain the candidate with an error. The implementation skill instructs Codex to gather all pages and wait for the user.

Read SVG exports are limited to vector-like nodes; use PNG for other nodes. Generation keeps its existing component identity fields for creating instances.

## Validate

```bash
pnpm --filter @codex-figma/bridge typecheck
pnpm --filter @codex-figma/bridge test
```

Tests cover all-page/hidden-node search, duplicate pagination, screenshots, stale choices, fresh reads, correlation cleanup, and an actual local HTTP/MCP/SSE round trip using a mocked Figma API. These tests do not replace a Figma Desktop acceptance check.

See the [repository README](../../README.md) for installation, upgrade and troubleshooting.
