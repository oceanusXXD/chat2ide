from __future__ import annotations

import logging
import sys


def build_logger() -> logging.Logger:
    """构建标准输出日志器，便于插件侧和人工排障统一采集。"""

    logging.basicConfig(
        level=logging.INFO,
        format="[%(asctime)s] [%(levelname)s] %(message)s",
        datefmt="%H:%M:%S",
        stream=sys.stdout,
    )
    return logging.getLogger("prompt_bridge_helper")
