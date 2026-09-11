---
name: figma-generate-design-from-intent
description: "Use this skill when the user describes a product, page, modal, dashboard, workflow, or business UI intent and wants Codex to create that design in Figma through the local Codex Figma Bridge. Trigger phrases include 'generate a design from this description', 'create a Figma design for...', 'design this feature in Figma', 'turn this idea into a UI', 'make a dashboard/modal/landing page in Figma', 'use the components on the Polaris page', 'use the Polaris component library', and 'write the design to the ShopifyApp page'. Do not use this skill for design-to-code implementation."
disable-model-invocation: false
---

# Generate a Figma Design from Natural Language

This is the **intent → Figma** direction. Codex interprets the user's business intent, produces one structured design specification, and sends it with the `generate_design` MCP tool. The Figma plugin shows a **Generate design** button; the user confirms it, and the plugin creates the design locally.

Before calling `list_components`, `get_node`, `get_screenshot`, or any other Figma read tool in this workflow, also load the mandatory `figma-implement-design` skill.

## Prerequisites

- The bridge must be running (`pnpm start` from the repository root).
- The **Codex Figma Bridge** plugin must be open in Figma Desktop.
- The plugin UI must show **bridge up**.

If the bridge or plugin is unavailable, tell the user exactly what to open. Do not invent a successful Figma result.

## Workflow

1. Restate the business goal and audience in one concise sentence.
2. Decide the screen name, dimensions, and major business areas. Use desktop `1440×900`, tablet `834×1112`, or mobile `390×844` unless the user specifies otherwise.
3. Identify the target Figma page from phrases such as “写入 ShopifyApp” or “put it on the ShopifyApp page”. Put that exact page name in `targetPage`; the plugin will use the existing page or create it if it is missing.
4. Identify the component-library page from phrases such as “使用 Polaris 页面下的组件” or “use the components on the Polaris page”. Call `list_components` with `{ "pageName": "Polaris" }` to cache and list every component on that page. Add `"query": "button"` when the user asks for a specific component or when the result is too large.
5. For each likely component, call `get_node` with the returned component id. Inspect its tree and `component.componentPropertyDefinitions`. Prefer actual `COMPONENT` nodes over `COMPONENT_SET` nodes when creating instances. Use the component id and its property keys/values to build overrides.
6. Split the design into one or more business groups. Every group must have a clear business name, such as `Primary Navigation`, `Revenue KPIs`, `Customer Filters`, `Conversion Chart`, or `Action Bar`. Do not use generic names such as `Group 1`.
7. Build a complete `design` object that follows the schema below. Coordinates are relative to the root frame for first-level group children, and relative to their parent frame for nested children.
8. Call the local `generate_design` tool exactly once:

```json
{
  "design": {
    "name": "Customer Revenue Dashboard",
    "description": "Operations dashboard for monitoring revenue and customer health",
    "width": 1440,
    "height": 900,
    "background": { "r": 0.96, "g": 0.97, "b": 0.99 },
    "targetPage": "ShopifyApp",
    "groups": [
      {
        "name": "Revenue KPIs",
        "description": "Core revenue metrics for the selected period",
        "children": [
          {
            "kind": "frame",
            "name": "ARR Card",
            "box": { "x": 48, "y": 120, "width": 280, "height": 120 },
            "fill": { "r": 1, "g": 1, "b": 1 },
            "cornerRadius": 12,
            "children": [
              {
                "kind": "text",
                "name": "ARR Label",
                "characters": "Annual recurring revenue",
                "box": { "x": 16, "y": 20, "width": 240, "height": 20 },
                "fontSize": 12,
                "color": { "r": 0.35, "g": 0.4, "b": 0.5 }
              },
              {
                "kind": "text",
                "name": "ARR Value",
                "characters": "$12.4M",
                "box": { "x": 16, "y": 48, "width": 240, "height": 44 },
                "fontSize": 32,
                "fontWeight": 700,
                "color": { "r": 0.05, "g": 0.07, "b": 0.1 }
              }
            ]
          }
        ]
      }
    ]
  }
}
```

9. Tell the user to click **Generate design** in the Figma plugin. Wait for the tool result. Success returns `{ ok: true, requestId, rootId }`.
10. Report the generated root frame name, target page, component library used, and business groups created.

### Component Library Example

If the user says “使用 Polaris 页面下的 Button、Badge 和 Card 组件，写入 ShopifyApp 页面”， first call:

```json
{ "pageName": "Polaris" }
```

Then call `get_node` for each matching component id. A design node using a discovered component looks like:

```json
{
  "kind": "component",
  "name": "Save Button",
  "componentId": "42:17",
  "componentKey": "abcdef123456",
  "box": { "x": 0, "y": 0, "width": 120, "height": 36 },
  "properties": {
    "Size": "Medium",
    "Label#12:34": "Save customer"
  }
}
```

Only use component ids and property keys/values that exist in the component data returned by `list_components` / `get_node`. Do not guess ids or property names.

## Design JSON Schema

Root:

- `name` (required): business-facing screen name.
- `width`, `height` (required): positive frame dimensions.
- `background` (optional): `{ r, g, b, a? }`, all channels from `0` to `1`.
- `targetPage` (optional): exact destination Figma page name. The plugin creates it if it does not exist.
- `groups` (required, non-empty): business-level Figma groups.

Group:

- `name` (required): stable business group name used as the Figma Group name.
- `description` (optional): concise business purpose.
- `children` (required): first-level design nodes.

Node (`kind` is `frame`, `rectangle`, `ellipse`, or `text`):

- `name` (required): semantic node name such as `Search Input`, `Upgrade Button`, or `Weekly Active Users`.
- `box` (required): `{ x, y, width, height }`.
- `fill`, `stroke`, `strokeWeight`, `cornerRadius`, `rotation`, `opacity` (optional).
- `frame` nodes may contain nested `children`.
- `component` nodes require `componentId` from `list_components`, and may include `properties` discovered from `componentPropertyDefinitions`.
- `text` nodes require `characters`, and may set `fontSize`, `fontWeight`, `color`, and `textAlignHorizontal`.

## Design Requirements

- Cover the requested user workflow completely; do not produce a single placeholder card when the user asked for a screen.
- Use 8-pt spacing and readable text sizes (`12–32px` for UI text).
- Name every node semantically. Never emit `Rectangle 1`, `Text 2`, or `Frame 3`.
- Group by business capability, not by visual primitive type. Avoid groups named `Shapes`, `Texts`, or `Frames`.
- Keep all boxes inside the root frame and avoid overlapping unrelated interactive elements.
- Use a restrained color palette and make primary actions visually distinct.
- Include real, plausible copy derived from the user's business context rather than lorem ipsum.
- When the user names a component library page, reuse its components instead of drawing equivalent primitives whenever a suitable component exists.
- When the user names a destination page, always set `targetPage` to that exact name.

## Tool Failure Handling

- Validation failure: fix the JSON shape and call `generate_design` again.
- Timeout: confirm the Figma plugin UI is open and visible, then ask the user whether to retry.
- Post failure: the Figma node may exist even if the bridge acknowledgement failed. Ask the user to check Figma before retrying.
