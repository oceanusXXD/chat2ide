import pytest

from helper.models import HelperRequest, HelperResponse, parse_action_request


def test_parse_send_prompt_request() -> None:
    request = parse_action_request(
        {
            "action": "send_prompt",
            "requestId": "req-1",
            "text": "请解释超时原因",
        }
    )
    assert request == HelperRequest(action="send_prompt", request_id="req-1", text="请解释超时原因")


def test_parse_ping_request() -> None:
    request = parse_action_request({"action": "ping", "requestId": "ping-1"})
    assert request == HelperRequest(action="ping", request_id="ping-1", text=None)


def test_parse_request_rejects_invalid_payload() -> None:
    with pytest.raises(ValueError):
        parse_action_request({"action": "send_prompt", "requestId": "req-1", "text": ""})


def test_response_to_dict_uses_protocol_field_names() -> None:
    response = HelperResponse(status="ok", request_id="req-2", detail="已发送", state="success")
    assert response.to_dict() == {
        "status": "ok",
        "detail": "已发送",
        "requestId": "req-2",
        "state": "success",
    }
