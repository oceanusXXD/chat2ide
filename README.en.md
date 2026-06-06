# chat2ide

`chat2ide` is a self-hosted remote terminal for one user's Codex CLI sessions. It starts real PTY processes on your server and exposes terminal output, input, reconnect, and recent-output replay through a browser UI.

It is built for a narrow use case: you already have Codex CLI working on a trusted Linux dev box, VPS, or home server, and you want to check or steer those jobs from a laptop, tablet, or phone.

## Preview

<p align="center">
  <img src="docs/assets/chat2ide-mobile-workbench.png" alt="chat2ide mobile terminal workbench" width="360">
</p>

The mobile view is not a shrunken desktop terminal. It keeps the workspace status, terminal tabs, real xterm output, and a bottom command composer in one screen for long-running AI coding jobs.

## What This Repository Does

- Provides a PIN-protected private web console.
- Creates multiple independent Codex CLI terminal tabs.
- Uses `xterm.js` to render real terminal output, including ANSI sequences and cursor control.
- Lets mobile users send commands from a bottom input bar instead of typing directly into xterm.
- Shows terminal totals, running/starting/stopped/error counts, unread background output, and the active terminal size.
- Keeps the last 30 sent commands in browser memory for the current session, with arrow-key recall for single-line input. The history is not written to local storage.
- Reconnects after refresh or short network drops and replays recent terminal output.
- Moves to the adjacent terminal after closing the active tab, which keeps multi-task switching predictable.
- Works behind Cloudflare Tunnel so the app can stay bound to `127.0.0.1`.
- Limits terminal count, single input size, and WebSocket message size.
- Uses no database. Sessions, PTY processes, and replay buffers live in server memory.

## Stack and AI Coding CLI Integration

| Layer | Technology | Role |
| --- | --- | --- |
| Browser workbench | React, Vite, Tailwind CSS, xterm.js | Renders the mobile/desktop console, terminal tabs, and real ANSI terminal output |
| Server | Express, `ws`, TypeScript | Serves auth, terminal APIs, and the `/ws` WebSocket channel |
| Terminal runtime | `node-pty` | Starts real server-side PTYs so interactive CLIs behave like they are in a normal terminal |
| Remote access | Cloudflare Tunnel | Forwards a public HTTPS hostname to the local `127.0.0.1:3000` service |
| State | Process memory and ring buffers | Keeps login sessions, PTY process handles, and recent-output replay |

The default command is `codex`. To use Claude Code, Gemini CLI, Aider, or a custom AI coding wrapper, point `CODEX_COMMAND` at that command and configure `CODEX_ARGS` as needed. `chat2ide` does not call those tools through private APIs; it moves terminal bytes between the browser, WebSocket, PTY, and CLI process.

## What It Is Not

- A multi-user IDE.
- An enterprise audit terminal.
- A command sandbox.
- A file permission or project ACL system.
- A persistent terminal history system.
- A console that automatically redacts terminal output.

After login, the user can run commands as the OS account that runs `chat2ide`. Run it with a low-privilege account and point `CODEX_CWD` at a specific project directory.

## Communication Architecture

```mermaid
%%{init: {"theme": "base", "themeVariables": {"fontFamily": "Inter, ui-sans-serif, system-ui", "primaryColor": "#0f172a", "lineColor": "#64748b"}}}%%
flowchart TB
  subgraph Surface["Access surface"]
    Mobile["Mobile browser<br/>status, tabs, composer"]
    Desktop["Desktop browser<br/>full terminal workbench"]
  end

  subgraph Ingress["Ingress"]
    Tunnel["Cloudflare Tunnel<br/>HTTPS + WebSocket upgrade"]
  end

  subgraph App["chat2ide app process"]
    UI["React workbench<br/>Vite static UI"]
    Auth["PIN session guard<br/>HttpOnly cookie"]
    API["REST API<br/>create, list, stop, restart"]
    WSGW["WebSocket gateway<br/>attach, input, resize, replay"]
  end

  subgraph Runtime["Terminal runtime"]
    Manager["TerminalSessionManager<br/>lifecycle + limits"]
    Buffer["Ring buffer<br/>recent-output replay"]
    PTY["node-pty<br/>real server-side PTY"]
  end

  subgraph Coding["AI coding environment"]
    CLI["AI coding CLI<br/>Codex / Claude Code / Gemini / Aider / custom"]
    Repo["Project workspace<br/>CODEX_CWD"]
  end

  Mobile -->|HTTPS| Tunnel
  Desktop -->|HTTPS| Tunnel
  Tunnel -->|local HTTP| UI
  UI --> Auth
  UI --> API
  UI <-->|terminal stream| WSGW
  API --> Manager
  WSGW --> Manager
  Manager --> Buffer
  Manager --> PTY
  PTY <-->|stdin / stdout / resize| CLI
  CLI <-->|files, tests, git| Repo

  classDef surface fill:#ecfeff,stroke:#0891b2,color:#164e63
  classDef ingress fill:#eff6ff,stroke:#2563eb,color:#1e3a8a
  classDef app fill:#f8fafc,stroke:#475569,color:#0f172a
  classDef runtime fill:#fff7ed,stroke:#f97316,color:#7c2d12
  classDef coding fill:#f0fdf4,stroke:#16a34a,color:#14532d
  class Mobile,Desktop surface
  class Tunnel ingress
  class UI,Auth,API,WSGW app
  class Manager,Buffer,PTY runtime
  class CLI,Repo coding
```

## Runtime Flow

```mermaid
sequenceDiagram
  autonumber
  participant User as Phone / Browser
  participant UI as React workbench
  participant API as Express REST
  participant WS as WebSocket gateway
  participant TM as TerminalSessionManager
  participant PTY as node-pty PTY
  participant CLI as AI coding CLI

  rect rgb(239, 246, 255)
    Note over User,API: Authenticate and create a terminal
    User->>API: POST /api/auth/login
    API-->>User: HttpOnly session cookie
    User->>API: POST /api/terminals
    API->>TM: allocate starting session
    API-->>UI: terminal summary
  end

  rect rgb(240, 253, 244)
    Note over UI,CLI: Attach starts the real PTY
    UI->>WS: attach terminalId
    WS->>TM: attach subscriber
    TM->>PTY: spawn CODEX_COMMAND in CODEX_CWD
    PTY->>CLI: interactive terminal process
  end

  rect rgb(255, 247, 237)
    Note over User,CLI: Browser input becomes PTY bytes
    CLI-->>WS: output chunks
    WS-->>UI: render in xterm.js
    User->>UI: send command / prompt
    UI->>WS: input, resize, Ctrl+C
    WS->>PTY: write bytes to PTY
  end
```

When a terminal is created, the server stores a `starting` session first. The PTY starts only after the browser attaches over WebSocket, so startup prompts go into the real xterm view.

## Requirements

- Node.js 20.19+ and npm.
- A Linux machine that can keep the service running.
- Codex CLI installed and authenticated on that machine, or `CODEX_COMMAND` pointing at another command.
- A project directory for `CODEX_CWD`.
- For public access, Cloudflare Tunnel and your own domain are recommended.

Windows is fine for local development and smoke tests. Linux is still the recommended production target because `node-pty` and interactive CLIs behave more predictably there.

## Local Development

```bash
npm install
cp env.example .env
npm run dev
```

Windows PowerShell:

```powershell
npm install
Copy-Item env.example .env
npm run dev
```

Development mode starts:

- API/WebSocket: `http://127.0.0.1:3000`
- Vite frontend: `http://127.0.0.1:5173`

## Production Build

```bash
npm install
npm run test
npm run build
npm run start
```

Linux helper scripts:

```bash
./scripts/bootstrap.sh
./scripts/test.sh
./scripts/dev.sh start
```

## Minimal Configuration

Copy `env.example` to `.env` and check at least these values:

```dotenv
APP_HOST=127.0.0.1
APP_PORT=3000
APP_PUBLIC_ORIGIN=https://terminal.example.com
APP_TRUST_PROXY=1
APP_PIN_HASH=scrypt$<salt-hex>$<hash-hex>
CODEX_COMMAND=codex
CODEX_CWD=/srv/your-project
TERMINAL_MAX_SESSIONS=8
TERMINAL_MAX_INPUT_BYTES=65536
APP_WS_MAX_MESSAGE_BYTES=131072
```

For local development, a plain PIN is acceptable:

```dotenv
APP_PIN=123456
```

Use `APP_PIN_HASH` in production:

```bash
node -e 'const c=require("crypto");const pin=process.argv[1];const salt=c.randomBytes(16);const hash=c.scryptSync(pin,salt,32);console.log(`scrypt$${salt.toString("hex")}$${hash.toString("hex")}`)' 123456
```

Before deployment, run:

```bash
npm run preflight
```

It checks Node, `node-pty`, PIN configuration, `CODEX_CWD`, `CODEX_ARGS`, `CODEX_COMMAND`, PTY runtime, `APP_PUBLIC_ORIGIN`, PIN hash format, and resource limits. The default PIN and a missing public origin are reported as warnings.

## Cloudflare Tunnel

The recommended topology is `cloudflared` on the server forwarding a public HTTPS hostname to `http://127.0.0.1:3000`.

```yaml
tunnel: chat2ide
credentials-file: /etc/cloudflared/chat2ide.json

ingress:
  - hostname: terminal.example.com
    service: http://127.0.0.1:3000
  - service: http_status:404
```

HTTP API and WebSocket use the same origin. The WebSocket path is `/ws`. See [Cloudflare deployment](docs/deploy-cloudflare.md) for the full flow.

## Daily Use

1. Open the deployed URL.
2. Enter the configured PIN.
3. Click "New terminal".
4. Send commands or prompts from the bottom input bar.
5. Switch tasks with terminal tabs.
6. Use `Ctrl+C` to interrupt, "Stop" to end the process, "Restart" to clear the view and start a new PTY, and "Close" to remove the tab.
7. After refresh or a short disconnect, the page reattaches to the current terminal and replays recent output.

On phones, use the bottom input bar first. Terminal tabs scroll horizontally; the top overview shows whether background terminals have unread output, errors, or sessions still starting.

## Mobile Check

Use a narrow viewport such as 390 x 844:

```bash
npm run build
APP_PIN=123456 CODEX_COMMAND=/bin/bash CODEX_ARGS='["-i"]' CODEX_CWD=$PWD npm run start
```

Windows PowerShell:

```powershell
npm run build
$env:APP_PIN="123456"; $env:CODEX_COMMAND="powershell.exe"; $env:CODEX_ARGS='["-NoLogo"]'; $env:CODEX_CWD=$PWD; npm run start
```

Open `http://127.0.0.1:3000`, check that the page has no horizontal scrolling, that the overview does not crowd out the terminal, that the terminal and bottom input are visible, and send one command to confirm output appears. Send a second command and use the arrow keys in single-line input to confirm the in-memory command history recalls it.

## Operational Boundaries

- `/api/health` is available for basic health checks.
- Restarting the service clears login sessions, PTY processes, and ring buffers.
- The ring buffer stores recent output only. It is not a full log.
- `TERMINAL_MAX_SESSIONS`, `TERMINAL_MAX_INPUT_BYTES`, and `APP_WS_MAX_MESSAGE_BYTES` are misuse guardrails, not a sandbox.

## Documentation

- [Product and scope](docs/product.md)
- [Configuration](docs/configuration.md)
- [User guide](docs/user-guide.md)
- [Architecture](docs/architecture.md)
- [Protocol](docs/protocol.md)
- [Security boundary](docs/security.md)
- [Cloudflare deployment](docs/deploy-cloudflare.md)
- [Development guide](docs/dev-guide.md)
- [Operations](docs/operations.md)
- [Manual test plan](docs/manual-test-plan.md)
- [Troubleshooting](docs/troubleshooting.md)
- [Contributing](CONTRIBUTING.md)
- [Security policy](SECURITY.md)
