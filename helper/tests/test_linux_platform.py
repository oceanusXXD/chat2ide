import subprocess

import pytest

from helper.platform.linux import LinuxPlatformAdapter


class FakeCompletedProcess:
    def __init__(self, stdout: str = "") -> None:
        self.stdout = stdout


def test_check_dependencies_requires_display(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("DISPLAY", raising=False)
    adapter = LinuxPlatformAdapter()
    with pytest.raises(RuntimeError):
        adapter.check_dependencies()


def test_focus_vscode_window_activates_latest_window(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("DISPLAY", ":0")
    monkeypatch.setattr("shutil.which", lambda name: f"/usr/bin/{name}")
    calls: list[list[str]] = []

    def runner(args: list[str], capture_output: bool = False, input_text: str | None = None):
        calls.append(args)
        if args[:3] == ["xdotool", "search", "--name"]:
            return FakeCompletedProcess(stdout="100\n200\n")
        return FakeCompletedProcess(stdout="")

    adapter = LinuxPlatformAdapter(runner=runner)
    adapter.focus_vscode_window("Visual Studio Code")
    assert calls[1] == ["xdotool", "windowactivate", "--sync", "200"]


def test_get_mouse_position_parses_xdotool_output() -> None:
    def runner(args: list[str], capture_output: bool = False, input_text: str | None = None):
        return FakeCompletedProcess(stdout="X=123\nY=456\nSCREEN=0\n")

    adapter = LinuxPlatformAdapter(runner=runner)
    point = adapter.get_mouse_position()
    assert point.x == 123
    assert point.y == 456


def test_click_absolute_moves_mouse_then_clicks() -> None:
    calls: list[list[str]] = []

    def runner(args: list[str], capture_output: bool = False, input_text: str | None = None):
        calls.append(args)
        return FakeCompletedProcess(stdout="")

    adapter = LinuxPlatformAdapter(runner=runner)
    adapter.click_absolute(1, 2)
    assert calls == [
        ["xdotool", "mousemove", "--sync", "1", "2"],
        ["xdotool", "click", "1"],
    ]


def test_get_clipboard_text_returns_none_when_xclip_fails() -> None:
    def runner(args: list[str], capture_output: bool = False, input_text: str | None = None):
        raise subprocess.CalledProcessError(returncode=1, cmd=args)

    adapter = LinuxPlatformAdapter(runner=runner)
    assert adapter.get_clipboard_text() is None
