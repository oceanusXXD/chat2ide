# 架构

`chat2ide` 的架构围绕一个主路径：浏览器或手机通过 WebSocket 附着到服务器上的真实 PTY，PTY 内运行 Codex CLI。

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
- 多终端标签页。
- `xterm.js` 终端视图。
- 手机端底部输入栏。
- `Ctrl+C`、停止、重启、关闭、重连、刷新输出。
- WebSocket 断线重连与 ring buffer 回放。

### HTTP + WebSocket 服务

相关文件：

- [src/server/index.ts](../src/server/index.ts)
- [src/server/ws/terminalSocketHub.ts](../src/server/ws/terminalSocketHub.ts)

职责：

- 提供 `/api/*` HTTP API。
- 提供 `/ws` WebSocket。
- 处理 PIN 登录、cookie、session。
- 校验 WebSocket origin。
- 把前端输入、resize、attach 转发给终端管理器。
- 在生产构建后提供静态前端资源。

### 终端会话管理

相关文件：

- [src/server/terminal/terminalSessionManager.ts](../src/server/terminal/terminalSessionManager.ts)
- [src/server/terminal/codexPtyRunner.ts](../src/server/terminal/codexPtyRunner.ts)
- [src/server/terminal/ringBuffer.ts](../src/server/terminal/ringBuffer.ts)

职责：

- 创建多个独立终端记录。
- 维护每个终端的 `id`、`name`、`status`、`cwd`、`pid`、尺寸、最近退出信息和 ring buffer。
- 用 `node-pty` 启动 Codex CLI。
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

### 登录

1. 浏览器请求 `GET /api/auth/me` 判断当前 session。
2. 未登录时，用户提交 `POST /api/auth/pin`。
3. 服务端校验 PIN，设置 `HttpOnly` cookie。
4. 前端进入主控制台并建立 `/ws` 连接。

### 新建终端

1. 前端请求 `POST /api/terminals`。
2. 服务端创建一个 `starting` 状态的终端记录，但还不启动 PTY。
3. 前端切换到该标签页并发送 WebSocket `attach`。
4. 服务端发送 `terminal_reset`、`terminal_updated` 和 ring buffer replay。
5. 如果这是首次 attach，服务端调用 `startIfPending` 启动 Codex CLI PTY。

这个延迟启动语义能避免 Codex CLI 的启动阶段交互输出在前端 xterm 尚未准备好时丢失。

### 输入与输出

1. 前端发送 `{ "type": "input", "terminalId": "...", "data": "...\r" }`。
2. 服务端写入对应 PTY。
3. PTY 输出进入 ring buffer。
4. 服务端把输出推送给已 attach 该 terminal 的 WebSocket 客户端。
5. 前端把原始 PTY 字节流写入 `xterm.js`。

### 重连与回放

1. 浏览器 WebSocket 断线后自动重连。
2. 重连成功后，前端对当前活动终端重新发送 `attach`。
3. 服务端先发 `terminal_reset`，再按顺序回放 ring buffer。
4. 回放结束后继续推送实时输出。

## 为什么使用 PTY

Codex CLI 是交互式命令行工具。普通 stdout/stderr 管道无法完整表达终端行为。`node-pty` 能保留：

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
