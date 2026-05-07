"""Structured JSON logging.

Replaces the default formatter with one that emits one JSON object per line:

    {"ts": "...", "level": "INFO", "logger": "...", "msg": "...",
     "request_id": "...", "user_id": "...", "method": "GET",
     "path": "/api/v1/notes", "status": 200, "latency_ms": 12.4}

Correlation IDs (request_id, user_id) are pulled from a ContextVar that the
RequestContextMiddleware populates per request. Anything outside a request
(startup, scheduled jobs) just omits those keys.
"""
import json
import logging
import sys
from contextvars import ContextVar
from datetime import datetime, timezone

# Per-request context, set by middleware. Defaults are None so logs outside
# request lifetime stay clean.
request_id_var: ContextVar[str | None] = ContextVar("request_id", default=None)
user_id_var: ContextVar[str | None] = ContextVar("user_id", default=None)


_RESERVED = {
    "name", "msg", "args", "levelname", "levelno", "pathname", "filename",
    "module", "exc_info", "exc_text", "stack_info", "lineno", "funcName",
    "created", "msecs", "relativeCreated", "thread", "threadName",
    "processName", "process", "asctime", "message",
}


class JsonFormatter(logging.Formatter):
    """One-line JSON per record. `extra=` kwargs flow through unchanged."""

    def format(self, record: logging.LogRecord) -> str:
        ts = datetime.fromtimestamp(record.created, tz=timezone.utc).isoformat()
        out: dict = {
            "ts": ts,
            "level": record.levelname,
            "logger": record.name,
            "msg": record.getMessage(),
        }
        rid = request_id_var.get()
        if rid:
            out["request_id"] = rid
        uid = user_id_var.get()
        if uid:
            out["user_id"] = uid
        if record.exc_info:
            out["exc_info"] = self.formatException(record.exc_info)
        # Forward any extra fields the call site attached.
        for k, v in record.__dict__.items():
            if k in _RESERVED or k.startswith("_"):
                continue
            try:
                json.dumps(v)
            except (TypeError, ValueError):
                v = repr(v)
            out[k] = v
        return json.dumps(out, ensure_ascii=False)


def setup_logging(level: str = "INFO") -> None:
    """Replace root handlers with a single JSON-on-stdout handler."""
    handler = logging.StreamHandler(stream=sys.stdout)
    handler.setFormatter(JsonFormatter())
    root = logging.getLogger()
    # Don't double-configure if the app is reloaded under uvicorn --reload.
    for h in list(root.handlers):
        root.removeHandler(h)
    root.addHandler(handler)
    root.setLevel(level)
    # Tame noisy third-party loggers a touch.
    logging.getLogger("uvicorn.access").setLevel("WARNING")
    logging.getLogger("sqlalchemy.engine").setLevel("WARNING")
    logging.getLogger("aiosqlite").setLevel("INFO")
    logging.getLogger("botocore").setLevel("WARNING")
    logging.getLogger("urllib3").setLevel("WARNING")
