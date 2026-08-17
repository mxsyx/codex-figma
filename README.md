# Codex Figma Bridge

Implement your **live Figma selection** as code in any local repository — no Figma URL, no cloud connector, no Dev Seat required.

A Figma Desktop plugin captures the user's current selection (node tree, styles, text, variables, components, screenshots, SVG icons) and ships it over HTTP to a **local bridge** running on `localhost:3845`. The bridge caches the context and exposes it to Codex CLI through an **MCP server**. Codex reads node info + screenshots and modifies the local repository, then runs lint / typecheck.

```
┌───────────────────────────────┐
│          Figma Desktop        │
│                               │
│   用户选中 Frame / Group       │
│              │                │
│              ▼                │
│       Figma Plugin            │
│   ┌───────────────────────┐   │
│   │ selection             │   │
│   │ node tree             │   │
│   │ CSS / Auto Layout     │   │
│   │ text                  │   │
│   │ variables             │   │
│   │ component info        │   │
│   │ screenshot / SVG      │   │
│   └──────────┬────────────┘   │
└──────────────┼────────────────┘
               │ HTTP (POST /selection + GET /events SSE)
               ▼
┌───────────────────────────────┐
│        Local Bridge           │
│      localhost:3845           │
│                               │
│   current-selection.json      │
│   images / screenshots        │
│   Figma context cache         │
│                               │
│   MCP Server (Streamable HTTP)│
│   ├─ get_selection            │
│   ├─ get_node                 │
│   ├─ get_screenshot           │
│   ├─ get_asset                │
│   ├─ list_nodes               │
│   └─ get_variables            │
└──────────────┬────────────────┘
               │ MCP (POST /mcp)
               ▼
┌───────────────────────────────┐
│         Codex CLI / IDE       │
│                               │
│  读取当前 repository          │
│  读取 AGENTS.md               │
│  调用 Figma MCP tools         │
│  修改 React / CSS / Tailwind  │
│  运行 lint / typecheck        │
└───────────────────────────────┘
```

## Repository layout

| Path                                                     | Component               | What it does                                                               |
| -------------------------------------------------------- | ----------------------- | -------------------------------------------------------------------------- |
| [`figma-plugin/`](packages/figma-plugin/)                         | Figma Desktop plugin    | Captures the live selection + ships it to the bridge.                      |
| [`bridge/`](packages/bridge/)                                     | Local HTTP + MCP server | Caches the selection on disk; exposes MCP tools to Codex.                  |
| [`codex-plugin/`](packages/codex-plugin/)                         | Codex CLI plugin        | Skill + command + agents that teach Codex how to use the local MCP tools.  |
| [`2.0.17/`](2.0.17/)                                     | Reference (read-only)   | Figma's official Codex plugin (cloud-connector variant) for comparison.    |
| [`AGENTS.md.template`](AGENTS.md.template)               | Drop-in rules           | Copy into your target repo to guide Codex when implementing Figma designs. |
| [`codex-config.snippet.toml`](codex-config.snippet.toml) | Codex config            | MCP server snippet for `~/.codex/config.toml`.                             |

## Prerequisites

- **Node.js ≥ 20** (tested on Node 22)
- **Figma Desktop** (the plugin API only runs in the desktop app, not the browser)
- **Codex CLI** with MCP support

## Setup (3 steps)

### 1. Start the bridge

```bash
pnpm install        # root-level: installs all workspace packages (bridge + figma-plugin + codex-plugin)
pnpm start          # = pnpm --filter @codex-figma/bridge run start
```

You should see:

```
codex-figma-bridge v0.1.0 listening on http://127.0.0.1:3845
  cache: ~/Library/Caches/codex-figma-bridge
  mcp:   http://127.0.0.1:3845/mcp
```

Smoke-test it:

```bash
curl http://localhost:3845/health
# → {"ok":true,"version":"0.1.0","capturedAt":null,"selectionCount":0,...}
```

### 2. Install the Figma plugin

1. `cd figma-plugin && npm install && npm run build`
2. Open Figma Desktop → **Menu → Plugins → Development → New Plugin…**
3. Click **"Click to link a plugin from your file system"**
4. Select [`figma-plugin/manifest.json`](packages/figma-plugin/manifest.json).
5. Run the plugin from the menu (Menu → Plugins → Development → Codex Figma Bridge).
6. In the plugin panel:
   - Confirm the bridge URL is `http://localhost:3845`.
   - The status pill should say **"bridge up"**.
   - Toggle **Auto-push on selection change** on.
7. Select a frame in Figma. The panel should flash "just now · 1 selected · N nodes · 1 screenshot · M icons".

Verify on disk:

```bash
cat ~/Library/Caches/codex-figma-bridge/current-selection.json
```

### 3. Configure Codex CLI

Append the snippet from [`codex-config.snippet.toml`](codex-config.snippet.toml) to `~/.codex/config.toml`:

```toml
[mcp_servers.codex-figma-bridge]
type = "http"
url = "http://localhost:3845/mcp"
```

Install the Codex plugin (optional — gives Codex the skill + slash command):

```bash
codex plugin install ./codex-plugin
```

If you skip the plugin install, copy [`AGENTS.md.template`](AGENTS.md.template) into your target repo as `AGENTS.md` so Codex still learns the workflow.

## Usage

In any target repository, with the bridge running and a frame selected in Figma:

```bash
codex "implement my current Figma selection as a React component"
```

Or with the plugin installed:

```
/implement-from-figma
```

Codex will:

1. Call `get_selection` → see what you've selected.
2. Call `get_node` → read the full node tree (layout, styles, text, variables, components).
3. Call `get_screenshot` → fetch the visual reference.
4. Call `get_asset` for each icon → fetch SVG bytes and commit them.
5. Adapt the design to your project's stack (reuse existing components + tokens).
6. Run lint / typecheck / preview and report parity.

## MCP tools

| Tool             | Input                                                                 | Returns                                         |
| ---------------- | --------------------------------------------------------------------- | ----------------------------------------------- |
| `get_selection`  | (none)                                                                | File/page/selection summary. Always call first. |
| `get_node`       | `{ nodeId, depth?, includeStyles?, includeVariables?, includeText? }` | Serialized node tree.                           |
| `get_screenshot` | `{ nodeId, format? }`                                                 | PNG image content (base64).                     |
| `get_asset`      | `{ nodeId, format? }`                                                 | SVG (preferred for icons) or PNG image content. |
| `list_nodes`     | `{ type?, name? }`                                                    | Search hits across cached trees.                |
| `get_variables`  | `{ collectionName? }`                                                 | Design-token bindings.                          |

Plus the MCP resource `figma://selection/current`.

## Cache layout

The bridge writes to `~/Library/Caches/codex-figma-bridge/` (macOS) or `~/.cache/codex-figma-bridge/` (Linux). Override with `CODEX_FIGMA_BRIDGE_ROOT`.

```
codex-figma-bridge/
├── current-selection.json    # latest selection summary
├── nodes/<id>.json           # one file per captured node tree root
├── assets/<id>.png           # PNG screenshots
├── assets/<id>.svg           # SVG icons
├── events.jsonl              # append-only event log
└── bridge.log                # structured logs
```

## Configuration

| Env var                        | Default                             | What it does                            |
| ------------------------------ | ----------------------------------- | --------------------------------------- |
| `CODEX_FIGMA_BRIDGE_PORT`      | `3845`                              | Port the bridge listens on.             |
| `CODEX_FIGMA_BRIDGE_HOST`      | `127.0.0.1`                         | Host the bridge binds to.               |
| `CODEX_FIGMA_BRIDGE_ROOT`      | OS cache dir + `codex-figma-bridge` | Where the cache lives.                  |
| `CODEX_FIGMA_BRIDGE_LOG_LEVEL` | `info`                              | `debug` \| `info` \| `warn` \| `error`. |

If you change the port, also update [`figma-plugin/manifest.json`](packages/figma-plugin/manifest.json)'s `networkAccess.allowedDomains` and [`codex-config.snippet.toml`](codex-config.snippet.toml).

## How it differs from Figma's official Codex plugin

The reference plugin at [`2.0.17/`](2.0.17/) uses Figma's **cloud MCP connector** (declared in [`.app.json`](2.0.17/.app.json)) and operates on a Figma URL. That requires a Figma Dev Seat and a cloud relay.

This project uses a **local bridge** instead:

- No cloud connector — the Figma plugin talks HTTP to a localhost server.
- No Figma URL — the agent sees the user's live selection.
- No Dev Seat — works with any Figma account that can run plugins.
- Read-only — the bridge cannot write back to Figma. Use Figma's cloud connector for that direction.

## Development

Run from the repo root (pnpm workspace aggregates sub-package scripts):

```bash
pnpm dev                                          # = pnpm --filter @codex-figma/bridge run dev (tsx watch)
pnpm --filter @codex-figma/figma-plugin run watch  # esbuild watch — rebuild on file change
```

Typecheck everything:

```bash
pnpm -r run typecheck
```

## Troubleshooting & debugging

The system has three layers — debug them in order, from the easiest (bridge) outward.

> **Monorepo note**: This is a pnpm workspace. Run all commands from the repo root via `pnpm -r run <script>` (all packages) or `pnpm --filter <pkg> run <script>` (one package). Running `npm run <script>` inside a sub-package directory won't work — shared devDependencies (`typescript`, `@types/node`) live at the root and aren't visible from a sub-package's `node_modules`.

### 1. Bridge (localhost)

The bridge is a plain HTTP server, so it's the easiest layer to inspect.

```bash
# Start with debug logging (structured JSONL → stderr + bridge.log)
cd bridge
CODEX_FIGMA_BRIDGE_LOG_LEVEL=debug npm run dev

# Tail the structured log
tail -f ~/Library/Caches/codex-figma-bridge/bridge.log

# Liveness + cache state
curl http://127.0.0.1:3845/health

# Watch SSE events live (selection-change broadcasts)
curl -N http://127.0.0.1:3845/events

# Inspect the raw cached payload
cat ~/Library/Caches/codex-figma-bridge/current-selection.json | jq .
```

**MCP Inspector** — the official GUI and the single best debugging tool. It visualizes `tools/list`, lets you call any tool, and shows raw JSON-RPC traffic:

```bash
npx @modelcontextprotocol/inspector
```

In the UI pick transport `Streamable HTTP`, URL `http://127.0.0.1:3845/mcp`, connect. You should see all 6 tools and be able to call `get_selection` manually — this bypasses both Figma and Codex, isolating the bridge.

### 2. Figma plugin (runs inside Figma's sandbox)

The plugin runs in two contexts; each has its own console.

| Context          | File                                  | Where its `console.log` lands                                     |
| ---------------- | ------------------------------------- | ----------------------------------------------------------------- |
| Sandbox (no DOM) | [`code.ts`](packages/figma-plugin/src/code.ts) | Figma's main Dev Console                                          |
| UI iframe        | [`ui.ts`](packages/figma-plugin/src/ui/ui.ts)  | Iframe console — pick it from the dropdown at the top of DevTools |

Open the console: Figma Desktop → **Plugins → Development → &lt;plugin&gt;** to run it, then **Menu → Plugins → Development → Open Console** (or `Cmd+Opt+I` on macOS).

Common issues:

- **Manifest import error: `Invalid value for allowedDomains. '...' must be a valid URL`** — Figma's URL validator rejects IP literals like `http://127.0.0.1:3845`. Use the `localhost` hostname instead: `http://localhost:3845`. All entries in `allowedDomains` must use `localhost`, never `127.0.0.1`.
- **`fetch failed` / CORS errors** — [`manifest.json`](packages/figma-plugin/manifest.json)'s `networkAccess.allowedDomains` must include your bridge URL (default `http://localhost:3845`). If you changed the bridge port, update this too — and keep the `localhost` hostname (see above).
- **`ReferenceError: 'AbortController' is not defined`** — the Figma plugin sandbox (where [`code.ts`](packages/figma-plugin/src/code.ts) runs) is a minimal QuickJS environment and doesn't expose `AbortController`. Use `Promise.race` + `setTimeout` for fetch timeouts instead. [`bridge-client.ts`](packages/figma-plugin/src/bridge-client.ts) already does this — if you add new sandbox-side network code, follow the same pattern. (Browser-only globals like `XMLHttpRequest`, `FormData`, `localStorage` are also absent from the sandbox; UI-side code in [`ui.ts`](packages/figma-plugin/src/ui/ui.ts) runs in a real iframe and can use them freely.)
- **"bridge down" pill stays red** — bridge isn't running, or port mismatch. Click **Probe** to re-check.
- **No `selection stored` in the bridge log after selecting a node** — the plugin only fires on real node selection, not empty-canvas clicks. Select a Frame/Component/layer in the layers panel, then **Push now**.
- **Push succeeds but `selectionCount: 0`** — selection was empty at push time. Re-select and push again.

### 3. Codex CLI (the consumer)

Codex is mostly a black box, but the bridge log tells you exactly what it's doing:

```bash
# After asking Codex to implement, filter for MCP activity
tail -f ~/Library/Caches/codex-figma-bridge/bridge.log | grep mcp
```

You should see, in order:

1. `mcp session initialized` — Codex connected.
2. `tools/call get_selection` — Codex queried the selection.
3. More `tools/call` lines as it walks the tree.

If you don't see `mcp session initialized`:

- Confirm [`codex-config.snippet.toml`](codex-config.snippet.toml) was merged into your Codex config.
- Run `codex mcp list` (or equivalent) to verify the server is registered.
- Check the bridge URL in the config matches the bridge's actual port.

If Codex connects but never calls tools:

- Make sure `AGENTS.md` (copied from [`AGENTS.md.template`](AGENTS.md.template)) is in the target repo's root — that's what teaches Codex the workflow.
- Or invoke the skill explicitly: `/implement-from-figma`.

### End-to-end smoke test (no Figma, no Codex)

The fastest way to verify the whole chain without opening Figma or Codex:

```bash
# 1. Bridge up on a throwaway port
CODEX_FIGMA_BRIDGE_PORT=3951 pnpm --filter @codex-figma/bridge run start &

# 2. Inject a fake selection (bypasses the Figma plugin)
curl -X POST http://127.0.0.1:3951/selection \
  -H 'content-type: application/json' \
  --data '{"fileKey":"test","fileName":"t","pageId":"0:1","pageName":"p","capturedAt":"2026-08-17T00:00:00Z","pluginVersion":"0.1.0","selection":[],"nodes":{},"assets":{}}'

# 3. Confirm the bridge saw it (selectionCount should be non-zero)
curl http://127.0.0.1:3951/health

# 4. Point MCP Inspector at http://127.0.0.1:3951/mcp and call get_selection
```

Recommended order: **Bridge (curl + Inspector) → +Figma (DevTools console) → +Codex (bridge.log grep mcp)**. Confirm each layer independently before stacking the next, so you can pinpoint which link broke.

## License

MIT. See [`LICENSE`](LICENSE) (or each package's `package.json`).
