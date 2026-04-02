# Deploy with Cloudflare Tunnel

## Target Topology

```text
browser / phone
    |
Cloudflare edge
    |
cloudflared on the server
    |
127.0.0.1:3000 chat2ide
```

The app handles both HTTP and WebSocket traffic on the same origin. The frontend connects to `/ws`.

## 1. Build the App

```bash
cd /home/coder/data/chat2ide
./scripts/bootstrap.sh
./scripts/test.sh
```

## 2. Configure Environment

Create `.env` from `env.example` or export variables directly.

Recommended minimum:

```dotenv
APP_HOST=127.0.0.1
APP_PORT=3000
APP_PUBLIC_ORIGIN=https://terminal.example.com
APP_TRUST_PROXY=1
APP_COOKIE_SECURE=auto
APP_PIN_HASH=scrypt$<salt>$<hash>
CODEX_COMMAND=codex
CODEX_CWD=/srv/your-project
```

## 3. Start the App

```bash
cd /home/coder/data/chat2ide
node dist/server/index.js
```

## 4. Install `cloudflared`

On Debian or Ubuntu, follow Cloudflare's official install steps. Then authenticate and create a tunnel:

```bash
cloudflared tunnel login
cloudflared tunnel create chat2ide
```

## 5. Configure Tunnel Ingress

Example `/etc/cloudflared/config.yml`:

```yaml
tunnel: chat2ide
credentials-file: /etc/cloudflared/chat2ide.json

ingress:
  - hostname: terminal.example.com
    service: http://127.0.0.1:3000
  - service: http_status:404
```

Then route the hostname:

```bash
cloudflared tunnel route dns chat2ide terminal.example.com
```

## 6. Run `cloudflared`

Foreground:

```bash
cloudflared tunnel run chat2ide
```

Or install it as a system service according to your distro.

## WebSocket Notes

No extra websocket path rewrite is required.

Requirements:

- `/ws` stays on the same public hostname as the frontend
- `APP_PUBLIC_ORIGIN` matches the Cloudflare hostname
- `APP_TRUST_PROXY=1` stays enabled behind Cloudflare

## Validation Checklist

1. Open `https://terminal.example.com`
2. Confirm the PIN login page loads
3. Log in
4. Create a terminal
5. Confirm terminal output appears in the xterm viewport
6. Confirm stop, restart, and close work
7. Refresh and confirm reconnect plus replay works

## Common Failure Modes

- Login works locally but fails behind Cloudflare:
  Check `APP_PUBLIC_ORIGIN`, `APP_TRUST_PROXY`, and cookie secure behavior.
- Page loads but terminal never connects:
  Check browser devtools for `/ws` websocket failures and confirm Cloudflare forwards websocket traffic.
- Cookies not sticking:
  Confirm the public hostname is HTTPS and `APP_COOKIE_SECURE` is not forced to `never`.
- Wrong project directory:
  Confirm `CODEX_CWD`.

See also: [Troubleshooting](troubleshooting.md)
