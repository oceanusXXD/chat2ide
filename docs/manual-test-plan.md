# 人工验收方案

本文档分成三条验收路径：

1. `本地模式`
2. `Relay 模式（Remote-SSH / 服务器）`
3. `CLI 模式（纯 SSH / 服务器）`

如果你的日常使用方式是“本机 VS Code 连接 SSH 服务器”，请先判断你真正需要哪条链路：

1. 必须发进 `VS Code 侧边栏 Codex`
   按 `Relay 模式` 验收
2. 只需要把 prompt 发给 `服务器上的 Codex CLI`
   按 `CLI 模式` 验收

## 通用前置条件

- 服务器和手机之间网络可达
- 已执行 `./scripts/bootstrap.sh`
- 若验收 `本地模式` 或 `Relay 模式`：
  - 需要 Linux/X11 会话
  - 需要已安装 `xdotool` 和 `xclip`
  - 需要已安装 Codex 扩展
  - 建议先让 Codex 扩展至少启动过一次

建议同时打开两个观察面板：

1. VS Code 的 `Output -> Prompt Bridge`
2. Helper 或 Relay Server 的终端窗口

## 一、本地模式验收

### 1. 启动 Helper

```bash
cd /home/coder/data/chat2ide
./scripts/dev.sh helper
```

期望：

- 终端输出 Helper 已启动日志

### 2. 启动扩展

1. 用 VS Code 打开 [vscode-extension](/home/coder/data/chat2ide/vscode-extension)
2. 按 `F5`
3. 在新窗口执行：
   - `PromptBridge: Start Server`
   - `PromptBridge: Show Access Info`

若扩展没有自动发现 Helper，再执行：

- `PromptBridge: Configure Helper Path`

### 3. 手机登录

1. 手机扫描二维码或直接打开链接
2. 输入 PIN

期望：

- 手机进入 prompt 输入区
- VS Code `Output -> Prompt Bridge` 出现登录成功日志

### 4. 手机发送 prompt

1. 输入测试文本
2. 点击发送

期望：

- 手机页面显示正在转发或发送成功
- VS Code `Output -> Prompt Bridge` 依次出现：
  - 收到 prompt
  - 尝试打开 Codex
  - Helper 执行中
- Codex 输入框收到文本并回车发送

### 5. 校准验证

若发送位置不对：

1. 先把鼠标放到 Codex 输入框
2. 执行 `PromptBridge: Calibrate Input Position`
3. 重新发送 prompt

期望：

- VS Code 提示已记录输入位置
- 再次发送时会先点击该位置

## 二、Relay 模式验收

这是服务器场景的主验收流程。

### 0. 先明确两个 VS Code 窗口的角色

如果你同时开了两个窗口，请按这个规则：

1. `本地普通窗口`
   只用于安装扩展、看输出、调试，不作为真正发送目标
2. `Remote-SSH 窗口`
   这是唯一的发送目标窗口

真正发送前，必须保证：

1. 当前最前面的窗口是目标 `Remote-SSH` 窗口
2. 不要让本地普通窗口挡在前面

否则 Helper 可能会把 prompt 粘贴到错误窗口。

### 1. 在服务器启动 Relay Server

```bash
cd /home/coder/data/chat2ide
./scripts/dev.sh relay-server https://你的公网地址:8765
```

期望：

- 终端打印：
  - 手机访问链接
  - 一次性 PIN
  - Agent Token
  - 二维码

### 2. 在本机启动 Helper

```bash
cd /home/coder/data/chat2ide
./scripts/dev.sh helper
```

### 3. 在本机 VS Code 中连接 Relay Agent

重要说明：

- 这里的扩展必须安装在 `本机 UI 侧`
- 即使当前 VS Code 窗口连的是 `Remote-SSH` 工作区，也仍然要让本机侧扩展运行
- 推荐直接在目标 `Remote-SSH` 窗口里执行下面这些命令，而不是在本地普通窗口里执行

操作步骤：

1. 在本机 VS Code 的目标窗口里执行 `PromptBridge: Configure Relay Connection`
2. 输入服务器打印出来的：
   - Relay Server 地址
   - Agent Token
   - Agent 名称
3. 再执行 `PromptBridge: Connect Relay Agent`
4. 可执行 `PromptBridge: Show Relay Agent Status` 观察连接状态

期望：

- `Output -> Prompt Bridge` 出现已连接 Relay Server 的日志
- Relay Server 终端中的 `Agent 已连接` 变为 `是`
- `Developer: Show Running Extensions` 中，`Prompt Bridge` 应位于 `Local - Running Extensions`

### 4. 手机登录服务器页面

1. 手机扫描二维码或直接打开服务器打印的链接
2. 输入服务器终端中的 PIN

期望：

- 手机进入 prompt 输入页
- Relay Server 日志中出现登录成功

### 5. 手机发送 prompt

1. 手机输入测试文本
2. 点击发送

期望：

- Relay Server 终端显示正在转发到本地 Agent
- 本机 VS Code `Output -> Prompt Bridge` 显示：
  - Relay Agent 收到 prompt
  - 尝试打开 Codex
  - Helper 调用开始 / 成功
- 本机 VS Code 的 Codex 输入框收到文本并发送
- 前台窗口应始终保持为目标 `Remote-SSH` 窗口

### 6. Remote-SSH 工作区确认

若你当前窗口本身就是一个 `Remote-SSH` 工程：

1. 在发送前确认当前活动窗口就是目标 SSH 工作区
2. 发送后观察 Codex 是否仍以该远端工作区为上下文

期望：

- Codex 的动作仍针对当前远端服务器代码，而不是切回本地工程

## 三、CLI 模式验收

这条路径最适合你当前“服务器才是真正执行环境”的场景。

### 0. 先明确两个 VS Code 的角色

在 `CLI 模式` 下：

1. `本地普通窗口`
   只是普通编辑器，可开可不开
2. `Remote-SSH 窗口`
   也只是普通编辑器，用来查看和编辑服务器代码

这两个窗口都不参与发送链路。

真正的发送链路是：

`手机 -> 服务器 CLI Server -> 服务器上的 Codex CLI`

### 1. 在服务器手工确认 Codex CLI 可用

先在服务器终端手工执行你准备给 CLI Server 使用的命令。例如：

```bash
cd /你的仓库目录
codex --help
```

或你自己的实际非交互调用方式。

期望：

- 命令存在
- 当前用户有权限执行
- 工作目录正确

### 2. 启动 CLI Server

最简单示例：

```bash
cd /home/coder/data/chat2ide
./scripts/dev.sh cli-server --public-base-url https://你的公网地址:8765 --workdir /你的仓库目录 --exec-command codex
```

若你的 CLI 需要把 prompt 当参数传入，可改为：

```bash
cd /home/coder/data/chat2ide
./scripts/dev.sh cli-server --public-base-url https://你的公网地址:8765 --workdir /你的仓库目录 --exec-command codex --exec-arg run --exec-arg __PROMPT__ --prompt-mode arg
```

期望：

- 终端打印：
  - 手机访问链接
  - 一次性 PIN
  - 二维码
  - CLI 命令摘要

### 3. 手机登录

1. 手机扫描二维码或直接打开链接
2. 输入 PIN

期望：

- 手机进入 prompt 输入页
- CLI Server 终端出现登录成功日志

### 4. 手机发送 prompt

1. 手机输入测试文本
2. 点击发送

期望：

- 手机显示发送成功或明确失败
- CLI Server 终端显示：
  - 收到 prompt
  - 启动 CLI
  - 工作目录
  - 退出码
  - stdout / stderr 摘要

### 5. 验证命令确实运行在目标仓库

根据你自己的 Codex CLI 行为确认以下至少一点：

1. 终端日志中的 `workdir` 与预期一致
2. CLI 输出与该仓库上下文一致
3. 该目录下产生了符合预期的 CLI 行为结果

## 四、失败时的最小排查顺序

### 本地模式

1. `Output -> Prompt Bridge` 是否已有“本地服务已启动”
2. 手机是否能打开 `session URL`
3. PIN 是否仍在有效期内
4. 是否已经进入 `helper_busy`
5. Helper 终端是否报 VS Code 窗口、DISPLAY 或剪贴板错误

### Relay 模式

1. Relay Server 终端是否显示 `Agent 已连接: 是`
2. 本机 `PromptBridge: Show Relay Agent Status` 是否为 `connected`
3. 手机是否能访问服务器链接
4. PIN 是否仍有效
5. 本机 Helper 是否已启动并健康
6. 发送时本机日志是否至少进入“尝试打开 Codex”
7. 是否需要先执行输入框校准

### CLI 模式

1. CLI Server 终端是否已经打印访问链接和 PIN
2. 手机是否能访问该链接
3. PIN 是否仍有效
4. `--exec-command` 是否配置正确
5. `--workdir` 是否指向目标仓库
6. 该命令能否在服务器终端手工跑通
7. 是否需要调整 `--prompt-mode` 或 `--timeout-ms`
