from __future__ import annotations

import json
import platform
from collections.abc import Callable
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from logging import Logger

from .automator import PromptAutomator
from .models import HelperRequest, HelperResponse, HelperState, parse_action_request

HELPER_VERSION = "0.2.0"


class PromptBridgeHttpServer(ThreadingHTTPServer):
    """更适合本地开发与频繁重启的 HTTP Server 配置。"""

    allow_reuse_address = True
    daemon_threads = True


class HelperService:
    """封装 Helper 的协议处理、状态机与日志。"""

    def __init__(self, automator: PromptAutomator, logger: Logger) -> None:
        self.automator = automator
        self.logger = logger
        self.state: HelperState = "idle"
        self.automator.state_listener = self.set_state

    def set_state(self, state: HelperState) -> None:
        self.state = state
        self.logger.info("Helper 状态切换为：%s", state)

    def health_status(self) -> HelperResponse:
        return HelperResponse(
            status="health_status",
            request_id="health",
            detail="Helper 运行正常",
            healthy=True,
            platform=platform.system().lower(),
            version=HELPER_VERSION,
            state=self.state,
        )

    def handle_action(self, request: HelperRequest) -> HelperResponse:
        if request.action == "ping":
            return HelperResponse(
                status="ok",
                request_id=request.request_id,
                detail="pong",
                state=self.state,
            )

        if request.action == "calibrate":
            try:
                result = self.automator.calibrate_input_position()
                return HelperResponse(
                    status="calibration_result",
                    request_id=request.request_id,
                    detail=result.detail,
                    state=self.state,
                    x=result.calibration.x if result.calibration else None,
                    y=result.calibration.y if result.calibration else None,
                )
            except Exception as error:  # noqa: BLE001
                self.set_state("failure")
                self.logger.exception("校准输入框失败")
                return HelperResponse(
                    status="error",
                    request_id=request.request_id,
                    code="AUTOMATION_FAILED",
                    detail=str(error),
                    state=self.state,
                )

        if request.action == "send_prompt":
            try:
                result = self.automator.send_prompt(request.text or "")
                return HelperResponse(
                    status="ok",
                    request_id=request.request_id,
                    detail=result.detail,
                    state=self.state,
                )
            except Exception as error:  # noqa: BLE001
                self.set_state("failure")
                self.logger.exception("自动化发送失败")
                return HelperResponse(
                    status="error",
                    request_id=request.request_id,
                    code="AUTOMATION_FAILED",
                    detail=str(error),
                    state=self.state,
                )

        return self.health_status()


def create_handler(service: HelperService, logger: Logger) -> type[BaseHTTPRequestHandler]:
    """生成绑定业务对象的 HTTP Handler。"""

    class Handler(BaseHTTPRequestHandler):
        def do_GET(self) -> None:  # noqa: N802
            if self.path != "/api/v1/health":
                self._write_json(
                    404,
                    HelperResponse(status="error", code="BAD_REQUEST", detail="未知路径").to_dict(),
                )
                return
            self._write_json(200, service.health_status().to_dict())

        def do_POST(self) -> None:  # noqa: N802
            if self.path != "/api/v1/actions":
                self._write_json(
                    404,
                    HelperResponse(status="error", code="BAD_REQUEST", detail="未知路径").to_dict(),
                )
                return
            try:
                length = int(self.headers.get("Content-Length", "0"))
                raw = self.rfile.read(length).decode("utf-8")
                request = parse_action_request(json.loads(raw))
            except Exception as error:  # noqa: BLE001
                logger.exception("请求解析失败")
                self._write_json(
                    400,
                    HelperResponse(
                        status="error",
                        code="BAD_REQUEST",
                        detail=f"请求解析失败：{error}",
                    ).to_dict(),
                )
                return

            result = service.handle_action(request)
            status_code = 200 if result.status != "error" else 500
            self._write_json(status_code, result.to_dict())

        def log_message(self, format: str, *args: object) -> None:  # noqa: A003
            logger.info("HTTP %s", format % args)

        def _write_json(self, status_code: int, payload: dict) -> None:
            body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
            self.send_response(status_code)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

    return Handler


def run_server(
    host: str,
    port: int,
    service: HelperService,
    logger: Logger,
    server_factory: Callable[..., ThreadingHTTPServer] = PromptBridgeHttpServer,
) -> None:
    """启动阻塞式 HTTP 服务。"""

    server = server_factory((host, port), create_handler(service, logger))
    logger.info("Prompt Bridge Helper 已启动，监听 http://%s:%s", host, port)
    server.serve_forever()
