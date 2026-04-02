from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol


@dataclass(frozen=True)
class MousePosition:
    """记录当前鼠标位置。"""

    x: int
    y: int


class PlatformAdapter(Protocol):
    """平台自动化接口，方便真实实现和测试替身共用。"""

    def check_dependencies(self) -> None:
        ...

    def focus_vscode_window(self, keyword: str) -> None:
        ...

    def get_clipboard_text(self) -> str | None:
        ...

    def set_clipboard_text(self, text: str) -> None:
        ...

    def paste(self) -> None:
        ...

    def press_enter(self) -> None:
        ...

    def sleep_ms(self, delay_ms: int) -> None:
        ...

    def get_mouse_position(self) -> MousePosition:
        ...

    def click_absolute(self, x: int, y: int) -> None:
        ...
