from helper.clipboard import ClipboardManager, ClipboardSnapshot


class FakePlatform:
    def __init__(self) -> None:
        self.clipboard = "original"
        self.actions: list[str] = []

    def get_clipboard_text(self) -> str | None:
        self.actions.append("get_clipboard")
        return self.clipboard

    def set_clipboard_text(self, text: str) -> None:
        self.actions.append(f"set_clipboard:{text}")
        self.clipboard = text


def test_clipboard_backup_and_restore() -> None:
    platform = FakePlatform()
    manager = ClipboardManager(platform, restore_enabled=True)
    snapshot = manager.backup()
    platform.set_clipboard_text("temp")
    manager.restore(snapshot)
    assert snapshot == ClipboardSnapshot(text="original")
    assert platform.clipboard == "original"


def test_temporary_text_restores_clipboard() -> None:
    platform = FakePlatform()
    manager = ClipboardManager(platform, restore_enabled=True)
    with manager.temporary_text("hello"):
        assert platform.clipboard == "hello"
    assert platform.clipboard == "original"
