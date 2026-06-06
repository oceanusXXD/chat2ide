# 安全边界

`chat2ide` 是单用户远程终端入口。登录后的用户等价于能以运行 `chat2ide` 的系统账户在服务器上执行命令。

这不是多用户权限系统，不是代码执行沙箱，也不是企业审计平台。

## 默认安全模型

- 单用户。
- 单服务器。
- 服务监听 `127.0.0.1`。
- 通过 Cloudflare Tunnel 暴露 HTTPS 入口。
- PIN 登录。
- `HttpOnly` session cookie。
- 内存 session。
- 无数据库。

## 已实现措施

### 服务端 PIN 校验

- PIN 不内置在前端。
- 支持明文 `APP_PIN` 和 scrypt 格式 `APP_PIN_HASH`。
- 生产环境建议只使用 `APP_PIN_HASH`。

### 登录失败限速

- 同一来源连续失败会触发短暂锁定。
- 错误信息保持模糊，不区分 PIN 错误和暂时锁定。

### Cookie

- `HttpOnly`。
- `SameSite=Lax`。
- `Secure` 根据 HTTPS、代理头和 `APP_COOKIE_SECURE` 推断。

### Origin 校验

如果设置 `APP_PUBLIC_ORIGIN`，WebSocket 请求的 `Origin` 必须完全匹配。

### 资源上限

- `TERMINAL_MAX_SESSIONS` 限制同时存在的 PTY 终端数量。
- `TERMINAL_MAX_INPUT_BYTES` 限制单次写入 PTY 的输入大小。
- `APP_WS_MAX_MESSAGE_BYTES` 限制 WebSocket 单条消息大小。
- 登录失败记录会在 `APP_LOGIN_ATTEMPT_WINDOW_SECONDS` 后过期，避免长期运行时无界增长。

这些限制用于防误用和降低暴露入口被滥用时的资源消耗，不是权限隔离或命令沙箱。

## 生产建议

- 始终监听 `127.0.0.1`，不要直接绑定公网地址。
- 始终设置 `APP_PUBLIC_ORIGIN`。
- Cloudflare Tunnel 后保持 `APP_TRUST_PROXY=1`。
- 用最小权限系统账户运行。
- 把 `CODEX_CWD` 限制到具体项目目录。
- 根据服务器规格设置 `TERMINAL_MAX_SESSIONS`，不要让单用户入口无限创建 PTY。
- 保护 `.env` 文件，尤其是 PIN hash 和运行配置。
- 保护服务器 SSH 和 Cloudflare 账户。

## 不做的事

- 不做多用户账号体系。
- 不做角色权限、文件级 ACL 或项目级授权。
- 不做数据库审计日志。
- 不做终端内容脱敏。
- 不保证服务重启后恢复终端进程。
- 不隔离 Codex CLI 能执行的命令。

## 风险理解

如果攻击者拿到 PIN 或 session cookie，就能进入远程终端。进入后能够执行的范围取决于运行 `chat2ide` 的系统账户权限。

因此，安全边界应放在三层：

1. Cloudflare 和 HTTPS 入口。
2. `chat2ide` 的 PIN/session。
3. 服务器系统账户和文件权限。

不要把应用层 PIN 当成服务器整体安全的替代品。
