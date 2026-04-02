from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime, timezone
from logging import Logger

from .calibration import CalibrationPoint, CalibrationStore
from .clipboard import ClipboardManager
from .config import AutomationConfig
from .models import HelperState
from .platform.base import PlatformAdapter


@dataclass(frozen=True)
class AutomationResult:
    """记录一次自动化执行的最终状态。"""

    detail: str
    state: HelperState
    calibration: CalibrationPoint | None = None


class PromptAutomator:
    """封装完整的“聚焦 VS Code -> 可选点击输入框 -> 粘贴 -> 回车”动作链。"""

    def __init__(
        self,
        platform: PlatformAdapter,
        clipboard: ClipboardManager,
        calibration_store: CalibrationStore,
        config: AutomationConfig,
        logger: Logger,
        state_listener: Callable[[HelperState], None] | None = None,
    ) -> None:
        self.platform = platform
        self.clipboard = clipboard
        self.calibration_store = calibration_store
        self.config = config
        self.logger = logger
        self.state_listener = state_listener

    def send_prompt(self, text: str) -> AutomationResult:
        """执行一次 prompt 发送，并按配置做短暂重试与剪贴板恢复。"""

        if not text.strip():
            raise ValueError("prompt 不能为空")

        self.platform.check_dependencies()
        last_error: Exception | None = None

        for attempt in range(1, self.config.max_retries + 2):
            try:
                self.logger.info("开始第 %s 次自动化发送", attempt)
                self._set_state("focusing_window")
                self.platform.focus_vscode_window(self.config.vscode_window_keyword)
                self.platform.sleep_ms(self.config.focus_delay_ms)

                point = self.calibration_store.load()
                if point is not None:
                    self.logger.info("使用校准坐标点击 Codex 输入框：(%s, %s)", point.x, point.y)
                    self.platform.click_absolute(point.x, point.y)
                    self.platform.sleep_ms(self.config.click_delay_ms)

                self._set_state("preparing_input")
                with self.clipboard.temporary_text(text):
                    self.platform.paste()
                    self.platform.sleep_ms(self.config.paste_delay_ms)
                    self._set_state("sending")
                    self.platform.press_enter()

                self._set_state("success")
                return AutomationResult(detail="已将 prompt 粘贴到 Codex 并发送", state="success")
            except Exception as error:  # noqa: BLE001
                last_error = error
                self.logger.warning("第 %s 次自动化发送失败：%s", attempt, error)

        self._set_state("failure")
        raise RuntimeError(f"自动化发送失败：{last_error}")

    def calibrate_input_position(self) -> AutomationResult:
        """读取当前鼠标位置并保存为输入框校准坐标。"""

        self.platform.check_dependencies()
        point = self.platform.get_mouse_position()
        saved = self.calibration_store.save(
            CalibrationPoint(
                x=point.x,
                y=point.y,
                captured_at=datetime.now(timezone.utc).isoformat(),
            )
        )
        self._set_state("success")
        detail = f"已记录 Codex 输入框坐标：({saved.x}, {saved.y})"
        self.logger.info(detail)
        return AutomationResult(detail=detail, state="success", calibration=saved)

    def _set_state(self, state: HelperState) -> None:
        if self.state_listener is not None:
            self.state_listener(state)
