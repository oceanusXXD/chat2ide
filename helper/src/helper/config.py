from __future__ import annotations

import argparse
import os
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class ServerConfig:
    """HTTP 服务监听配置。"""

    host: str
    port: int


@dataclass(frozen=True)
class AutomationConfig:
    """自动化动作的可调参数。"""

    vscode_window_keyword: str
    focus_delay_ms: int
    paste_delay_ms: int
    click_delay_ms: int
    restore_clipboard: bool
    max_retries: int
    calibration_file: Path


@dataclass(frozen=True)
class AppConfig:
    """Helper 总配置对象。"""

    server: ServerConfig
    automation: AutomationConfig


def build_parser() -> argparse.ArgumentParser:
    """定义命令行接口，支持独立启动本地 HTTP 服务。"""

    parser = argparse.ArgumentParser(description="Prompt Bridge 本地 Helper")
    subparsers = parser.add_subparsers(dest="command", required=True)

    serve = subparsers.add_parser("serve", help="启动本地 Helper HTTP 服务")
    serve.add_argument("--host", default="127.0.0.1", help="监听地址")
    serve.add_argument("--port", default=8766, type=int, help="监听端口")
    serve.add_argument(
        "--window-keyword",
        default="Visual Studio Code",
        help="用于匹配 VS Code 窗口标题的关键字",
    )
    serve.add_argument("--focus-delay-ms", default=350, type=int, help="窗口聚焦后等待毫秒数")
    serve.add_argument("--paste-delay-ms", default=120, type=int, help="粘贴后回车前等待毫秒数")
    serve.add_argument("--click-delay-ms", default=120, type=int, help="点击校准坐标后等待毫秒数")
    serve.add_argument(
        "--restore-clipboard",
        dest="restore_clipboard",
        action="store_true",
        default=True,
        help="发送完成后恢复原剪贴板",
    )
    serve.add_argument(
        "--no-restore-clipboard",
        dest="restore_clipboard",
        action="store_false",
        help="发送完成后不恢复原剪贴板",
    )
    serve.add_argument("--max-retries", default=1, type=int, help="自动化失败时最大重试次数")
    serve.add_argument(
        "--calibration-file",
        default=str(default_calibration_file()),
        help="输入框校准文件路径",
    )
    return parser


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    """解析命令行参数。"""

    parser = build_parser()
    return parser.parse_args(argv)


def load_config(argv: list[str] | None = None) -> AppConfig:
    """从命令行生成完整配置对象。"""

    args = parse_args(argv)
    return AppConfig(
        server=ServerConfig(host=args.host, port=args.port),
        automation=AutomationConfig(
            vscode_window_keyword=args.window_keyword,
            focus_delay_ms=args.focus_delay_ms,
            paste_delay_ms=args.paste_delay_ms,
            click_delay_ms=args.click_delay_ms,
            restore_clipboard=args.restore_clipboard,
            max_retries=args.max_retries,
            calibration_file=Path(args.calibration_file),
        ),
    )


def default_calibration_file() -> Path:
    """默认将校准信息保存到 XDG 配置目录。"""

    config_home = os.environ.get("XDG_CONFIG_HOME")
    if config_home:
        return Path(config_home) / "prompt-bridge-helper" / "calibration.json"
    return Path.home() / ".config" / "prompt-bridge-helper" / "calibration.json"
