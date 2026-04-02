# 安全说明

## 当前版本的安全目标

本项目不是通用公网 SaaS，而是一个受控场景下的桥接工具。

当前安全目标分成三类：

1. `手机 -> 服务端`
   防止未登录手机直接提交 prompt
2. `服务端 -> 本地 Relay Agent`
   防止陌生客户端伪装成本地执行器接收 prompt
3. `CLI Server -> Codex CLI`
   防止服务端在未受控参数下执行错误命令或卡死命令

## 当前安全控制

### 手机访问侧

已实现：

1. 随机 `sessionId`
2. 一次性短期 `PIN`
3. PIN 登录成功后签发短期 `authToken`
4. `session` 与 `authToken` 都有过期时间
5. PIN 连续输错达到阈值后临时锁定
6. 未登录时拒绝 `submit_prompt`
7. 已登录手机的 WebSocket 只接受合法 `authToken`
8. 日志中对 PIN 与 token 进行遮罩

### Relay Agent 侧

已实现：

1. 服务端启动时生成随机 `agentToken`
2. 本地 Relay Agent 连接时必须携带 `agentToken`
3. token 不进入手机页面，不通过手机链路暴露
4. token 默认存储在本机扩展 `secrets` 中，而不是工作区文件里
5. 服务端没有本地 Agent 时，手机提交会收到明确失败，不会假成功
6. 当前只允许一个活动 Relay Agent，新的连接会替换旧连接

### CLI 模式侧

已实现：

1. CLI Server 必须显式配置 `--exec-command`
2. prompt 默认走 `stdin`，避免直接把整段敏感文本拼进 shell 命令串
3. 执行通过 `spawn` 参数数组完成，不通过 `sh -c` 拼接字符串
4. 支持 `timeout-ms`，避免单次 CLI 调用无限挂起
5. 工作目录由 `--workdir` 显式指定，避免在错误目录执行
6. 日志只记录命令摘要和输出摘要，不直接完整打印手机口令

## 过期与轮换

### session URL

- 形式：`/session/<sessionId>`
- 默认 15 分钟过期
- 本地模式下可通过 `PromptBridge: Regenerate Access Token` 轮换
- Relay 模式下当前版本建议直接重启 Relay Server 完成轮换

### PIN

- 默认 6 位
- 与 session 一起过期
- 连续错误达到阈值后触发锁定

### authToken

- 默认 10 分钟过期
- 过期后手机必须重新输入 PIN
- 手机状态 WebSocket 会随登录态一起失效

### agentToken

- Relay Server 启动时生成
- 当前版本默认跟随 Relay Server 生命周期
- 若需要轮换，建议重启 Relay Server 并重新在本机扩展中配置

### CLI 执行配置

- `--exec-command`、`--exec-arg`、`--workdir` 跟随 CLI Server 进程生命周期
- 若需要轮换执行策略，建议重启 CLI Server
- 当前版本不支持手机端动态修改 CLI 执行命令，避免远程滥用

## 日志策略

日志中不会完整打印：

- PIN
- 手机 `authToken`
- Relay `agentToken`
- 手机提交的完整敏感口令

但以下信息会保留，用于排障：

- sessionId
- 失败原因
- 锁定时间
- 连接状态
- Agent 名称

## 当前边界

### 本地模式

本地模式更适合：

- 同机使用
- 同一局域网
- 临时测试

若直接把本地模式服务暴露到公网，风险较高。

### Relay 模式

Relay 模式更适合：

- 服务器对手机可达
- 本机通过互联网连到服务器
- 当前 VS Code 使用 `Remote-SSH`

但当前仍有这些边界：

1. Relay Agent 与 Relay Server 的连接本身不附带额外双向设备认证
2. `agentToken` 仍属于单一共享密钥
3. 若通过公网使用，建议把 Relay Server 放在 HTTPS / WSS 反向代理之后
4. `publicBaseUrl` 当前不支持路径前缀，只支持根路径部署

### CLI 模式

CLI 模式更适合：

- 手机与服务器可达
- 服务器已经手工验证过 `Codex CLI` 可用
- 不要求文本必须出现在 VS Code 侧边栏

但当前边界也很明确：

1. 当前版本不会解析 `Codex CLI` 的富交互 TTY 界面
2. 如果某种 CLI 用法必须依赖交互式终端、全屏 UI 或人工确认，则不适合当前模式
3. `stdin` 与 `arg` 两种传参方式都属于“预定义命令模板”，不是任意远程执行接口
4. 若 CLI 本身能访问敏感仓库或高权限环境，仍应由部署者自行控制该服务的暴露范围
5. 若要公网暴露，仍建议放在 HTTPS 反向代理后，并做好防火墙限制

## 推荐使用方式

### 本地模式

1. 仅在可信局域网中使用
2. 用完立即停止服务或轮换 session
3. 不要直接向公网暴露本地端口

### Relay 模式

1. 优先使用 HTTPS / WSS 暴露服务端入口
2. `agentToken` 只在服务器终端和本机扩展之间传递，不要发到聊天软件或提交到仓库
3. 本机扩展断开后，服务器终端应能看到 `Agent 已连接: 否`
4. 使用结束后关闭 Relay Server，避免长期开放入口

### CLI 模式

1. 优先使用 `prompt-mode=stdin`
2. `--exec-command` 指向你已经手工验证可运行的 `codex` 可执行文件
3. `--workdir` 只指向你允许 Codex 操作的仓库目录
4. 把 CLI Server 放在 HTTPS 反向代理之后时，只转发到单一受控端口
5. 使用结束后关闭 CLI Server，避免长期暴露手机入口
