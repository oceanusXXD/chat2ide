#!/usr/bin/env bash
set -euo pipefail

source "$(cd "$(dirname "$0")" && pwd)/common.sh"

bootstrap_all
echo "依赖安装完成。"
echo "Python 环境: ${VENV_DIR}"
echo "扩展目录: ${EXTENSION_DIR}"
