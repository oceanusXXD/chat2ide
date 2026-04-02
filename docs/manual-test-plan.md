# 手工验收

目标：确认系统满足 `Remote Codex CLI Terminal Hub` 的最低可用闭环。

## 0. 预设条件

- 服务端已经启动
- 已配置 `APP_PIN`
- 已配置 `CODEX_COMMAND`
- 如果验收公网访问，Cloudflare Tunnel 已经通

## 1. 登录

1. 打开页面
2. 确认先看到 PIN 登录页
3. 输入错误 PIN
4. 确认返回模糊错误，不泄露内部细节
5. 输入正确 PIN
6. 确认进入主页面

通过标准：

- 必须由服务端校验 PIN
- 登录后浏览器能维持会话

## 2. 新建多个终端

1. 点击 `New Terminal` 两次
2. 确认出现两个 tabs
3. 确认每个 tab 都有自己的状态和 PID

通过标准：

- 两个 terminal 对应两个独立进程
- tab 切换不互相污染

## 3. 输入与流式输出

1. 选中第一个 terminal
2. 在底部输入栏发送一条命令
3. 确认命令进入当前 terminal
4. 确认终端主视图实时流式显示输出
5. 切换到第二个 terminal，发送另一条命令
6. 确认输出只对应第二个 terminal

通过标准：

- 输出主界面是终端
- 不是聊天卡片列表
- 输出顺序不乱

## 4. stop / restart / close

1. 对某个 terminal 点击 `Stop`
2. 确认状态变为 `stopped`
3. 点击 `Restart`
4. 确认 terminal 被清空并重新开始
5. 点击 `Close`
6. 确认 tab 被移除

## 5. 断线重连

1. 打开一个持续输出中的 terminal
2. 临时断开网络，或直接刷新页面
3. 页面恢复后重新登录或自动恢复会话
4. 确认 terminal 重新 attach
5. 确认最近输出被 replay

通过标准：

- 不需要重新创建进程
- 可以继续看到已有 terminal

## 6. Cloudflare Tunnel

1. 通过 Cloudflare 域名访问页面
2. 登录
3. 新建 terminal
4. 发送命令
5. 确认 `/ws` 正常工作

通过标准：

- 页面可访问
- WebSocket 正常升级
- cookie 在 Cloudflare 后仍然有效

## 7. 移动端

1. 用手机浏览器打开页面
2. 登录
3. 滚动 tabs
4. 使用底部输入框发送命令
5. 点击 `Ctrl+C` / `Stop` / `Restart`

通过标准：

- 输入框可用
- tabs 可横向滚动
- 终端区域仍保持主要可视空间
