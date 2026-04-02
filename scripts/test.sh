#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

cd "${ROOT_DIR}"

node ./node_modules/typescript/bin/tsc --noEmit -p tsconfig.server.json
node ./node_modules/typescript/bin/tsc --noEmit -p web/tsconfig.json
node ./node_modules/typescript/bin/tsc -p tsconfig.server.json
node ./node_modules/vite/bin/vite.js build
