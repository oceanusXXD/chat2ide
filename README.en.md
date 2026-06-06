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

The default command is `codex`. To use another AI coding tool, point `CODEX_COMMAND` at a real terminal command and configure `CODEX_ARGS` as needed. `chat2ide` does not call vendor private APIs; it moves terminal bytes between the browser, WebSocket, PTY, and CLI process.

## AI Coding Platform Support

`chat2ide` directly supports terminal-native AI coding agents: the tool must run inside a server shell, accept stdin in a PTY, and write terminal output to stdout/stderr. GUI editors can share the same host and project directory, but `chat2ide` does not remote-control editor windows, proprietary sidebars, browser workspaces, or vendor cloud sessions.

Before calling an integration ready on a new host, verify four things: the command exists, vendor auth works under the same OS account, the CLI starts from `CODEX_CWD` in a normal terminal, and `chat2ide` can create a terminal with that `CODEX_COMMAND`.

| Platform | Direct target? | `CODEX_COMMAND` / args | Recommended setup | Reference docs |
| --- | --- | --- | --- | --- |
| OpenAI Codex CLI | Yes | `CODEX_COMMAND=codex` | Run `codex login`, then launch from the project directory. | [Codex CLI reference](https://developers.openai.com/codex/cli/reference) |
| Anthropic Claude Code | Yes | `CODEX_COMMAND=claude` | Run `claude auth login` or the account login flow on the server. | [Claude Code CLI reference](https://code.claude.com/docs/en/cli-reference) |
| Google Gemini CLI | Yes | `CODEX_COMMAND=gemini` | Install `@google/gemini-cli`, run `gemini`, and complete Google authentication. | [Gemini CLI installation](https://geminicli.com/docs/get-started/installation/) |
| Cursor Agent CLI | Yes | `CODEX_COMMAND=cursor-agent` | Install Cursor CLI and authenticate it. This controls the terminal agent, not the Cursor editor GUI. | [Cursor CLI docs](https://cursor.com/docs/cli/overview) |
| Qoder CLI | Yes | `CODEX_COMMAND=qodercli` | Install `@qoder-ai/qodercli`, run `qodercli`, then use `/login` or `QODER_PERSONAL_ACCESS_TOKEN`. If you refer to qCoder in this project, it means Qoder. | [Qoder CLI quick start](https://docs.qoder.com/en/cli/quick-start) |
| Trae Agent CLI | Yes | `CODEX_COMMAND=trae-cli`, `CODEX_ARGS=["interactive"]` | Use the open-source `trae-agent` CLI. For one-off tasks, run `trae-cli run "<task>"` inside a shell or wrapper. | [trae-agent README](https://github.com/bytedance/trae-agent/blob/main/README.md) |
| Qwen Code | Yes | `CODEX_COMMAND=qwen` | Install `@qwen-code/qwen-code`, run `qwen`, then configure `/auth`. | [Qwen Code](https://github.com/QwenLM/qwen-code) |
| Kiro CLI | Yes | `CODEX_COMMAND=kiro-cli`, `CODEX_ARGS=["chat"]` | Install Kiro CLI, complete browser authentication, then start chat from the project directory. | [Kiro CLI installation](https://kiro.dev/docs/cli/installation/) |
| GitHub Copilot CLI | Yes, if the standalone CLI is installed | `CODEX_COMMAND=copilot` | Install Copilot CLI, ensure organization policy allows it, and sign in. Use a wrapper if you only have `gh copilot`. | [GitHub Copilot CLI](https://docs.github.com/en/copilot/how-tos/copilot-cli/cli-getting-started) |
| Aider | Yes | `CODEX_COMMAND=aider` | Install `aider-chat`, configure model credentials, and start it in the repo. | [Aider installation](https://aider.chat/docs/install.html) |
| Goose CLI | Yes | `CODEX_COMMAND=goose`, `CODEX_ARGS=["session"]` | Install the CLI, configure an LLM provider, then run `goose session`. | [Goose installation](https://goose-docs.ai/docs/getting-started/installation/) |
| Windsurf / Devin Desktop | Indirect | `CODEX_COMMAND=bash` or `powershell` | Use Cascade and the enhanced terminal inside the IDE; use `chat2ide` beside it for mobile shell, tests, git, and other CLI agents. | [Terminal and Cascade docs](https://docs.devin.ai/desktop/terminal) |
| Trae IDE | Indirect unless using `trae-agent` | Use `trae-cli` for direct PTY control | `chat2ide` is not remote desktop and does not control IDE plugin state. | [trae-agent README](https://github.com/bytedance/trae-agent/blob/main/README.md) |

Common configurations:

```dotenv
# Codex CLI
CODEX_COMMAND=codex
CODEX_ARGS=[]
CODEX_CWD=/srv/your-project
```

```dotenv
# Cursor Agent CLI
CODEX_COMMAND=cursor-agent
CODEX_ARGS=[]
CODEX_CWD=/srv/your-project
```

```dotenv
# Claude Code
CODEX_COMMAND=claude
CODEX_ARGS=[]
CODEX_CWD=/srv/your-project
```

```dotenv
# Gemini CLI
CODEX_COMMAND=gemini
CODEX_ARGS=[]
CODEX_CWD=/srv/your-project
```

```dotenv
# Qoder CLI
CODEX_COMMAND=qodercli
CODEX_ARGS=[]
CODEX_CWD=/srv/your-project
```

```dotenv
# Trae Agent wrapper. scripts/run-trae-agent.sh can call trae-cli run or start a shell.
CODEX_COMMAND=/srv/chat2ide/scripts/run-trae-agent.sh
CODEX_ARGS=[]
CODEX_CWD=/srv/your-project
```

```dotenv
# Qwen Code
CODEX_COMMAND=qwen
CODEX_ARGS=[]
CODEX_CWD=/srv/your-project
```

```dotenv
# Kiro CLI chat
CODEX_COMMAND=kiro-cli
CODEX_ARGS=["chat"]
CODEX_CWD=/srv/your-project
```

```dotenv
# GitHub Copilot CLI
CODEX_COMMAND=copilot
CODEX_ARGS=[]
CODEX_CWD=/srv/your-project
```

```dotenv
# Aider
CODEX_COMMAND=aider
CODEX_ARGS=[]
CODEX_CWD=/srv/your-project
```

```dotenv
# Goose CLI
CODEX_COMMAND=goose
CODEX_ARGS=["session"]
CODEX_CWD=/srv/your-project
```

If a platform only exposes a desktop GUI, browser workspace, or IDE plugin and has no public terminal CLI, do not set it directly as `CODEX_COMMAND`. Use `bash`/`powershell` as the command instead, then run tests, git, deployment scripts, or another real CLI agent from the mobile terminal.

## What It Is Not

- A multi-user IDE.
- An enterprise audit terminal.
- A command sandbox.
- A file permission or project ACL system.
- A persistent terminal history system.
- A console that automatically redacts terminal output.

After login, the user can run commands as the OS account that runs `chat2ide`. Run it with a low-privilege account and point `CODEX_CWD` at a specific project directory.

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

On phones, use the bottom input bar first. Terminal tabs scroll horizontally; the compact status line shows connection state, the active terminal, unread output, and terminal size.

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

Open `http://127.0.0.1:3000`, check that the page has no horizontal scrolling, that the status line does not crowd out the terminal, that the terminal and bottom input are visible, and send one command to confirm output appears. Send a second command and use the arrow keys in single-line input to confirm the in-memory command history recalls it.

## Architecture

The full design notes live in [docs/architecture.md](docs/architecture.md). The compact flow below shows the runtime path that matters for mobile control.

<details>
<summary>Compact communication architecture</summary>

```mermaid
flowchart LR
  Browser["Phone / browser"] --> Tunnel["HTTPS + WebSocket<br/>Cloudflare Tunnel"]
  Tunnel --> App["chat2ide<br/>React UI + Express API"]
  App --> Auth["PIN session<br/>HttpOnly cookie"]
  App <-->|REST + /ws| Manager["Session manager<br/>limits + replay buffer"]
  Manager --> PTY["node-pty<br/>real PTY"]
  PTY <-->|stdin / stdout / resize| CLI["AI coding CLI<br/>codex / claude / gemini / cursor-agent / qodercli / custom"]
  CLI <-->|files / tests / git| Repo["Project workspace<br/>CODEX_CWD"]
```

```mermaid
sequenceDiagram
  participant U as Phone/browser
  participant A as chat2ide API+WS
  participant T as Session manager
  participant P as node-pty
  participant C as AI coding CLI
  U->>A: login + create terminal
  A->>T: allocate session
  U->>A: attach over WebSocket
  T->>P: spawn CODEX_COMMAND in CODEX_CWD
  P->>C: start interactive CLI
  U-->>C: input, resize, Ctrl+C through WS and PTY
  C-->>U: streamed output and replay buffer
```

</details>

When a terminal is created, the server stores a `starting` session first. The PTY starts only after the browser attaches over WebSocket, so startup prompts go into the real xterm view.

## Operational Boundaries

- `/api/health` is available for basic health checks.
- Restarting the service clears login sessions, PTY processes, and ring buffers.
- The ring buffer stores recent output only. It is not a full log.
- `TERMINAL_MAX_SESSIONS`, `TERMINAL_MAX_INPUT_BYTES`, and `APP_WS_MAX_MESSAGE_BYTES` are misuse guardrails, not a sandbox.

## Roadmap

These are planned improvements, not current guarantees:

- Provider presets for Codex, Qoder, Claude Code, Gemini CLI, Cursor Agent, and other common terminal agents.
- A Qoder smoke-test guide or script that checks install, login, startup, and terminal output.
- Wrapper templates such as `scripts/run-qoder.sh` and `scripts/run-claude.sh` for parameterized agent startup.
- Optional notifications for completed tasks, crashed terminals, and unread background output.
- Optional persistence for terminal metadata or task summaries while keeping the default runtime lightweight.
- More mobile polish around tab switching, command history, quick commands, and keyboard behavior.
- More security guardrails such as read-only mode, workspace allowlists, and clearer deployment checks.

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
