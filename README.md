# chat2ide

把服务器上的 AI Coding CLI 变成一个手机也能接管的远程终端工作台。

<p align="center">
  <img src="docs/assets/chat2ide-mobile-workbench.png" alt="chat2ide 手机端远程终端工作台" width="360">
</p>

<p align="center">
  <em>不是远程桌面，也不是多人 IDE。它做一件事：把真实 PTY 里的 AI coding session 稳定地送到浏览器和手机上。</em>
</p>

阅读其他版本：

- [English README](README.en.md)
- [完整中文文档](README.zh-CN.md)

## 这个项目解决什么

很多 AI coding 工具都已经有不错的 CLI：Codex、Claude Code、Gemini CLI、Cursor Agent、Qoder、Trae Agent、Qwen Code、Aider、Goose 等。问题是它们通常跑在电脑或服务器终端里，任务一跑久，人离开电脑后就很难继续观察和接管。

`chat2ide` 的定位很直接：

- AI coding session 仍然跑在你的服务器上。
- 每个 session 都是真实 `node-pty` PTY 进程，不是模拟终端。
- 手机或浏览器只负责显示输出、发送输入、重连和回放最近输出。
- 默认跑 `codex`，也可以通过 `CODEX_COMMAND` 接其他终端原生 CLI。

它适合个人开发者自己的 Linux 开发机、VPS、家用服务器或长期在线工作站。登录后用户拥有运行 `chat2ide` 的系统账户权限，所以它应该跑在可信机器和低权限账户下。

## 可以用来干什么

- 在手机上查看长时间运行的 AI coding 任务。
- 从底部输入栏继续给 Codex / Qoder / Claude Code 等 CLI 发指令。
- 同时保留多个终端标签，分别跑修 bug、测试、文档、部署等任务。
- 断线或刷新后重新附着当前终端，并回放最近输出。
- 用 `Ctrl+C` 中断、停止、重启或关闭指定终端。
- 通过 Cloudflare Tunnel 把本地 `127.0.0.1:3000` 安全暴露成 HTTPS 入口。

它不做这些事：

- 不远程控制 Cursor、Windsurf、Trae IDE 这类 GUI 编辑器。
- 不接管厂商云端 session 或私有侧边栏。
- 不做多人协作、企业审计、命令沙箱或权限隔离。
- 不保存完整终端历史，也不会自动脱敏终端输出。

## 技术栈

| 层 | 技术 | 作用 |
| --- | --- | --- |
| 前端工作台 | React、Vite、Tailwind CSS、xterm.js | 渲染移动端/桌面端终端、标签和底部输入栏 |
| 服务端 | Express、`ws`、TypeScript | 提供登录、终端 API 和 `/ws` WebSocket 通道 |
| 终端运行时 | `node-pty` | 启动真实服务器 PTY，让交互式 CLI 正常工作 |
| 远程入口 | Cloudflare Tunnel | 把公网 HTTPS 域名转发到本地服务 |
| 状态存储 | 进程内存、ring buffer | 保存登录 session、PTY 句柄和最近输出回放 |

## AI Coding 平台接入

`chat2ide` 的接入边界是 PTY，不是厂商 API。只要一个工具能在服务器 shell 里以 CLI 方式运行、能接收 stdin、能输出 stdout/stderr，就可以作为直接目标。

在新机器上确认一个平台已经接入时，按这四步验收：

1. 命令存在，并能返回 `--version`、`doctor`、`status` 或等价输出。
2. 同一个系统账户已经完成厂商登录或 API key 配置。
3. CLI 能从 `CODEX_CWD` 在普通终端里启动。
4. `chat2ide` 能用对应 `CODEX_COMMAND` 创建终端，并看到预期提示符或 TUI。

| 平台 | 是否直接接入 | `CODEX_COMMAND` / 参数 | 使用方式 | 参考文档 |
| --- | --- | --- | --- | --- |
| OpenAI Codex CLI | 可以 | `CODEX_COMMAND=codex` | 先运行 `codex login`，再从项目目录启动。 | [Codex CLI reference](https://developers.openai.com/codex/cli/reference) |
| Qoder CLI | 可以 | `CODEX_COMMAND=qodercli` | 安装 `@qoder-ai/qodercli`，运行 `qodercli`，再用 `/login` 或 `QODER_PERSONAL_ACCESS_TOKEN` 登录。你说的 qCoder 这里按 Qoder 处理。 | [Qoder CLI quick start](https://docs.qoder.com/en/cli/quick-start) |
| Anthropic Claude Code | 可以 | `CODEX_COMMAND=claude` | 在服务器上运行 `claude auth login` 或完成账号登录流程。 | [Claude Code CLI reference](https://code.claude.com/docs/en/cli-reference) |
| Google Gemini CLI | 可以 | `CODEX_COMMAND=gemini` | 安装 `@google/gemini-cli`，运行 `gemini`，完成 Google 登录。 | [Gemini CLI installation](https://geminicli.com/docs/get-started/installation/) |
| Cursor Agent CLI | 可以 | `CODEX_COMMAND=cursor-agent` | 安装 Cursor CLI 并登录。这里接的是终端 agent，不是远程控制 Cursor 编辑器 GUI。 | [Cursor CLI docs](https://cursor.com/docs/cli/overview) |
| Trae Agent CLI | 可以 | `CODEX_COMMAND=trae-cli`，`CODEX_ARGS=["interactive"]` | 使用开源 `trae-agent` CLI。一次性任务可以在 shell 里运行 `trae-cli run "<task>"`。 | [trae-agent README](https://github.com/bytedance/trae-agent/blob/main/README.md) |
| Qwen Code | 可以 | `CODEX_COMMAND=qwen` | 安装 `@qwen-code/qwen-code`，运行 `qwen`，再通过 `/auth` 配置账号或 API key。 | [Qwen Code](https://github.com/QwenLM/qwen-code) |
| Kiro CLI | 可以 | `CODEX_COMMAND=kiro-cli`，`CODEX_ARGS=["chat"]` | 安装 Kiro CLI，完成浏览器登录，再从项目目录启动 chat。 | [Kiro CLI installation](https://kiro.dev/docs/cli/installation/) |
| GitHub Copilot CLI | 可以，前提是安装独立 CLI | `CODEX_COMMAND=copilot` | 安装 Copilot CLI，确认组织策略允许使用，并完成登录。如果只有 `gh copilot`，建议写 wrapper。 | [GitHub Copilot CLI](https://docs.github.com/en/copilot/how-tos/copilot-cli/cli-getting-started) |
| Aider | 可以 | `CODEX_COMMAND=aider` | 安装 `aider-chat`，配置模型/API 凭据，然后在 repo 中启动。 | [Aider installation](https://aider.chat/docs/install.html) |
| Goose CLI | 可以 | `CODEX_COMMAND=goose`，`CODEX_ARGS=["session"]` | 安装 CLI，配置 LLM provider，然后运行 `goose session`。 | [Goose installation](https://goose-docs.ai/docs/getting-started/installation/) |
| Windsurf / Devin Desktop | 间接配合 | `CODEX_COMMAND=bash` 或 `powershell` | 在 IDE 内使用 Cascade 和增强终端；`chat2ide` 负责手机侧 shell、测试、git 和其他 CLI agent。 | [Terminal and Cascade docs](https://docs.devin.ai/desktop/terminal) |
| Trae IDE | 间接配合，除非使用 `trae-agent` | 直接 PTY 控制请用 `trae-cli` | `chat2ide` 不做远程桌面，也不接管 IDE 插件状态。 | [trae-agent README](https://github.com/bytedance/trae-agent/blob/main/README.md) |

## 常见配置

```dotenv
# Codex CLI
CODEX_COMMAND=codex
CODEX_ARGS=[]
CODEX_CWD=/srv/your-project
```

```dotenv
# Qoder CLI
CODEX_COMMAND=qodercli
CODEX_ARGS=[]
CODEX_CWD=/srv/your-project
```

```dotenv
# Claude Code
CODEX_COMMAND=claude
CODEX_ARGS=[]
CODEX_CWD=/srv/your-project
```

```dotenv
# Cursor Agent CLI
CODEX_COMMAND=cursor-agent
CODEX_ARGS=[]
CODEX_CWD=/srv/your-project
```

```dotenv
# Goose CLI
CODEX_COMMAND=goose
CODEX_ARGS=["session"]
CODEX_CWD=/srv/your-project
```

如果某个平台只有桌面 GUI、浏览器工作台或 IDE 插件，没有公开终端 CLI，就不要直接写成 `CODEX_COMMAND`。这时推荐把 `CODEX_COMMAND` 设置为 `bash`/`powershell`，然后在 `chat2ide` 里运行测试、git、部署脚本，或启动另一个真正的 CLI agent。

## 快速开始

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

开发模式会启动：

- API/WebSocket: `http://127.0.0.1:3000`
- Vite 前端: `http://127.0.0.1:5173`

## 生产部署

```bash
npm install
npm run test
npm run build
npm run start
```

最小 `.env`：

```dotenv
APP_HOST=127.0.0.1
APP_PORT=3000
APP_PUBLIC_ORIGIN=https://terminal.example.com
APP_TRUST_PROXY=1
APP_PIN_HASH=scrypt$<salt-hex>$<hash-hex>
CODEX_COMMAND=codex
CODEX_CWD=/srv/your-project
TERMINAL_MAX_SESSIONS=8
TERMINAL_MAX_INPUT_BYTES=65536
APP_WS_MAX_MESSAGE_BYTES=131072
```

部署前建议运行：

```bash
npm run preflight
```

公网访问推荐用 Cloudflare Tunnel，把域名转发到 `http://127.0.0.1:3000`。完整流程见 [Cloudflare 部署](docs/deploy-cloudflare.md)。

## 手机端体验

手机端不是缩小版桌面终端。界面保留四个重点：

- 顶部紧凑状态栏：连接状态、当前终端、未读输出、终端尺寸。
- 横向滚动终端标签：适合同时跑多个 AI coding 任务。
- 真实 xterm 输出区：ANSI、光标控制、交互式提示都保留。
- 底部输入栏：更适合手机输入命令、提示词和 `Ctrl+C`。

建议用 390 x 844 这类窄屏视口验收：

```bash
npm run build
APP_PIN=123456 CODEX_COMMAND=/bin/bash CODEX_ARGS='["-i"]' CODEX_CWD=$PWD npm run start
```

确认页面没有横向滚动，终端和底部输入栏都在首屏内，然后发送一条命令看输出。

## 架构

完整设计说明在 [docs/architecture.md](docs/architecture.md)。下面是手机接管 AI coding CLI 的最短路径。

<details>
<summary>紧凑通信架构</summary>

```mermaid
flowchart LR
  Browser["手机 / 浏览器"] --> Tunnel["HTTPS + WebSocket<br/>Cloudflare Tunnel"]
  Tunnel --> App["chat2ide<br/>React UI + Express API"]
  App --> Auth["PIN session<br/>HttpOnly cookie"]
  App <-->|REST + /ws| Manager["Session manager<br/>限制 + 回放缓存"]
  Manager --> PTY["node-pty<br/>真实 PTY"]
  PTY <-->|stdin / stdout / resize| CLI["AI coding CLI<br/>codex / qodercli / claude / cursor-agent / custom"]
  CLI <-->|文件 / 测试 / git| Repo["项目目录<br/>CODEX_CWD"]
```

```mermaid
sequenceDiagram
  participant U as 手机/浏览器
  participant A as chat2ide API+WS
  participant T as Session manager
  participant P as node-pty
  participant C as AI coding CLI
  U->>A: 登录 + 新建终端
  A->>T: 分配 session
  U->>A: WebSocket attach
  T->>P: 在 CODEX_CWD 启动 CODEX_COMMAND
  P->>C: 启动交互式 CLI
  U-->>C: 输入、resize、Ctrl+C 经 WS 和 PTY 转发
  C-->>U: 流式输出和最近输出回放
```

</details>

## 待接入 / 改进方向

这些不是当前承诺已经完成的功能，而是后续可以继续增强的方向：

- 平台预设：在 UI 或配置里直接选择 Codex、Qoder、Claude Code、Gemini、Cursor Agent 等常用 CLI。
- Qoder 专项验收：增加 `qodercli` 的 smoke test 文档或脚本，覆盖安装、登录、启动、终端输出四步。
- Wrapper 模板：提供 `scripts/run-qoder.sh`、`scripts/run-claude.sh` 等示例，方便带参数启动不同 agent。
- 任务通知：长任务完成、终端异常退出、后台有未读输出时推送通知。
- 持久化可选项：可选保存终端元信息或最近任务摘要，但默认仍保持轻量和低状态。
- 移动端继续打磨：更好的多终端切换、输入历史、常用命令面板和小屏键盘适配。
- 安全增强：更细的命令风险提示、只读模式、项目目录白名单和部署检查项。

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
- [贡献指南](CONTRIBUTING.md)
- [安全策略](SECURITY.md)
