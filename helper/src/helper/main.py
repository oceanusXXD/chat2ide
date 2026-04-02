from __future__ import annotations

from .automator import PromptAutomator
from .calibration import CalibrationStore
from .clipboard import ClipboardManager
from .config import load_config
from .logger import build_logger
from .platform.linux import LinuxPlatformAdapter
from .service import HelperService, run_server


def main(argv: list[str] | None = None) -> int:
    """命令行入口。"""

    logger = build_logger()
    config = load_config(argv)
    platform_adapter = LinuxPlatformAdapter()
    calibration_store = CalibrationStore(config.automation.calibration_file)
    clipboard = ClipboardManager(platform_adapter, config.automation.restore_clipboard)
    automator = PromptAutomator(
        platform=platform_adapter,
        clipboard=clipboard,
        calibration_store=calibration_store,
        config=config.automation,
        logger=logger,
    )
    service = HelperService(automator=automator, logger=logger)
    try:
        run_server(config.server.host, config.server.port, service, logger)
    except KeyboardInterrupt:
        logger.info("收到中断信号，Prompt Bridge Helper 正在退出")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
