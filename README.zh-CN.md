# Codex Figma Bridge

[English](README.md)

让 Codex 按名字实时读取 Figma 设计并实现为代码：

> 实现 figma 节点「登录页」

在目标 Figma 文件中打开插件并保持连接即可。不需要选中节点、填写 nodeId 或点击 Push。每次查询都会加载该文件的全部页面，按完整节点名称精确匹配，包含隐藏节点和未选中的节点。这里的范围是**当前打开的 Figma 文件**，不跨团队项目里的其他文件。

名字唯一时，Codex 读取实时节点树、截图、变量和素材。存在重名时，Codex 展示带编号的候选截图、页面/图层路径及尺寸，等待你选择；内部使用文档身份和 nodeId 区分候选，但每次读取仍先按名称搜索。节点改名、删除或插件重启后，旧选择会失效。

## 数据流

```text
Codex → MCP（nodeName）→ Bridge → SSE → Figma 插件
Codex ← 实时节点/截图 ← Bridge ← 当前请求的响应 ← 全文件搜索
```

没有主动 Push、选区同步、节点索引或设计缓存。Bridge 只保存连接、等待中的请求及运行日志；请求完成后释放结果。插件断开或查询超时时会报错，不会回退到旧设计。Codex 对话中已收到的数据属于对话上下文，后续工具调用始终重新查询 Figma。

保留自然语言生成设计的能力：Codex 发出 `generate_design`，你在 Figma 插件里点击 **Generate design** 创建图层。`list_components` 实时读取指定组件库页面，可继续用于 Polaris 等组件库。

## 安装

需要 Node.js 20+、pnpm 和 Figma Desktop。从仓库根目录执行：

```bash
pnpm install
pnpm build
npm install -g ./packages/bridge
codex plugin marketplace add .
codex plugin add codex-figma-bridge@codex-figma
```

在 Figma 的开发插件菜单选择 **Import plugin from manifest…**，导入 `packages/figma-plugin/manifest.json`。在目标文件运行 **Codex Figma Bridge**，URL 使用 `http://localhost:11111`，等待面板显示 `bridge up`。

Codex 插件自带 MCP 配置和 SessionStart hook。按 Codex 的 hook 信任流程，在 `/hooks` 检查并信任后，新 session 会自动启动 Bridge；已经有兼容 Bridge 在运行时直接复用。多个 session 共享服务，结束 session 不停止它。hook 不会下载依赖，也不会终止占用端口的其他服务。

若安装后的 Codex 插件找不到 Bridge，可在启动 Codex 前设置：

```bash
export CODEX_FIGMA_BRIDGE_ENTRY=/absolute/path/to/codex-figma/packages/bridge/bin/codex-figma-bridge.mjs
```

不使用 Codex 插件时，可参考 [手动 MCP 配置](codex-config.snippet.toml) 和 [AGENTS 模板](AGENTS.md.template)，并手动运行 `pnpm start`。

## 使用

1. 在目标 Figma 文件保持一个插件实例连接。无需提前选中或推送节点。
2. 在 Codex 输入：`实现 figma 节点「登录页」`。
3. 重名时查看候选截图，回复编号，例如：`实现第 2 个`。
4. Codex 读取所选节点的最新数据并实现代码。

名称按大小写和完整内容精确匹配。不存在时会提示检查名称/文件。候选很多时分批返回（每批最多 6 个），Codex 应取完所有候选再询问。无法导出截图的节点仍会列出路径、尺寸及失败原因。

若同时连接多个 Figma 插件，查询会要求只保留目标文件的连接，避免查询到错误文件。

## MCP 工具

| 工具 | 用途 |
| --- | --- |
| `resolve_node` | 按 `nodeName` 搜索全部页面，返回候选和截图 |
| `get_node` | 按名称实时读取节点树，默认深度 5，可指定 0–20 |
| `get_screenshot` | 按名称导出最新 PNG |
| `get_asset` | 按名称导出 SVG（矢量节点）或 PNG |
| `get_variables` | 按名称读取子树中的变量绑定 |
| `list_components` | 实时读取指定页面的组件库元数据 |
| `generate_design` | 发送设计生成请求，在插件中点击执行 |

读取工具必须提供 `nodeName`。确认后的 `choice` 是工具内部的候选身份，不是用户 prompt 参数。已移除 `get_selection`、`list_nodes`、`figma://selection/current` 和 `/selection`、`/node` 推送接口。

## 升级与开发

这是读取协议的破坏性更新。同步更新 Bridge、Figma 插件和 Codex 插件；旧版 Bridge 不会被新 hook 复用。停止旧进程后重建：

```bash
pnpm --filter @codex-figma/bridge run clean
pnpm build
pnpm -r run typecheck
pnpm --filter @codex-figma/bridge test
node --test packages/codex-plugin/tests/session-start.test.mjs
```

更新全局 Bridge 或 `CODEX_FIGMA_BRIDGE_ENTRY` 指向的构建，刷新/重装已缓存的 Codex 插件，然后重开 Figma 插件与 Codex session。旧缓存文件不再读取或写入；本次升级不会自动删除历史文件。

开发命令：`pnpm dev` 启动 Bridge watch；`pnpm --filter @codex-figma/figma-plugin watch` 构建插件。前台 dev 与后台 Bridge 使用同一端口时只能运行一个实例。

默认端口 **11111**。修改 `CODEX_FIGMA_BRIDGE_PORT` 或 `CODEX_FIGMA_BRIDGE_HOST` 后，同步修改 Codex `.mcp.json`、Figma 插件 URL 和 manifest 的网络域名。插件保留已保存的 URL；旧地址需在面板中手动更新。

## 排查问题

```bash
curl http://localhost:11111/health
```

正常响应包含 `service: "codex-figma-bridge"`、`mode: "live-name-query"` 和 `connectedPlugins`。节点查询需要恰好一个插件连接。

- `EADDRINUSE`：停止冲突进程，或统一修改所有端口配置。
- 面板显示 `reconnecting…`：确认服务已启动、URL 正确，点击 **Reconnect**。
- 节点找不到：检查目标文件和完整图层名称，而不是当前选区。
- 大文件超时：查询会加载全部页面；保持插件打开后重试，不会使用过期数据。
- 更新后仍有 Push 按钮：重建并重新打开 Figma 插件。

运行日志默认位于 macOS `~/Library/Logs/codex-figma-bridge/bridge.log` 或 Linux `${XDG_STATE_HOME:-~/.local/state}/codex-figma-bridge/bridge.log`。可通过 `CODEX_FIGMA_BRIDGE_LOG_DIR` 修改。hook 的 `startup.log` 位于 `PLUGIN_DATA`，未设置时使用上述默认日志目录。

源码分为 [Bridge](packages/bridge)、[Figma 插件](packages/figma-plugin)、[Codex 插件](packages/codex-plugin)。`2.0.17/` 是历史参考插件，不参与本项目构建。

MIT，见 [LICENSE](LICENSE)。
