# 协议说明

协议定义集中在：

- [protocol.ts](/home/coder/data/chat2ide/vscode-extension/src/types/protocol.ts)

本文档按“谁发给谁”说明。

## 1. 手机 -> 服务端

这里的“服务端”在不同模式下含义不同：

- `本地模式`
  服务端就是 VS Code 扩展内启动的本地 HTTP / WebSocket 服务
- `Relay 模式`
  服务端是远端 `Relay Server`
- `CLI 模式`
  服务端是远端 `CLI Server`

### `login`

```json
{
  "type": "login",
  "requestId": "req-1",
  "sessionId": "abc123",
  "pin": "123456",
  "deviceName": "iphone"
}
```

字段说明：

- `requestId`
  客户端请求 ID，用于排障
- `sessionId`
  当前访问会话 ID
- `pin`
  一次性口令
- `deviceName`
  可选，终端名称

### `submit_prompt`

```json
{
  "type": "submit_prompt",
  "requestId": "req-2",
  "sessionId": "abc123",
  "authToken": "token-xyz",
  "text": "帮我解释这段代码为什么超时"
}
```

### `ping`

```json
{
  "type": "ping",
  "requestId": "req-3",
  "sessionId": "abc123",
  "authToken": "token-xyz"
}
```

## 2. 服务端 -> 手机

### `login_ok`

```json
{
  "type": "login_ok",
  "requestId": "req-1",
  "sessionId": "abc123",
  "authToken": "token-xyz",
  "expiresAt": "2026-03-31T00:10:00.000Z",
  "state": "authenticated"
}
```

### `login_failed`

```json
{
  "type": "login_failed",
  "requestId": "req-1",
  "code": "INVALID_PIN",
  "message": "PIN 不正确",
  "attemptsRemaining": 2
}
```

### `submit_ok`

```json
{
  "type": "submit_ok",
  "requestId": "req-2",
  "acceptedAt": "2026-03-31T00:02:00.000Z",
  "state": "authenticated",
  "lastPromptPreview": "帮我解释这段代码为什么超时"
}
```

### `submit_failed`

```json
{
  "type": "submit_failed",
  "requestId": "req-2",
  "code": "CLI_EXECUTION_FAILED",
  "message": "服务器上的 Codex CLI 执行失败",
  "recoverable": true
}
```

说明：

- `本地模式`
  常见失败码是 `HELPER_UNAVAILABLE`、`CODEX_COMMAND_FAILED`
- `Relay 模式`
  常见失败码是 `RELAY_AGENT_UNAVAILABLE`、`RELAY_REQUEST_TIMEOUT`
- `CLI 模式`
  常见失败码是 `CLI_NOT_CONFIGURED`、`CLI_EXECUTION_FAILED`、`CLI_TIMEOUT`

### `state_update`

```json
{
  "type": "state_update",
  "state": "awaiting_login",
  "updatedAt": "2026-03-31T00:01:00.000Z",
  "detail": "手机已打开登录页，等待输入 PIN",
  "authenticated": false,
  "sessionExpiresAt": "2026-03-31T00:15:00.000Z"
}
```

### `error`

```json
{
  "type": "error",
  "code": "BAD_REQUEST",
  "message": "无效请求",
  "recoverable": true
}
```

## 3. 服务端 -> Helper

### `health_check`

概念模型：

```json
{
  "action": "health_check",
  "requestId": "health-1"
}
```

### `send_prompt`

```json
{
  "action": "send_prompt",
  "requestId": "req-2",
  "text": "帮我解释这段代码为什么超时"
}
```

### `calibrate`

```json
{
  "action": "calibrate",
  "requestId": "cal-1"
}
```

### `ping`

```json
{
  "action": "ping",
  "requestId": "ping-1"
}
```

## 4. Helper -> 服务端

### `ok`

```json
{
  "status": "ok",
  "requestId": "req-2",
  "detail": "已将 prompt 粘贴到 Codex 并发送",
  "state": "success"
}
```

### `health_status`

```json
{
  "status": "health_status",
  "requestId": "health",
  "healthy": true,
  "platform": "linux",
  "version": "0.2.0",
  "detail": "Helper 运行正常",
  "state": "idle"
}
```

### `calibration_result`

```json
{
  "status": "calibration_result",
  "requestId": "cal-1",
  "detail": "已记录 Codex 输入框坐标：(100, 200)",
  "x": 100,
  "y": 200,
  "state": "success"
}
```

### `error`

```json
{
  "status": "error",
  "requestId": "req-2",
  "code": "AUTOMATION_FAILED",
  "detail": "未找到包含关键字“Visual Studio Code”的 VS Code 窗口",
  "state": "failure"
}
```

## 5. Relay Server -> 本地 Relay Agent

### `agent_hello`

服务端接收本地 Agent 成功连接后发送的握手消息。

```json
{
  "type": "agent_hello",
  "detail": "Relay Server 已接入本地执行器",
  "connectedAt": "2026-03-31T00:00:00.000Z"
}
```

### `forward_prompt`

```json
{
  "type": "forward_prompt",
  "requestId": "relay-1",
  "sessionId": "abc123",
  "text": "请帮我分析这个超时",
  "receivedAt": "2026-03-31T00:01:00.000Z",
  "deviceName": "iphone"
}
```

### `agent_ping`

```json
{
  "type": "agent_ping",
  "requestId": "ping-1"
}
```

## 6. CLI 模式的执行约定

`CLI 模式` 不新增手机侧协议类型，仍然沿用：

- 手机 `login`
- 手机 `submit_prompt`
- 服务端 `login_ok / login_failed`
- 服务端 `submit_ok / submit_failed`
- 服务端 `state_update / error`

差异只发生在“服务端收到 prompt 之后”的内部执行链路：

1. 服务端不再调用本机 Helper
2. 服务端不再向 Relay Agent 转发
3. 服务端直接在目标目录里启动 `Codex CLI`

### 6.1 CLI 启动配置

`CLI Server` 通过命令行参数定义执行方式，关键参数如下：

- `--exec-command`
  真实要启动的 CLI 命令，例如 `codex`
- `--exec-arg`
  可重复追加参数
- `--workdir`
  CLI 运行目录，通常是目标仓库根目录
- `--prompt-mode stdin|arg`
  prompt 通过标准输入还是命令参数传入
- `--prompt-placeholder`
  当 `prompt-mode=arg` 时，用于在参数列表中替换 prompt 的占位符，默认 `__PROMPT__`
- `--timeout-ms`
  单次 CLI 调用超时

### 6.2 CLI 结果映射

`CLI 模式` 成功时：

- 手机收到 `submit_ok`
- 服务端日志会记录：
  - 命令摘要
  - 工作目录
  - 退出码
  - stdout / stderr 摘要

`CLI 模式` 失败时：

- 手机收到 `submit_failed`
- 常见错误码：
  - `CLI_NOT_CONFIGURED`
    服务端没有配置可执行命令
  - `CLI_EXECUTION_FAILED`
    CLI 启动失败或非零退出
  - `CLI_TIMEOUT`
    超过 `timeout-ms` 仍未结束

## 7. 错误码说明

错误码统一定义在：

- [protocol.ts](/home/coder/data/chat2ide/vscode-extension/src/types/protocol.ts)

下面按类别说明。

### 7.1 通用请求错误

- `BAD_REQUEST`
  请求字段不完整、格式错误或类型不匹配
- `UNKNOWN`
  未归类异常

### 7.2 认证与会话错误

- `SESSION_NOT_FOUND`
  sessionId 不存在
- `SESSION_EXPIRED`
  session 已过期
- `PIN_EXPIRED`
  PIN 已过期
- `INVALID_PIN`
  PIN 不正确
- `LOCKED_OUT`
  连续输错次数过多，进入临时锁定
- `UNAUTHORIZED`
  authToken 缺失、错误或已过期

### 7.3 本地模式 / GUI 自动化错误

- `PORT_IN_USE`
  本地监听端口被占用
- `HELPER_NOT_CONFIGURED`
  未配置 Helper 路径
- `HELPER_UNAVAILABLE`
  Helper 未启动或健康检查失败
- `HELPER_REQUEST_FAILED`
  Helper 返回错误或请求超时
- `CODEX_COMMAND_FAILED`
  打开 Codex 的公开命令调用失败
- `AUTOMATION_FAILED`
  GUI 自动化执行失败

### 7.4 CLI 模式错误

- `CLI_NOT_CONFIGURED`
  未配置 `--exec-command`
- `CLI_EXECUTION_FAILED`
  进程启动失败、执行报错或非零退出
- `CLI_TIMEOUT`
  超时后被服务端主动终止

### 7.5 Relay 模式错误

- `RELAY_AGENT_UNAVAILABLE`
  当前没有已连接的本地 Agent
- `RELAY_AGENT_UNAUTHORIZED`
  Agent token 不正确
- `RELAY_CONNECTION_FAILED`
  Agent 与服务端连接失败
- `RELAY_REQUEST_TIMEOUT`
  已转发但在规定时间内未收到 Agent 结果

### 7.6 手机连接错误

- `MOBILE_CONNECTION_FAILED`
  手机 WebSocket 连接中断或状态推送失败

## 6. 本地 Relay Agent -> Relay Server

### `forward_result`

```json
{
  "type": "forward_result",
  "requestId": "relay-1",
  "ok": true,
  "detail": "prompt 已成功发送到本地 VS Code Codex"
}
```

失败示例：

```json
{
  "type": "forward_result",
  "requestId": "relay-1",
  "ok": false,
  "code": "CODEX_COMMAND_FAILED",
  "detail": "未找到可用的 Codex 打开命令"
}
```

### `agent_pong`

```json
{
  "type": "agent_pong",
  "requestId": "ping-1",
  "detail": "local-agent-alive"
}
```

## 7. HTTP / WebSocket 路径

### 手机访问入口

- `GET /`
  若有活动 session，则 302 到 `/session/<sessionId>`
- `GET /session/<sessionId>`
  手机登录页 / prompt 页
- `GET /api/session/<sessionId>/state`
  获取当前状态
- `POST /api/mobile`
  手机提交 `login` / `submit_prompt` / `ping`
- `GET /health`
  服务健康检查
- `WS /ws?sessionId=<id>&authToken=<token>`
  已登录手机的状态推送

### Helper 入口

- `GET /api/v1/health`
  Helper 健康检查
- `POST /api/v1/actions`
  发送 `send_prompt` / `calibrate` / `ping`

### Relay Agent 入口

- `WS /relay/agent?agentToken=<token>&agentName=<name>`
  本地 Agent 与远端 Relay Server 的长连接通道

## 8. 错误码

- `BAD_REQUEST`
  请求结构非法
- `SESSION_NOT_FOUND`
  session 不存在或已被轮换
- `SESSION_EXPIRED`
  session 已过期
- `PIN_EXPIRED`
  PIN 已过期
- `INVALID_PIN`
  PIN 错误
- `LOCKED_OUT`
  PIN 连续错误超过阈值，进入临时锁定
- `UNAUTHORIZED`
  未登录或登录态已过期
- `PORT_IN_USE`
  服务端口被占用
- `HELPER_NOT_CONFIGURED`
  未配置 Helper 路径，无法自动启动
- `HELPER_UNAVAILABLE`
  Helper 不可访问，或自动拉起后在超时内仍未就绪
- `HELPER_REQUEST_FAILED`
  Helper 已响应但动作失败
- `CODEX_COMMAND_FAILED`
  Codex 公开命令执行失败
- `AUTOMATION_FAILED`
  Helper 平台自动化失败
- `RELAY_AGENT_UNAVAILABLE`
  Relay Server 没有可用的本地 Agent
- `RELAY_AGENT_UNAUTHORIZED`
  Relay Agent token 无效
- `RELAY_CONNECTION_FAILED`
  Relay WebSocket 连接中断或建立失败
- `RELAY_REQUEST_TIMEOUT`
  服务端等待本地 Agent 回执超时
- `MOBILE_CONNECTION_FAILED`
  手机与服务端通信失败
- `UNKNOWN`
  未归类异常
