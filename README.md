# chat2ide

`chat2ide` has been redefined as a single-user Remote Codex CLI Terminal Hub.

Primary flow:

1. Deploy one app instance on one server
2. Expose it through Cloudflare Tunnel
3. Open it from phone or browser
4. Enter a server-side PIN
5. Create multiple long-lived Codex CLI terminal tabs
6. Watch raw PTY output in a terminal-first UI
7. Reconnect later and attach to existing in-memory sessions

## Product Rules

- CLI direct mode is the only primary path.
- Terminal output is streamed as PTY data, not re-rendered as chat cards.
- `node-pty` plus `xterm.js` is the core runtime and UI pair.
- Cloudflare Tunnel is the default public exposure model.
- PIN plus `HttpOnly` cookie is the only auth path.
- No database. Runtime state lives in memory with per-terminal ring buffers.

## Core Features

- Server-side PIN validation with basic brute-force throttling
- Multiple independent Codex CLI processes managed like terminal tabs
- Terminal-first UI with `xterm.js`
- Mobile-first bottom composer for phone keyboards
- PTY input, resize, stop, restart, and close controls
- Reconnect and replay from in-memory ring buffers
- Cloudflare-compatible HTTP and WebSocket transport on the same origin

## Active Paths

- [`src/server`](src/server): Node/Express/WS server, auth, PTY runtime
- [`src/shared`](src/shared): shared protocol definitions
- [`web`](web): React + Tailwind + xterm frontend
- [`scripts`](scripts): install, dev, and validation scripts for the terminal hub
- [`docs`](docs): architecture, protocol, security, deployment, troubleshooting, test plans

## Repository Scope

The repository now contains only the active terminal-hub code path.

Old duplicate runtime trees such as `frontend/`, `server/`, `helper/`, and `vscode-extension/` have been removed.

## Requirements

- Linux server with a working `codex` CLI in `PATH`, or an explicit `CODEX_COMMAND`
- Node.js 16.20+ or newer
- A domain exposed through Cloudflare Tunnel

## Local Dependency Isolation

- Node dependencies are installed only into this repository's `node_modules/`.
- The active product path does not require `npm install -g`, Python packages, or shell profile edits.
- All Node entrypoints run through local project scripts or local binaries.
- Python is not required by this repository anymore.

## Quick Start

Install dependencies:

```bash
./scripts/bootstrap.sh
```

This installs Node dependencies into the current project directory only.

Create an environment file:

```bash
cp env.example .env
```

Minimum required settings:

```dotenv
APP_PIN=123456
APP_PUBLIC_ORIGIN=https://terminal.example.com
CODEX_CWD=/srv/your-project
```

Start local development:

```bash
./scripts/dev.sh all
```

Validate and build:

```bash
./scripts/test.sh
```

Start the built server:

```bash
APP_PIN=123456 APP_PUBLIC_ORIGIN=https://terminal.example.com node dist/server/index.js
```

## Cloudflare Deployment

Recommended topology:

```text
browser / phone
    |
Cloudflare edge
    |
cloudflared on the server
    |
127.0.0.1:3000 chat2ide
```

Example `cloudflared` config:

```yaml
tunnel: chat2ide
credentials-file: /etc/cloudflared/chat2ide.json

ingress:
  - hostname: terminal.example.com
    service: http://127.0.0.1:3000
  - service: http_status:404
```

The app serves both HTTP and WebSocket traffic on the same origin. No special WebSocket rewrite is required. The frontend connects to `/ws`.

Detailed steps: [Deploy with Cloudflare Tunnel](docs/deploy-cloudflare.md)

## PIN Hashing

For production, prefer `APP_PIN_HASH` over `APP_PIN`.

Generate a hash with Node:

```bash
node -e 'const c=require("crypto");const pin=process.argv[1];const salt=c.randomBytes(16);const hash=c.scryptSync(pin,salt,32);console.log(`scrypt$${salt.toString("hex")}$${hash.toString("hex")}`)' 123456
```

Then set:

```dotenv
APP_PIN_HASH=scrypt$<salt-hex>$<hash-hex>
```

## Operational Notes

- Active terminals and login sessions are stored in memory only.
- Restarting the service drops active sessions and PTY processes.
- Reconnect replays recent output from each terminal ring buffer.
- PTY mode does not preserve a clean `stdout` vs `stderr` split; lifecycle errors and exits are surfaced as separate terminal events.

## Documentation

- [Architecture](docs/architecture.md)
- [Protocol](docs/protocol.md)
- [Security](docs/security.md)
- [Cloudflare Deployment](docs/deploy-cloudflare.md)
- [Development Guide](docs/dev-guide.md)
- [Manual Test Plan](docs/manual-test-plan.md)
- [Troubleshooting](docs/troubleshooting.md)
