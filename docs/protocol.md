# 协议

协议类型定义集中在 [src/shared/protocol.ts](../src/shared/protocol.ts)。

## HTTP API

所有 `/api/*` 响应都会设置 `Cache-Control: no-store`。

### `GET /api/health`

无需登录。

```json
{
  "ok": true,
  "terminals": 2,
  "ptyTerminals": 1,
  "bridgeEnabled": true,
  "bridgeSessions": 1,
  "publicOrigin": "https://terminal.example.com"
}
```

### `GET /api/auth/me`

```json
{
  "authenticated": true,
  "expiresAt": "2026-04-02T12:00:00.000Z"
}
```

未登录：

```json
{
  "authenticated": false
}
```

### `POST /api/auth/pin`

请求：

```json
{
  "pin": "123456"
}
```

成功：

```json
{
  "authenticated": true,
  "expiresAt": "2026-04-02T12:00:00.000Z"
}
```

失败：

```json
{
  "error": "PIN 不正确或暂时不可用"
}
```

失败次数过多时返回 `429`，并带 `Retry-After`。

### `POST /api/auth/logout`

成功响应：

```text
204 No Content
```

### `GET /api/terminals`

需要登录。

```json
{
  "items": [
	    {
	      "id": "7df5a6b4-6ce7-47f1-8d62-8ec2a3f1b145",
	      "backend": "pty",
	      "name": "Codex 1",
	      "profileId": "codex",
	      "profileName": "Codex CLI",
	      "commandDisplay": "codex",
	      "bridgeClientId": null,
	      "status": "running",
      "createdAt": "2026-04-02T10:00:00.000Z",
      "updatedAt": "2026-04-02T10:01:00.000Z",
      "cwd": "/srv/app",
      "pid": 12345,
      "cols": 120,
      "rows": 32,
      "lastError": null,
      "lastExitCode": null,
      "lastExitSignal": null
    }
  ]
}
```

`backend` 为 `pty` 时表示服务器本地 `node-pty` 进程；为 `client_bridge` 时表示 IDE/plugin/desktop companion 通过 `/bridge` 发布的外部会话。Bridge 会话的 `profileId` 形如 `bridge:<clientId>`，`pid` 始终为 `null`，`bridgeClientId` 为拥有该会话的客户端。

### `GET /api/profiles`

需要登录。返回前端可用于新建终端的启动配置。

```json
{
  "items": [
    {
      "id": "codex",
      "name": "Codex CLI",
      "description": "Default server-side coding CLI",
      "commandDisplay": "codex",
      "cwd": "/srv/app",
      "isDefault": true
    }
  ]
}
```

### `POST /api/terminals`

请求体可为空。服务端会用默认 cwd 和尺寸。

```json
{
  "name": "Fix auth bug",
  "profileId": "codex",
  "cwd": "/srv/app",
  "cols": 120,
  "rows": 32
}
```

响应：

```json
{
  "item": {
	    "id": "7df5a6b4-6ce7-47f1-8d62-8ec2a3f1b145",
	    "backend": "pty",
	    "name": "Fix auth bug",
	    "profileId": "codex",
	    "profileName": "Codex CLI",
	    "commandDisplay": "codex",
	    "bridgeClientId": null,
	    "status": "starting",
    "createdAt": "2026-04-02T10:00:00.000Z",
    "updatedAt": "2026-04-02T10:00:00.000Z",
    "cwd": "/srv/app",
    "pid": null,
    "cols": 120,
    "rows": 32,
    "lastError": null,
    "lastExitCode": null,
    "lastExitSignal": null
  }
}
```

注意：创建后状态是 `starting`。首次 WebSocket `attach` 后才会真正启动 PTY。

如果达到 `TERMINAL_MAX_SESSIONS`，会返回 `400`：

```json
{
  "error": "已达到终端数量上限 (8)"
}
```

### `PATCH /api/terminals/:id`

```json
{
  "name": "Run tests"
}
```

响应：

```json
{
  "item": {
	    "id": "7df5a6b4-6ce7-47f1-8d62-8ec2a3f1b145",
	    "backend": "pty",
	    "name": "Run tests",
	    "profileId": "codex",
	    "profileName": "Codex CLI",
	    "commandDisplay": "codex",
	    "bridgeClientId": null,
	    "status": "running",
    "createdAt": "2026-04-02T10:00:00.000Z",
    "updatedAt": "2026-04-02T10:05:00.000Z",
    "cwd": "/srv/app",
    "pid": 12345,
    "cols": 120,
    "rows": 32,
    "lastError": null,
    "lastExitCode": null,
    "lastExitSignal": null
  }
}
```

### `POST /api/terminals/:id/stop`

```json
{
  "ok": true
}
```

### `POST /api/terminals/:id/restart`

```json
{
  "ok": true
}
```

### `DELETE /api/terminals/:id`

成功响应：

```text
204 No Content
```

## WebSocket

路径：`/ws`

要求：

- 请求必须携带登录 cookie。
- 如果设置了 `APP_PUBLIC_ORIGIN`，WebSocket `Origin` 必须完全匹配。
- 单条消息不能超过 `APP_WS_MAX_MESSAGE_BYTES`。
- `input.data` 不能超过 `TERMINAL_MAX_INPUT_BYTES`。
- 非法消息会被忽略。

## Client -> Server

### `attach`

```json
{
  "type": "attach",
  "terminalId": "7df5a6b4-6ce7-47f1-8d62-8ec2a3f1b145"
}
```

### `input`

```json
{
  "type": "input",
  "terminalId": "7df5a6b4-6ce7-47f1-8d62-8ec2a3f1b145",
  "data": "echo hello\r"
}
```

### `resize`

```json
{
  "type": "resize",
  "terminalId": "7df5a6b4-6ce7-47f1-8d62-8ec2a3f1b145",
  "cols": 120,
  "rows": 32
}
```

### `ping`

```json
{
  "type": "ping"
}
```

## Server -> Client

### `ready`

```json
{
  "type": "ready"
}
```

### `pong`

```json
{
  "type": "pong"
}
```

### `terminal_list`

```json
{
  "type": "terminal_list",
  "items": []
}
```

### `terminal_created`

```json
{
  "type": "terminal_created",
	  "item": {
	    "id": "7df5a6b4-6ce7-47f1-8d62-8ec2a3f1b145",
	    "backend": "pty",
	    "name": "Codex 1",
	    "profileId": "codex",
	    "profileName": "Codex CLI",
	    "commandDisplay": "codex",
	    "bridgeClientId": null,
	    "status": "starting",
    "createdAt": "2026-04-02T10:00:00.000Z",
    "updatedAt": "2026-04-02T10:00:00.000Z",
    "cwd": "/srv/app",
    "pid": null,
    "cols": 120,
    "rows": 32,
    "lastError": null,
    "lastExitCode": null,
    "lastExitSignal": null
  }
}
```

### `terminal_updated`

同样携带完整 `TerminalSummary`。

### `terminal_reset`

表示该终端需要清空当前显示，准备接收新的 replay 或新一代 PTY 输出。

```json
{
  "type": "terminal_reset",
  "terminalId": "7df5a6b4-6ce7-47f1-8d62-8ec2a3f1b145"
}
```

### `terminal_output`

```json
{
  "type": "terminal_output",
  "terminalId": "7df5a6b4-6ce7-47f1-8d62-8ec2a3f1b145",
  "data": "\u001b[?2004h..."
}
```

Replay 输出会带：

```json
{
  "type": "terminal_output",
  "terminalId": "7df5a6b4-6ce7-47f1-8d62-8ec2a3f1b145",
  "data": "previous output",
  "replay": true
}
```

### `terminal_exit`

```json
{
  "type": "terminal_exit",
  "terminalId": "7df5a6b4-6ce7-47f1-8d62-8ec2a3f1b145",
  "code": 0,
  "signal": null
}
```

### `terminal_error`

```json
{
  "type": "terminal_error",
  "terminalId": "7df5a6b4-6ce7-47f1-8d62-8ec2a3f1b145",
  "message": "启动 Codex CLI 失败"
}
```

### `terminal_closed`

```json
{
  "type": "terminal_closed",
  "terminalId": "7df5a6b4-6ce7-47f1-8d62-8ec2a3f1b145"
}
```

## Client Bridge WebSocket

路径：`/bridge`

要求：

- 仅当配置 `APP_BRIDGE_TOKEN` 或 `APP_BRIDGE_CLIENTS` 时开启。
- 请求必须携带 `Authorization: Bearer <token>`；服务端要求 token 至少 32 字节。
- 如果 token 来自 `APP_BRIDGE_CLIENTS`，服务端会把连接绑定到对应 client id，并拒绝 `hello.clientId` 冒用其他客户端。
- 如果设置了 `APP_PUBLIC_ORIGIN` 且请求带 `Origin`，`Origin` 必须完全匹配。
- 单条消息不能超过 `APP_WS_MAX_MESSAGE_BYTES`。
- 推送缓冲不能超过 `APP_WS_MAX_BUFFERED_BYTES`，否则服务端会关闭慢连接。
- 第一条非 `ping` 消息必须是 `hello`。
- 新会话受 `APP_BRIDGE_MAX_SESSIONS` 限制，已停止会话会按 `APP_BRIDGE_STOPPED_SESSION_TTL_MINUTES` 清理。
- 服务端会发送 WebSocket ping；客户端应响应 pong，长时间无响应会被断开。

### Bridge Client -> Server

#### `hello`

```json
{
  "type": "hello",
  "clientId": "cursor-plugin",
  "name": "Cursor Plugin",
  "description": "Local IDE companion",
  "protocolVersion": 1,
  "capabilities": ["input", "resize", "control", "heartbeat", "replay"]
}
```

`clientId` 可省略；服务端会根据客户端名称生成稳定格式的 id。如果使用 scoped token，服务端会使用配置中的 id。当前协议版本为 `1`；`capabilities` 是可选扩展字段，当前服务端会保留解析结果但不会强制协商。

#### `session_upsert`

创建或更新外部会话。该会话会作为普通 `TerminalSummary` 广播到浏览器 `/ws`。

```json
{
  "type": "session_upsert",
  "externalId": "workspace-main",
  "name": "Cursor workspace",
  "status": "running",
  "cwd": "/srv/app",
  "commandDisplay": "Cursor Agent",
  "cols": 120,
  "rows": 32,
  "description": "IDE-owned agent session",
  "capabilities": ["input", "resize", "control"]
}
```

#### `session_output`

```json
{
  "type": "session_output",
  "externalId": "workspace-main",
  "data": "agent output\r\n"
}
```

#### `session_status`

```json
{
  "type": "session_status",
  "externalId": "workspace-main",
  "status": "stopped",
  "lastError": null,
  "lastExitCode": 0,
  "lastExitSignal": null
}
```

#### `session_closed`

```json
{
  "type": "session_closed",
  "externalId": "workspace-main"
}
```

#### `ping`

```json
{
  "type": "ping"
}
```

### Bridge Server -> Client

#### `ready`

```json
{
  "type": "ready",
  "clientId": "cursor-plugin"
}
```

#### `input`

手机端或浏览器发送到该 terminal 的输入会被转发给拥有它的 bridge client。

```json
{
  "type": "input",
  "externalId": "workspace-main",
  "data": "run tests\r"
}
```

#### `resize`

```json
{
  "type": "resize",
  "externalId": "workspace-main",
  "cols": 100,
  "rows": 30
}
```

#### `control`

```json
{
  "type": "control",
  "externalId": "workspace-main",
  "action": "restart"
}
```

`action` 可为 `stop`、`restart` 或 `close`。

#### `error`

```json
{
  "type": "error",
  "externalId": "workspace-main",
  "message": "Client bridge session workspace-main 不存在"
}
```

#### `pong`

```json
{
  "type": "pong"
}
```

## Attach / Replay 顺序

浏览器 attach 某个 terminal 后，服务端按顺序发送：

1. `terminal_reset`
2. `terminal_updated`
3. ring buffer 中保存的 `terminal_output` replay 块

后续只有已 attach 的客户端才会继续收到该 terminal 的实时输出。
