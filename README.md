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

The Codex plugin ships the Bridge and all runtime dependencies. **No separate npm installation or checkout path is required.** Node.js 20+ must be available, and the companion Figma plugin must remain open.

If the marketplace is already registered, install `codex-figma-bridge@codex-figma`. For a local marketplace, run from the repository root:

```bash
codex plugin marketplace add .
codex plugin add codex-figma-bridge@codex-figma
```

Starting with Codex plugin 0.5.0, the Figma companion ZIP is included too. Ask the Agent:

> Help me install the Figma plugin. Give me the ZIP and installation instructions.

The Agent provides the actual ZIP and tutorial links. You can also get the [Figma plugin ZIP](packages/codex-plugin/assets/figma-plugin/codex-figma-plugin.zip) and [full installation guide](packages/codex-plugin/assets/figma-plugin/INSTALL.md) here.

1. Save the ZIP locally and fully extract it into a permanent directory.
2. In Figma Desktop, use **Plugins → Development → Import new plugin from manifest…** and select the extracted `codex-figma-plugin/manifest.json`.
3. Run **Codex Figma Bridge**, use `http://localhost:11111`, and wait for `bridge up`.
4. Keep it open and ask Codex for a screenshot of a node by name.

No source checkout or build is needed. Keep the extracted directory after import; do not save only the manifest. You can also ask the Agent to copy the ZIP to a directory you specify. The user performs the Figma Desktop import.

The Codex plugin supplies a prebuilt `runtime/bridge.mjs`, MCP configuration and a SessionStart hook. Review/trust it through Codex `/hooks`; new sessions then start the background bridge or reuse an existing compatible instance. The bridge remains running between sessions. The hook never downloads dependencies or kills another service occupying the port.

The hook starts its bundled Bridge by default and never searches for a global executable. `CODEX_FIGMA_BRIDGE_ENTRY` remains an explicit development override; remove an old override for normal use. If `runtime/bridge.mjs` is missing, reinstall the complete plugin.

The Figma companion needs a one-time import. For upgrades, ask the Agent for the new ZIP and follow the included guide. Only developers need pnpm and build commands.

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

Codex plugin 0.4.0 bundles its Bridge. Users only need to update the Codex plugin package. Stop an existing Bridge before starting a new session when switching to the newly bundled runtime. The hook refuses the old cache-based protocol.

For source development:

```bash
pnpm install
pnpm --filter @codex-figma/bridge run clean
pnpm build
pnpm --filter @codex-figma/codex-plugin check:bundle
pnpm -r run typecheck
pnpm --filter @codex-figma/bridge test
node --test packages/codex-plugin/tests/*.test.mjs
```

Distributions must include `packages/codex-plugin/runtime/` and `assets/figma-plugin/`. The Bridge runtime, Figma ZIP, tutorial and licenses are kept with source so marketplace installation needs no build step. ZIP contents are built from current Figma source, never a potentially stale dist directory. `check:bundle` and `prepack` reject stale artifacts. Refresh/reinstall the cached Codex plugin and open a new session; reload the Figma plugin when its code changes. Historical design cache files are neither read nor written, and are not automatically deleted.

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
