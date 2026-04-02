from __future__ import annotations

import os
import shutil
import subprocess
import time
from collections.abc import Callable, Sequence

from .base import MousePosition


class LinuxPlatformAdapter:
    """Linux/X11 实现，依赖 xdotool 与 xclip 完成聚焦、粘贴和点击。"""

    def __init__(
        self,
        runner: Callable[..., subprocess.CompletedProcess[str]] | None = None,
        sleeper: Callable[[float], None] | None = None,
    ) -> None:
        self._runner = runner or self._default_runner
        self._sleeper = sleeper or time.sleep

    def check_dependencies(self) -> None:
        if "DISPLAY" not in os.environ:
            raise RuntimeError("当前环境缺少 DISPLAY，Linux 自动化仅支持 X11 会话")
        missing = [name for name in ("xdotool", "xclip") if shutil.which(name) is None]
        if missing:
            raise RuntimeError(f"缺少依赖命令：{', '.join(missing)}")

    def focus_vscode_window(self, keyword: str) -> None:
        search = self._runner(["xdotool", "search", "--name", keyword], capture_output=True)
        window_ids = [item.strip() for item in search.stdout.splitlines() if item.strip()]
        if not window_ids:
            raise RuntimeError(f"未找到包含关键字“{keyword}”的 VS Code 窗口")
        self._runner(["xdotool", "windowactivate", "--sync", window_ids[-1]])

    def get_clipboard_text(self) -> str | None:
        try:
            result = self._runner(["xclip", "-selection", "clipboard", "-o"], capture_output=True)
        except subprocess.CalledProcessError:
            return None
        return result.stdout

    def set_clipboard_text(self, text: str) -> None:
        self._runner(
            ["xclip", "-selection", "clipboard", "-in"],
            capture_output=False,
            input_text=text,
        )

    def paste(self) -> None:
        self._runner(["xdotool", "key", "--clearmodifiers", "ctrl+v"])

    def press_enter(self) -> None:
        self._runner(["xdotool", "key", "Return"])

    def sleep_ms(self, delay_ms: int) -> None:
        self._sleeper(delay_ms / 1000)

    def get_mouse_position(self) -> MousePosition:
        result = self._runner(["xdotool", "getmouselocation", "--shell"], capture_output=True)
        values: dict[str, int] = {}
        for line in result.stdout.splitlines():
            if "=" not in line:
                continue
            key, value = line.split("=", 1)
            if key in {"X", "Y"}:
                values[key] = int(value)
        if "X" not in values or "Y" not in values:
            raise RuntimeError("无法解析当前鼠标坐标")
        return MousePosition(x=values["X"], y=values["Y"])

    def click_absolute(self, x: int, y: int) -> None:
        self._runner(["xdotool", "mousemove", "--sync", str(x), str(y)])
        self._runner(["xdotool", "click", "1"])

    def _default_runner(
        self,
        args: Sequence[str],
        capture_output: bool = False,
        input_text: str | None = None,
    ) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            args,
            check=True,
            text=True,
            capture_output=capture_output,
            input=input_text,
        )
