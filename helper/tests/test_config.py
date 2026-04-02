from helper.config import default_calibration_file, load_config, parse_args


def test_parse_args_with_defaults() -> None:
    args = parse_args(["serve"])
    assert args.host == "127.0.0.1"
    assert args.port == 8766
    assert args.restore_clipboard is True


def test_load_config_with_overrides(tmp_path) -> None:
    config = load_config(
        [
            "serve",
            "--host",
            "0.0.0.0",
            "--port",
            "9000",
            "--window-keyword",
            "Code - chat2ide",
            "--focus-delay-ms",
            "600",
            "--paste-delay-ms",
            "200",
            "--click-delay-ms",
            "50",
            "--no-restore-clipboard",
            "--max-retries",
            "3",
            "--calibration-file",
            str(tmp_path / "calibration.json"),
        ]
    )
    assert config.server.host == "0.0.0.0"
    assert config.server.port == 9000
    assert config.automation.vscode_window_keyword == "Code - chat2ide"
    assert config.automation.focus_delay_ms == 600
    assert config.automation.paste_delay_ms == 200
    assert config.automation.click_delay_ms == 50
    assert config.automation.restore_clipboard is False
    assert config.automation.max_retries == 3
    assert config.automation.calibration_file == tmp_path / "calibration.json"


def test_default_calibration_file_points_to_user_config_dir() -> None:
    assert default_calibration_file().name == "calibration.json"
