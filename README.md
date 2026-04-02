# chat2ide Prompt Bridge MVP

这是一个“手机 -> VS Code Codex”的远程提示桥接工具。

说明：本文档使用脱敏路径占位。`<repo-root>` 表示仓库根目录，请替换为你的实际路径。

当前仓库已经支持两种运行模式：

1. `本地模式`
   手机直接访问本机 VS Code 扩展启动的服务，然后由本机 Helper 把文本粘贴到 Codex 输入框。
2. `Relay 模式`
   适合 `Remote-SSH / 服务器` 场景：
   手机访问服务器上的 Relay Server；
   本机 VS Code 扩展作为 Relay Agent 长连服务器；
   服务器把 prompt 中继给本机；
   本机再把文本发进当前 VS Code 窗口里的 Codex。
3. `CLI 模式`
   最适合纯 SSH / 服务器场景：
   手机访问服务器上的 CLI Server；
   服务器直接调用 `Codex CLI`；
   不再依赖本机 VS Code 扩展、Helper 和 GUI 自动化。

如果你平时是“本机 VS Code 连接远端 SSH 工作区”，分两种情况：

1. 你必须把 prompt 发进 `VS Code 里的 Codex 侧边栏`
   用 `Relay 模式`
2. 你只要求把 prompt 发给 `服务器上的 Codex`
   优先用 `CLI 模式`

这时真正的运行边界是：

- `服务器`：手机入口、PIN、session、二维码、消息中继
- `本机`：VS Code GUI、Codex 输入框、本地 Python Helper
- `远端工作区`：仍然是你当前打开的 SSH 工程；Codex 发出的动作仍作用在远端代码上

## 当前闭环

当前版本只解决下面这条主链路：

1. 手机打开链接并输入 PIN 登录
2. 手机输入 prompt 并发送
3. 服务器或 VS Code 侧接收 prompt
4. 按运行模式转发：
   - 本地 / Relay 模式：打开 Codex 侧边栏并发送
   - CLI 模式：直接调用服务器上的 Codex CLI

当前不做：

- 不解析 Codex 回复
- 不做 OCR
- 不做文件编辑
- 不做 Git 自动化
- 不做云端多用户系统
- 不依赖 Codex 私有 API

## 项目结构

- `docs/`
  架构、协议、安全、开发与人工验收文档
- `vscode-extension/`
  VS Code 扩展本体
- `helper/`
  Python 本地 Helper，负责 Linux/X11 GUI 自动化
- `scripts/`
  安装、开发、测试与打包脚本

## 架构概要

### VS Code 扩展负责

- 本地模式下启动手机 HTTP / WebSocket 服务
- 生成 session URL、二维码和 PIN
- 处理登录、登录态和错误次数限制
- 打开 Codex 侧边栏
- 调用本地 Python Helper
- 在 Relay 模式下作为本地 Agent 连接远端服务器

### Relay Server 负责

- 运行在服务器上
- 提供手机登录页、PIN、session 和二维码
- 接收手机 prompt
- 把 prompt 通过 WebSocket 转发给本机 Relay Agent

### CLI Server 负责

- 运行在服务器上
- 提供手机登录页、PIN、session 和二维码
- 接收手机 prompt
- 直接调用服务器上的 Codex CLI
- 记录 stdout / stderr / 退出码

### Python Helper 负责

- 聚焦 VS Code
- 可选点击已校准的输入位置
- 写剪贴板、粘贴、回车发送

详细设计见：

- [docs/architecture.md](docs/architecture.md)
- [docs/protocol.md](docs/protocol.md)
- [docs/security.md](docs/security.md)

## 环境要求

- Linux，优先支持 X11
- VS Code
- 已安装 Codex 扩展
- Node.js 16+
- Python
  - 设计目标优先 3.11+
  - 当前仓库已在 Python 3.10.12 上完成验证
- 系统命令：
  - `xdotool`
  - `xclip`

安装系统依赖示例：

```bash
sudo apt-get update
sudo apt-get install -y xdotool xclip
```

## 安装

### 推荐方式

```bash
cd <repo-root>
./scripts/bootstrap.sh
```

脚本行为：

- 若本机有 `uv`，优先用 `uv`
- 若没有 `uv`，回退到 `.venv + pip`
- 安装 Python Helper 依赖
- 安装 VS Code 扩展侧依赖

### 手动安装

若本机有 `uv`：

```bash
cd <repo-root>
uv venv .venv
uv pip install --python .venv/bin/python -e helper[dev]
cd vscode-extension
npm install
```

若本机没有 `uv`：

```bash
cd <repo-root>
python3 -m venv .venv
.venv/bin/pip install -U pip setuptools wheel
.venv/bin/pip install -e helper[dev]
cd vscode-extension
npm install
```

## 模式一：本地模式

### 启动 Helper

```bash
cd <repo-root>
./scripts/dev.sh helper
```

### 编译并调试扩展

```bash
cd <repo-root>
./scripts/dev.sh extension
```

然后：

1. 用 VS Code 打开 [vscode-extension](vscode-extension)
2. 按 `F5` 启动 `Extension Development Host`
3. 在新窗口执行：
   - `PromptBridge: Start Server`
   - `PromptBridge: Show Access Info`

若没有自动发现 Helper，再执行：

- `PromptBridge: Configure Helper Path`

建议路径：

```text
<repo-root>/.venv/bin/prompt-bridge-helper
```

### 手机访问

1. 手机扫描二维码或打开链接
2. 输入桌面端 PIN
3. 登录成功后发送 prompt

## 模式二：Relay 模式（推荐用于 Remote-SSH / 服务器）

这是你当前场景应该使用的模式。

### 先说结论：两个 VS Code 分别干什么

如果你手上会同时打开两个 VS Code 窗口，建议按下面分工：

1. `VS Code A：本地普通窗口`
   只用来安装扩展、看文档、调试扩展，平时不参与真正发送。
2. `VS Code B：Remote-SSH 窗口`
   这才是实际工作的目标窗口。
   你要在这个窗口里打开 Codex，并在这个窗口里执行：
   - `PromptBridge: Configure Relay Connection`
   - `PromptBridge: Connect Relay Agent`
   - `PromptBridge: Show Relay Agent Status`

更稳的做法其实是：

- `只保留一个目标 SSH 窗口作为发送窗口`

原因：

- Helper 只能操作“当前前台的 VS Code 窗口”
- 如果你同时把本地普通窗口放在前面，Helper 可能会把 prompt 粘贴到错误窗口

所以真正发送前，请确保：

1. 当前最前面的 VS Code 窗口，就是你的目标 `Remote-SSH` 窗口
2. Codex 侧边栏已经在这个窗口里可见，或至少能被公开命令正常打开
3. 其他本地 VS Code 窗口不要挡在前面

### 先理解安装位置

`Relay 模式` 下有两个关键结论：

1. `Prompt Bridge VS Code 扩展` 必须安装在 `本机 UI 侧`
2. `Relay Server` 必须跑在 `远端服务器`

原因：

- Codex 输入框和 VS Code GUI 在你本机屏幕上
- 最后一跳“聚焦窗口 -> 粘贴 -> 回车”只能在本机完成
- 但当前工作区仍然可以是 `Remote-SSH` 连接的远端工程

本仓库已经把扩展声明为 `extensionKind = ui`，也就是它会优先运行在本机 UI 侧。

### 1. 在服务器启动 Relay Server

```bash
cd <repo-root>
./scripts/dev.sh relay-server https://你的公网地址:8765
```

如果你没有公网域名或公网 IP，可以先不传第二个参数：

```bash
cd <repo-root>
./scripts/dev.sh relay-server
```

启动后终端会打印：

- 手机访问链接
- 一次性 PIN
- Agent Token
- 终端二维码

### 2. 在本机安装并启动扩展

在本机 VS Code 中安装本扩展。若你当前打开的是 `Remote-SSH` 窗口，也仍然要安装在 `本机`，不是安装在 `.vscode-server/extensions` 这一侧。

建议先做一次确认：

1. 在目标 `Remote-SSH` 窗口中执行 `Developer: Show Running Extensions`
2. 确认 `Prompt Bridge` 出现在 `Local - Running Extensions` 一侧

只有这样，Relay Agent 才是在本机 UI 侧运行的。

然后在这个本机 VS Code 窗口里：

1. 启动本地 Helper
2. 打开命令面板执行 `PromptBridge: Configure Relay Connection`
3. 输入：
   - Relay Server 地址
   - Agent Token
   - 本地 Agent 名称
4. 再执行 `PromptBridge: Connect Relay Agent`

可用命令：

- `PromptBridge: Configure Relay Connection`
- `PromptBridge: Connect Relay Agent`
- `PromptBridge: Disconnect Relay Agent`
- `PromptBridge: Show Relay Agent Status`

### 3. 手机访问服务器链接并发送 prompt

1. 手机打开服务器打印出来的链接或扫二维码
2. 输入 PIN
3. 发送 prompt

链路会变成：

`手机 -> 服务器 Relay Server -> 本机 Relay Agent -> 本机 Codex GUI -> 当前 Remote-SSH 工作区`

### 4. 推荐使用方式

对于你的场景，推荐这样用：

1. 服务器终端：
   只运行 `Relay Server`
2. 本机终端：
   只运行 `Helper`
3. 本机 VS Code：
   只把 `Remote-SSH` 工作窗口当成真正发送窗口
4. 若你额外开了本地普通窗口：
   不要在发送时把它放到前台

## 模式三：CLI 模式（最适合纯 SSH / 服务器）

如果你已经能在服务器上手工跑通 `Codex CLI`，这通常是最省事的方案。

### 快速启动（双终端 / 单命令）

如果你在 `vscode-extension` 子项目下直接运行 CLI Bridge，可用下面两种方式。

双终端方式：

```bash
# 终端 A
cd /your/project
codex --help

# 终端 B
cd <repo-root>/vscode-extension
npm run codex-cli:standalone -- --workdir /your/project --exec-command codex
```

单命令方式：

```bash
cd <repo-root>/vscode-extension
npm run codex-cli:both
```

可选环境变量（示例）：

```bash
PB_HOST=0.0.0.0 \
PB_PORT=8765 \
PB_WORKDIR=/your/project \
PB_CODEX_CMD=codex \
PB_PUBLIC_BASE_URL=https://your-domain.example.com \
npm run codex-cli:both
```

### 1. 先说结论：这时两个 VS Code 都不用参与发送

如果你使用 CLI 模式：

1. `VS Code A：本地普通窗口`
   可开可不开，只是普通编辑器
2. `VS Code B：Remote-SSH 窗口`
   也只是普通编辑器，用来看服务器代码

这两个窗口都不负责发送链路。

真正的发送链路会变成：

`手机 -> 服务器 CLI Server -> 服务器上的 Codex CLI -> 服务器代码目录`

所以 CLI 模式下：

- 不需要安装本扩展到本机来参与发送
- 不需要本机 Helper
- 不需要窗口焦点切换
- 不需要区分哪个窗口在前台

### 2. 在服务器启动 CLI Server

最简单示例：

```bash
cd <repo-root>
./scripts/dev.sh cli-server --public-base-url https://你的公网地址:8765 --workdir /你的仓库目录 --exec-command codex
```

如果你的 `Codex CLI` 不是从 stdin 读 prompt，而是把 prompt 当参数传入，可以这样：

```bash
cd <repo-root>
./scripts/dev.sh cli-server --public-base-url https://你的公网地址:8765 --workdir /你的仓库目录 --exec-command codex --exec-arg run --exec-arg __PROMPT__ --prompt-mode arg
```

含义：

- `--workdir`
  指向真正要运行 Codex 的服务器仓库目录
- `--exec-command`
  你手工已验证可用的命令，例如 `codex`
- `--exec-arg`
  追加命令参数，可重复写多次
- `--prompt-mode stdin`
  通过标准输入传 prompt，默认值
- `--prompt-mode arg`
  把 prompt 填进参数列表；若参数中包含 `__PROMPT__`，会替换它；否则会自动把 prompt 追加到最后

### 3. 手机访问并发送

启动后服务器终端会打印：

- 手机访问链接
- 一次性 PIN
- 当前 CLI 命令摘要
- 终端二维码

然后：

1. 手机打开链接
2. 输入 PIN
3. 发送 prompt

服务器会直接调用 Codex CLI。

### 4. 推荐使用方式

对你当前场景，优先推荐：

1. 服务器终端：
   运行 `CLI Server`
2. 本机 VS Code：
   只是普通的 Remote-SSH 编辑器
3. 手机：
   只负责发 prompt

## 如何测试

运行完整测试：

```bash
cd <repo-root>
./scripts/test.sh
```

当前已覆盖：

- Python `ruff + pytest`
- TypeScript `eslint + typecheck + build + vitest`
- 本地模式集成测试
- Relay 模式集成测试
- CLI 模式集成测试

## 如何打包扩展

```bash
cd <repo-root>
./scripts/package-extension.sh
```

## 人工验收清单

详细步骤见 [docs/manual-test-plan.md](docs/manual-test-plan.md)。

最小清单：

### 本地模式

1. 启动 Helper
2. 启动扩展
3. 查看链接 / 二维码 / PIN
4. 手机登录
5. 手机发送 prompt
6. 观察 Codex 输入框收到文本并发送

### Relay 模式

1. 在服务器启动 Relay Server
2. 在本机启动 Helper
3. 在本机 VS Code 配置并连接 Relay Agent
4. 手机访问服务器链接并登录
5. 手机发送 prompt
6. 观察本机 VS Code 的 Codex 输入框收到文本并发送
7. 确认 Codex 仍作用在当前 Remote-SSH 工作区

### CLI 模式

1. 在服务器启动 CLI Server
2. 手机访问服务器链接并登录
3. 手机发送 prompt
4. 观察服务器终端输出的 Codex CLI 日志
5. 确认命令实际运行在目标仓库目录

## 已知限制

- 仅实现 Linux/X11 稳定版，不保证 Wayland 可用
- 不读取 Codex 输出
- 打开 Codex 侧边栏仍依赖公开命令探测或显式配置
- 若输入框位置不稳定，需要先执行 `PromptBridge: Calibrate Input Position`
- Relay Server 当前只支持一个活动本地 Agent
- Relay `publicBaseUrl` 当前不支持路径前缀，适合根路径部署或反代到根路径
- CLI 模式要求你的 Codex CLI 本身支持非交互调用；如果某种用法必须依赖 TTY 交互，就不适合当前 CLI Server
- 真实 GUI 自动化仍依赖本机桌面环境；测试已经覆盖 mock / 集成链路，但不能替代真实桌面人工验收
- 当前环境没有 `uv` 和 `python3.11`，因此脚本已回退到 `.venv + pip`，并在 Python 3.10.12 上完成验证

## 后续扩展点

- 手机回看 Codex 回复
- 截图回传
- 响应流显示
- 多设备 / 多 Agent
- Wayland 适配
- 更细粒度的 Codex UI 定位
