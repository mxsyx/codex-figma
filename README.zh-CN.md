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

Codex 插件内置 Bridge 及全部运行依赖，**不需要单独 npm 安装 Bridge，也不需要配置仓库路径**。运行环境需要 Node.js 20+，Figma 侧仍需打开配套插件。

已添加 marketplace 时，只需安装 `codex-figma-bridge@codex-figma`。使用本地仓库作为 marketplace 时，从仓库根目录执行：

```bash
codex plugin marketplace add .
codex plugin add codex-figma-bridge@codex-figma
```

Codex 插件 0.5.0 起同时内置 Figma 侧插件压缩包。安装 Codex 插件后直接对 Agent 说：

> 帮我安装 Figma 插件，给我压缩包和安装教程

Agent 会提供可另存的 ZIP 和教程链接。也可以直接获取仓库中的 [Figma 插件压缩包](packages/codex-plugin/assets/figma-plugin/codex-figma-plugin.zip) 与 [完整安装教程](packages/codex-plugin/assets/figma-plugin/INSTALL.md)。

1. 将 ZIP 另存到本地，完整解压到长期保留的目录。
2. 在 Figma 桌面版的 **Plugins → Development → Import new plugin from manifest…** 中选择解压后的 `codex-figma-plugin/manifest.json`。
3. 运行 **Codex Figma Bridge**，URL 使用 `http://localhost:11111`，等待 `bridge up`。
4. 保持插件打开，向 Codex 请求：`获取 figma 节点「创建二维码」的截图`。

不用克隆源码或编译插件；不要只保存 manifest，也不要在导入后删除解压目录。若希望 Agent 帮忙保存到指定目录，可以说“把 Figma 插件压缩包保存到 /我的目录”。Figma 的导入操作由用户在桌面版中完成。

Codex 插件自带预构建的 `runtime/bridge.mjs`、MCP 配置和 SessionStart hook。按 Codex 的 hook 信任流程，在 `/hooks` 检查并信任后，新 session 会自动启动 Bridge；已经有兼容 Bridge 在运行时直接复用。多个 session 共享服务，结束 session 不停止它。hook 不会下载依赖，也不会终止占用端口的其他服务。

默认启动插件内置 Bridge，不会查找全局可执行文件。`CODEX_FIGMA_BRIDGE_ENTRY` 仅作为开发时的显式覆盖；正式使用可移除之前设置的该变量。若提示缺少 `runtime/bridge.mjs`，请重新安装完整插件包。

Figma 侧插件只需导入一次；升级时重新向 Agent 索取压缩包，并按教程更新本地文件。开发者才需要 `pnpm install` 和构建命令。

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

Codex 插件 0.4.0 起内置 Bridge。正式使用只需更新 Codex 插件包；升级后如需切换到包内新版运行时，先停止旧 Bridge，再启动新 session。旧缓存协议的 Bridge 不会被新 hook 复用。

开发者修改源码后执行：

```bash
pnpm install
pnpm --filter @codex-figma/bridge run clean
pnpm build
pnpm --filter @codex-figma/codex-plugin check:bundle
pnpm -r run typecheck
pnpm --filter @codex-figma/bridge test
node --test packages/codex-plugin/tests/*.test.mjs
```

发布时必须包含 `packages/codex-plugin/runtime/` 和 `assets/figma-plugin/`：Bridge、Figma ZIP、安装教程及许可证随源码保留，marketplace 安装无需运行构建。ZIP 始终从当前 Figma 源码构建，不读取可能过期的 dist。`check:bundle` 检查产物是否与源码一致，`prepack` 也会执行此检查。重装已缓存的 Codex 插件并重开 session 后使用新版；Figma 侧代码变更后也需重载插件。历史设计缓存不再读取或写入，也不会自动删除。

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
