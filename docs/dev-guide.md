# 开发指南

本仓库的主路径是一个 Node/Express/WebSocket 服务和一个 React/Vite 前端。生产目标是 Linux 服务器；Windows 和 macOS 可以用于本地开发。

## 安装依赖

跨平台推荐：

```bash
npm install
```

Linux 服务器也可以使用脚本：

```bash
./scripts/bootstrap.sh
```

依赖只安装到当前仓库的 `node_modules/`，不需要全局 npm 包，也不需要 Python。

## 准备环境文件

```bash
cp env.example .env
```

Windows PowerShell：

```powershell
Copy-Item env.example .env
```

开发时可以先使用：

```dotenv
APP_PIN=123456
APP_PUBLIC_ORIGIN=http://127.0.0.1:5173
CODEX_COMMAND=codex
CODEX_CWD=/path/to/your/project
```

如果只想测试 PTY，不依赖真实 Codex CLI，可以临时使用 shell：

```dotenv
CODEX_COMMAND=/bin/bash
CODEX_ARGS=["-i"]
```

Windows 本地 smoke test 可用：

```dotenv
CODEX_COMMAND=powershell.exe
CODEX_ARGS=["-NoLogo"]
```

## 启动开发模式

```bash
npm run dev
```

它会同时启动：

- API/WebSocket：`http://127.0.0.1:3000`
- Vite 前端：`http://127.0.0.1:5173`

分别启动：

```bash
npm run dev:server
npm run dev:web
```

Linux 便捷脚本：

```bash
./scripts/dev.sh all
./scripts/dev.sh server
./scripts/dev.sh web
```

## 代码检查

```bash
npm run typecheck
```

生产构建：

```bash
npm run build
```

Linux 脚本：

```bash
./scripts/test.sh
```

## 启动生产构建

```bash
npm run start
```

等价于：

```bash
node dist/server/index.js
```

## 部署前检查

```bash
npm run preflight
```

这个命令会读取 `.env` 和 `.env.local`，检查 Node、`node-pty`、PIN、`CODEX_CWD`、`CODEX_ARGS`、`CODEX_COMMAND`、PTY runtime 和 `APP_PUBLIC_ORIGIN`。

在本地开发时，如果没有安装真实 Codex CLI，可以用 shell 命令覆盖：

```bash
APP_PIN=123456 CODEX_COMMAND=/bin/bash CODEX_ARGS='["-i"]' CODEX_CWD=$PWD npm run preflight
```

Windows PowerShell：

```powershell
$env:APP_PIN="123456"; $env:CODEX_COMMAND="powershell.exe"; $env:CODEX_ARGS='["-NoLogo"]'; $env:CODEX_CWD=$PWD; npm run preflight
```

## 本地 smoke test

1. 设置 `APP_PIN`。
2. 设置 `CODEX_COMMAND` 为真实 `codex` 或测试 shell。
3. 运行 `npm run build && npm run start`。
4. 打开 `http://127.0.0.1:3000`。
5. 登录。
6. 新建终端。
7. 发送 `echo hello`。
8. 确认终端视图出现输出。

## 目录说明

- [src/server](../src/server)：Express、WebSocket、认证、PTY runtime。
- [src/shared](../src/shared)：前后端共享协议类型。
- [web](../web)：React、Tailwind、xterm 前端。
- [scripts](../scripts)：Linux 便捷脚本和 preflight。
- [docs](../docs)：产品、配置、部署、使用、运维和排障文档。
