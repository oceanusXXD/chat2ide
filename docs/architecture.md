# 架构

## 产品裁决

当前产品裁决非常明确：

- `CLI direct mode` 是唯一主路径
- `PTY + xterm.js` 是唯一主呈现路径
- `Cloudflare Tunnel` 是默认公网暴露方式
- `PIN + HttpOnly session cookie` 是默认认证方式
- `helper / relay / vscode-extension` 降为 legacy，不参与主闭环
- 不使用数据库

## 核心组件

### 1. Frontend Terminal App

位置：

- [web/src/App.tsx](/home/coder/data/chat2ide/web/src/App.tsx)
- [web/src/components/TerminalPane.tsx](/home/coder/data/chat2ide/web/src/components/TerminalPane.tsx)
- [web/src/components/TerminalTabs.tsx](/home/coder/data/chat2ide/web/src/components/TerminalTabs.tsx)
- [web/src/hooks/useTerminalSocket.ts](/home/coder/data/chat2ide/web/src/hooks/useTerminalSocket.ts)

职责：

- PIN 登录
- 顶部状态区
- 多 terminal tabs
- `xterm.js` 终端视图
- 移动端输入栏
- stop / restart / close / reconnect
- 断线后重新附着

### 2. HTTP + WebSocket Server

位置：

- [src/server/index.ts](/home/coder/data/chat2ide/src/server/index.ts)
- [src/server/ws/terminalSocketHub.ts](/home/coder/data/chat2ide/src/server/ws/terminalSocketHub.ts)

职责：

- 提供 `/api/*`
- 提供 `/ws`
- 处理 PIN 登录、cookie、session
- 将前端操作转发给 terminal manager
- 提供静态前端产物

### 3. Terminal Session Manager

位置：

- [src/server/terminal/terminalSessionManager.ts](/home/coder/data/chat2ide/src/server/terminal/terminalSessionManager.ts)
- [src/server/terminal/codexPtyRunner.ts](/home/coder/data/chat2ide/src/server/terminal/codexPtyRunner.ts)
- [src/server/terminal/ringBuffer.ts](/home/coder/data/chat2ide/src/server/terminal/ringBuffer.ts)

职责：

- 创建多个独立终端
- 为每个终端维护：
  - `id`
  - `name`
  - `status`
  - `cwd`
  - `pid`
  - `cols`
  - `rows`
  - `lastExitCode`
  - `lastExitSignal`
  - `ring buffer`
- 支持：
  - `create`
  - `list`
  - `rename`（可选）
  - `input`
  - `resize`
  - `stop`
  - `restart`
  - `close`
  - `replay`

### 4. Auth / Session

位置：

- [src/server/auth/pinAuth.ts](/home/coder/data/chat2ide/src/server/auth/pinAuth.ts)
- [src/server/auth/sessionManager.ts](/home/coder/data/chat2ide/src/server/auth/sessionManager.ts)
- [src/server/config.ts](/home/coder/data/chat2ide/src/server/config.ts)

职责：

- 校验 `APP_PIN` 或 `APP_PIN_HASH`
- 内存 session
- 登录失败限速与短暂锁定
- 根据 `X-Forwarded-Proto` / `APP_PUBLIC_ORIGIN` / `APP_COOKIE_SECURE` 决定 secure cookie

## 数据流

### 登录

1. 浏览器 `POST /api/auth/pin`
2. 服务端校验 PIN
3. 服务端返回 HttpOnly cookie
4. 浏览器调用 `/api/auth/me` 和 `/ws`

### 终端附着

1. 浏览器建立 WebSocket
2. 浏览器对每个 terminal 发送 `{ type: "attach", terminalId }`
3. 服务端返回：
   - `terminal_reset`
   - `terminal_updated`
   - 最近 ring buffer 输出块
4. 后续该 terminal 的输出只推给已 attach 的客户端

### 输入

1. 浏览器发送 `{ type: "input", terminalId, data }`
2. 服务端写入对应 PTY
3. PTY 输出块经 WebSocket 回推
4. `xterm.js` 原样写入终端视图

## 重连策略

- 浏览器断线后会重连 WebSocket
- 重连成功后重新对每个已知 terminal 执行 `attach`
- 服务端回放 ring buffer
- 终端视图恢复到最近缓冲状态

## 为什么选择 `node-pty`

- 需要保留真实终端语义
- 需要尽量原样保留 CLI 输出
- 需要支持长生命周期进程，而不是一次 prompt 一次退出
- 需要支持多终端
- 需要处理终端尺寸变化
- 需要 attach / detach / replay

## 仓库收敛状态

旧的 `helper/`、`vscode-extension/`、relay/local 相关目录和重复运行时目录已经从当前仓库主路径中移除。

当前仓库只保留远程终端控制台所需的活动代码与文档。
