# Cloudflare 部署

推荐生产方式是：`chat2ide` 只监听服务器本机 `127.0.0.1:3000`，由 `cloudflared` 把公网 HTTPS 域名转发进来。

```text
browser / phone
    |
Cloudflare edge
    |
cloudflared on the server
    |
127.0.0.1:3000 chat2ide
```

应用的 HTTP API 和 WebSocket 都在同一个 origin 下。前端固定连接 `/ws`，Cloudflare Tunnel 不需要额外 rewrite。

## 1. 准备服务器

前置条件：

- Node.js 16.20+。
- npm。
- 已安装并认证可用的 Codex CLI。
- 一个低权限运行用户，例如 `chat2ide`。
- 一个项目目录，例如 `/srv/your-project`，作为 `CODEX_CWD`。

示例：

```bash
sudo useradd --system --create-home --shell /usr/sbin/nologin chat2ide
sudo mkdir -p /srv/chat2ide /srv/your-project
sudo chown -R chat2ide:chat2ide /srv/chat2ide /srv/your-project
```

如果 Codex CLI 需要用户级认证，请确保运行 `chat2ide` 的系统用户能执行 `codex`。

## 2. 构建应用

```bash
cd /srv/chat2ide
npm install
npm run typecheck
npm run build
```

## 3. 配置 `.env`

```dotenv
APP_HOST=127.0.0.1
APP_PORT=3000
APP_PUBLIC_ORIGIN=https://terminal.example.com
APP_TRUST_PROXY=1
APP_COOKIE_SECURE=auto
APP_PIN_HASH=scrypt$<salt-hex>$<hash-hex>
CODEX_COMMAND=codex
CODEX_CWD=/srv/your-project
TERMINAL_BUFFER_BYTES=262144
```

运行部署前检查：

```bash
npm run preflight
```

如果 preflight 失败，先修复失败项。不要先排查 Cloudflare。

## 4. 配置 systemd

示例 `/etc/systemd/system/chat2ide.service`：

```ini
[Unit]
Description=chat2ide remote Codex terminal
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=chat2ide
WorkingDirectory=/srv/chat2ide
EnvironmentFile=/srv/chat2ide/.env
ExecStart=/usr/bin/node /srv/chat2ide/dist/server/index.js
Restart=on-failure
RestartSec=3

[Install]
WantedBy=multi-user.target
```

启动：

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now chat2ide
```

查看日志：

```bash
journalctl -u chat2ide -f
```

本机检查：

```bash
curl http://127.0.0.1:3000/api/health
```

## 5. 创建 Cloudflare Tunnel

```bash
cloudflared tunnel login
cloudflared tunnel create chat2ide
cloudflared tunnel route dns chat2ide terminal.example.com
```

示例 `/etc/cloudflared/config.yml`：

```yaml
tunnel: chat2ide
credentials-file: /etc/cloudflared/chat2ide.json

ingress:
  - hostname: terminal.example.com
    service: http://127.0.0.1:3000
  - service: http_status:404
```

前台测试：

```bash
cloudflared tunnel run chat2ide
```

作为服务运行：

```bash
sudo cloudflared service install
sudo systemctl enable --now cloudflared
```

## 6. 验证公网访问

1. 打开 `https://terminal.example.com`。
2. 确认 PIN 登录页出现。
3. 登录。
4. 新建终端。
5. 确认 xterm 视图出现 Codex CLI 输出。
6. 发送一条输入。
7. 刷新页面，确认可以重新附着并回放最近输出。

## 常见失败

登录成功但 `/ws` 失败：

- 检查 `APP_PUBLIC_ORIGIN` 是否与浏览器 origin 完全一致。
- 检查 Cloudflare Tunnel 是否指向 `http://127.0.0.1:3000`。
- 检查 `APP_TRUST_PROXY=1`。

cookie 不保存：

- 生产域名必须是 HTTPS。
- 保持 `APP_COOKIE_SECURE=auto` 或 `always`。
- 不要用和 `APP_PUBLIC_ORIGIN` 不一致的域名访问。

终端无输出：

- 先运行 `npm run preflight`。
- 检查 `CODEX_COMMAND` 是否能被运行用户执行。
- 检查 `CODEX_CWD` 是否存在且运行用户有权限。
- 临时把 `CODEX_COMMAND` 改成 `/bin/bash`、`CODEX_ARGS=["-i"]` 做 PTY smoke test。

## 升级

```bash
cd /srv/chat2ide
git pull
npm install
npm run typecheck
npm run build
npm run preflight
sudo systemctl restart chat2ide
```

注意：重启 `chat2ide` 会清空当前登录 session、终端进程和 ring buffer。
