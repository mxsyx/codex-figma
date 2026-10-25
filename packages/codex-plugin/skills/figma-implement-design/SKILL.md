---
name: figma-implement-design
description: "MANDATORY before local Figma read tools (resolve_node, get_node, get_screenshot, get_asset, get_variables, list_components). Use when the user asks to implement a named Figma node, such as '实现 figma 节点「登录页」', 'implement the Figma node Login', or 'build this Figma screen'. Queries the open file live across every page."
disable-model-invocation: false
---

# Implement a Named Figma Node

Translate a named Figma design into project code using live queries through the
local bridge. The user can simply say **实现 figma 节点「登录页」**. Do not ask them to
write `nodeName`, provide a nodeId, select a node, or upload a snapshot.

## Prerequisites

The bridge runs on `http://localhost:11111`. Keep the Codex Figma Bridge plugin
open and connected in the intended Figma file. Only one file/plugin should be
connected to that bridge. The search covers all pages, hidden layers, and nodes
that are not selected, within that file. It cannot search other files in the
same Figma team/project.

If the user needs the Figma-side plugin installed, use `figma-install-plugin`
to supply the bundled ZIP and tutorial before attempting live reads.

## Resolve the name first

1. Extract the full layer name from the user's request. For `实现 figma 节点「登录页」`,
   call `resolve_node({ "nodeName": "登录页" })`. Names match exactly, including case.
   If no name was given, ask which named node they want to implement.
2. Every call reads the file live. There is no design cache, current-selection
   resource, manual Push, or automatic Push. Never ask the user to Push or refer
   to an old snapshot as current evidence.
3. `unique`: retain the candidate's `choice` object internally and continue.
4. `not_found`: ask the user to correct the name or open the intended file. Do
   not choose a similar name or fabricate a node.
5. `ambiguous`: STOP implementation. Follow `nextOffset` to obtain every page of
   matches. Show each candidate's numbered **screenshot, page/layer path, type,
   and dimensions**. Re-display the returned MCP image blocks through the
   client's image display capability; a tool-only image or a text list of IDs
   is not a user-visible comparison. If the client cannot show images, disclose
   that limitation instead of pretending a gallery was displayed.
6. Ask “这些节点都叫‘登录页’，请按截图选择要实现的编号。” Wait for an explicit answer.
   Never choose the first, largest, or most likely match. Keep the displayed
   number → choice mapping; never turn a number into an offset on a later query.
7. Missing previews must be disclosed and their candidates kept in the list.
   Ask the user to identify the layer by page/path or make it exportable in
   Figma. Never invent a screenshot or silently omit a duplicate.

## Read only the confirmed design

- Call `get_node` with `nodeName` and the unique/user-confirmed `choice`. Use
  `depth` (default 5, maximum 20) for subtree detail. Even with a choice, the
  plugin searches by name again and verifies that the same internal ID remains
  among the matches. The ID is never a standalone lookup key.
- Call `get_screenshot` with the same name and choice. Inspect the fresh PNG
  before implementation. Screenshots have a maximum longest side of 1600 px;
  discovery previews use 640 px. Do not claim pixel-perfect inspection beyond
  the available resolution.
- `stale_choice` means the document/plugin changed or the node was renamed or
  removed. Resolve again and ask the user if the target is no longer clear;
  never substitute a new same-name node automatically.
- For icons and illustrations, call `get_asset` with each descendant's exact
  name and its internal choice `{ documentId, nodeId }` from the returned tree
  in the confirmed document. This is a descendant already identified in the
  chosen design, not an arbitrary name match. Prefer SVG for vectors; request
  PNG if SVG export is unavailable. Save returned bytes as project assets.
- `get_variables` takes the same name/choice plus optional `collectionName` and
  `depth`. It queries current bindings within that subtree. Reuse project tokens.
- A failed or disconnected query supplies no usable fallback data. Ask the user
  to reconnect the plugin and retry. Never use a previous result as a cache.

## Implement and verify

Use the returned node tree and screenshot as design evidence, then follow the
project's framework, component conventions, accessibility requirements, and
existing tokens. Reuse matching components. Use exported image/SVG bytes rather
than inventing icons. Save implementation assets to the target project; the
bridge itself never saves screenshots or node trees.

Run relevant lint/type checks and preview the implementation when possible.
Report the implemented node by name and page/path, plus material differences or
missing data. Never claim a live Figma query or visual check that was not run.

## Tools

| Tool | Input | Result |
| --- | --- | --- |
| `resolve_node` | `nodeName`, optional `offset`, `limit` | Current matches with numbered screenshots and internal choices |
| `get_node` | `nodeName`, optional `choice`, `depth` | Current node tree, or ambiguity candidates |
| `get_screenshot` | `nodeName`, optional `choice` | Fresh PNG, or ambiguity candidates |
| `get_asset` | `nodeName`, optional `choice`, `format` | Fresh SVG source or PNG bytes |
| `get_variables` | `nodeName`, optional `choice`, `collectionName`, `depth` | Current variable bindings |
| `list_components` | `pageName`, optional `query` | Live component metadata and choices |

All name queries cover the entire connected file. Pagination rescans live data;
if the document changes while collecting candidates, restart discovery before
asking the user. No candidate ID, page number, or prior response is a cache.

For generating or modifying a Figma design, use `figma-generate-design-from-intent`.
