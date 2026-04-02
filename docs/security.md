# 安全边界

## 默认安全模型

这个系统是：

- 单用户
- 单服务器
- 内网监听
- Cloudflare Tunnel 暴露公网
- PIN 登录
- 内存 session

它不是多用户 SaaS，也不是高隔离托管平台。

## 已实现的最小安全措施

### PIN 服务端校验

- PIN 只在服务端校验
- 前端不会内置 PIN
- 支持 `APP_PIN` 或 `APP_PIN_HASH`

### 登录失败限制

- 连续输错会触发短暂锁定
- 返回模糊错误，不区分“PIN 错”还是“暂时锁定”

### Session Cookie

- `HttpOnly`
- `SameSite=Lax`
- `Secure` 根据 HTTPS / Cloudflare / 配置推断

### 代理感知

- 支持 `trust proxy`
- 可以正确处理 `X-Forwarded-*`

## 生产建议

- 始终监听 `127.0.0.1`
- 始终通过 Cloudflare 域名访问
- 始终设置 `APP_PUBLIC_ORIGIN`
- 始终启用 `APP_TRUST_PROXY=1`
- 优先使用 `APP_PIN_HASH`

## 不做的事

- 不做多用户权限系统
- 不做数据库审计日志
- 不做复杂 token 刷新机制
- 不做文件级 ACL
- 不做终端内容脱敏

## 需要自行承担的边界

- 登录后的用户就是这台服务器上的单一控制者
- 终端有执行服务器命令的能力
- 如果服务器本身被入侵，应用层 PIN 不能替代主机安全

所以你仍然需要：

- 保护服务器 SSH
- 保护 Cloudflare 账户
- 使用最小权限系统账户运行 `chat2ide`
- 控制 `CODEX_CWD` 和 CLI 执行用户权限
