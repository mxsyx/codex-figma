# Codex Figma Bridge — Codex Plugin

This directory is the **Codex CLI plugin** half of the Codex Figma Bridge. It teaches Codex how to drive the local MCP server exposed by [`../bridge`](../bridge) to implement the user's live Figma selection as code.

Unlike the reference plugin at [`../../2.0.17`](../../2.0.17), this plugin has **no `.app.json`** — the local bridge replaces Figma's cloud MCP connector.

## Layout

```
codex-plugin/
├── .codex-plugin/plugin.json              # plugin manifest (skills + interface metadata)
├── skills/
│   └── figma-implement-design/SKILL.md    # MANDATORY prerequisite — teaches the 6 local MCP tools
├── commands/
│   └── implement-from-figma.md            # /implement-from-figma slash command
├── agents/
│   ├── figma-implementation-agent.md      # for substantial UI work
│   └── design-parity-review-agent.md      # for post-implementation parity review
├── assets/
│   └── icon.svg                           # plugin icon (Figma-blue bridge glyph)
└── README.md                              # this file
```

## MCP tools exposed by the bridge

The plugin assumes the following tools are available via the `codex-figma-bridge` MCP server (configured in `~/.codex/config.toml`):

| Tool | Purpose |
|------|---------|
| `get_selection` | Returns the user's current Figma selection summary (file, page, selected node ids + boxes). Always call first. |
| `get_node` | Returns the full serialized node tree for one node id. |
| `get_screenshot` | Returns a PNG screenshot of one node (visual source of truth for parity). |
| `get_asset` | Returns SVG/PNG bytes for icons and vector art. |
| `list_nodes` | Searches cached trees by type or name substring. |
| `get_variables` | Lists design-token variable bindings across the cached trees. |

Plus one MCP resource: `figma://selection/current` — mirrors `get_selection`.

## Install

```bash
codex plugin install ./packages/codex-plugin
```

Then ensure the bridge is configured in `~/.codex/config.toml`:

```toml
[mcp_servers.codex-figma-bridge]
type = "http"
url = "http://localhost:3845/mcp"
```

And start the bridge:

```bash
cd ../.. && pnpm start
```

## Usage

In a target repo, ask Codex:

> Implement my current Figma selection as a React component.

Or use the slash command:

> /implement-from-figma

The skill `figma-implement-design` is a MANDATORY prerequisite — Codex will load it automatically before calling any Figma MCP tool.
