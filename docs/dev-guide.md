# 开发与部署

## 本地开发

### 安装

```bash
./scripts/bootstrap.sh
```

说明：

- 依赖只会安装到当前项目目录下的 `node_modules/`
- 不需要 `npm install -g`
- 不需要修改 `~/.bashrc`、`~/.zshrc` 或全局 PATH
- 当前仓库不再包含 Python helper 运行路径

### 启动开发模式

```bash
./scripts/dev.sh all
```

或分别启动：

```bash
./scripts/dev.sh server
./scripts/dev.sh web
```

## 生产构建

```bash
npm run build
```

## 生产启动

```bash
APP_PIN=123456 \
APP_HOST=127.0.0.1 \
APP_PORT=3000 \
APP_PUBLIC_ORIGIN=https://terminal.example.com \
CODEX_COMMAND=codex \
CODEX_CWD=/srv/project \
npm run start
```

## 常用环境变量

```bash
APP_HOST=127.0.0.1
APP_PORT=3000
APP_PUBLIC_ORIGIN=https://terminal.example.com
APP_TRUST_PROXY=1

APP_PIN=123456
# 或：
APP_PIN_HASH=scrypt$<salt-hex>$<hash-hex>

APP_COOKIE_NAME=chat2ide_session
APP_COOKIE_SECURE=auto
APP_SESSION_TTL_HOURS=24
APP_LOGIN_MAX_ATTEMPTS=5
APP_LOGIN_LOCKOUT_SECONDS=120

CODEX_COMMAND=codex
CODEX_ARGS=
CODEX_CWD=/srv/project

TERMINAL_DEFAULT_COLS=120
TERMINAL_DEFAULT_ROWS=32
TERMINAL_BUFFER_BYTES=262144
```

## 本地 smoke test

如果你只想验证 PTY 机制，不依赖真实 `codex`，可以临时用 `bash -i`：

```bash
APP_PIN=123456 \
CODEX_COMMAND=/bin/bash \
CODEX_ARGS='["-i"]' \
CODEX_CWD=$PWD \
npm run start
```

然后：

1. 登录页面
2. 创建 terminal
3. 发送 `echo hello`
4. 确认终端中出现 `hello`

## 代码校验

```bash
./scripts/test.sh
```

当前脚本会执行：

- server typecheck
- web typecheck
- vite production build

## 部署建议

- 服务仅监听 `127.0.0.1`
- 通过 `cloudflared` 暴露公网
- 生产环境总是设置 `APP_PUBLIC_ORIGIN`
- 生产环境总是启用 `APP_TRUST_PROXY=1`
- 优先使用 `APP_PIN_HASH` 而不是明文 `APP_PIN`

## 仓库说明

当前仓库已经收敛到单一产品路径，不再包含 helper、VS Code extension、relay agent 或本地 GUI 自动化子系统。
