from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import helper.main as main_module
from helper.config import AppConfig, AutomationConfig, ServerConfig


@dataclass
class FakeLogger:
    messages: list[str]

    def info(self, message: str) -> None:
        self.messages.append(message)


def test_main_handles_keyboard_interrupt(monkeypatch) -> None:
    logger = FakeLogger(messages=[])
    config = AppConfig(
        server=ServerConfig(host="127.0.0.1", port=8766),
        automation=AutomationConfig(
            vscode_window_keyword="Code",
            focus_delay_ms=100,
            paste_delay_ms=50,
            click_delay_ms=20,
            restore_clipboard=True,
            max_retries=1,
            calibration_file=Path("unused.json"),
        ),
    )

    monkeypatch.setattr(main_module, "build_logger", lambda: logger)
    monkeypatch.setattr(main_module, "load_config", lambda argv=None: config)
    monkeypatch.setattr(main_module, "LinuxPlatformAdapter", lambda: object())
    monkeypatch.setattr(main_module, "CalibrationStore", lambda path: object())
    monkeypatch.setattr(main_module, "ClipboardManager", lambda platform, restore: object())
    monkeypatch.setattr(main_module, "PromptAutomator", lambda **kwargs: object())
    monkeypatch.setattr(main_module, "HelperService", lambda automator, logger: object())

    def interrupted_run_server(host, port, service, active_logger) -> None:
        raise KeyboardInterrupt

    monkeypatch.setattr(main_module, "run_server", interrupted_run_server)

    assert main_module.main(["serve"]) == 0
    assert logger.messages == ["收到中断信号，Prompt Bridge Helper 正在退出"]
