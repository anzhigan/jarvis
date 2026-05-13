"""Per-request middleware: request_id + access log."""
import logging
import time
import uuid

from fastapi import Request

from app.core.logging import request_id_var, user_id_var

logger = logging.getLogger("access")


async def request_context_middleware(request: Request, call_next):
    """Generate a request_id, expose it through the ContextVar + response header,
    and emit a JSON access log line with method/path/status/latency.
    """
    rid = request.headers.get("X-Request-ID") or uuid.uuid4().hex[:16]
    rid_token = request_id_var.set(rid)
    uid_token = user_id_var.set(None)
    started = time.perf_counter()
    status_code = 500
    try:
        response = await call_next(request)
        status_code = response.status_code
        return response
    finally:
        latency_ms = round((time.perf_counter() - started) * 1000, 1)
        # Skip noisy health probes from the access log unless they failed.
        path = request.url.path
        if not (path.startswith("/health") and 200 <= status_code < 400):
            logger.info(
                "%s %s %d", request.method, path, status_code,
                extra={
                    "method": request.method,
                    "path": path,
                    "status": status_code,
                    "latency_ms": latency_ms,
                },
            )
        request_id_var.reset(rid_token)
        user_id_var.reset(uid_token)


def add_request_id_header(response, request_id: str) -> None:
    """Helper to be called from a tail middleware that copies the id back to the client."""
    response.headers["X-Request-ID"] = request_id
