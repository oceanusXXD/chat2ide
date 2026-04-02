# Troubleshooting

## App Loads but Login Fails

Checks:

- verify `APP_PIN` or `APP_PIN_HASH` is set on the server
- if using `APP_PIN_HASH`, confirm the format is `scrypt$<salt>$<hash>`
- after repeated failures, wait for the lockout window or reduce the throttle settings

Relevant env:

- `APP_LOGIN_MAX_ATTEMPTS`
- `APP_LOGIN_LOCKOUT_SECONDS`

## Login Works but `/ws` Fails

Checks:

- confirm the frontend is loading from the same hostname the websocket uses
- confirm Cloudflare Tunnel points to `http://127.0.0.1:3000`
- confirm `APP_PUBLIC_ORIGIN` matches the public hostname
- confirm `APP_TRUST_PROXY=1`

## Cookie Is Not Set or Not Sent

Checks:

- ensure the public site is HTTPS
- keep `APP_COOKIE_SECURE=auto` or `always` in production
- avoid opening the app from a mismatched local host after setting a strict public origin

## Terminal Creates but No Output Appears

Checks:

- verify `CODEX_COMMAND` exists on the server
- verify `CODEX_CWD` points to a readable directory
- try a simple smoke command, for example:

```bash
CODEX_COMMAND=/bin/bash
CODEX_ARGS='["-i"]'
```

If that works, the PTY stack is fine and the issue is with the configured CLI command.

## Stop Seems Slow

The runner sends `SIGTERM` first and escalates to `SIGKILL` after a short timeout. Interactive shells may take a moment before the forced kill path finishes.

## Reconnect Does Not Restore Old Sessions

This app stores sessions and PTYs in memory only.

Expected behavior:

- browser refresh: sessions survive if the server process is still running
- server restart: sessions and terminals are gone

## `npm` Is Broken in This Environment

During this refactor, the local wrapper at `/home/coder/.local/bin/npm` pointed to a missing Node 20 path. Validation was done with direct Node invocations:

```bash
node ./node_modules/typescript/bin/tsc --noEmit -p tsconfig.server.json
node ./node_modules/typescript/bin/tsc --noEmit -p web/tsconfig.json
node ./node_modules/vite/bin/vite.js build
```

If your server has a normal Node/npm install, the standard `npm run ...` scripts should work.

## Python Is No Longer Required

The current repository no longer contains the old helper subproject. The active terminal hub does not require Python packages.
