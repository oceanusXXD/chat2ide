#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VENV_DIR="${PROJECT_ROOT}/.venv"
HELPER_DIR="${PROJECT_ROOT}/helper"
EXTENSION_DIR="${PROJECT_ROOT}/vscode-extension"

resolve_python_bin() {
  if command -v python3.11 >/dev/null 2>&1; then
    command -v python3.11
    return
  fi
  if command -v python3.10 >/dev/null 2>&1; then
    command -v python3.10
    return
  fi
  command -v python3
}

resolve_node_bin() {
  if [[ -n "${NODE_BIN:-}" && -x "${NODE_BIN}" ]]; then
    printf '%s\n' "${NODE_BIN}"
    return
  fi

  local candidate
  candidate="$(compgen -G '/usr/local/nvm/versions/node/v*/bin/node' | sort -V | tail -n1 || true)"
  if [[ -n "${candidate}" && -x "${candidate}" ]]; then
    printf '%s\n' "${candidate}"
    return
  fi

  command -v node
}

resolve_npm_cli() {
  local node_bin
  node_bin="$(resolve_node_bin)"
  local npm_cli
  npm_cli="$(dirname "$(dirname "${node_bin}")")/lib/node_modules/npm/bin/npm-cli.js"
  if [[ -f "${npm_cli}" ]]; then
    printf '%s\n' "${npm_cli}"
    return
  fi

  if [[ -n "${NPM_CLI:-}" && -f "${NPM_CLI}" ]]; then
    printf '%s\n' "${NPM_CLI}"
    return
  fi

  echo "未找到 npm-cli.js，请设置 NODE_BIN 或 NPM_CLI" >&2
  exit 1
}

npm_cmd() {
  local node_bin
  local npm_cli
  node_bin="$(resolve_node_bin)"
  npm_cli="$(resolve_npm_cli)"
  "${node_bin}" "${npm_cli}" "$@"
}

create_python_env() {
  local python_bin
  python_bin="$(resolve_python_bin)"
  rm -rf "${VENV_DIR}"
  if command -v uv >/dev/null 2>&1; then
    uv venv "${VENV_DIR}" --python "${python_bin}"
    return
  fi
  if ! "${python_bin}" -m venv "${VENV_DIR}"; then
    "${python_bin}" -m virtualenv "${VENV_DIR}"
  fi
}

ensure_python_env() {
  if [[ ! -x "${VENV_DIR}/bin/python" || ! -x "${VENV_DIR}/bin/pip" ]]; then
    create_python_env
  fi
}

install_helper_deps() {
  ensure_python_env
  if command -v uv >/dev/null 2>&1; then
    uv pip install --python "${VENV_DIR}/bin/python" -e "${HELPER_DIR}[dev]"
    return
  fi
  "${VENV_DIR}/bin/pip" install --upgrade pip setuptools wheel
  "${VENV_DIR}/bin/pip" install -e "${HELPER_DIR}[dev]"
}

ensure_extension_deps() {
  (
    cd "${EXTENSION_DIR}"
    npm_cmd install
  )
}

bootstrap_all() {
  install_helper_deps
  ensure_extension_deps
}
