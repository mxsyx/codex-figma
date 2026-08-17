# /implement-from-figma

Implement the user's current Figma selection into project code via the local Codex Figma Bridge.

## Arguments

- `target`: optional file/component target hint (e.g. `src/components/Button.tsx`)
- `mode`: `component` or `screen` (optional; infer if omitted)

## Workflow

1. Call `get_selection` to read what the user has currently selected in Figma.
   - If the selection is empty, ask the user to select a frame in Figma Desktop and click "Push now" in the Codex Figma Bridge plugin UI.
2. For each selected root, call `get_node` (depth 5, all flags on) and `get_screenshot`.
3. Walk the tree, call `get_asset` (SVG) for every VECTOR / BOOLEAN_OPERATION descendant, and commit the bytes to the project's assets directory.
4. Implement using project conventions and reusable components. Map Figma variables to project tokens via `get_variables`.
5. Run local lint / typecheck / preview.
6. Summarize parity (what matches / what differs) and list any known deltas.

## Escalation

Delegate to `figma-implementation-agent` for substantial UI work or multi-file changes. Delegate to `design-parity-review-agent` for a structured parity review after implementation.
