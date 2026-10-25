# Codex Figma Bridge

[简体中文](README.zh-CN.md)

Implement a Figma design by its name:

> 实现 figma 节点「登录页」
>
> Implement the Figma node “Login page”.

Keep the plugin open in the target Figma file. Every read searches **all pages of that file** by exact node name, including hidden and unselected nodes. No selection, node ID in the prompt, or Push button is needed. The scope is the connected file, not every file in a team project.

When several nodes share the name, Codex shows numbered screenshots with page/layer paths and dimensions, then waits for your choice. The chosen document/node identity is carried internally; subsequent reads still search by name. Renaming/deleting the node or restarting the plugin invalidates the old choice.

## How it works

```text
Codex → MCP (nodeName) → Bridge → SSE → Figma plugin
Codex ← live node/image ← Bridge ← request response ← full-file search
```

There is no Push, selection sync, design cache or stored node index. The bridge retains connections and pending requests only, plus operational logs. Completed results are released. Disconnected plugins and timed-out queries report errors instead of returning old designs. Data already received in the Codex conversation remains conversation context; each tool call queries Figma afresh.

Design generation is also supported: Codex sends `generate_design`, and you click **Generate design** in Figma. `list_components` reads a named component library page live for workflows such as Polaris reuse.

## Install

Requires Node.js 20+, pnpm and Figma Desktop. From the repository root:

```bash
pnpm install
pnpm build
npm install -g ./packages/bridge
codex plugin marketplace add .
codex plugin add codex-figma-bridge@codex-figma
```

In Figma's development plugins menu, choose **Import plugin from manifest…** and import `packages/figma-plugin/manifest.json`. Run **Codex Figma Bridge** in the target file with `http://localhost:11111` as its Bridge URL.

The Codex plugin supplies MCP configuration and a SessionStart hook. Review/trust it through Codex `/hooks`; new sessions then start the background bridge or reuse an existing compatible instance. The bridge remains running between sessions. The hook never downloads dependencies or kills another service occupying the port.

If the installed plugin cannot locate the bridge, export its entry path before starting Codex:

```bash
export CODEX_FIGMA_BRIDGE_ENTRY=/absolute/path/to/codex-figma/packages/bridge/bin/codex-figma-bridge.mjs
```

For manual setup without the Codex plugin, see [the MCP configuration snippet](codex-config.snippet.toml) and [AGENTS template](AGENTS.md.template), then run `pnpm start`.

## Use

1. Keep one Figma plugin connected in the target file; wait for `bridge up`.
2. Ask Codex to implement a node by name.
3. If names repeat, inspect the screenshots and reply with a candidate number.
4. Codex reads the chosen node's current design and implements it.

Names match exactly and case-sensitively. Candidates are paginated in batches of up to six; Codex must collect all pages before asking. Failed screenshots do not remove candidates: their path, dimensions and export error remain available. Multiple connected plugins are rejected to avoid reading the wrong file.

## MCP tools

| Tool | Purpose |
| --- | --- |
| `resolve_node` | Search all pages by `nodeName`, returning candidates and previews |
| `get_node` | Read the current node tree by name; depth defaults to 5, range 0–20 |
| `get_screenshot` | Export a fresh PNG by name |
| `get_asset` | Export SVG for vector nodes, or PNG, by name |
| `get_variables` | Read current variable bindings in a named subtree |
| `list_components` | Read component metadata on a named library page |
| `generate_design` | Send a design for one-click creation in Figma |

All node reads require `nodeName`. The optional `choice` is an internal disambiguator, not a prompt parameter. Removed APIs: `get_selection`, `list_nodes`, `figma://selection/current`, `POST /selection`, and `POST /node`.

## Upgrade and development

This is a breaking read-protocol update. Update all three packages together. Stop the old bridge before restarting: the new hook refuses to reuse the old cache-based protocol.

```bash
pnpm --filter @codex-figma/bridge run clean
pnpm build
pnpm -r run typecheck
pnpm --filter @codex-figma/bridge test
node --test packages/codex-plugin/tests/session-start.test.mjs
```

Update the global bridge install or the build selected by `CODEX_FIGMA_BRIDGE_ENTRY`, refresh/reinstall the cached Codex plugin, then reopen Figma's plugin and a Codex session. Old cache files are neither read nor written; upgrading does not delete historical files.

Use `pnpm dev` for the bridge watcher and `pnpm --filter @codex-figma/figma-plugin watch` for plugin builds. A foreground watcher and background bridge cannot both listen on the same port.

The default port is **11111**. If changing `CODEX_FIGMA_BRIDGE_PORT` or `CODEX_FIGMA_BRIDGE_HOST`, update `.mcp.json`, the Figma Bridge URL and manifest network domains together. Saved Figma URLs survive upgrades and may need changing manually.

## Troubleshooting

`curl http://localhost:11111/health` should report `service: "codex-figma-bridge"`, `mode: "live-name-query"` and `connectedPlugins`. Exactly one plugin must be connected for reads.

- `EADDRINUSE`: stop the conflicting process or update all port settings.
- `reconnecting…`: check the server and URL, then click **Reconnect**.
- Node not found: check the full layer name and target file, not the selection.
- Large-file timeout: keep the plugin open and retry; no stale data is returned.
- Push controls still visible: rebuild and reopen the Figma plugin.

Logs default to `~/Library/Logs/codex-figma-bridge/bridge.log` on macOS or `${XDG_STATE_HOME:-~/.local/state}/codex-figma-bridge/bridge.log` on Linux. Override with `CODEX_FIGMA_BRIDGE_LOG_DIR`. The hook writes `startup.log` to `PLUGIN_DATA`, falling back to the default log directory.

Packages: [Bridge](packages/bridge), [Figma plugin](packages/figma-plugin), [Codex plugin](packages/codex-plugin). `2.0.17/` is a historical reference plugin and is not part of this build.

MIT — see [LICENSE](LICENSE).
