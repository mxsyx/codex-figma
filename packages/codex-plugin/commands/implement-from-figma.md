# /implement-from-figma

Implement the named Figma node through live bridge queries.

Example: **实现 figma 节点「登录页」**.

Optional arguments: `nodeName` (exact layer name), `target` (project file/component),
`mode` (component or screen). Natural-language names are preferred; do not require IDs.

1. Load `figma-implement-design`, then call `resolve_node` with the extracted name.
2. For duplicate names across any pages, show all candidate screenshots and paths,
   then STOP and wait for the user's choice. Preserve the number-to-choice mapping.
3. Read the chosen design with `get_node` and `get_screenshot`, always by name plus
   the confirmed internal choice. Re-resolve stale choices; never reuse old data.
4. Query assets and variables live, reuse project components, and implement.
5. Run relevant checks and report differences. No selection upload is required.
