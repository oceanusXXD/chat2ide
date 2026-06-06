# 故障排查

优先从服务器本机开始排查，再排查 Cloudflare 和浏览器。

## 先运行 preflight

```bash
npm run preflight
```

如果失败，先修复失败项：

- `APP_PIN or APP_PIN_HASH is configured`：没有配置登录凭据。
- `CODEX_CWD points to an existing directory`：目录不存在或运行用户无权访问。
- `CODEX_ARGS format is valid`：参数格式错误；如果参数包含空格，改用 JSON 数组。
- `CODEX_COMMAND can be executed`：服务器找不到 Codex CLI 或命令路径错误。
- `node-pty can spawn a probe shell`：`node-pty` 可以加载但无法启动 PTY 探针，检查系统 PTY 支持、Node 版本和 native 依赖。
- `node-pty can be loaded`：依赖安装失败，或系统缺少 native 模块运行条件。

## 页面打不开

检查：

```bash
curl http://127.0.0.1:3000/api/health
```

如果本机不通：

- 确认服务已启动。
- 确认 `APP_HOST` 和 `APP_PORT`。
- 检查端口是否被占用。
- 查看服务日志或 `journalctl -u chat2ide -f`。

如果本机通、Cloudflare 域名不通：

- 检查 `cloudflared tunnel run chat2ide` 是否正常。
- 检查 ingress 是否指向 `http://127.0.0.1:3000`。
- 检查 DNS route 是否指向正确 tunnel。

## 登录失败

检查：

- `.env` 是否设置 `APP_PIN` 或 `APP_PIN_HASH`。
- `APP_PIN_HASH` 格式是否是 `scrypt$<salt>$<hash>`。
- 是否触发登录失败限速。等待 `APP_LOGIN_LOCKOUT_SECONDS` 后再试。
- 浏览器是否访问了和 `APP_PUBLIC_ORIGIN` 一致的域名。

相关配置：

- `APP_LOGIN_MAX_ATTEMPTS`
- `APP_LOGIN_LOCKOUT_SECONDS`

## Cookie 不保存或不发送

检查：

- 公网访问必须是 HTTPS。
- 生产保持 `APP_COOKIE_SECURE=auto` 或 `always`。
- 不要在设置严格 `APP_PUBLIC_ORIGIN` 后，从另一个本地域名访问。
- Cloudflare 后保持 `APP_TRUST_PROXY=1`。

## 登录成功但 `/ws` 失败

检查浏览器 devtools 的 WebSocket close reason。

常见原因：

- `APP_PUBLIC_ORIGIN` 与实际浏览器 origin 不一致。
- Cloudflare Tunnel 没有转发到同一个本地服务。
- cookie 没有随 WebSocket 请求发送。
- session 已过期。

服务端会在未登录或过期时用 `1008` 关闭 WebSocket。

## 新建终端后没有输出

先确认这个语义：HTTP 创建终端后，首次 WebSocket `attach` 才启动 PTY。页面必须连接上 `/ws` 并选中该标签页。

然后检查：

- `CODEX_COMMAND` 是否存在。
- Codex CLI 是否已经在运行用户下完成认证。
- `CODEX_CWD` 是否存在且可读写。
- `node-pty` 是否可加载。

PTY smoke test：

```bash
APP_PIN=123456 CODEX_COMMAND=/bin/bash CODEX_ARGS='["-i"]' CODEX_CWD=$PWD npm run start
```

如果 `/bin/bash -i` 可用而 `codex` 不可用，问题在 Codex CLI 安装、认证或路径。

## 停止按钮看起来慢

runner 会先发送 `SIGTERM`，短暂等待后再强制 kill。交互式 shell 或子进程可能需要一点时间才会退出。

## 刷新后旧终端消失

如果只是浏览器刷新，服务进程仍在，旧终端应保留。

如果服务进程重启过，旧终端消失是预期行为。当前版本所有 session、PTY 和 ring buffer 都只在内存里。

## 输出不是完整日志

ring buffer 只保存最近输出，用于断线或刷新后的恢复。它不是审计日志，也不保证保存完整历史。

如需长期记录，请在 Codex CLI 或 shell 层面自行使用日志命令。

## node-pty 安装失败

`node-pty` 是 native 依赖。常见处理：

- 使用 Node.js 20.19+。
- 在 Linux 上安装编译工具链。
- 删除 `node_modules` 后重新 `npm install`。
- 确认生产运行系统和安装依赖的系统一致。

## Windows 注意事项

Windows 可以用于开发和 smoke test，但生产目标建议是 Linux。某些 PTY 行为、Codex CLI 认证路径和 shell 参数在 Windows 上会不同。
