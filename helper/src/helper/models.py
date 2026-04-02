from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Literal

HelperAction = Literal["send_prompt", "health_check", "calibrate", "ping"]
HelperResponseStatus = Literal["ok", "error", "health_status", "calibration_result"]
HelperState = Literal[
    "idle",
    "focusing_window",
    "preparing_input",
    "sending",
    "success",
    "failure",
]


@dataclass(frozen=True)
class HelperRequest:
    """插件发给 Helper 的统一请求模型。"""

    action: HelperAction
    request_id: str
    text: str | None = None


@dataclass(frozen=True)
class HelperResponse:
    """Helper 返回给插件的统一响应模型。"""

    status: HelperResponseStatus
    detail: str
    request_id: str | None = None
    code: str | None = None
    state: HelperState | None = None
    healthy: bool | None = None
    platform: str | None = None
    version: str | None = None
    x: int | None = None
    y: int | None = None

    def to_dict(self) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "status": self.status,
            "detail": self.detail,
        }
        if self.request_id is not None:
            payload["requestId"] = self.request_id
        if self.code is not None:
            payload["code"] = self.code
        if self.state is not None:
            payload["state"] = self.state
        if self.healthy is not None:
            payload["healthy"] = self.healthy
        if self.platform is not None:
            payload["platform"] = self.platform
        if self.version is not None:
            payload["version"] = self.version
        if self.x is not None:
            payload["x"] = self.x
        if self.y is not None:
            payload["y"] = self.y
        return payload


def parse_action_request(data: dict[str, Any]) -> HelperRequest:
    """将 JSON 载荷解析为 HelperRequest，并执行基础字段校验。"""

    action = data.get("action")
    request_id = data.get("requestId")
    text = data.get("text")

    if action not in {"send_prompt", "health_check", "calibrate", "ping"}:
        raise ValueError("action 非法")
    if not isinstance(request_id, str) or not request_id.strip():
        raise ValueError("requestId 非法")
    if action == "send_prompt" and (not isinstance(text, str) or not text.strip()):
        raise ValueError("send_prompt 缺少有效 text")

    return HelperRequest(
        action=action,
        request_id=request_id,
        text=text if isinstance(text, str) else None,
    )
