#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

BRIDGE_HOST="${PB_HOST:-0.0.0.0}"
BRIDGE_PORT="${PB_PORT:-8765}"
BRIDGE_WORKDIR="${PB_WORKDIR:-$PWD}"
BRIDGE_CODEX_CMD="${PB_CODEX_CMD:-codex}"
BRIDGE_PROMPT_MODE="${PB_PROMPT_MODE:-stdin}"
BRIDGE_TIMEOUT_MS="${PB_TIMEOUT_MS:-300000}"

is_truthy() {
  case "${1,,}" in
    1|true|yes|on)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

port_is_occupied() {
  local rc

  if BRIDGE_CHECK_HOST="$BRIDGE_HOST" BRIDGE_CHECK_PORT="$BRIDGE_PORT" node - <<'NODE'
const net = require('net');

const host = process.env.BRIDGE_CHECK_HOST;
const port = Number(process.env.BRIDGE_CHECK_PORT);
const server = net.createServer();

server.once('error', (error) => {
  if (error && error.code === 'EADDRINUSE') {
    process.exit(20);
  }
  console.error(`[prompt-bridge] failed to probe port: ${error?.message ?? String(error)}`);
  process.exit(21);
});

server.listen({ host, port }, () => {
  server.close(() => process.exit(0));
});
NODE
  then
    rc=0
  else
    rc=$?
  fi

  if [[ "$rc" -eq 0 ]]; then
    return 1
  fi

  if [[ "$rc" -eq 20 ]]; then
    return 0
  fi

  echo "[prompt-bridge] unable to probe ${BRIDGE_HOST}:${BRIDGE_PORT}"
  exit 1
}

find_same_bridge_pid() {
  ps -eo pid=,args= | awk -v target_port="$BRIDGE_PORT" '
    /out\/src\/cli\/codexCliServer\.js/ {
      for (i = 2; i <= NF; i++) {
        if ($i == "--port" && (i + 1) <= NF && $(i + 1) == target_port) {
          print $1;
          exit;
        }
      }
    }
  '
}

ensure_bridge_port_available() {
  if ! port_is_occupied; then
    return
  fi

  local existing_pid
  existing_pid="$(find_same_bridge_pid || true)"

  if [[ -z "$existing_pid" ]]; then
    echo "[ERROR] port ${BRIDGE_PORT} is occupied by another process. Set PB_PORT to a different value."
    exit 1
  fi

  echo "[prompt-bridge] found existing bridge task on port ${BRIDGE_PORT} (pid=${existing_pid}), stopping it ..."
  kill "$existing_pid" >/dev/null 2>&1 || true

  local i
  for i in {1..20}; do
    if ! kill -0 "$existing_pid" >/dev/null 2>&1; then
      break
    fi
    sleep 0.2
  done

  if kill -0 "$existing_pid" >/dev/null 2>&1; then
    kill -9 "$existing_pid" >/dev/null 2>&1 || true
  fi

  if port_is_occupied; then
    echo "[ERROR] port ${BRIDGE_PORT} is still occupied after stopping existing bridge task."
    exit 1
  fi
}

if [[ ! -f "./out/src/cli/codexCliServer.js" ]]; then
  echo "[prompt-bridge] build artifacts not found, running npm run build ..."
  npm run build
fi

ensure_bridge_port_available

# Quick defaults. You can override via env or pass explicit CLI args.
DEFAULT_ARGS=(
  --host "$BRIDGE_HOST"
  --port "$BRIDGE_PORT"
  --workdir "$BRIDGE_WORKDIR"
  --exec-command "$BRIDGE_CODEX_CMD"
  --prompt-mode "$BRIDGE_PROMPT_MODE"
  --timeout-ms "$BRIDGE_TIMEOUT_MS"
)

if [[ -n "${PB_PUBLIC_BASE_URL:-}" ]]; then
  DEFAULT_ARGS+=(--public-base-url "$PB_PUBLIC_BASE_URL")
fi

has_custom_exec_args="0"
for item in "$@"; do
  if [[ "$item" == "--exec-arg" ]]; then
    has_custom_exec_args="1"
    break
  fi
done

if [[ "$BRIDGE_PROMPT_MODE" == "arg" ]] && is_truthy "${PB_AUTO_EXEC_ARGS:-1}" && [[ "$has_custom_exec_args" == "0" ]]; then
  # arg 模式下默认补齐 codex exec 参数，避免 codex <prompt> 在无 TTY 时失败。
  DEFAULT_ARGS+=(
    --exec-arg exec
    --exec-arg --skip-git-repo-check
    --exec-arg __PROMPT__
  )
fi

echo "[prompt-bridge] starting standalone codex CLI bridge ..."
exec node ./out/src/cli/codexCliServer.js "${DEFAULT_ARGS[@]}" "$@"
