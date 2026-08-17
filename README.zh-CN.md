# Codex Figma Bridge

把你的 **当前 Figma 选区** 还原成代码，写进任意本地仓库 —— 无需 Figma URL、无需云连接器、无需 Dev Seat。

一个 Figma Desktop 插件采集用户当前选中的内容（节点树、样式、文字、变量、组件、截图、SVG 图标），通过 HTTP 上报给运行在 `localhost:3845` 的 **本地 Bridge**。Bridge 缓存这些上下文，并通过一个 **MCP server** 暴露给 Codex CLI。Codex 读取节点信息 + 截图，修改本地仓库，然后运行 lint / typecheck。

```
┌───────────────────────────────┐
│          Figma Desktop        │
│                               │
│   用户选中 Frame / Group       │
│              │                │
│              ▼                │
│       Figma Plugin            │
│   ┌───────────────────────┐   │
│   │ selection             │   │
│   │ node tree             │   │
│   │ CSS / Auto Layout     │   │
│   │ text                  │   │
│   │ variables             │   │
│   │ component info        │   │
│   │ screenshot / SVG      │   │
│   └──────────┬────────────┘   │
└──────────────┼────────────────┘
               │ HTTP (POST /selection + GET /events SSE)
               ▼
┌───────────────────────────────┐
│        Local Bridge           │
│      localhost:3845           │
│                               │
│   current-selection.json      │
│   images / screenshots        │
│   Figma context cache         │
│                               │
│   MCP Server (Streamable HTTP)│
│   ├─ get_selection            │
│   ├─ get_node                 │
│   ├─ get_screenshot           │
│   ├─ get_asset                │
│   ├─ list_nodes               │
│   └─ get_variables            │
└──────────────┬────────────────┘
               │ MCP (POST /mcp)
               ▼
┌───────────────────────────────┐
│         Codex CLI / IDE       │
│                               │
│  读取当前 repository          │
│  读取 AGENTS.md               │
│  调用 Figma MCP tools         │
│  修改 React / CSS / Tailwind  │
│  运行 lint / typecheck        │
└───────────────────────────────┘
```

## 仓库结构

| 路径                                                     | 组件                   | 作用                                                       |
| -------------------------------------------------------- | ---------------------- | ---------------------------------------------------------- |
| [`figma-plugin/`](packages/figma-plugin/)                         | Figma Desktop 插件     | 采集当前选区并上报给 Bridge。                              |
| [`bridge/`](packages/bridge/)                                     | 本地 HTTP + MCP server | 把选区缓存到磁盘，并通过 MCP 工具暴露给 Codex。            |
| [`codex-plugin/`](packages/codex-plugin/)                         | Codex CLI 插件         | Skill + command + agents，教 Codex 如何使用本地 MCP 工具。 |
| [`2.0.17/`](2.0.17/)                                     | 参考实现（只读）       | Figma 官方 Codex 插件（云连接器版本），用于对比。          |
| [`AGENTS.md.template`](AGENTS.md.template)               | 可直接放入仓库的规则   | 复制到目标仓库，指导 Codex 在还原 Figma 设计时的行为。     |
| [`codex-config.snippet.toml`](codex-config.snippet.toml) | Codex 配置片段         | 写入 `~/.codex/config.toml` 的 MCP server 配置片段。       |

## 前置条件

- **Node.js ≥ 20**（在 Node 22 上测试通过）
- **pnpm 9+**（`corepack enable pnpm` 或 `npm i -g pnpm`）—— 本项目是 pnpm workspace monorepo
- **Figma Desktop**（插件 API 只在桌面端运行，浏览器里不行）
- 支持 MCP 的 **Codex CLI**

## 安装（3 步）

### 1. 启动 Bridge

```bash
pnpm install        # 根目录：一次性安装所有 workspace 包（bridge + figma-plugin + codex-plugin）
pnpm start          # = pnpm --filter @codex-figma/bridge run start
```

你会看到：

```
codex-figma-bridge v0.1.0 listening on http://127.0.0.1:3845
  cache: ~/Library/Caches/codex-figma-bridge
  mcp:   http://127.0.0.1:3845/mcp
```

冒烟测试一下：

```bash
curl http://localhost:3845/health
# → {"ok":true,"version":"0.1.0","capturedAt":null,"selectionCount":0,...}
```

### 2. 安装 Figma 插件

1. `pnpm -r run build`（在仓库根目录执行 —— 构建 figma-plugin 的 `dist/code.js` + `dist/ui.html` 和 bridge 的 `dist/`）
2. 打开 Figma Desktop → **菜单 → Plugins → Development → New Plugin…**
3. 点击 **"Click to link a plugin from your file system"**
4. 选择 [`figma-plugin/manifest.json`](packages/figma-plugin/manifest.json)。
5. 从菜单运行插件（菜单 → Plugins → Development → Codex Figma Bridge）。
6. 在插件面板里：
   - 确认 Bridge URL 是 `http://localhost:3845`。
   - 状态指示灯应该显示 **"bridge up"**。
   - 打开 **Auto-push on selection change** 开关。
7. 在 Figma 里选中一个 Frame。面板会闪过 "just now · 1 selected · N nodes · 1 screenshot · M icons"。

在磁盘上验证：

```bash
cat ~/Library/Caches/codex-figma-bridge/current-selection.json
```

### 3. 配置 Codex CLI

把 [`codex-config.snippet.toml`](codex-config.snippet.toml) 里的片段追加到 `~/.codex/config.toml`：

```toml
[mcp_servers.codex-figma-bridge]
type = "http"
url = "http://localhost:3845/mcp"
```

安装 Codex 插件（可选 —— 给 Codex 提供 skill + 斜杠命令）：

```bash
codex plugin install ./codex-plugin
```

如果你跳过插件安装，把 [`AGENTS.md.template`](AGENTS.md.template) 复制到目标仓库根目录命名为 `AGENTS.md`，Codex 依然能学到这套工作流。

## 使用

在任意目标仓库里，确保 Bridge 已启动且 Figma 里已选中一个 Frame：

```bash
codex "implement my current Figma selection as a React component"
```

或者安装了插件后：

```
/implement-from-figma
```

Codex 会：

1. 调用 `get_selection` → 查看你选中了什么。
2. 调用 `get_node` → 读取完整节点树（布局、样式、文字、变量、组件）。
3. 调用 `get_screenshot` → 拉取视觉参考。
4. 对每个图标调用 `get_asset` → 拉取 SVG 字节并提交到仓库。
5. 把设计适配到你的项目技术栈（复用已有组件 + tokens）。
6. 运行 lint / typecheck / 预览，并报告还原度。

## MCP 工具

| 工具             | 入参                                                                  | 返回                                 |
| ---------------- | --------------------------------------------------------------------- | ------------------------------------ |
| `get_selection`  | （无）                                                                | 文件/页面/选区摘要。务必第一个调用。 |
| `get_node`       | `{ nodeId, depth?, includeStyles?, includeVariables?, includeText? }` | 序列化后的节点树。                   |
| `get_screenshot` | `{ nodeId, format? }`                                                 | PNG 图片内容（base64）。             |
| `get_asset`      | `{ nodeId, format? }`                                                 | SVG（图标首选）或 PNG 图片内容。     |
| `list_nodes`     | `{ type?, name? }`                                                    | 在缓存的树里搜索命中的节点。         |
| `get_variables`  | `{ collectionName? }`                                                 | 设计 token 绑定关系。                |

另外还有 MCP 资源 `figma://selection/current`。

## 缓存目录结构

Bridge 写入 `~/Library/Caches/codex-figma-bridge/`（macOS）或 `~/.cache/codex-figma-bridge/`（Linux）。可用 `CODEX_FIGMA_BRIDGE_ROOT` 覆盖。

```
codex-figma-bridge/
├── current-selection.json    # 最新的选区摘要
├── nodes/<id>.json           # 每个被采集的节点树根一个文件
├── assets/<id>.png           # PNG 截图
├── assets/<id>.svg           # SVG 图标
├── events.jsonl              # 只追加的事件日志
└── bridge.log                # 结构化日志
```

## 配置

| 环境变量                       | 默认值                                 | 作用                                     |
| ------------------------------ | -------------------------------------- | ---------------------------------------- |
| `CODEX_FIGMA_BRIDGE_PORT`      | `3845`                                 | Bridge 监听的端口。                      |
| `CODEX_FIGMA_BRIDGE_HOST`      | `127.0.0.1`                            | Bridge 绑定的主机。                      |
| `CODEX_FIGMA_BRIDGE_ROOT`      | 系统 cache 目录 + `codex-figma-bridge` | 缓存存放位置。                           |
| `CODEX_FIGMA_BRIDGE_LOG_LEVEL` | `info`                                 | `debug` \| `info` \| `warn` \| `error`。 |

如果你改了端口，记得同步更新 [`figma-plugin/manifest.json`](packages/figma-plugin/manifest.json) 的 `networkAccess.allowedDomains` 和 [`codex-config.snippet.toml`](codex-config.snippet.toml)。

## 与 Figma 官方 Codex 插件的区别

参考实现 [`2.0.17/`](2.0.17/) 用的是 Figma 的 **云 MCP 连接器**（在 [`.app.json`](2.0.17/.app.json) 里声明），基于一个 Figma URL 工作。那需要 Figma Dev Seat 和一个云端中转。

本项目改用 **本地 Bridge**：

- 没有云连接器 —— Figma 插件直接通过 HTTP 跟 localhost server 通信。
- 不需要 Figma URL —— Agent 看到的是用户当前的实时选区。
- 不需要 Dev Seat —— 任何能跑插件的 Figma 账号都可用。
- 只读 —— Bridge 不能回写 Figma。反向写回请用 Figma 的云连接器。

## 开发

从仓库根目录执行（pnpm workspace 聚合各子包脚本）：

```bash
pnpm dev                                          # = pnpm --filter @codex-figma/bridge run dev（tsx watch）
pnpm --filter @codex-figma/figma-plugin run watch  # esbuild watch —— 文件变更重新构建
```

类型检查：

```bash
pnpm -r run typecheck
```

## 故障排查与调试

系统分三层 —— 按从最易调（Bridge）向外的顺序排查。

> **Monorepo 提示**：本项目是 pnpm workspace。所有命令都从仓库根目录用 `pnpm -r run <script>`（所有包）或 `pnpm --filter <pkg> run <script>`（单个包）执行。在子包目录里直接跑 `npm run <script>` 不可行 —— 共享的 devDependencies（`typescript`、`@types/node`）在根目录，子包的 `node_modules` 里看不到。

### 1. Bridge（localhost）

Bridge 是一个普通的 HTTP server，最容易观察。

```bash
# 以 debug 日志启动（结构化 JSONL → stderr + bridge.log）
CODEX_FIGMA_BRIDGE_LOG_LEVEL=debug pnpm --filter @codex-figma/bridge run dev

# 跟踪结构化日志
tail -f ~/Library/Caches/codex-figma-bridge/bridge.log

# 存活 + 缓存状态
curl http://127.0.0.1:3845/health

# 实时看 SSE 事件（selection-change 广播）
curl -N http://127.0.0.1:3845/events

# 查看缓存里的原始 payload
cat ~/Library/Caches/codex-figma-bridge/current-selection.json | jq .
```

**MCP Inspector** —— 官方 GUI，也是最好用的调试工具。它能可视化 `tools/list`、让你手动调用任意工具，并显示原始 JSON-RPC 流量：

```bash
npx @modelcontextprotocol/inspector
```

在界面里选 transport `Streamable HTTP`，URL 填 `http://127.0.0.1:3845/mcp`，连上即可。你应该能看到全部 6 个工具，并能手动调用 `get_selection` —— 这一步绕开 Figma 和 Codex，单独验证 Bridge。

### 2. Figma 插件（运行在 Figma 沙箱内）

插件跑在两个 context 里，各自有独立的 console。

| Context           | 文件                                  | `console.log` 去哪                                                |
| ----------------- | ------------------------------------- | ----------------------------------------------------------------- |
| Sandbox（无 DOM） | [`code.ts`](packages/figma-plugin/src/code.ts) | Figma 主 Dev Console                                              |
| UI iframe         | [`ui.ts`](packages/figma-plugin/src/ui/ui.ts)  | iframe console —— 在 DevTools 顶部的下拉里切换到该 iframe context |

打开 console：Figma Desktop → **Plugins → Development → &lt;plugin&gt;** 运行插件，然后 **菜单 → Plugins → Development → Open Console**（macOS 上 `Cmd+Opt+I`）。

常见问题：

- **Manifest 导入报错：`Invalid value for allowedDomains. '...' must be a valid URL`** —— Figma 的 URL 校验器拒绝 IP 字面量（如 `http://127.0.0.1:3845`）。必须用 `localhost` 主机名：`http://localhost:3845`。`allowedDomains` 里所有条目都只能用 `localhost`，不能用 `127.0.0.1`。
- **`fetch failed` / CORS 报错** —— [`manifest.json`](packages/figma-plugin/manifest.json) 的 `networkAccess.allowedDomains` 必须包含你的 Bridge URL（默认 `http://localhost:3845`）。如果你改了 Bridge 端口，这里也要同步改 —— 且主机名必须保持 `localhost`（见上一条）。
- **`ReferenceError: 'AbortController' is not defined`** —— Figma 插件 sandbox（[`code.ts`](packages/figma-plugin/src/code.ts) 运行的地方）是精简的 QuickJS 环境，不提供 `AbortController`。fetch 超时请改用 `Promise.race` + `setTimeout`。[`bridge-client.ts`](packages/figma-plugin/src/bridge-client.ts) 已经这么做了 —— 新增 sandbox 侧网络代码时请遵循同样模式。（`XMLHttpRequest`、`FormData`、`localStorage` 等浏览器专属全局也不在 sandbox 里；UI 侧的 [`ui.ts`](packages/figma-plugin/src/ui/ui.ts) 跑在真实 iframe 里，可自由使用。）
- **"bridge down" 指示灯一直红** —— Bridge 没启动，或端口对不上。点 **Probe** 重新检测。
- **选中节点后 Bridge 日志里没有 `selection stored`** —— 插件只在真正选中节点时触发，点空白画布不算。在图层面板里选中 Frame/Component/图层，然后点 **Push now**。
- **Push 成功但 `selectionCount: 0`** —— 推送那一刻选区是空的。重新选中再推。

### 3. Codex CLI（消费端）

Codex 基本是个黑盒，但 Bridge 日志会精确告诉你它在干什么：

```bash
# 让 Codex 跑一次后，过滤 MCP 活动
tail -f ~/Library/Caches/codex-figma-bridge/bridge.log | grep mcp
```

你应该按顺序看到：

1. `mcp session initialized` —— Codex 已连上。
2. `tools/call get_selection` —— Codex 查询了选区。
3. 更多 `tools/call` —— 它在遍历节点树。

**没看到 `mcp session initialized`**：

- 确认 [`codex-config.snippet.toml`](codex-config.snippet.toml) 已合并进你的 Codex 配置。
- 跑 `codex mcp list`（或等价命令）确认 server 已注册。
- 检查配置里的 Bridge URL 端口和 Bridge 实际端口一致。

**Codex 连上了但不调工具**：

- 确保目标仓库根目录有 `AGENTS.md`（从 [`AGENTS.md.template`](AGENTS.md.template) 复制）—— 那才是教 Codex 工作流的东西。
- 或者显式触发 skill：`/implement-from-figma`。

### 端到端冒烟测试（无需 Figma 和 Codex）

最快验证整条链路的方法，不用打开 Figma 或 Codex：

```bash
# 1. 在临时端口上启动 bridge
CODEX_FIGMA_BRIDGE_PORT=3951 pnpm --filter @codex-figma/bridge run start &

# 2. 注入一个假 selection（绕过 Figma 插件）
curl -X POST http://127.0.0.1:3951/selection \
  -H 'content-type: application/json' \
  --data '{"fileKey":"test","fileName":"t","pageId":"0:1","pageName":"p","capturedAt":"2026-08-17T00:00:00Z","pluginVersion":"0.1.0","selection":[],"nodes":{},"assets":{}}'

# 3. 确认 Bridge 收到了（selectionCount 应该非 0）
curl http://127.0.0.1:3951/health

# 4. 把 MCP Inspector 指向 http://127.0.0.1:3951/mcp，调用 get_selection
```

推荐顺序：**Bridge（curl + Inspector）→ +Figma（DevTools console）→ +Codex（bridge.log grep mcp）**。逐层独立确认没问题再往上叠，这样能最快定位是哪一环坏了。

## 许可证

MIT。见 [`LICENSE`](LICENSE)（或各子包的 `package.json`）。
