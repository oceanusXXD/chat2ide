# 配置说明

配置可以放在仓库根目录 `.env` 或 `.env.local`，也可以通过进程环境变量传入。显式环境变量优先级最高。

生产环境建议复制 `env.example`：

```bash
cp env.example .env
```

Windows PowerShell：

```powershell
Copy-Item env.example .env
```

## 最小生产配置

```dotenv
APP_HOST=127.0.0.1
APP_PORT=3000
APP_PUBLIC_ORIGIN=https://terminal.example.com
APP_TRUST_PROXY=1
APP_PIN_HASH=scrypt$<salt-hex>$<hash-hex>
CODEX_COMMAND=codex
CODEX_CWD=/srv/your-project
TERMINAL_PROFILES=[{"id":"claude","name":"Claude Code","command":"claude","args":[],"cwd":"/srv/your-project","description":"Claude Code CLI"},{"id":"codex-remote","name":"Codex remote TUI","command":"codex","args":["--remote","wss://remote-host:4500","--remote-auth-token-env","CODEX_REMOTE_TOKEN"],"cwd":"/srv/your-project","description":"Connect Codex TUI to a secured app-server"}]
# 只有需要 IDE/plugin/desktop companion 直连时才配置
# APP_BRIDGE_TOKEN=<32-byte-minimum-high-entropy-secret>
# APP_BRIDGE_CLIENTS=[{"id":"desktop-ide","name":"Desktop IDE","token":"<32-byte-minimum-high-entropy-client-secret>"}]
```

## 网络配置

`APP_HOST`

默认 `127.0.0.1`。生产环境建议保持本机监听，通过 Cloudflare Tunnel 暴露公网。

`APP_PORT`

默认 `3000`。Cloudflare Tunnel ingress 应转发到同一个端口。

`APP_PUBLIC_ORIGIN`

公网访问 origin，例如 `https://terminal.example.com`。它用于 WebSocket origin 校验和 cookie secure 推断。生产环境必须设置，并且必须和浏览器地址栏中的域名一致。

`APP_TRUST_PROXY`

Cloudflare Tunnel 或其他反向代理后应设置为 `1`。服务端会信任 `X-Forwarded-Proto` 等头部来判断 HTTPS。

## 登录配置

`APP_PIN`

开发和内网测试可用的明文 PIN。不要在生产环境长期使用。

`APP_PIN_HASH`

生产推荐。格式：

```text
scrypt$<salt-hex>$<hash-hex>
```

生成命令：

```bash
node -e 'const c=require("crypto");const pin=process.argv[1];const salt=c.randomBytes(16);const hash=c.scryptSync(pin,salt,32);console.log(`scrypt$${salt.toString("hex")}$${hash.toString("hex")}`)' 123456
```

`APP_COOKIE_NAME`

默认 `chat2ide_session`。

`APP_COOKIE_SECURE`

可选值：`auto`、`always`、`never`。生产 HTTPS 建议 `auto` 或 `always`。

`APP_SESSION_TTL_HOURS`

登录 session 存活小时数。默认 `24`。

`APP_LOGIN_MAX_ATTEMPTS` 与 `APP_LOGIN_LOCKOUT_SECONDS`

登录失败限速配置。达到失败次数后，同一来源会短暂锁定。

`APP_LOGIN_ATTEMPT_WINDOW_SECONDS`

登录失败计数窗口。默认 `600`。超过窗口后，未锁定来源的失败次数会过期，避免长期运行时失败记录永久留在内存中。

`APP_WS_MAX_MESSAGE_BYTES`

WebSocket 单条消息大小上限。默认 `131072`。它用于在 JSON 解析和 PTY 写入前拦截异常大的浏览器输入。

`APP_WS_MAX_BUFFERED_BYTES`

单个 WebSocket 连接的待发送缓冲上限。默认 `1048576`。当浏览器或 bridge 客户端读得太慢时，服务端会关闭该连接，避免长时间堆积输出占用内存。

## Direct Client Bridge 配置

`APP_BRIDGE_TOKEN`

可选。设置后服务会开启 `/bridge` WebSocket，供可信 IDE 插件、桌面客户端或本机 companion 直连。Bridge 使用独立 Bearer token，不复用浏览器 PIN：

```text
Authorization: Bearer <APP_BRIDGE_TOKEN>
```

Bridge 适合没有独立可运行 CLI 的产品形态。客户端负责连接 `/bridge`、发送 `hello`、发布自己的 session 和输出；`chat2ide` 负责把这些 session 显示在移动端，并把输入、resize、停止、重启、关闭等控制消息转发回客户端。

`APP_BRIDGE_TOKEN` 至少 32 字节。生产环境应使用随机高熵 secret，例如 `openssl rand -base64 32` 生成的值。

`APP_BRIDGE_CLIENTS`

可选。JSON 数组，用来给不同 companion 配置独立 token 和固定 `clientId`。如果配置了 scoped token，客户端 `hello.clientId` 必须匹配对应 id；不传 `clientId` 时服务端会使用配置中的 id。

示例：

```dotenv
APP_BRIDGE_CLIENTS=[{"id":"desktop-ide","name":"Desktop IDE","description":"Local IDE companion","token":"replace-with-32-byte-random-client-secret"}]
```

`APP_BRIDGE_TOKEN` 仍可作为全局兼容 token 使用；多客户端或生产部署优先使用 `APP_BRIDGE_CLIENTS`，避免一个 token 持有者冒用另一个在线 companion 的身份。

如果某个平台有真实 CLI，优先用 `CODEX_COMMAND` 或 `TERMINAL_PROFILES` 走 PTY profile。如果只有 IDE 插件、桌面 App、浏览器工作台或厂商私有面板，则不要伪装成 `CODEX_COMMAND`；应写一个 companion 使用 `/bridge` 暴露当前客户端会话。

`APP_BRIDGE_MAX_SESSIONS`

可选。Bridge 客户端可发布的会话上限，默认 `8`。它独立于 PTY 的 `TERMINAL_MAX_SESSIONS`，避免持有 bridge token 的客户端无限创建 UI 会话和 ring buffer。

`APP_BRIDGE_STOPPED_SESSION_TTL_MINUTES`

可选。已停止 bridge 会话在内存中保留多久，默认 `60` 分钟。超过 TTL 后维护任务会移除会话并通知前端关闭标签。

## Codex CLI 配置

`CODEX_COMMAND`

要启动的命令，默认 `codex`。服务器上必须能找到并执行该命令。

`CODEX_ARGS`

传给 Codex CLI 的参数。支持两种格式：

```dotenv
CODEX_ARGS=--model your-model
CODEX_ARGS=["--model","your-model"]
```

如果参数里有空格，优先用 JSON 数组。

`CODEX_CWD`

Codex CLI 的默认工作目录。建议指向一个具体项目目录，并用低权限系统账户运行服务。

如果 `CODEX_CWD` 不存在或不是目录，新建终端会失败。

`TERMINAL_ALLOWED_CWD_ROOTS`

可选。限制 API 创建终端时传入的 `cwd` 必须位于这些目录内。使用系统路径分隔符分隔多个目录：Linux/macOS 为 `:`，Windows 为 `;`。

未配置时，允许范围默认为所有 profile 的 `cwd`。这意味着 `CODEX_CWD` 和 `TERMINAL_PROFILES[].cwd` 是默认允许根；如果你要让一个 profile 在多个项目目录下启动，应显式配置 `TERMINAL_ALLOWED_CWD_ROOTS`。

`TERMINAL_PROFILES`

可选。一个 JSON 数组字符串，用来在移动端/浏览器里暴露多个启动入口。服务会把 `CODEX_COMMAND` / `CODEX_ARGS` / `CODEX_CWD` 组合成默认的 `codex` profile，再把这个数组里的 profile 追加进去。

每个 profile 需要这些字段：

- `id`：稳定标识，UI 和 API 会用它创建终端。
- `name`：显示名称。
- `command`：真实可执行命令。
- `args`：字符串数组，或者可以被解析成字符串数组的 JSON 值。
- `cwd`：该 profile 的默认工作目录。
- `description`：可选说明。

示例：

```dotenv
TERMINAL_PROFILES=[{"id":"shell","name":"Interactive Shell","command":"/bin/bash","args":["-i"],"cwd":"/srv/your-project","description":"Fallback shell for tests and scripts"}]
```

这个机制适合三类入口：

- 直接 PTY CLI，例如 Codex CLI、Claude Code、Qoder、Gemini CLI、Aider。
- 需要显式远程连接参数的 Codex TUI，例如 `codex --remote wss://...`。
- 需要 wrapper 脚本的编辑器周边工作流，例如先起 shell，再让 CLI 连接到同一台机器上的其他工具。

## 终端配置

`TERMINAL_DEFAULT_COLS` 与 `TERMINAL_DEFAULT_ROWS`

新终端的默认尺寸。浏览器 attach 后会根据 xterm 视口重新上报尺寸。

`TERMINAL_BUFFER_BYTES`

每个终端的最近输出缓存大小。它只用于刷新或断线后的 replay，不是完整日志。

`TERMINAL_MAX_SESSIONS`

允许同时存在的终端数量。默认 `8`。达到上限后，新建终端会返回错误。这个限制用于避免误操作或暴露入口被滥用时生成过多 PTY 进程。

`TERMINAL_MAX_INPUT_BYTES`

单次输入写入 PTY 的字节上限。默认 `65536`。普通命令和提示词远低于该值；大块文件传输不应该通过这个远程控制台完成。

## 部署前检查

运行：

```bash
npm run preflight
```

检查项包括：

- Node.js 版本。
- `node-pty` 是否能加载。
- 是否配置 PIN。
- `CODEX_CWD` 是否存在。
- `CODEX_ARGS` 格式是否正确。
- `CODEX_COMMAND` 是否可执行。
- `TERMINAL_PROFILES` 是否是合法 JSON、是否有重复 id、profile 的 cwd 和 command 是否可用。
- `APP_BRIDGE_TOKEN` 是否启用 direct client bridge；未启用只输出警告，不阻止 CLI-only 部署；启用时 token 必须至少 32 字节。
- `APP_BRIDGE_CLIENTS` 是否是合法 JSON、是否有重复 id、客户端 token 是否至少 32 字节。
- `TERMINAL_ALLOWED_CWD_ROOTS` 是否存在且为目录。
- `node-pty` 是否能启动一个短生命周期探针 shell。
- `APP_PUBLIC_ORIGIN` 是否是有效 `http` 或 `https` URL。
- 资源上限和登录窗口是否为正整数。
- `APP_PIN_HASH` 是否是有效 scrypt 十六进制格式。

如果使用 `env.example` 默认 PIN 或未配置 `APP_PUBLIC_ORIGIN`，preflight 会输出警告。警告不阻止本地开发，但生产部署前应处理。
