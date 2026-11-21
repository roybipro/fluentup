"""ASGI middleware that caps request body size, including chunked bodies with no Content-Length."""
import json

from starlette.exceptions import HTTPException
from starlette.types import ASGIApp, Message, Receive, Scope, Send

_TOO_LARGE = "Request payload exceeds maximum allowed size."


async def _send_json(send: Send, status_code: int, detail: str) -> None:
    body = json.dumps({"detail": detail}).encode()
    await send(
        {
            "type": "http.response.start",
            "status": status_code,
            "headers": [(b"content-type", b"application/json"), (b"content-length", str(len(body)).encode())],
        }
    )
    await send({"type": "http.response.body", "body": body})


class RequestSizeLimitMiddleware:
    def __init__(self, app: ASGIApp, max_bytes: int) -> None:
        self.app = app
        self.max_bytes = max_bytes

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        raw_length = dict(scope.get("headers") or []).get(b"content-length")
        if raw_length is not None:
            try:
                declared = int(raw_length)
            except ValueError:
                await _send_json(send, 400, "Invalid Content-Length header.")
                return
            if declared < 0:
                await _send_json(send, 400, "Invalid Content-Length header.")
                return
            if declared > self.max_bytes:
                await _send_json(send, 413, _TOO_LARGE)
                return

        received = 0

        async def limited_receive() -> Message:
            nonlocal received
            message = await receive()
            if message["type"] == "http.request":
                received += len(message.get("body", b""))
                if received > self.max_bytes:
                    # HTTPException passes through FastAPI's body parsing and becomes a 413 response.
                    raise HTTPException(status_code=413, detail=_TOO_LARGE)
            return message

        await self.app(scope, limited_receive, send)
