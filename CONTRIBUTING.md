# Contributing to chat2ide

`chat2ide` is a focused self-hosted remote terminal for single-user Codex CLI sessions. Contributions should preserve that product boundary: real PTY behavior, mobile usability, simple deployment, and explicit security tradeoffs.

## Development Setup

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

## Before Opening a PR

Run:

```bash
npm run test
npm run build
npm run preflight
```

Use a realistic local configuration for `preflight`, for example:

```bash
APP_PIN=123456 CODEX_COMMAND=/bin/bash CODEX_ARGS='["-i"]' CODEX_CWD=$PWD npm run preflight
```

## Change Guidelines

- Keep the project single-user and self-hosted unless the maintainers explicitly accept a broader scope.
- Preserve raw PTY semantics. Do not transform terminal output into chat messages or structured logs.
- Treat mobile UX as a first-class workflow. Check narrow viewports when changing layout.
- Keep deployment simple. Avoid adding databases, job queues, or external services unless they solve a documented product requirement.
- Update docs when changing configuration, security assumptions, protocol behavior, or user-facing workflows.
- Add or update tests for auth, config parsing, terminal lifecycle, resource limits, and protocol behavior.

## Security-Sensitive Changes

Changes involving auth, cookies, WebSocket origin checks, PTY lifecycle, resource limits, or environment parsing should include:

- The threat or failure mode being addressed.
- The exact configuration impact.
- A test or repeatable validation path.

