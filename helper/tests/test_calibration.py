from helper.calibration import CalibrationPoint, CalibrationStore


def test_calibration_store_save_and_load(tmp_path) -> None:
    store = CalibrationStore(tmp_path / "calibration.json")
    point = CalibrationPoint(x=10, y=20, captured_at="2026-03-31T00:00:00+00:00")
    store.save(point)

    assert store.load() == point


def test_calibration_store_returns_none_when_missing(tmp_path) -> None:
    store = CalibrationStore(tmp_path / "missing.json")
    assert store.load() is None
