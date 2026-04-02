#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

BRIDGE_HOST="${PB_HOST:-0.0.0.0}"
BRIDGE_PORT="${PB_PORT:-8765}"
BRIDGE_WORKDIR_DEFAULT="${PB_WORKDIR:-$ROOT_DIR}"
BRIDGE_CODEX_CMD="${PB_CODEX_CMD:-codex}"
BRIDGE_PROMPT_MODE="${PB_PROMPT_MODE:-arg}"
BRIDGE_TIMEOUT_MS="${PB_TIMEOUT_MS:-300000}"

usage() {
  cat <<'EOF'
用法:
  ./start.sh help
  ./start.sh tunnel [port]
  ./start.sh bridge <public-base-url> [workdir]
  ./start.sh local [workdir]

推荐的双终端流程:
  终端 A:
    ./start.sh tunnel

  终端 B:
    ./start.sh bridge https://xxxx.trycloudflare.com /absolute/path/to/your/project

说明:
  1. tunnel 会把本地 http://127.0.0.1:8765 暴露成公网 URL。
  2. bridge 会启动 Codex CLI Bridge，并把你传入的公网 URL 作为 --public-base-url。
  3. local 不走公网，只在本机/局域网启动 bridge。

环境变量:
  PB_HOST              默认 0.0.0.0
  PB_PORT              默认 8765
  PB_WORKDIR           默认当前仓库目录
  PB_CODEX_CMD         默认 codex
  PB_PROMPT_MODE       默认 arg
  PB_TIMEOUT_MS        默认 300000

依赖:
  tunnel 子命令需要系统已安装 cloudflared。
EOF
}

ensure_file() {
  local path="$1"
  local hint="$2"

  if [[ -e "$path" ]]; then
    return 0
  fi

  echo "[ERROR] missing ${path}. ${hint}" >&2
  exit 1
}

ensure_command() {
  local cmd="$1"
  local hint="$2"

  if command -v "$cmd" >/dev/null 2>&1; then
    return 0
  fi

  echo "[ERROR] command not found: ${cmd}. ${hint}" >&2
  exit 1
}

ensure_build() {
  ensure_command node "请先安装 Node.js，并保证 node 在 PATH 中。"
  ensure_file "./node_modules/typescript/bin/tsc" "请先在此目录执行依赖安装。"

  if [[ -f "./out/src/cli/codexCliServer.js" ]]; then
    return 0
  fi

  echo "[start.sh] build artifacts not found, compiling TypeScript ..."
  node ./node_modules/typescript/bin/tsc -p ./tsconfig.json
}

run_bridge() {
  local public_base_url="${1:-}"
  local workdir="${2:-$BRIDGE_WORKDIR_DEFAULT}"

  ensure_build
  ensure_command "$BRIDGE_CODEX_CMD" "请确认 Codex CLI 已安装，或通过 PB_CODEX_CMD 指向可执行文件。"

  if [[ -n "$public_base_url" ]]; then
    case "$public_base_url" in
      http://*|https://*)
        ;;
      *)
        echo "[ERROR] public-base-url 必须以 http:// 或 https:// 开头。" >&2
        exit 1
        ;;
    esac
  fi

  if [[ ! -d "$workdir" ]]; then
    echo "[ERROR] workdir does not exist: ${workdir}" >&2
    exit 1
  fi

  export PB_HOST="$BRIDGE_HOST"
  export PB_PORT="$BRIDGE_PORT"
  export PB_WORKDIR="$workdir"
  export PB_CODEX_CMD="$BRIDGE_CODEX_CMD"
  export PB_PROMPT_MODE="$BRIDGE_PROMPT_MODE"
  export PB_TIMEOUT_MS="$BRIDGE_TIMEOUT_MS"
  export PB_AUTO_EXEC_ARGS="${PB_AUTO_EXEC_ARGS:-1}"

  if [[ -n "$public_base_url" ]]; then
    export PB_PUBLIC_BASE_URL="${public_base_url%/}"
    echo "[start.sh] starting bridge with public URL: $PB_PUBLIC_BASE_URL"
  else
    unset PB_PUBLIC_BASE_URL || true
    echo "[start.sh] starting bridge without public URL"
  fi

  echo "[start.sh] host=${PB_HOST} port=${PB_PORT} workdir=${PB_WORKDIR} promptMode=${PB_PROMPT_MODE}"
  exec bash ./scripts/run-codex-cli-bridge.sh
}

run_tunnel() {
  local port="$BRIDGE_PORT"

  if [[ $# -ge 1 ]]; then
    if [[ "$1" =~ ^[0-9]+$ ]]; then
      port="$1"
      shift || true
    else
      echo "[ERROR] tunnel 端口必须是数字。" >&2
      exit 1
    fi
  fi

  if [[ $# -gt 0 ]]; then
    echo "[ERROR] tunnel 参数过多。" >&2
    exit 1
  fi

  local target_url="http://127.0.0.1:${port}"

  echo "[start.sh] exposing ${target_url}"
  ensure_command cloudflared "请先安装 cloudflared。"
  cat <<EOF
[start.sh] using cloudflared quick tunnel
[start.sh] 复制 cloudflared 输出中的 https://xxxxx.trycloudflare.com
[start.sh] 然后在另一个终端执行:
  ./start.sh bridge <上面的公网URL> ${BRIDGE_WORKDIR_DEFAULT}
EOF
  exec cloudflared tunnel --url "$target_url"
}

main() {
  local command="${1:-help}"

  case "$command" in
    help|-h|--help)
      usage
      ;;
    tunnel)
      shift || true
      if [[ $# -gt 0 ]]; then
        run_tunnel "$1"
      else
        run_tunnel
      fi
      ;;
    bridge)
      shift || true
      if [[ $# -lt 1 ]]; then
        echo "[ERROR] bridge 需要传入公网 URL。" >&2
        echo "示例: ./start.sh bridge https://xxxx.trycloudflare.com /absolute/path/to/your/project" >&2
        exit 1
      fi
      run_bridge "$1" "${2:-$BRIDGE_WORKDIR_DEFAULT}"
      ;;
    local)
      shift || true
      run_bridge "" "${1:-$BRIDGE_WORKDIR_DEFAULT}"
      ;;
    *)
      echo "[ERROR] unknown command: ${command}" >&2
      usage >&2
      exit 1
      ;;
  esac
}

main "$@"
