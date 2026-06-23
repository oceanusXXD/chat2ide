# 架构

`chat2ide` 的架构围绕两条入口：浏览器或手机通过 `/ws` 附着到统一终端路由；后端终端可以是服务器上的真实 PTY，也可以是 IDE 插件/桌面客户端通过 `/bridge` 发布的 direct client session。

## 组件

### 前端终端应用

相关文件：

- [web/src/App.tsx](../web/src/App.tsx)
- [web/src/components/TerminalPane.tsx](../web/src/components/TerminalPane.tsx)
- [web/src/components/TerminalTabs.tsx](../web/src/components/TerminalTabs.tsx)
- [web/src/components/ComposerBar.tsx](../web/src/components/ComposerBar.tsx)
- [web/src/hooks/useTerminalSocket.ts](../web/src/hooks/useTerminalSocket.ts)

职责：

- PIN 登录页与主控制台。
- 启动 profile 选择器：显示命令、工作目录和 profile 说明。
- 多终端标签页。
- `xterm.js` 终端视图。
- 手机端底部输入栏。
- `Ctrl+C`、停止、重启、关闭、重连、刷新输出。
- WebSocket 断线重连与 ring buffer 回放。

### HTTP + WebSocket 服务

相关文件：

- [src/server/index.ts](../src/server/index.ts)
- [src/server/ws/terminalSocketHub.ts](../src/server/ws/terminalSocketHub.ts)
- [src/server/ws/clientBridgeSocketHub.ts](../src/server/ws/clientBridgeSocketHub.ts)

职责：

- 提供 `/api/*` HTTP API。
- 提供浏览器 `/ws` WebSocket。
- 在配置 `APP_BRIDGE_TOKEN` 或 `APP_BRIDGE_CLIENTS` 后提供客户端 `/bridge` WebSocket。
- 处理 PIN 登录、cookie、session。
- 校验 WebSocket origin。
- 把前端输入、resize、attach 转发给统一终端路由。
- 把 bridge 客户端的 session、输出、状态更新转成普通终端事件。
- 在生产构建后提供静态前端资源。

### 终端会话管理

相关文件：

- [src/server/terminal/terminalSessionManager.ts](../src/server/terminal/terminalSessionManager.ts)
- [src/server/terminal/terminalSessionRouter.ts](../src/server/terminal/terminalSessionRouter.ts)
- [src/server/bridge/clientBridgeSessionManager.ts](../src/server/bridge/clientBridgeSessionManager.ts)
- [src/server/terminal/codexPtyRunner.ts](../src/server/terminal/codexPtyRunner.ts)
- [src/server/terminal/ringBuffer.ts](../src/server/terminal/ringBuffer.ts)

职责：

- 创建多个独立终端记录。
- 维护每个终端的 `id`、`name`、`profileId`、`profileName`、`commandDisplay`、`status`、`cwd`、`pid`、尺寸、最近退出信息和 ring buffer。
- 用 `node-pty` 启动当前 profile 对应的 CLI / wrapper。
- 管理 direct client bridge 会话，维护外部 session 的摘要和 ring buffer。
- 通过 `TerminalSessionRouter` 的 backend registry 合并 PTY 和 bridge session，让 REST 和 `/ws` 共享同一套终端操作，并为后续 backend 保留扩展入口。
- 广播输出、退出、错误和状态更新。
- 在重启终端时清空 ring buffer 并启动新 PTY。

### 认证与配置

相关文件：

- [src/server/auth/pinAuth.ts](../src/server/auth/pinAuth.ts)
- [src/server/auth/sessionManager.ts](../src/server/auth/sessionManager.ts)
- [src/server/config.ts](../src/server/config.ts)

职责：

- 从 `.env`、`.env.local` 和进程环境变量加载配置。
- 校验 `APP_PIN` 或 `APP_PIN_HASH`。
- 登录失败限速。
- 管理内存 session。
- 根据 HTTPS、代理头和配置决定 cookie secure 行为。

## 数据流

### Profile 加载

1. 服务端从 `CODEX_COMMAND` / `CODEX_ARGS` / `CODEX_CWD` 构造默认 `codex` profile。
2. 如果配置了 `TERMINAL_PROFILES`，服务端解析 JSON 数组并追加为额外启动入口。
3. 登录后的前端请求 `GET /api/profiles`。
4. 前端在顶部启动栏展示 profile 名称、命令、工作目录和说明。

Profile 是 `chat2ide` 的 CLI 接入边界。一个 profile 可以是普通 AI coding CLI，也可以是 wrapper 脚本，或者是 `codex --remote wss://...` 这类连接到已加固 app-server 的远程 TUI。

### Direct Client Bridge

1. 服务端只有在 `APP_BRIDGE_TOKEN` 或 `APP_BRIDGE_CLIENTS` 存在时开启 `/bridge`。
2. IDE 插件、桌面 App 或本机 companion 用 `Authorization: Bearer <token>` 建立 WebSocket。
3. 客户端第一条消息必须是 `hello`。`hello` 可携带 `protocolVersion` 和 `capabilities`，服务端返回 `ready` 和规范化后的 `clientId`。
4. 如果使用 `APP_BRIDGE_CLIENTS` scoped token，服务端会把 token 绑定到配置中的 `clientId`，拒绝冒用其他客户端 id。
5. 客户端用 `session_upsert` 发布一个或多个外部 session，用 `session_output` 推送输出，用 `session_status` / `session_closed` 更新生命周期。
6. 这些 session 会以 `backend: "client_bridge"` 出现在 `GET /api/terminals` 和浏览器 `/ws` 的 `terminal_list` 中。
7. 手机端输入、resize、停止、重启、关闭会被路由为 bridge server message，发回拥有该 session 的客户端。
8. 服务端对 bridge socket 做 heartbeat；输出推送受 `APP_WS_MAX_BUFFERED_BYTES` 约束，慢客户端会被断开，防止无限排队。

这条路径用于没有独立可运行 CLI 的产品。客户端仍然在它自己的进程里持有 IDE/plugin/desktop 上下文，`chat2ide` 只转发移动端控制和最近输出回放。

### 登录

1. 浏览器请求 `GET /api/auth/me` 判断当前 session。
2. 未登录时，用户提交 `POST /api/auth/pin`。
3. 服务端校验 PIN，设置 `HttpOnly` cookie。
4. 前端进入主控制台并建立 `/ws` 连接。

### 新建终端

1. 前端请求 `POST /api/terminals`。
2. 请求可以携带 `profileId`；服务端解析 profile，创建一个 `starting` 状态的终端记录，但还不启动 PTY。
3. 前端切换到该标签页并发送 WebSocket `attach`。
4. 服务端发送 `terminal_reset`、`terminal_updated` 和 ring buffer replay。
5. 如果这是首次 attach，服务端调用 `startIfPending`，按 profile 的 `command`、`args` 和 `cwd` 启动真实 PTY。

这个延迟启动语义能避免 CLI 的启动阶段交互输出在前端 xterm 尚未准备好时丢失。

### 输入与输出

1. 前端发送 `{ "type": "input", "terminalId": "...", "data": "...\r" }`。
2. 服务端通过统一路由写入对应 backend：PTY 写入真实 pty，bridge 转发给拥有该 session 的客户端。
3. backend 输出进入 ring buffer。
4. 服务端把输出推送给已 attach 该 terminal 的 WebSocket 客户端。
5. 前端把原始字节流写入 `xterm.js`。

### 重连与回放

1. 浏览器 WebSocket 断线后自动重连。
2. 重连成功后，前端对当前活动终端重新发送 `attach`。
3. 服务端先发 `terminal_reset`，再按顺序回放 ring buffer。
4. 回放结束后继续推送实时输出。

## 为什么使用 PTY

Codex CLI 和大多数 AI coding CLI 都是交互式命令行工具。普通 stdout/stderr 管道无法完整表达终端行为。`node-pty` 能保留：

- ANSI 颜色和光标控制。
- 交互式输入。
- 终端尺寸变化。
- Ctrl+C 等控制字符。
- 长生命周期进程。

## 状态持久化边界

所有运行状态都在内存中：

- 登录 session。
- 终端进程。
- 每个终端的 ring buffer。

服务进程重启后，这些状态都会消失。当前版本不引入数据库，也不尝试恢复已退出的 PTY 进程。

## 与 Codex mobile / app-server 的边界

Codex 官方移动端 remote-control 是“手机连接到可信 Codex App host”：host 提供项目、文件、凭据、插件、MCP、浏览器/桌面能力和安全策略，手机负责发送指令、审批动作、查看输出和继续会话。

`chat2ide` 采用更轻的自托管模型：手机浏览器连接到本应用，应用只暴露 PIN 保护的 Web UI、REST、WebSocket 和 PTY。它不接管 Codex App 的云同步、官方安全 relay、IDE 插件上下文或 ChatGPT mobile UI。

如果需要更深的 Codex 原生集成，可以通过 profile 启动 `codex --remote`，连接到已经配置 WebSocket auth 和 TLS 的 `codex app-server`。这仍然应作为显式 profile，而不是让 `chat2ide` 默认暴露未认证 app-server。

## 与开源远程终端 / 编辑器方案的取舍

开源远程终端如 ttyd、Wetty、GoTTY 通常把 PTY 绑定到 WebSocket，再由浏览器显示终端；code-server 这类浏览器 IDE 则把编辑器服务端搬到浏览器。`chat2ide` 选择前者的窄边界：只转发 PTY 字节流、输入和 resize，不实现浏览器 IDE，也不试图远程控制编辑器插件 GUI。

因此，编辑器插件类产品的推荐接入方式是：

- 有 CLI：配置成 profile，直接通过 PTY 控制。
- 有官方 app-server / remote mode：配置成 profile，并在外部先做好认证和 TLS。
- 没有独立 CLI，但能写 IDE/plugin/desktop companion：用 `/bridge` 直连客户端，把外部会话发布到同一个移动端终端列表。
- 只有 GUI 插件或云工作台且不能接 companion：不要声明为直接接入；可以用 shell profile 在同一项目目录里跑测试、git、部署脚本或另一个真实 CLI。
