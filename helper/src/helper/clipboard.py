from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import dataclass

from .platform.base import PlatformAdapter


@dataclass(frozen=True)
class ClipboardSnapshot:
    """记录当前剪贴板内容，便于发送后恢复。"""

    text: str | None


class ClipboardManager:
    """封装剪贴板备份、临时写入与恢复逻辑。"""

    def __init__(self, platform: PlatformAdapter, restore_enabled: bool) -> None:
        self.platform = platform
        self.restore_enabled = restore_enabled

    def backup(self) -> ClipboardSnapshot:
        return ClipboardSnapshot(text=self.platform.get_clipboard_text())

    def restore(self, snapshot: ClipboardSnapshot) -> None:
        if snapshot.text is None:
            return
        self.platform.set_clipboard_text(snapshot.text)

    @contextmanager
    def temporary_text(self, text: str) -> Iterator[None]:
        snapshot = self.backup() if self.restore_enabled else None
        self.platform.set_clipboard_text(text)
        try:
            yield
        finally:
            if self.restore_enabled and snapshot is not None:
                self.restore(snapshot)
