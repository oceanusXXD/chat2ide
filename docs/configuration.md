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

Codex CLI 的工作目录，也是这个远程控制台的业务边界。建议指向一个具体项目目录，并用低权限系统账户运行服务。

如果 `CODEX_CWD` 不存在或不是目录，新建终端会失败。

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
- `node-pty` 是否能启动一个短生命周期探针 shell。
- `APP_PUBLIC_ORIGIN` 是否是有效 `http` 或 `https` URL。
- 资源上限和登录窗口是否为正整数。
- `APP_PIN_HASH` 是否是有效 scrypt 十六进制格式。

如果使用 `env.example` 默认 PIN 或未配置 `APP_PUBLIC_ORIGIN`，preflight 会输出警告。警告不阻止本地开发，但生产部署前应处理。
