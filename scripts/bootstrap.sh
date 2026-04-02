#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

cd "${ROOT_DIR}"

NODE_BIN="${NODE_BIN:-}"
if [[ -z "${NODE_BIN}" || ! -x "${NODE_BIN}" ]]; then
  NVM_NODE="$(compgen -G '/usr/local/nvm/versions/node/v*/bin/node' | sort -V | tail -n1 || true)"
  if [[ -n "${NVM_NODE}" && -x "${NVM_NODE}" ]]; then
    NODE_BIN="${NVM_NODE}"
  else
    NODE_BIN="$(command -v node || true)"
  fi
fi

if [[ -z "${NODE_BIN}" || ! -x "${NODE_BIN}" ]]; then
  echo "node is required but was not found in PATH" >&2
  exit 1
fi

NPM_CLI="${NPM_CLI:-}"
if [[ -z "${NPM_CLI}" || ! -f "${NPM_CLI}" ]]; then
  NPM_CLI="$(dirname "$(dirname "${NODE_BIN}")")/lib/node_modules/npm/bin/npm-cli.js"
fi
if [[ ! -f "${NPM_CLI}" ]]; then
  NPM_CLI="$(compgen -G '/usr/local/nvm/versions/node/v*/lib/node_modules/npm/bin/npm-cli.js' | sort -V | tail -n1 || true)"
fi
if [[ ! -f "${NPM_CLI}" ]]; then
  echo "npm-cli.js was not found. Set NPM_CLI or install npm with node." >&2
  exit 1
fi

# Install only into this repository's node_modules. No global npm packages or
# shell/profile changes are required for the active terminal-hub workflow.
"${NODE_BIN}" "${NPM_CLI}" install --prefix "${ROOT_DIR}"
echo "Node dependencies installed."
