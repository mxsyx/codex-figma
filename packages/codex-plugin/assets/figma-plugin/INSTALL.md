# 安装 Codex Figma Bridge 的 Figma 插件

这是已经构建好的插件，无需 npm、pnpm、编译或克隆仓库。Codex 插件已内置 Bridge；电脑上需有 Node.js 20+，Figma 中需导入并运行本压缩包中的插件。

## 1. 保存并解压

将 Agent 提供的 `codex-figma-plugin.zip` 另存到你选择的本地目录，完整解压到长期保留的文件夹，例如“文档/Figma 插件”。不要直接在 ZIP 预览窗口里打开 manifest。

解压后的结构应为：

```text
codex-figma-plugin/
  manifest.json
  dist/
    code.js
    ui.html
  INSTALL.md
  LICENSE
  VERSION.txt
```

保持这些文件的相对位置。导入后也不要删除或移动该文件夹；Figma 会从这个位置加载插件。

## 2. 在 Figma 中导入

1. 打开 **Figma 桌面版**，进入需要访问的设计文件。
2. 在左上角 Figma 菜单中打开 **Plugins → Development → Import new plugin from manifest…**（部分版本显示为 **Import plugin from manifest…**）。
3. 选择解压目录中的 `codex-figma-plugin/manifest.json`，完成导入。
4. 在 **Plugins → Development → Codex Figma Bridge** 中运行插件。

这是 Figma 的本地开发插件导入流程，不是把 ZIP 上传到 Community。菜单位置可能随版本变化；请参阅 [Figma 官方导入说明](https://help.figma.com/hc/en-us/articles/360042786733-Create-a-classic-plugin-for-development)。

## 3. 连接 Codex

1. 确认 Codex 已安装 Codex Figma Bridge 插件，并按 Codex 提示信任其 SessionStart hook；开启新 session 会自动启动 Bridge。
2. Figma 插件中的 Bridge URL 默认是 `http://localhost:11111`。等面板显示 **bridge up**；必要时点击 **Reconnect**。
3. 保持目标文件中这一个插件实例打开。在 Codex 输入：

   > 获取 figma 节点「创建二维码」的截图

   或：

   > 实现 figma 节点「登录页」

无需选中节点或 Push。工具按名称搜索当前文件的所有页面；重名时由截图候选确认。

## 常见问题与升级

- **找不到导入菜单**：本流程需要 Figma 桌面版的开发插件导入功能；浏览器版不能直接使用这个本地导入流程。
- **提示找不到 code.js / ui.html**：重新完整解压，确认 `manifest.json` 旁边有 `dist` 文件夹，不要只保存 manifest。
- **一直 reconnecting**：确认 Codex 的 Bridge 已启动、端口与 URL 一致。Codex 和 Figma 必须能访问同一个 Bridge；远程开发环境中的 localhost 不一定是运行 Figma 的电脑。
- **连接成功但查询超时**：关闭旧 Figma 插件窗口，确认导入的是本次解压的 manifest，再重新运行。连接指示灯只能证明连接建立，不能证明截图查询成功。
- **更新插件**：向 Agent 再次索取压缩包，关闭旧插件，解压到新的长期目录，并导入新目录的 manifest；或在自己确认后完整替换原目录的文件，再重开插件。

# Install the Figma companion plugin

This ZIP contains built files. No npm/pnpm install, compilation, or source checkout is required. The Codex plugin already bundles the Bridge; its host needs Node.js 20+.

1. Save `codex-figma-plugin.zip` to a local directory you choose. Extract the entire ZIP into a permanent folder. Keep `manifest.json` next to `dist/`; do not import from a ZIP preview or delete/move the folder after importing.
2. Open **Figma Desktop** and your target design file. Use **Plugins → Development → Import new plugin from manifest…** (sometimes **Import plugin from manifest…**), and select the extracted `codex-figma-plugin/manifest.json`.
3. Run **Plugins → Development → Codex Figma Bridge**.
4. Start a Codex session with the Codex plugin's SessionStart hook enabled/trusted. In Figma, use `http://localhost:11111` and wait for **bridge up**. Keep one plugin instance open in the target file.
5. Ask Codex to get a screenshot or implement a node by name. No selection or Push is needed. Duplicate names require a visual choice.

See [Figma's official import instructions](https://help.figma.com/hc/en-us/articles/360042786733-Create-a-classic-plugin-for-development). This is a local development-plugin import, not a Community ZIP upload. If the UI cannot connect, check the Bridge and URL; a remote Codex host and the Figma computer may not share localhost. When upgrading, close the old plugin and import the manifest from the newly extracted folder. The connection indicator alone does not prove a successful node query.
