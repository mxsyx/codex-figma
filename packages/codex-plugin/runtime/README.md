# Bundled Bridge

`bridge.mjs` is the standalone Node.js 20+ runtime started by the plugin's
SessionStart hook. It includes Bridge code and all required npm dependencies.
No installation, network download, node_modules, global bridge, or checkout is
required at runtime. The companion installer is bundled in
`../assets/figma-plugin/codex-figma-plugin.zip`; ask the Agent for installation
instructions. The user imports it in Figma and keeps it open in the file.

These release artifacts are intentionally kept in the plugin directory and in
version control: marketplace installation copies files without running builds.
Do not edit `bridge.mjs` or `THIRD_PARTY_NOTICES.txt` directly.

From a development checkout:

```sh
pnpm --filter @codex-figma/codex-plugin build
pnpm --filter @codex-figma/codex-plugin check:bundle
pnpm --filter @codex-figma/codex-plugin test
```

Include the regenerated runtime and notices whenever Bridge/Figma code, tutorial or dependencies
change; the build and freshness check also cover the Figma ZIP. `prepack` checks freshness; the isolated installation test exercises the
copied runtime without access to a sibling package or external npm dependencies.
