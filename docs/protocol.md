# 协议

协议定义集中在：

- [src/shared/protocol.ts](/home/coder/data/chat2ide/src/shared/protocol.ts)

## HTTP API

### `GET /api/health`

响应：

```json
{
  "ok": true,
  "terminals": 2,
  "publicOrigin": "https://terminal.example.com"
}
```

### `GET /api/auth/me`

响应：

```json
{
  "authenticated": true,
  "expiresAt": "2026-04-02T12:00:00.000Z"
}
```

### `POST /api/auth/pin`

请求：

```json
{
  "pin": "123456"
}
```

成功响应：

```json
{
  "authenticated": true,
  "expiresAt": "2026-04-02T12:00:00.000Z"
}
```

失败响应：

```json
{
  "error": "PIN 不正确或暂时不可用"
}
```

### `POST /api/auth/logout`

响应：

- `204 No Content`

### `GET /api/terminals`

响应：

```json
{
  "items": [
    {
      "id": "term-1",
      "name": "Codex 1",
      "status": "running",
      "createdAt": "2026-04-02T10:00:00.000Z",
      "updatedAt": "2026-04-02T10:01:00.000Z",
      "cwd": "/srv/app",
      "pid": 12345,
      "cols": 120,
      "rows": 32,
      "generation": 1,
      "exitCode": null,
      "signal": null,
      "lastError": null
    }
  ]
}
```

### `POST /api/terminals`

请求：

```json
{
  "name": "Codex 2",
  "cwd": "/srv/app",
  "cols": 120,
  "rows": 32
}
```

响应：

```json
{
  "item": {
    "id": "term-2",
    "name": "Codex 2",
    "status": "running"
  }
}
```

### `PATCH /api/terminals/:id`

请求：

```json
{
  "name": "Fix auth bug"
}
```

响应：

```json
{
  "item": {
    "id": "term-1",
    "name": "Fix auth bug"
  }
}
```

### `POST /api/terminals/:id/stop`

响应：

```json
{
  "ok": true
}
```

### `POST /api/terminals/:id/restart`

响应：

```json
{
  "ok": true
}
```

### `DELETE /api/terminals/:id`

响应：

- `204 No Content`

## WebSocket

路径：

- `/ws`

要求：

- 必须带上登录后获得的 cookie
- 一个 WebSocket 连接可管理多个 terminal
- 浏览器需要对每个 terminal 主动发送 `attach`

## Client -> Server

### `attach`

```json
{
  "type": "attach",
  "terminalId": "term-1"
}
```

### `input`

```json
{
  "type": "input",
  "terminalId": "term-1",
  "data": "echo hello\r"
}
```

### `resize`

```json
{
  "type": "resize",
  "terminalId": "term-1",
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
    "id": "term-1"
  }
}
```

### `terminal_updated`

```json
{
  "type": "terminal_updated",
  "item": {
    "id": "term-1",
    "status": "running"
  }
}
```

### `terminal_reset`

表示该终端需要清空当前显示并准备接收新的 replay 或新的 generation。

```json
{
  "type": "terminal_reset",
  "terminalId": "term-1"
}
```

### `terminal_output`

```json
{
  "type": "terminal_output",
  "terminalId": "term-1",
  "data": "\u001b[?2004h..."
}
```

### `terminal_exit`

```json
{
  "type": "terminal_exit",
  "terminalId": "term-1",
  "code": 0,
  "signal": null
}
```

### `terminal_error`

```json
{
  "type": "terminal_error",
  "terminalId": "term-1",
  "message": "启动 Codex CLI 失败"
}
```

### `terminal_closed`

```json
{
  "type": "terminal_closed",
  "terminalId": "term-1"
}
```

### `pong`

```json
{
  "type": "pong"
}
```

## Attach / Replay 顺序

浏览器 attach 某个 terminal 后，服务端按如下顺序发送：

1. `terminal_reset`
2. `terminal_updated`
3. 最近 ring buffer 中保存的 `terminal_output` 块

后续只有已 attach 的客户端才会继续收到这个 terminal 的实时输出。
