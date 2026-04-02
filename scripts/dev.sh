#!/usr/bin/env bash
set -euo pipefail

source "$(cd "$(dirname "$0")" && pwd)/common.sh"

MODE="${1:-help}"

case "${MODE}" in
  bootstrap|setup)
    bootstrap_all
    ;;
  helper)
    ensure_python_env
    if [[ ! -x "${VENV_DIR}/bin/prompt-bridge-helper" ]]; then
      install_helper_deps
    fi
    exec "${VENV_DIR}/bin/prompt-bridge-helper" serve --host 127.0.0.1 --port 8766
    ;;
  extension)
    ensure_extension_deps
    (
      cd "${EXTENSION_DIR}"
      npm_cmd run build
    )
    cat <<'EOF'
扩展代码已编译。
下一步：
1. 用 VS Code 打开 /home/coder/data/chat2ide/vscode-extension
2. 按 F5 启动 Extension Development Host
3. 在调试窗口执行：
   - PromptBridge: Configure Helper Path
   - PromptBridge: Start Server
   - PromptBridge: Show Access Info
EOF
    ;;
  relay-server)
    ensure_extension_deps
    (
      cd "${EXTENSION_DIR}"
      npm_cmd run build
    )
    HOST="${PROMPT_BRIDGE_RELAY_HOST:-0.0.0.0}"
    PORT="${PROMPT_BRIDGE_RELAY_PORT:-8765}"
    PUBLIC_BASE_URL="${2:-${PROMPT_BRIDGE_RELAY_PUBLIC_BASE_URL:-}}"
    NODE_BIN="$(resolve_node_bin)"
    ARGS=("${EXTENSION_DIR}/out/src/cli/relayServer.js" "--host" "${HOST}" "--port" "${PORT}")
    if [[ -n "${PUBLIC_BASE_URL}" ]]; then
      ARGS+=("--public-base-url" "${PUBLIC_BASE_URL}")
    fi
    exec "${NODE_BIN}" "${ARGS[@]}"
    ;;
  cli-server)
    ensure_extension_deps
    (
      cd "${EXTENSION_DIR}"
      npm_cmd run build
    )
    NODE_BIN="$(resolve_node_bin)"
    exec "${NODE_BIN}" "${EXTENSION_DIR}/out/src/cli/codexCliServer.js" "${@:2}"
    ;;
  help|*)
    cat <<'EOF'
用法:
  ./scripts/dev.sh bootstrap   安装 Python/Node 依赖
  ./scripts/dev.sh helper      启动本地 Python Helper
  ./scripts/dev.sh extension   编译 VS Code 扩展并打印调试步骤
  ./scripts/dev.sh relay-server [publicBaseUrl]
                              启动远端 Relay Server，适合 SSH / 服务器场景
  ./scripts/dev.sh cli-server [args...]
                              启动服务器侧 Codex CLI 模式，更适合纯 SSH / CLI 场景

查看链接 / 二维码 / PIN 的方式:
1. 在 VS Code 调试窗口中执行 PromptBridge: Start Server
2. 再执行 PromptBridge: Show Access Info
3. 若要轮换链接与 PIN，执行 PromptBridge: Regenerate Access Token

SSH / 服务器场景：
1. 在服务器运行 ./scripts/dev.sh relay-server https://你的公网地址:8765
2. 在本机 VS Code 中安装并启动扩展
3. 执行 PromptBridge: Configure Relay Connection
4. 再执行 PromptBridge: Connect Relay Agent

纯服务器 CLI 场景：
1. 在服务器运行 ./scripts/dev.sh cli-server --public-base-url https://你的公网地址:8765 --workdir /你的仓库 --exec-command codex
2. 手机访问服务端链接并输入 PIN
3. 手机提交 prompt 后，服务器直接调用 Codex CLI
EOF
    ;;
esac
