#!/usr/bin/env bash
set -euo pipefail

source "$(cd "$(dirname "$0")" && pwd)/common.sh"

ensure_extension_deps
(
  cd "${EXTENSION_DIR}"
  npm_cmd run package
)
