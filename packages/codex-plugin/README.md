# Codex Figma Bridge — Codex plugin

This plugin teaches Codex to implement a named Figma node using live queries:

> 实现 figma 节点「登录页」

It also retains the intent-to-Figma generation workflow. The local Bridge replaces a cloud connector; this package has no `.app.json`.

## Install

Version 0.5.0 includes the Bridge runtime, its npm dependencies, and a ready-to-import Figma companion ZIP. Users need Node.js 20+ on PATH, but no npm/pnpm install, global Bridge executable, or source checkout. With the marketplace registered, install this plugin. For a local marketplace, run from its root:

```bash
codex plugin marketplace add .
codex plugin add codex-figma-bridge@codex-figma
```

The bundled `.mcp.json` connects to `http://localhost:11111/mcp`. No separate MCP entry is needed when using this plugin. Ask the Agent “帮我安装 Figma 插件，给我压缩包和安装教程” or “Give me the Figma plugin ZIP and installation steps”. The installation skill supplies the [bundled ZIP](assets/figma-plugin/codex-figma-plugin.zip) and [tutorial](assets/figma-plugin/INSTALL.md) using actual local file links, and can copy them into a directory you specify. No source checkout or compilation is needed. Save/extract the ZIP permanently, import `codex-figma-plugin/manifest.json` in Figma Desktop, and keep one plugin open in the target file. Delivering the ZIP does not itself perform the Figma import.

## Automatic startup

Review/trust the SessionStart hook in Codex `/hooks`, then start a new session. The hook:

- Reuses a healthy service identifying itself as `codex-figma-bridge` with mode `live-name-query`.
- Otherwise starts a detached Bridge and waits up to 12 seconds for readiness. Concurrent sessions converge on one listener; losing startup processes exit.
- Keeps the shared Bridge alive when a session ends.
- Reports occupied ports/outdated bridges without killing them or downloading dependencies.

The hook uses Node to run `${PLUGIN_ROOT}/runtime/bridge.mjs`. It does not
search a sibling package or PATH for a Bridge. Installation/startup does not run
npm, pnpm, npx, or download any runtime dependencies. A missing bundle reports an
incomplete plugin installation and asks for a reinstall.

`CODEX_FIGMA_BRIDGE_ENTRY` remains an optional absolute `.mjs` path for developers
explicitly testing another build. It takes precedence over the bundle; unset it
for normal use. Node itself and the companion Figma plugin are still required.

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
- `runtime/`: standalone Bridge and complete bundled dependency license notices.
- `skills/`: ZIP installation, implementation and intent-to-design workflows.
- `assets/figma-plugin/`: prebuilt companion ZIP and bilingual installation guide.
- `commands/implement-from-figma.md`: named-node implementation command.
- `agents/figma-implementation-agent.md`: workflow for delegated implementation when requested.

## Upgrade

Update/reinstall the Codex plugin to receive its bundled Bridge. Stop an existing
Bridge before starting a new session if you want to switch to the new runtime;
compatible running services are still reused. Review changed hooks in `/hooks`
as required by Codex. The hook refuses an old cache-based Bridge. Figma companion
updates still require reloading that plugin.

For maintainers, run `pnpm --filter @codex-figma/codex-plugin build` after changing
Bridge/Figma code, installation guide or dependencies. Include `runtime/` and
`assets/figma-plugin/` in version control and releases:
marketplace installation copies the directory without executing build scripts.
`pnpm --filter @codex-figma/codex-plugin check:bundle` checks reproducibility, and
`prepack` runs that check before packaging. The ZIP builds directly from Figma source with fixed timestamps and includes manifest, JS, HTML, guide, version and license. Startup tests copy the distributable
plugin to an isolated directory with no node_modules or global Bridge, then
exercise startup, reuse and the actual HTTP MCP interface.

Changing port 11111 requires changing the Bridge environment, `.mcp.json`, Figma URL and manifest network domains. Saved Figma URLs are preserved and may need manual updating.

For manual setup without this plugin, see [codex-config.snippet.toml](../../codex-config.snippet.toml). See the [root README](../../README.md) for full setup and validation commands.
