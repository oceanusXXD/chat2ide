from __future__ import annotations

import json
from dataclasses import asdict, dataclass
from pathlib import Path


@dataclass(frozen=True)
class CalibrationPoint:
    """记录一次输入框校准结果。"""

    x: int
    y: int
    captured_at: str


class CalibrationStore:
    """负责将校准坐标持久化到本地文件。"""

    def __init__(self, path: Path) -> None:
        self.path = path

    def load(self) -> CalibrationPoint | None:
        if not self.path.exists():
            return None
        data = json.loads(self.path.read_text(encoding="utf-8"))
        return CalibrationPoint(
            x=int(data["x"]),
            y=int(data["y"]),
            captured_at=str(data["captured_at"]),
        )

    def save(self, point: CalibrationPoint) -> CalibrationPoint:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        content = json.dumps(asdict(point), ensure_ascii=False, indent=2)
        self.path.write_text(content, encoding="utf-8")
        return point
