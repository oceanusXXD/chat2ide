import logging

import pytest

from helper.automator import PromptAutomator
from helper.calibration import CalibrationPoint
from helper.clipboard import ClipboardManager
from helper.config import AutomationConfig


class FakeCalibrationStore:
    def __init__(self, point: CalibrationPoint | None = None) -> None:
        self.point = point
        self.saved: CalibrationPoint | None = None

    def load(self) -> CalibrationPoint | None:
        return self.point

    def save(self, point: CalibrationPoint) -> CalibrationPoint:
        self.saved = point
        self.point = point
        return point


class FakePlatform:
    def __init__(self, fail_times: int = 0) -> None:
        self.fail_times = fail_times
        self.focus_calls = 0
        self.clipboard = "old"
        self.actions: list[str] = []
        self.mouse_position = (100, 200)

    def check_dependencies(self) -> None:
        self.actions.append("check_dependencies")

    def focus_vscode_window(self, keyword: str) -> None:
        self.focus_calls += 1
        self.actions.append(f"focus:{keyword}")
        if self.focus_calls <= self.fail_times:
            raise RuntimeError("聚焦失败")

    def get_clipboard_text(self) -> str | None:
        self.actions.append("get_clipboard")
        return self.clipboard

    def set_clipboard_text(self, text: str) -> None:
        self.actions.append(f"set_clipboard:{text}")
        self.clipboard = text

    def paste(self) -> None:
        self.actions.append("paste")

    def press_enter(self) -> None:
        self.actions.append("press_enter")

    def sleep_ms(self, delay_ms: int) -> None:
        self.actions.append(f"sleep:{delay_ms}")

    def get_mouse_position(self):
        from helper.platform.base import MousePosition

        self.actions.append("get_mouse_position")
        return MousePosition(x=self.mouse_position[0], y=self.mouse_position[1])

    def click_absolute(self, x: int, y: int) -> None:
        self.actions.append(f"click:{x},{y}")


def build_automator(
    platform: FakePlatform,
    calibration_store: FakeCalibrationStore | None = None,
    *,
    restore_clipboard: bool = True,
    max_retries: int = 1,
) -> PromptAutomator:
    return PromptAutomator(
        platform=platform,
        clipboard=ClipboardManager(platform, restore_clipboard),
        calibration_store=calibration_store or FakeCalibrationStore(),
        config=AutomationConfig(
            vscode_window_keyword="Visual Studio Code",
            focus_delay_ms=100,
            paste_delay_ms=50,
            click_delay_ms=20,
            restore_clipboard=restore_clipboard,
            max_retries=max_retries,
            calibration_file=__import__("pathlib").Path("unused.json"),
        ),
        logger=logging.getLogger("test"),
    )


def test_send_prompt_success_restores_clipboard() -> None:
    platform = FakePlatform()
    result = build_automator(platform).send_prompt("hello")
    assert result.detail == "已将 prompt 粘贴到 Codex 并发送"
    assert platform.clipboard == "old"
    assert "press_enter" in platform.actions


def test_send_prompt_uses_calibration_click() -> None:
    platform = FakePlatform()
    calibration_store = FakeCalibrationStore(
        CalibrationPoint(x=10, y=20, captured_at="2026-03-31T00:00:00+00:00")
    )
    build_automator(platform, calibration_store).send_prompt("hello")
    assert "click:10,20" in platform.actions


def test_send_prompt_retries_then_succeeds() -> None:
    platform = FakePlatform(fail_times=1)
    build_automator(platform, max_retries=1).send_prompt("retry")
    assert platform.focus_calls == 2


def test_calibrate_input_position_saves_coordinates() -> None:
    platform = FakePlatform()
    calibration_store = FakeCalibrationStore()
    result = build_automator(platform, calibration_store).calibrate_input_position()
    assert result.calibration is not None
    assert calibration_store.saved is not None
    assert calibration_store.saved.x == 100
    assert calibration_store.saved.y == 200


def test_send_prompt_rejects_blank_text() -> None:
    platform = FakePlatform()
    with pytest.raises(ValueError):
        build_automator(platform).send_prompt("   ")
