# Prompt Bridge

这个目录是 `chat2ide` 仓库里的 VS Code 扩展子项目，同时也提供一个可独立运行的 Codex CLI Bridge。

当前推荐用途是：

- 服务器上运行 bridge
- 用 `cloudflared` 暴露一个公网 URL
- 手机打开页面后输入 PIN
- 在手机上直接查看 Codex CLI 的真实回复

说明：下文中的 `<repo-root>` 表示你的实际仓库路径，`<project-dir>` 表示要交给 Codex CLI 执行的目标项目目录。

## 你现在能得到什么

- 手机端 PIN 登录
- 左侧 session tabs，右侧对话流
- 多个 Codex 线程切换
- `continue/resume` 继续当前线程
- 中断当前运行中的线程
- 主视图展示 Codex CLI 的实际回复
- 折叠查看 stdout、stderr、参数、环境和文件变更
- 只读服务器诊断命令，例如 `nvidia-smi`

## 推荐启动方式

最简单的公网使用方式是 `cloudflared + start.sh`。

### 前置依赖

```bash
node -v
codex --version
cloudflared --version
```

如果还没安装依赖：

```bash
cd <repo-root>/vscode-extension
npm install
npm run build
```

### 双终端启动

终端 A：暴露公网 URL

```bash
cd <repo-root>/vscode-extension
./start.sh tunnel
```

它会把本地 `http://127.0.0.1:8765` 暴露为一个类似下面的地址：

```text
https://xxxx.trycloudflare.com
```

终端 B：启动 bridge

```bash
cd <repo-root>/vscode-extension
./start.sh bridge https://xxxx.trycloudflare.com <project-dir>
```

启动后会输出：

- 手机访问链接
- 一次性 PIN
- session 过期时间
- 二维码

手机打开输出里的链接，输入 PIN 即可使用。

### 只在本机/局域网启动

```bash
cd <repo-root>/vscode-extension
./start.sh local <project-dir>
```

## `start.sh` 说明

```bash
./start.sh help
./start.sh tunnel [port]
./start.sh bridge <public-base-url> [workdir]
./start.sh local [workdir]
```

常用环境变量：

```text
PB_HOST           默认 0.0.0.0
PB_PORT           默认 8765
PB_WORKDIR        默认当前仓库目录
PB_CODEX_CMD      默认 codex
PB_PROMPT_MODE    默认 arg
PB_TIMEOUT_MS     默认 300000
PB_AUTO_EXEC_ARGS 默认 1
```

说明：

- `start.sh bridge` 会把 `PB_PUBLIC_BASE_URL` 自动设置成你传入的公网地址。
- 默认走 `arg` 模式，并自动补上 `codex exec --skip-git-repo-check __PROMPT__`，这样可以规避部分环境下的非 TTY stdin 问题。

## 直接运行 CLI Server

如果你不想经过 `start.sh`，也可以直接跑独立 CLI 服务：

```bash
cd <repo-root>/vscode-extension
npm run codex-cli:standalone -- --help
```

一个常见例子：

```bash
cd <repo-root>/vscode-extension
npm run codex-cli:standalone -- \
  --host 0.0.0.0 \
  --port 8765 \
  --public-base-url https://your-domain.example.com \
  --workdir <project-dir> \
  --exec-command codex \
  --prompt-mode arg \
  --exec-arg exec \
  --exec-arg --skip-git-repo-check \
  --exec-arg __PROMPT__
```

## 单命令同时启动 bridge 和 codex

```bash
cd <repo-root>/vscode-extension
npm run codex-cli:both
```

可选环境变量：

```bash
PB_CODEX_NEW_TERMINAL=0 npm run codex-cli:both
PB_CODEX_TERMINAL_CMD=gnome-terminal npm run codex-cli:both
```

## 目录结构

```text
vscode-extension/
├── start.sh                         # 推荐启动入口
├── scripts/
│   ├── run-codex-cli-bridge.sh      # 独立 bridge 启动脚本
│   └── run-codex-and-bridge.sh      # bridge + codex 双进程脚本
├── src/
│   ├── cli/                         # 独立 CLI server / bridge / runner
│   ├── web/                         # 手机端页面
│   ├── server/                      # HTTP / WS / auth / session
│   ├── relay/                       # Relay 模式
│   ├── bridge/                      # 插件模式桥接
│   ├── commands/                    # VS Code commands
│   └── types/                       # 协议类型
└── test/
```

如果你要找关键入口，通常先看这些文件：

- `start.sh`
- `src/cli/codexCliServer.ts`
- `src/cli/codexCliBridgeController.ts`
- `src/cli/codexCliRunner.ts`
- `src/web/mobilePage.ts`
- `src/server/httpServer.ts`

## 项目模式

### 1. CLI 独立模式

手机请求直接进入服务器上的 Codex CLI Bridge。

这是当前最推荐的模式，适合：

- 云服务器
- 远程开发机
- 不想依赖 VS Code UI 的场景

### 2. 插件模式

手机请求先进入 VS Code 扩展服务，再由扩展调用本机 Helper / Codex 能力。

如果手机实际访问的是公网域名或反向代理地址，可以在 VS Code 设置中指定：

```text
promptBridge.server.publicBaseUrl = https://your-domain.example.com
```

这样二维码、推荐链接和访问面板会优先显示公网地址。

### 3. Relay 模式

本机扩展作为 Relay Agent 连接远端 Relay Server，远端负责接入公网。

## 前端交互说明

手机端现在的主路径是：

1. 输入 PIN 登录
2. 左侧切换 session
3. 右侧输入 prompt
4. 直接看 Codex 回复
5. 需要时再展开高级信息

右侧主区域展示的是：

- 你的 prompt
- Codex CLI 返回的主要回复内容

不是主区域优先展示的内容：

- 原始 stdout/stderr 全量
- 执行参数
- 运行环境
- 文件变更推断
- 诊断命令输出

这些信息仍然保留在折叠区域，方便排障。

## 开发命令

```bash
cd <repo-root>/vscode-extension
npm install
npm run build
npm run test
npm run lint
npm run typecheck
```

如果要单独执行：

```bash
./node_modules/.bin/tsc -p ./tsconfig.json
./node_modules/.bin/vitest run
./node_modules/.bin/eslint "src/**/*.ts" "test/**/*.ts"
```

## 安全建议

- 公网场景优先使用 HTTPS/WSS，不要直接暴露裸 HTTP。
- PIN 是一次性的，登录后会失效，但仍然建议缩短 session/login TTL。
- 手机页面不是远程 shell。当前只允许一小组只读诊断命令。
- stdout/stderr 里可能有敏感信息，避免把页面直接暴露给不可信用户。

## 常见问题

### `cloudflared` 没装

先安装它，再执行：

```bash
./start.sh tunnel
```

### 8765 端口被占用

改端口：

```bash
PB_PORT=9876 ./start.sh tunnel 9876
PB_PORT=9876 ./start.sh bridge https://xxxx.trycloudflare.com <project-dir>
```

### 手机上能打开页面，但提交后没回复

优先检查：

- `codex --version` 是否正常
- `PB_WORKDIR` / `--workdir` 是否指向正确仓库
- 服务器是否能访问该仓库
- 是否应该使用 `arg` 模式

### 手机上看到的不是 Codex 回复，而是一堆运行信息

当前实现里，主区域已经优先展示 Codex CLI 的主要回复；原始运行细节在“高级信息”里。

如果你想继续调 UI，主要入口在：

- `src/web/mobilePage.ts`
