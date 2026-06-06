# 运维手册

## 健康检查

```bash
curl http://127.0.0.1:3000/api/health
```

示例响应：

```json
{
  "ok": true,
  "terminals": 2,
  "publicOrigin": "https://terminal.example.com"
}
```

## 启动前检查

```bash
npm run preflight
```

如果失败，先修复失败项，再排查 Cloudflare 或浏览器问题。

常见失败：

- `APP_PIN or APP_PIN_HASH is configured`：没有配置登录凭据。
- `CODEX_CWD points to an existing directory`：项目目录不存在或路径写错。
- `CODEX_ARGS format is valid`：参数格式错误；包含空格的参数优先使用 JSON 数组。
- `CODEX_COMMAND can be executed`：服务器找不到 Codex CLI，或运行用户没有权限。
- `node-pty can spawn a probe shell`：PTY runtime 无法启动短生命周期探针 shell，先修复 `node-pty` 或系统 PTY 环境。
- `node-pty can be loaded`：依赖没有安装成功，或系统缺少编译/运行依赖。

## systemd 示例

假设项目位于 `/srv/chat2ide`，运行用户是 `chat2ide`：

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

启用：

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now chat2ide
```

查看日志：

```bash
journalctl -u chat2ide -f
```

## 重启影响

服务重启会丢失：

- 登录 session。
- 所有 PTY 进程。
- 每个终端的 ring buffer。

用户需要重新登录并新建终端。这是当前产品的明确边界，不是故障。

## 升级流程

```bash
cd /srv/chat2ide
git pull
npm install
npm run test
npm run build
npm run preflight
sudo systemctl restart chat2ide
```

升级会重启服务，因此会清空当前终端。

## 资源与权限

- 用专门的低权限系统账户运行服务。
- 把 `CODEX_CWD` 指向具体项目目录，不要指向 `/` 或整个 home。
- 不要把服务直接监听公网地址。
- 根据机器规格调整 `TERMINAL_MAX_SESSIONS`、`TERMINAL_MAX_INPUT_BYTES` 和 `APP_WS_MAX_MESSAGE_BYTES`。
- Cloudflare 账户、服务器 SSH 和 `.env` 文件都需要按敏感资产保护。
