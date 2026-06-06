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
      "name": "Codex 1",
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

### `POST /api/terminals`

请求体可为空。服务端会用默认 cwd 和尺寸。

```json
{
  "name": "Fix auth bug",
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
    "name": "Fix auth bug",
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
    "name": "Run tests",
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
    "name": "Codex 1",
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

## Attach / Replay 顺序

浏览器 attach 某个 terminal 后，服务端按顺序发送：

1. `terminal_reset`
2. `terminal_updated`
3. ring buffer 中保存的 `terminal_output` replay 块

后续只有已 attach 的客户端才会继续收到该 terminal 的实时输出。
