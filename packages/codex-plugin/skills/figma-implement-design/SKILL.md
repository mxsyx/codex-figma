---
name: figma-implement-design
description: "**MANDATORY prerequisite** — you MUST invoke this skill BEFORE calling any local Figma MCP tool (`get_selection`, `get_node`, `get_screenshot`, `get_asset`, `list_nodes`, `get_variables`). You MUST trigger this skill whenever the user wants to implement, build, port, or code up their current Figma selection as code. Example prompts (not exhaustive): 'implement my Figma selection', 'build this screen from Figma', 'turn my Figma into code', 'design to code'. This skill provides critical instructions on how to correctly drive the local Codex Figma Bridge MCP server and must NOT be skipped."
disable-model-invocation: false
---

# Implement a Figma Selection as Code (Design → Code, Local Bridge)

Use this skill to turn the user's **current Figma selection** into code in a target codebase. This is the **read-FROM-Figma** direction: pull design context out of the local bridge with `get_selection` / `get_node` / `get_screenshot` / `get_asset`, then adapt it into the project's real stack.

This skill owns the **workflow** for design-to-code. The local MCP tools (`get_selection`, `get_node`, `get_screenshot`, `get_asset`, `list_nodes`, `get_variables`) are provided by the **Codex Figma Bridge** — a localhost server the user runs alongside Figma Desktop. No Figma URL is required; the agent just sees what the designer has selected right now.

## Direction and Scope

- You MUST use this skill for design → code: implementing, translating, or porting a Figma selection into code.
- The local bridge is **read-only** — it cannot write back to Figma. Do not attempt to modify the Figma file through these tools.
- If the user wants to update a design in Figma from code, that is out of scope for this plugin — direct them to Figma's official cloud MCP connector instead.

## Workflow

### 1. Call `get_selection` first

- You MUST call `get_selection` before writing any code. It returns the user's current Figma selection (file, page, selected node ids + names + types + bounding boxes).
- If `get_selection` returns "No Figma selection has been captured yet", STOP and ask the user to:
  1. Open Figma Desktop.
  2. Select a frame, component, or node.
  3. Open the Codex Figma Bridge plugin UI (Plugins → Codex Figma Bridge).
  4. Confirm the bridge URL is correct (default `http://localhost:3845`) and the status pill says "bridge up".
  5. Click "Push now" (or enable "Auto-push on selection change").
- You MUST NOT guess or fabricate a node id. Every node id you use downstream must come from `get_selection` or `list_nodes`.

### 2. Pull the full node tree with `get_node`

- For each selected root returned by `get_selection`, call `get_node` with `depth: 5` (or higher for deeply nested screens) and all `include*` flags on.
- The returned tree includes:
  - **layout**: auto-layout props + a `cssHint` string (e.g. `display:flex;flex-direction:column;gap:12px;padding:16px;`)
  - **styles**: fills, strokes, effects, corner radii, opacity, blend mode
  - **text**: characters + font + line height + letter spacing + text case + decoration
  - **variables**: bound design-token variables with collection + mode + resolved value + alias chain
  - **component**: mainComponent, componentPropertyDefinitions, componentPropertyReferences (for INSTANCE/COMPONENT nodes)
- Treat the tree as a **reference**, not final code. Adapt it to the project's stack.

### 3. Pull the visual reference with `get_screenshot`

- Call `get_screenshot` for each selected root. The PNG is your **visual reference** — use it to understand spacing, color, hierarchy, and overall composition.
- You MUST call `get_screenshot` even if the node tree looks complete — visual details are easy to miss in the JSON.

### 4. Pull icons and vector art with `get_asset`

- For every VECTOR or BOOLEAN_OPERATION node in the tree (typically icons), call `get_asset` with `format: "SVG"`.
- The tool returns the SVG source as text. Save it as a `.svg` file in the project's assets directory; **never hand-write or inline a modified version**.
- If the SVG is missing (the plugin capped SVG exports at 50), fall back to `get_asset` with `format: "PNG"` or ask the user to push a smaller selection.

### 5. Reuse what the project already has

- Before writing new code, inspect the target project for existing components, layout patterns, and design tokens that match the design intent.
- You MUST reuse the project's existing components and tokens instead of generating new equivalents from scratch. Match the surrounding code.
- Use `get_variables` to map Figma tokens onto the project's token system (CSS variables, Tailwind theme, design-tokens.json).

### 6. Honor hints by priority

Apply design hints in this order — earlier sources override later ones:

1. **Code Connect mappings** (if the project has them) → use the mapped codebase component directly.
2. **Component documentation** (if the project documents its components) → follow it for usage and guidelines.
3. **Design annotations** in the Figma file (visible in the screenshot) → follow any designer notes.
4. **Bound variables (design tokens)** → map them to the project's token system.
5. **Raw hex / absolute positioning** → loosely structured; lean on the screenshot for intent.

### 7. Reproduce images and icons faithfully

- **Render every icon/image from its exported asset.** Never hand-write or inline `<svg>`/`<path>`, never author your own icon file, never drop an icon or leave a placeholder — you don't have the real vector data, so anything you draw is wrong.
- **Sourcing:** commit the SVG bytes returned by `get_asset` directly to the repo. The bridge is local-only; the bytes will not be available to the running app at runtime.
- **Reuse a project icon component only if its glyph clearly matches** (a name match is not enough); otherwise use the exported asset.
- **Size explicitly:** a fixed-size container (icons are usually square, e.g. `size-[24px]`, `overflow-clip`) with BOTH width and height set, and size the leaf `<img>`/`<svg>` to fill it (`100%` or fixed px) — never `auto`, which blows the image up to its intrinsic size.

### 8. Verify

- After writing code, run the project's lint / typecheck / preview build.
- Confirm the code compiles and runs without errors.
- Note any design details you couldn't fully capture from the Figma data (e.g. missing fonts, unresolved variables) so the user can address them.

## Error Recovery

- On a `get_selection` error, STOP and read the message before retrying.
- If `get_selection` returns an empty selection, ask the user to select a frame in Figma and click "Push now" — do NOT silently fall back to writing code from a guessed description.
- On `get_node` errors (e.g. "No cached node with id X"), re-call `get_selection` to refresh the cached tree, then retry.
- On `get_screenshot` / `get_asset` errors, ask the user to re-push the selection. The bridge cache is in-memory and is replaced on every push.
- If the bridge is unreachable (network error), ask the user to start it: `cd bridge && npm start`.
- You MUST NOT silently fall back to hand-writing the screen from a verbal description when the local MCP tools can still provide context.

## Tool Reference (quick)

| Tool | When to call | Input | Output |
|------|-------------|-------|--------|
| `get_selection` | Always first — every workflow | (none) | Selection summary: fileKey, page, selectedNodes[] |
| `get_node` | For each selected root | `{ nodeId, depth?, includeStyles?, includeVariables?, includeText? }` | Full serialized node tree |
| `get_screenshot` | For each selected root; on every parity check | `{ nodeId, format? }` | PNG image content (base64) |
| `get_asset` | For every VECTOR / BOOLEAN_OPERATION descendant | `{ nodeId, format? }` | SVG (preferred) or PNG image content |
| `list_nodes` | When you need to find specific nodes by type or name | `{ type?, name? }` | Array of `{id, name, type, depth, parentId}` |
| `get_variables` | When mapping Figma tokens onto the project's token system | `{ collectionName? }` | Array of bound-variable rows |

The MCP resource `figma://selection/current` mirrors `get_selection` — use it if your client prefers the resource surface.

## Pre-Flight Checklist

Before writing any code, verify:

- [ ] `get_selection` returned a non-empty selection.
- [ ] `get_node` returned the full tree for each selected root (no truncation errors).
- [ ] `get_screenshot` returned a PNG for each selected root.
- [ ] You've inspected the project for existing components/tokens that match the design.
- [ ] You have a plan for every icon (either reuse a matching project icon, or `get_asset` + commit the SVG).
- [ ] You've identified any Figma variables that map to project tokens.
