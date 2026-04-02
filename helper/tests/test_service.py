import logging

from helper.automator import AutomationResult
from helper.models import HelperRequest
from helper.service import HelperService, PromptBridgeHttpServer


class FakeAutomator:
    def __init__(self, fail_send: bool = False) -> None:
        self.fail_send = fail_send
        self.state_listener = None

    def send_prompt(self, text: str) -> AutomationResult:
        if self.state_listener is not None:
            self.state_listener("sending")
        if self.fail_send:
            raise RuntimeError("发送失败")
        if self.state_listener is not None:
            self.state_listener("success")
        return AutomationResult(detail=f"已发送：{text}", state="success")

    def calibrate_input_position(self) -> AutomationResult:
        if self.state_listener is not None:
            self.state_listener("success")
        from helper.calibration import CalibrationPoint

        point = CalibrationPoint(x=1, y=2, captured_at="2026-03-31T00:00:00+00:00")
        return AutomationResult(detail="已记录", state="success", calibration=point)


def test_service_handles_send_prompt_success() -> None:
    service = HelperService(FakeAutomator(), logging.getLogger("test"))
    response = service.handle_action(
        HelperRequest(action="send_prompt", request_id="req-1", text="hello")
    )
    assert response.status == "ok"
    assert response.state == "success"


def test_service_handles_send_prompt_failure() -> None:
    service = HelperService(FakeAutomator(fail_send=True), logging.getLogger("test"))
    response = service.handle_action(
        HelperRequest(action="send_prompt", request_id="req-2", text="hello")
    )
    assert response.status == "error"
    assert response.code == "AUTOMATION_FAILED"


def test_service_handles_calibration() -> None:
    service = HelperService(FakeAutomator(), logging.getLogger("test"))
    response = service.handle_action(HelperRequest(action="calibrate", request_id="req-3"))
    assert response.status == "calibration_result"
    assert response.x == 1
    assert response.y == 2


def test_health_status_contains_helper_state() -> None:
    service = HelperService(FakeAutomator(), logging.getLogger("test"))
    response = service.health_status()
    assert response.status == "health_status"
    assert response.state == "idle"


def test_prompt_bridge_http_server_enables_fast_restart() -> None:
    assert PromptBridgeHttpServer.allow_reuse_address is True
    assert PromptBridgeHttpServer.daemon_threads is True
