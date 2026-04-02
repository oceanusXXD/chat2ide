#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

CODEX_CMD="${PB_CODEX_CMD:-codex}"
CODEX_NEW_TERMINAL="${PB_CODEX_NEW_TERMINAL:-1}"
CODEX_TERMINAL_CMD="${PB_CODEX_TERMINAL_CMD:-}"
BRIDGE_HOST="${PB_HOST:-0.0.0.0}"
BRIDGE_PORT="${PB_PORT:-8765}"
BRIDGE_WORKDIR="${PB_WORKDIR:-$PWD}"
BRIDGE_TIMEOUT_MS="${PB_TIMEOUT_MS:-300000}"
BRIDGE_PROMPT_MODE="${PB_PROMPT_MODE:-arg}"

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

build_codex_shell_command() {
  local cmdline
  cmdline="$(printf '%q ' "$CODEX_CMD" "$@")"
  cmdline="${cmdline% }"

  printf 'cd %q && %s; kill -TERM %q >/dev/null 2>&1 || true' "$ROOT_DIR" "$cmdline" "$BRIDGE_PID"
}

launch_with_terminal() {
  local terminal_bin="$1"
  local command_string="$2"

  case "$terminal_bin" in
    gnome-terminal)
      "$terminal_bin" -- bash -lc "$command_string"
      ;;
    xfce4-terminal)
      "$terminal_bin" --command "bash -lc $(printf '%q' "$command_string")"
      ;;
    konsole)
      "$terminal_bin" -e bash -lc "$command_string"
      ;;
    *)
      "$terminal_bin" -e bash -lc "$command_string"
      ;;
  esac
}

launch_codex_in_new_terminal() {
  local command_string
  command_string="$(build_codex_shell_command "$@")"

  if [[ -n "${TMUX:-}" ]] && command -v tmux >/dev/null 2>&1; then
    local tmux_command
    tmux_command="bash -lc $(printf '%q' "$command_string")"

    if tmux new-window -c "$ROOT_DIR" "$tmux_command"; then
      echo "[prompt-bridge] launched codex in a new tmux window."
      return 0
    fi
  fi

  if [[ -n "$CODEX_TERMINAL_CMD" ]]; then
    if ! command -v "$CODEX_TERMINAL_CMD" >/dev/null 2>&1; then
      echo "[prompt-bridge] PB_CODEX_TERMINAL_CMD '$CODEX_TERMINAL_CMD' not found."
      return 1
    fi

    if launch_with_terminal "$CODEX_TERMINAL_CMD" "$command_string"; then
      echo "[prompt-bridge] launched codex in new terminal via ${CODEX_TERMINAL_CMD}."
      return 0
    fi

    return 1
  fi

  local terminal_bin
  for terminal_bin in x-terminal-emulator gnome-terminal konsole xfce4-terminal; do
    if ! command -v "$terminal_bin" >/dev/null 2>&1; then
      continue
    fi

    if launch_with_terminal "$terminal_bin" "$command_string"; then
      echo "[prompt-bridge] launched codex in new terminal via ${terminal_bin}."
      return 0
    fi
  done

  return 1
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

BRIDGE_ARGS=(
  --host "$BRIDGE_HOST"
  --port "$BRIDGE_PORT"
  --workdir "$BRIDGE_WORKDIR"
  --exec-command "$CODEX_CMD"
  --prompt-mode "$BRIDGE_PROMPT_MODE"
  --timeout-ms "$BRIDGE_TIMEOUT_MS"
)

if [[ -n "${PB_PUBLIC_BASE_URL:-}" ]]; then
  BRIDGE_ARGS+=(--public-base-url "$PB_PUBLIC_BASE_URL")
fi

if [[ "$BRIDGE_PROMPT_MODE" == "arg" ]]; then
  # 默认使用 arg 模式，规避部分环境下 codex 对非 TTY stdin 的限制。
  BRIDGE_ARGS+=(
    --exec-arg exec
    --exec-arg --skip-git-repo-check
    --exec-arg __PROMPT__
  )
fi

cleanup() {
  if [[ -n "${BRIDGE_PID:-}" ]] && kill -0 "$BRIDGE_PID" >/dev/null 2>&1; then
    kill "$BRIDGE_PID" >/dev/null 2>&1 || true
    wait "$BRIDGE_PID" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

echo "[prompt-bridge] starting bridge in background ..."
node ./out/src/cli/codexCliServer.js "${BRIDGE_ARGS[@]}" &
BRIDGE_PID=$!

# 给服务一点启动时间，避免立刻刷屏混在一起。
sleep 1

if ! kill -0 "$BRIDGE_PID" >/dev/null 2>&1; then
  wait "$BRIDGE_PID" || true
  echo "[ERROR] Codex CLI Server failed to start."
  exit 1
fi

if is_truthy "$CODEX_NEW_TERMINAL"; then
  echo "[prompt-bridge] trying to launch codex in a separate terminal ..."

  if launch_codex_in_new_terminal "$@"; then
    echo "[prompt-bridge] keep this terminal open for URL/QR and bridge logs."
    wait "$BRIDGE_PID" || true
    exit 0
  fi

  echo "[prompt-bridge] no supported terminal launcher found, fallback to current terminal."
fi

echo "[prompt-bridge] launching codex in foreground ..."
"$CODEX_CMD" "$@"
