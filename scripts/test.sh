#!/usr/bin/env bash
set -euo pipefail

source "$(cd "$(dirname "$0")" && pwd)/common.sh"

bootstrap_all

(
  cd "${HELPER_DIR}"
  "${VENV_DIR}/bin/ruff" check .
  "${VENV_DIR}/bin/pytest" -q
)

(
  cd "${EXTENSION_DIR}"
  npm_cmd run lint
  npm_cmd run typecheck
  npm_cmd run build
  npm_cmd run test
)
