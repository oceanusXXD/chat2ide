# 架构说明

## 设计目标

项目目标始终不变：

1. 手机安全访问
2. 输入 prompt
3. 按所选运行模式把 prompt 送给 Codex

当前仓库已经支持三条部署路径：

- `本地模式`
- `Relay 模式`
- `CLI 模式`

## 为什么采用“VS Code 扩展 + Python Helper”

这个项目刻意不依赖 Codex 扩展的私有 API。

原因：

1. 公开稳定的集成面通常只有命令、视图和扩展元数据
2. Codex 输入框属于另一扩展的内部 UI 结构，不能假设存在官方注入接口
3. 直接依赖私有 DOM / 内部 API 会在版本变动时立即失效

因此把系统分成两跳：

- `VS Code 扩展 / Relay Agent`
  负责公开命令调用、状态管理、接收手机或 relay 消息
- `Python Helper`
  负责操作系统级聚焦、点击、粘贴和回车

## 为什么要新增 Relay 模式

### 原本地模式的前提

本地模式默认假设：

1. 手机能直接访问运行扩展的那台机器
2. 扩展进程和 VS Code GUI 在同一台机器
3. Helper 也在同一台机器

这个假设对“本机 VS Code + 本机工作区”成立。

### 在 Remote-SSH 场景为什么不够

当用户是：

- 本机 VS Code
- 当前窗口连接远端 SSH 工作区
- 手机需要访问服务器入口

就会出现一个根本边界：

- `GUI 自动化` 只能发生在本机
- `手机入口` 却更适合放在服务器

也就是说，服务器不能直接操作本机屏幕上的 Codex 输入框。

因此必须引入中继：

- `服务器`
  提供手机入口和会话安全控制
- `本机`
  保留 VS Code 扩展与 Helper，执行最终 GUI 自动化

## 为什么还要新增 CLI 模式

对很多服务器用户来说，真正想要的是：

- 手机把 prompt 发到服务器
- 服务器直接调用 `Codex CLI`
- 不依赖本机 VS Code GUI

如果用户已经能在服务器上手工跑通 `Codex CLI`，那么再走：

- 本机扩展
- Relay Agent
- Helper
- GUI 聚焦和粘贴

就会显得过重。

因此新增 `CLI 模式`：

- 服务器继续提供手机入口和安全控制
- 服务器直接执行 `Codex CLI`
- 本机 VS Code 只保留“查看 / 编辑远端代码”的职责，不参与发送链路

## 三种模式的数据流

## 本地模式

1. 用户在本机 VS Code 中执行 `PromptBridge: Start Server`
2. 扩展创建 `sessionId + PIN`
3. 扩展在本机启动 HTTP / WebSocket 服务
4. 手机登录并提交 prompt
5. 扩展校验 session / PIN / authToken
6. 扩展调用公开命令打开 Codex
7. 扩展调用本机 Helper 粘贴并发送

## Relay 模式

1. 服务器启动 `Relay Server CLI`
2. Relay Server 创建 `sessionId + PIN + agentToken`
3. 本机 VS Code 扩展作为 `Relay Agent` 连接服务器
4. 手机访问服务器页面并完成 PIN 登录
5. 手机提交 prompt
6. 服务器校验登录态后，把 prompt 通过 WebSocket 发给本机 Relay Agent
7. 本机 Relay Agent 复用现有 `PromptBridgeController`：
   - 打开 Codex
   - 检查 / 启动 Helper
   - 粘贴并发送
8. 本机把执行结果回传给服务器
9. 服务器再把成功 / 失败结果反馈给手机页面

## CLI 模式

1. 服务器启动 `Codex CLI Server`
2. CLI Server 创建 `sessionId + PIN`
3. 手机访问服务器页面并完成 PIN 登录
4. 手机提交 prompt
5. 服务器校验登录态
6. 服务器在目标仓库目录里直接启动 `Codex CLI`
7. prompt 根据配置通过 `stdin` 或命令参数传给 CLI
8. 服务器记录 stdout / stderr / 退出码
9. 服务器把成功 / 失败状态返回给手机页面

## 模块职责

## `vscode-extension`

- [extension.ts](/home/coder/data/chat2ide/vscode-extension/src/extension.ts)
  扩展入口、依赖装配、命令注册
- [bridge/promptBridgeController.ts](/home/coder/data/chat2ide/vscode-extension/src/bridge/promptBridgeController.ts)
  本地模式主控制器，同时也提供 Relay Agent 复用的发送入口
- [relay/relayAgentClient.ts](/home/coder/data/chat2ide/vscode-extension/src/relay/relayAgentClient.ts)
  本机 Relay Agent，负责长连服务器并执行远端下发的 prompt
- [relay/relaySettingsStore.ts](/home/coder/data/chat2ide/vscode-extension/src/relay/relaySettingsStore.ts)
  本地保存 Relay Server 地址、Agent 名称和 token
- [server/httpServer.ts](/home/coder/data/chat2ide/vscode-extension/src/server/httpServer.ts)
  手机登录页与 HTTP API
- [server/wsServer.ts](/home/coder/data/chat2ide/vscode-extension/src/server/wsServer.ts)
  手机状态推送 WebSocket
- [relay/relayAgentServer.ts](/home/coder/data/chat2ide/vscode-extension/src/relay/relayAgentServer.ts)
  服务器侧的本地 Agent 管理与 prompt 中继
- [relay/relayBridgeController.ts](/home/coder/data/chat2ide/vscode-extension/src/relay/relayBridgeController.ts)
  远端 Relay Server 控制器
- [cli/relayServer.ts](/home/coder/data/chat2ide/vscode-extension/src/cli/relayServer.ts)
  服务器启动入口
- [cli/codexCliRunner.ts](/home/coder/data/chat2ide/vscode-extension/src/cli/codexCliRunner.ts)
  服务器侧 Codex CLI 执行器
- [cli/codexCliBridgeController.ts](/home/coder/data/chat2ide/vscode-extension/src/cli/codexCliBridgeController.ts)
  CLI 模式主控制器
- [cli/codexCliServer.ts](/home/coder/data/chat2ide/vscode-extension/src/cli/codexCliServer.ts)
  CLI 模式启动入口
- [server/auth.ts](/home/coder/data/chat2ide/vscode-extension/src/server/auth.ts)
  session/PIN/authToken 校验
- [server/sessionStore.ts](/home/coder/data/chat2ide/vscode-extension/src/server/sessionStore.ts)
  当前活动 session 数据
- [state/appState.ts](/home/coder/data/chat2ide/vscode-extension/src/state/appState.ts)
  运行状态、最近一次 prompt 和错误信息
- [codex/codexController.ts](/home/coder/data/chat2ide/vscode-extension/src/codex/codexController.ts)
  公开命令探测与执行
- [helper/helperClient.ts](/home/coder/data/chat2ide/vscode-extension/src/helper/helperClient.ts)
  调用 Python Helper

## `helper`

- [main.py](/home/coder/data/chat2ide/helper/src/helper/main.py)
  启动入口
- [service.py](/home/coder/data/chat2ide/helper/src/helper/service.py)
  协议处理与 HTTP 接口
- [automator.py](/home/coder/data/chat2ide/helper/src/helper/automator.py)
  自动化编排
- [clipboard.py](/home/coder/data/chat2ide/helper/src/helper/clipboard.py)
  剪贴板备份与恢复
- [calibration.py](/home/coder/data/chat2ide/helper/src/helper/calibration.py)
  输入框校准配置
- [platform/linux.py](/home/coder/data/chat2ide/helper/src/helper/platform/linux.py)
  Linux/X11 平台实现

## 状态机

## 扩展 / 服务端状态

- `stopped`
- `starting`
- `running`
- `awaiting_login`
- `authenticated`
- `forwarding`
- `helper_busy`
- `relay_connecting`
- `relay_connected`
- `relay_disconnected`
- `error`

## Helper 状态

- `idle`
- `focusing_window`
- `preparing_input`
- `sending`
- `success`
- `failure`

## 为什么 Helper 仍使用本地 HTTP

扩展与 Helper 继续沿用本地 HTTP，而不是改成 stdio / JSON-RPC，原因不变：

1. 独立启动与独立排障更直接
2. 健康检查、校准、发送动作都能统一成小接口
3. 测试更容易做 mock 与集成验证
4. Relay 模式只是把“谁触发发送”改成服务器下发，不需要改 Helper 通信栈

CLI 模式则完全绕过 Helper，因为它根本不再做 GUI 自动化。

## 为什么扩展声明为 `ui`

在 `Remote-SSH` 场景里，真正需要操作的是本机 GUI。

因此扩展被声明为：

- `extensionKind = ui`

这样它会优先运行在本机 UI 侧，而不是远端 `.vscode-server` 侧。

这正是 Relay Agent 能控制当前远端窗口 GUI、但又不影响 Remote-SSH 工作区本身的原因。
