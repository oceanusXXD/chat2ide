# Security Policy

`chat2ide` exposes a real server-side PTY after login. A user with access to the web UI can execute commands as the operating-system account running the service.

## Supported Scope

Security fixes are accepted for the current `main` branch.

## Reporting a Vulnerability

Please do not open a public issue for a vulnerability that gives unauthorized terminal access, bypasses PIN/session checks, weakens WebSocket origin validation, or leaves PTY child processes running unexpectedly.

Report privately through GitHub Security Advisories for this repository. Include:

- Affected commit or release.
- Deployment assumptions, especially `APP_PUBLIC_ORIGIN`, proxy/tunnel setup, and cookie settings.
- Reproduction steps.
- Expected and observed behavior.
- Impact assessment.

## Security Boundaries

- This is not a multi-user authorization system.
- This is not a command sandbox.
- This is not an audit or compliance terminal.
- The recommended production topology is Cloudflare Tunnel to `127.0.0.1`.
- Use `APP_PIN_HASH`, set `APP_PUBLIC_ORIGIN`, keep `APP_TRUST_PROXY=1` behind a trusted proxy, and run under a least-privilege OS account.

See [docs/security.md](docs/security.md) for the full security model.

