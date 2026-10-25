# Codex Figma Bridge — Codex plugin

This plugin teaches Codex to implement a named Figma node using live queries:

> 实现 figma 节点「登录页」

It also retains the intent-to-Figma generation workflow. The local Bridge replaces a cloud connector; this package has no `.app.json`.

## Install

From the repository root, with Node.js 20+:

```bash
pnpm install
pnpm build
npm install -g ./packages/bridge
codex plugin marketplace add .
codex plugin add codex-figma-bridge@codex-figma
```

The bundled `.mcp.json` connects to `http://localhost:11111/mcp`. No separate MCP entry is needed when using this plugin. Import `../figma-plugin/manifest.json` into Figma and keep one plugin open in the target file.

## Automatic startup

Review/trust the SessionStart hook in Codex `/hooks`, then start a new session. The hook:

- Reuses a healthy service identifying itself as `codex-figma-bridge` with mode `live-name-query`.
- Otherwise starts a detached Bridge and waits up to 12 seconds for readiness. Concurrent sessions converge on one listener; losing startup processes exit.
- Keeps the shared Bridge alive when a session ends.
- Reports occupied ports/outdated bridges without killing them or downloading dependencies.

Node must be on the Codex process's PATH. The hook finds the Bridge through `CODEX_FIGMA_BRIDGE_ENTRY` (an absolute `.mjs` path), a sibling `../bridge` checkout, or `codex-figma-bridge` on PATH, in that order. Rebuild after source changes.

For example, export this before starting Codex if not installing the Bridge globally:

```bash
export CODEX_FIGMA_BRIDGE_ENTRY=/absolute/path/to/codex-figma/packages/bridge/bin/codex-figma-bridge.mjs
```

Hook diagnostics go to `startup.log` under `PLUGIN_DATA`, falling back to macOS `~/Library/Logs/codex-figma-bridge` or Linux `${XDG_STATE_HOME:-~/.local/state}/codex-figma-bridge`. Bridge operational logs use `CODEX_FIGMA_BRIDGE_LOG_DIR` or that default directory. There is no design cache.

## Live implementation workflow

The [implementation skill](skills/figma-implement-design/SKILL.md) is the prerequisite for read tools. It instructs Codex to:

1. Parse the natural-language node name and call `resolve_node`.
2. Search all pages of the currently connected file, including hidden/unselected nodes.
3. For duplicates, collect every candidate page, show numbered screenshots and layer paths, and wait for the user.
4. Carry the confirmed document/node identity internally, then query by name for current trees, screenshots, assets and variables.
5. Resolve again if the selected node is renamed/deleted or the plugin/document changes.

There is no Push, selection sync or stored node index. The Bridge retains only in-flight requests. The file must remain open; offline or timed-out queries never use old design data. Multiple connected plugins are rejected until only the target remains connected. The scope is all pages in one file, not every file in a Figma team project.

| Tool | Purpose |
| --- | --- |
| `resolve_node` | Name discovery with candidate screenshots |
| `get_node` | Live named node tree |
| `get_screenshot` | Fresh PNG |
| `get_asset` | Fresh SVG/PNG |
| `get_variables` | Current variable bindings in a named subtree |
| `list_components` | Live metadata on a component-library page |
| `generate_design` | One-click Figma generation from a structured design |

Removed: `get_selection`, `list_nodes`, `figma://selection/current`, ID-only reads, and pushed selection/node endpoints. All node reads require `nodeName`; the optional internal `choice` never bypasses the name search.

## Package layout

- `.codex-plugin/plugin.json`: manifest and natural-language default prompts.
- `.mcp.json`: local HTTP MCP connection.
- `hooks/`: SessionStart registration and startup script.
- `skills/`: implementation and intent-to-design workflows.
- `commands/implement-from-figma.md`: named-node implementation command.
- `agents/figma-implementation-agent.md`: workflow for delegated implementation when requested.

## Upgrade

Update Bridge, Figma plugin and Codex plugin together: this version changes the read protocol. Stop the old Bridge, clean/build it, update its global install or configured entry, refresh/reinstall the cached Codex plugin, and reopen both plugins/session. Review changed hooks in `/hooks` as required by Codex. The new hook deliberately refuses an old cache-based Bridge.

Changing port 11111 requires changing the Bridge environment, `.mcp.json`, Figma URL and manifest network domains. Saved Figma URLs are preserved and may need manual updating.

For manual setup without this plugin, see [codex-config.snippet.toml](../../codex-config.snippet.toml). See the [root README](../../README.md) for full setup and validation commands.
