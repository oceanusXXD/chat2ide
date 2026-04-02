#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
MODE="${1:-all}"

cd "${ROOT_DIR}"

case "${MODE}" in
  bootstrap|setup)
    exec "${ROOT_DIR}/scripts/bootstrap.sh"
    ;;
  all)
    exec ./node_modules/.bin/concurrently -k "./node_modules/.bin/tsx watch src/server/index.ts" "./node_modules/.bin/vite"
    ;;
  server)
    exec ./node_modules/.bin/tsx watch src/server/index.ts
    ;;
  web)
    exec ./node_modules/.bin/vite
    ;;
  start)
    exec node dist/server/index.js
    ;;
  help|*)
    cat <<'EOF'
用法:
  ./scripts/dev.sh bootstrap   安装根项目依赖
  ./scripts/dev.sh all         同时启动服务端和前端开发服务器
  ./scripts/dev.sh server      启动服务端开发模式
  ./scripts/dev.sh web         启动前端开发模式
  ./scripts/dev.sh start       启动已构建的生产服务
EOF
    ;;
esac
