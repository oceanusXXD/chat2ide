# 开发指南

## 1. 安装依赖

```bash
cd /home/coder/data/chat2ide
./scripts/bootstrap.sh
```

## 2. 本地开发入口

### 启动 Helper

```bash
cd /home/coder/data/chat2ide
./scripts/dev.sh helper
```

### 编译扩展

```bash
cd /home/coder/data/chat2ide
./scripts/dev.sh extension
```

### 启动远端 Relay Server

```bash
cd /home/coder/data/chat2ide
./scripts/dev.sh relay-server https://你的公网地址:8765
```

若当前只是本机测试，也可以直接：

```bash
cd /home/coder/data/chat2ide
./scripts/dev.sh relay-server
```

### 启动服务器侧 CLI Server

如果你不需要“发进 VS Code 侧边栏”，而是希望服务器直接调用 `Codex CLI`，使用：

```bash
cd /home/coder/data/chat2ide
./scripts/dev.sh cli-server --public-base-url https://你的公网地址:8765 --workdir /你的仓库目录 --exec-command codex
```

如果你的 CLI 需要把 prompt 作为参数传入，而不是从 `stdin` 读取，可使用：

```bash
cd /home/coder/data/chat2ide
./scripts/dev.sh cli-server --public-base-url https://你的公网地址:8765 --workdir /你的仓库目录 --exec-command codex --exec-arg run --exec-arg __PROMPT__ --prompt-mode arg
```

## 3. VS Code 扩展调试

1. 用 VS Code 打开 [vscode-extension](/home/coder/data/chat2ide/vscode-extension)
2. 按 `F5`
3. 仓库已自带：
   - [launch.json](/home/coder/data/chat2ide/vscode-extension/.vscode/launch.json)
   - [tasks.json](/home/coder/data/chat2ide/vscode-extension/.vscode/tasks.json)
4. 正常情况下会直接拉起 `Extension Development Host`

## 4. 本地模式调试步骤

在调试窗口中执行：

- `PromptBridge: Start Server`
- `PromptBridge: Show Access Info`

若 Helper 未自动发现：

- `PromptBridge: Configure Helper Path`

建议路径：

```text
/home/coder/data/chat2ide/.venv/bin/prompt-bridge-helper
```

## 5. Relay 模式调试步骤

### 服务器侧

先运行：

```bash
cd /home/coder/data/chat2ide
./scripts/dev.sh relay-server https://你的公网地址:8765
```

记下终端输出的：

- 手机访问链接
- PIN
- Agent Token

### 本机扩展侧

在本机 VS Code 的目标窗口执行：

- `PromptBridge: Configure Relay Connection`
- `PromptBridge: Connect Relay Agent`
- `PromptBridge: Show Relay Agent Status`

重要：

- 当前扩展已声明为 `extensionKind = ui`
- 在 `Remote-SSH` 场景下，扩展应运行在本机 UI 侧，而不是远端 `.vscode-server` 侧
- 推荐直接把“目标 Remote-SSH 窗口”作为唯一发送窗口
- 如果你同时开了一个本地普通窗口，发送时不要让它处于前台

建议再做一次运行侧确认：

1. 在目标 `Remote-SSH` 窗口执行 `Developer: Show Running Extensions`
2. 确认 `Prompt Bridge` 位于 `Local - Running Extensions`
3. 再执行 `PromptBridge: Connect Relay Agent`

## 6. 日志观察点

### 扩展侧

打开 VS Code `Output` 面板并切到：

- `Prompt Bridge`

重点观察：

- 服务启动
- session 创建
- PIN 轮换
- 手机登录成功 / 失败
- Relay Agent 连接状态
- prompt 转发
- Codex 打开
- Helper 调用

### Helper 侧

直接看终端输出：

```bash
.venv/bin/prompt-bridge-helper serve --host 127.0.0.1 --port 8766
```

重点观察：

- 状态切换
- 重试
- 校准记录
- DISPLAY / 剪贴板 / 焦点错误

### Relay Server 侧

直接看服务器终端输出：

- session 创建
- PIN 展示
- Agent 是否已连接
- 手机登录成功 / 失败
- prompt 是否已转发给本地 Agent

### CLI Server 侧

直接看服务器终端输出：

- session 创建
- PIN 展示
- 手机登录成功 / 失败
- prompt 接收
- CLI 命令摘要
- 工作目录
- stdout / stderr 摘要
- 超时或非零退出

## 7. 打包

```bash
cd /home/coder/data/chat2ide
./scripts/package-extension.sh
```

## 8. 测试

### 一次跑完

```bash
cd /home/coder/data/chat2ide
./scripts/test.sh
```

### 单独跑 Python

```bash
cd /home/coder/data/chat2ide/helper
../.venv/bin/ruff check .
../.venv/bin/pytest -q
```

### 单独跑 TypeScript

```bash
cd /home/coder/data/chat2ide
source ./scripts/common.sh
cd "$EXTENSION_DIR"
npm_cmd run lint
npm_cmd run typecheck
npm_cmd run build
npm_cmd run test
```

## 9. 常见问题

### 手机上打不开页面

本地模式检查：

1. 是否已执行 `PromptBridge: Start Server`
2. 电脑与手机是否在同一网络
3. 当前绑定地址是否为 `0.0.0.0`

Relay 模式检查：

1. Relay Server 是否已经启动
2. `publicBaseUrl` 是否是手机能访问的真实地址
3. 反向代理是否把根路径正确转发到了 Relay Server

CLI 模式检查：

1. CLI Server 是否已经启动
2. `publicBaseUrl` 是否是手机能访问的真实地址
3. 反向代理或防火墙是否放通端口
4. 你访问的是否还是当前服务打印出的最新 `session URL`

### Relay Agent 连不上服务器

优先检查：

1. 本机扩展是否真的运行在本机 UI 侧
2. `Developer: Show Running Extensions` 里 `Prompt Bridge` 是否出现在 `Local - Running Extensions`
3. Relay Server 地址是否填写正确
4. Agent Token 是否与服务器终端打印的一致
5. 服务器防火墙或安全组是否放通端口

### Helper 找不到 VS Code 窗口

可先手动运行：

```bash
.venv/bin/prompt-bridge-helper serve --window-keyword "Code"
```

若仍失败：

1. 确认当前是 Linux/X11，而不是 Wayland
2. 先手动打开 Codex 侧边栏
3. 执行 `PromptBridge: Calibrate Input Position`

### 手机显示已发送，但 Codex 没反应

按顺序检查：

1. 扩展日志是否已经进入 `helper_busy`
2. Helper 终端是否报 `DISPLAY`、`xdotool`、`xclip` 或窗口匹配错误
3. 当前活动窗口是否真的是目标 `Remote-SSH` 窗口
4. 若是 Relay 模式，Relay Agent 状态是否仍为 `connected`

### CLI 模式显示发送失败

按顺序检查：

1. CLI Server 启动参数里是否提供了 `--exec-command`
2. `--workdir` 是否指向正确仓库
3. 该命令是否能在服务器终端里手工跑通
4. 若使用 `--prompt-mode arg`，参数列表里是否正确包含 `__PROMPT__`
5. 是否需要提高 `--timeout-ms`
