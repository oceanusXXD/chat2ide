# chat2ide

`chat2ide` 是一个自托管、单用户的 Codex CLI 远程终端工作台。它把服务器上的 Codex CLI 作为长生命周期 PTY 进程运行，并通过浏览器或手机提供多个可重连的终端标签页。

这个项目的目标不是做多人 IDE，也不是把 CLI 输出包装成聊天卡片。它服务的是一个明确场景：你有一台可信 Linux 开发机或服务器，希望在电脑、平板、手机上随时查看和接管服务器里的 Codex CLI 任务。

## 适合什么场景

- 独立开发者远程查看和控制服务器上的 Codex CLI。
- 同时保留多个 Codex CLI 会话，例如修 bug、跑测试、写文档。
- 外出时用手机查看长时间运行的 AI coding 任务，并在需要时发送输入或 `Ctrl+C`。
- 通过 Cloudflare Tunnel 暴露一个 HTTPS 入口，而不是直接开放 SSH 或公网端口。
- 接受“内存态恢复”：刷新页面或断线后可回放最近输出，但服务重启后终端进程会消失。

## 不适合什么场景

- 多用户团队协作平台。
- 企业级审计终端、权限系统或文件级 ACL。
- 强隔离代码执行沙箱。
- 需要服务重启后恢复全部进程和完整历史的持久化系统。
- 对终端内容有自动脱敏要求的生产控制台。

## 核心能力

- 服务端 PIN 登录，支持 `APP_PIN` 或 `APP_PIN_HASH`。
- `HttpOnly` session cookie，登录失败限速。
- 多个独立 Codex CLI PTY 终端标签页。
- `xterm.js` 原样显示 ANSI、光标控制和交互式输出。
- 底部输入栏适配手机键盘，支持发送、`Ctrl+C`、停止、重启、关闭。
- WebSocket 断线后自动重连，并从内存 ring buffer 回放最近输出。
- Cloudflare Tunnel 下同源 HTTP + WebSocket，前端固定连接 `/ws`。
- 无数据库。登录 session、终端进程和输出缓存都只在当前服务进程内存中。

## 架构概览

```text
browser / phone
    |
Cloudflare edge
    |
cloudflared on the server
    |
127.0.0.1:3000 chat2ide
    |
Express + WebSocket
    |
node-pty
    |
Codex CLI in CODEX_CWD
```

新建终端后，服务端先创建一个 `starting` 状态的会话记录。浏览器连接 WebSocket 并附着到该终端后，服务端才真正启动对应的 Codex CLI PTY 进程。这能保证启动阶段的交互式输出先进入真实 xterm 视图。

## 前置条件

- Node.js 16.20+ 和 npm。
- 一台可以长期运行服务的 Linux 服务器。
- 服务器上已经安装并登录可用的 Codex CLI，或通过 `CODEX_COMMAND` 指向等价命令。
- 一个作为 `CODEX_CWD` 的项目目录。
- 生产访问建议使用 Cloudflare Tunnel 和自有域名。

Windows 可以用于本地开发和查看仓库；生产运行仍建议放在 Linux 服务器上，因为 `node-pty` 与交互式 CLI 在 Linux 上最稳定。

## 快速开始

### 本地开发

```bash
npm install
cp env.example .env
npm run dev
```

Windows PowerShell：

```powershell
npm install
Copy-Item env.example .env
npm run dev
```

开发模式会同时启动：

- API/WebSocket 服务：`http://127.0.0.1:3000`
- Vite 前端：`http://127.0.0.1:5173`

### 生产构建

```bash
npm install
npm run typecheck
npm run build
npm run start
```

Linux 服务器也可以使用便捷脚本：

```bash
./scripts/bootstrap.sh
./scripts/test.sh
./scripts/dev.sh start
```

## 最小配置

复制 `env.example` 为 `.env` 后，至少确认这些值：

```dotenv
APP_HOST=127.0.0.1
APP_PORT=3000
APP_PUBLIC_ORIGIN=https://terminal.example.com
APP_TRUST_PROXY=1
APP_PIN_HASH=scrypt$<salt-hex>$<hash-hex>
CODEX_COMMAND=codex
CODEX_CWD=/srv/your-project
```

开发时可以临时使用明文 PIN：

```dotenv
APP_PIN=123456
```

生产环境优先使用 `APP_PIN_HASH`。生成方式：

```bash
node -e 'const c=require("crypto");const pin=process.argv[1];const salt=c.randomBytes(16);const hash=c.scryptSync(pin,salt,32);console.log(`scrypt$${salt.toString("hex")}$${hash.toString("hex")}`)' 123456
```

部署前建议运行：

```bash
npm run preflight
```

它会检查 Node 版本、`node-pty` 是否可加载、PIN 是否配置、`CODEX_CWD` 是否存在、`CODEX_ARGS` 格式、`CODEX_COMMAND` 是否可执行、PTY runtime 是否能启动探针 shell，以及 `APP_PUBLIC_ORIGIN` 是否是有效 URL。

## Cloudflare Tunnel 部署

推荐生产拓扑是：`cloudflared` 运行在服务器上，把公网域名转发到本机 `http://127.0.0.1:3000`。

最小 ingress：

```yaml
tunnel: chat2ide
credentials-file: /etc/cloudflared/chat2ide.json

ingress:
  - hostname: terminal.example.com
    service: http://127.0.0.1:3000
  - service: http_status:404
```

应用的 HTTP API 和 WebSocket 都在同一个 origin 下，WebSocket 路径是 `/ws`，Cloudflare 不需要额外 rewrite。

完整步骤见 [Cloudflare 部署](docs/deploy-cloudflare.md)。

## 日常使用

1. 打开部署后的网址。
2. 输入服务器配置的 PIN。
3. 点击“新建终端”创建 Codex CLI 会话。
4. 在底部输入栏发送命令或提示词。
5. 用标签页切换多个并行任务。
6. 用 `Ctrl+C` 中断当前命令，用“停止”结束进程，用“重启”清屏并启动新 PTY，用“关闭”删除标签页。
7. 刷新页面或弱网恢复后，当前终端会重新附着并回放最近输出。

手机端优先使用底部输入栏，不依赖 xterm 原生键盘输入。横向滚动标签页可以切换终端。

## 移动端使用体验

手机端不是桌面终端的等比缩小版。主界面会优先保留三块内容：

- 顶部状态：连接状态、当前终端状态、工作目录和常用操作。
- 中间终端：真实 `xterm.js` 视图，占据首屏主要区域。
- 底部输入：适合手机键盘的输入栏，以及发送、`Ctrl+C`、停止、重启、关闭。

推荐在手机上通过底部输入栏发送命令或提示词。输入栏会自动追加回车并写入当前 PTY；`Ctrl+C` 会发送中断字符；重连和刷新输出用于移动网络切换或页面恢复后的手动修复。

移动端验收建议使用 390 x 844 这类窄屏视口检查：

```bash
npm run build
APP_PIN=123456 CODEX_COMMAND=/bin/bash CODEX_ARGS='["-i"]' CODEX_CWD=$PWD npm run start
```

Windows PowerShell：

```powershell
npm run build
$env:APP_PIN="123456"; $env:CODEX_COMMAND="powershell.exe"; $env:CODEX_ARGS='["-NoLogo"]'; $env:CODEX_CWD=$PWD; npm run start
```

打开 `http://127.0.0.1:3000` 后，确认首屏没有横向滚动，终端区和底部输入区都可见，并实际发送一条命令看到输出。

## 运维边界

- `/api/health` 可用于基础健康检查。
- 服务重启会清空登录 session、终端进程和 ring buffer。
- ring buffer 只保存最近输出，不是完整日志。
- 登录后的用户等价于能以运行 `chat2ide` 的系统账户执行服务器命令。
- 请使用最小权限系统账户运行，并限制 `CODEX_CWD` 到实际项目目录。

## 文档

- [产品与场景](docs/product.md)
- [配置说明](docs/configuration.md)
- [使用指南](docs/user-guide.md)
- [架构](docs/architecture.md)
- [协议](docs/protocol.md)
- [安全边界](docs/security.md)
- [Cloudflare 部署](docs/deploy-cloudflare.md)
- [开发指南](docs/dev-guide.md)
- [运维手册](docs/operations.md)
- [手工验收](docs/manual-test-plan.md)
- [故障排查](docs/troubleshooting.md)
