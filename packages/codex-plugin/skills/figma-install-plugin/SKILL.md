---
name: figma-install-plugin
description: "Provide the bundled Figma companion ZIP and guide the user through local installation. Use for '安装 Figma 插件', '给我 Figma 插件压缩包', '下载/更新 Figma 插件', or 'install the Figma plugin'. This distributes the Figma-side plugin, not design-to-code or design generation."
---

# Install the Figma Companion

The Codex plugin already includes the Bridge and a prebuilt Figma companion ZIP.
Deliver the archive and installation instructions without requiring a repository,
npm, compilation, a connected Figma document, or a Figma read-tool call.

## Deliver the real files

Run `node scripts/prepare-download.mjs` relative to this skill's directory (or
use the script's absolute path). It resolves assets relative to the installed
skill, verifies their existence, and prints absolute archive/tutorial paths,
version, byte size and SHA-256. Do not hardcode a cache version or workspace path.

Present the returned ZIP and tutorial using the client's supported file attachment
or local-file link mechanism. For a local Codex client, use clickable Markdown
links with absolute file paths; enclose paths containing spaces in `<...>`.
Do not invent an HTTP download URL or claim a file was attached if the client
does not support it. A client unable to download local links can still use the
exact path to copy/save the archive. If the user asks you to save it into a
specific folder, pass that folder as the script's one argument. The helper copies
files without overwriting different existing content. Do not save into a guessed
Downloads folder or extract into the managed plugin cache.

If files are missing, explain that this plugin installation is incomplete and
needs updating/reinstalling. Do not build from a sibling checkout as an end-user
fallback. Read the returned INSTALL.md for maintained instructions.

## Guide the user

Respond in the user's language with the actual ZIP link and these concrete steps:

1. Save the ZIP locally and extract it into a permanent folder. Preserve the
   `codex-figma-plugin/manifest.json` and `dist/` relative layout; keep the folder
   after import because Figma loads files from it.
2. In Figma Desktop, open a design file and use **Plugins → Development → Import
   new plugin from manifest…** (also called **Import plugin from manifest…**).
   Select the extracted `manifest.json`, not the ZIP itself.
3. Run **Codex Figma Bridge** from the Development menu. Keep it open in the target
   file. Its Bridge URL defaults to `http://localhost:11111`; wait for `bridge up`.
4. The Codex side requires Node.js 20+ and its SessionStart hook to be enabled/
   trusted. A new session starts the bundled Bridge; no standalone npm install.
5. Test with `获取 figma 节点「创建二维码」的截图` or a node name the user provides.
   If doing that test, load `figma-implement-design` before any Figma read tool.

The user performs the Figma import; delivering a ZIP is not evidence of successful
installation. Do not claim installation or a live screenshot succeeded without
observing it. No confirmation is needed merely to provide the ZIP and tutorial.
