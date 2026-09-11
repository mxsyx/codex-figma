# Codex Figma Bridge — Codex Plugin

This directory is the **Codex CLI plugin** half of the Codex Figma Bridge. It teaches Codex how to drive the local MCP server exposed by [`../bridge`](../bridge) in both directions: implement the user's live Figma selection as code, or generate a structured Figma design from a natural-language product intent.

Unlike the reference plugin at [`../../2.0.17`](../../2.0.17), this plugin has **no `.app.json`** — the local bridge replaces Figma's cloud MCP connector.

## Layout

```
codex-plugin/
├── .codex-plugin/plugin.json              # plugin manifest (skills + interface metadata)
├── skills/
│   ├── figma-implement-design/SKILL.md    # MANDATORY prerequisite — teaches the read tools
│   └── figma-generate-design-from-intent/SKILL.md  # intent → Figma design workflow
├── commands/
│   └── implement-from-figma.md            # /implement-from-figma slash command
├── agents/
│   └── figma-implementation-agent.md      # for substantial UI work
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
| `get_screenshot` | Returns a PNG screenshot of one node (visual reference for layout/colors/typography). |
| `get_asset` | Returns SVG/PNG bytes for icons and vector art. |
| `list_nodes` | Searches cached trees by type or name substring. |
| `get_variables` | Lists design-token variable bindings across the cached trees. |
| `generate_design` | Sends a structured design specification to the plugin for one-click generation. |
| `list_components` | Scans every component on a named Figma page and caches the node trees for `get_node`. |

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

To generate a design from a natural-language intent:

> Generate a Figma design for an admin dashboard that shows revenue KPIs, churn risk, and recent payments.

To use a named component library and destination page:

> Use the Button, Badge, and Card components on the Polaris page to design a customer revenue dashboard, and write it to the ShopifyApp page.

The skill `figma-implement-design` is a MANDATORY prerequisite before calling any read tool. For intent-to-design work, Codex loads `figma-generate-design-from-intent` and calls `generate_design`.
