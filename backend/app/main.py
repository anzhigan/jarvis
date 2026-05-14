import asyncio
import logging
from contextlib import asynccontextmanager

from botocore.exceptions import ClientError
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from sqlalchemy import text

from app.core.config import settings
from app.core.database import engine
from app.core.logging import request_id_var, setup_logging
from app.core.middleware import request_context_middleware
from app.core.rate_limit import limiter
from app.core.sentry import init_sentry
from app.models import *  # noqa: F401, F403
from app.routers import auth, focus_sprints, notes, routines, steps, tags, tasks
from app.services.s3 import _get_client, ensure_bucket_exists

setup_logging(level="DEBUG" if settings.APP_ENV != "production" else "INFO")
init_sentry()

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        ensure_bucket_exists()
    except Exception as e:
        logger.warning("S3 bucket check failed: %s", e)
    yield
    await engine.dispose()


app = FastAPI(
    title="Jarvnote API",
    description="Personal knowledge base, tasks, and metrics",
    version="1.0.0",
    lifespan=lifespan,
)

_cors_kwargs: dict = {
    "allow_origins": settings.origins,
    "allow_credentials": True,
    "allow_methods": ["*"],
    "allow_headers": ["*"],
}
# Allow localhost dev servers only outside production. In prod we only honour
# the explicit ALLOWED_ORIGINS list to avoid DNS-rebinding / loopback abuse.
if settings.APP_ENV != "production":
    _cors_kwargs["allow_origin_regex"] = r"^http://localhost(:[0-9]+)?$"

app.add_middleware(CORSMiddleware, **_cors_kwargs)
# Per-request context (request_id, access log). Registered *after* CORS so
# preflight OPTIONS handled by CORSMiddleware don't pollute the access log.
app.middleware("http")(request_context_middleware)


@app.middleware("http")
async def _expose_request_id(request: Request, call_next):
    response = await call_next(request)
    rid = request_id_var.get()
    if rid:
        response.headers["X-Request-ID"] = rid
    return response

# Rate-limiting (slowapi). Per-route limits are declared via @limiter.limit decorators.
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# Canonical API v1. New code should always use /api/v1/*.
_routers = (auth.router, notes.router, tags.router, tasks.router, steps.router,
            routines.router, focus_sprints.router)
for r in _routers:
    app.include_router(r, prefix="/api/v1")

# Deprecated alias /api/* — kept so already-installed iOS/web clients on the
# old build keep working through the v1 cutover. Hidden from OpenAPI to avoid
# polluting the contract surface; logged with a Deprecation header so we can
# observe and eventually drop it.
for r in _routers:
    app.include_router(r, prefix="/api", include_in_schema=False)


@app.middleware("http")
async def _api_v0_deprecation(request: Request, call_next):
    """Tag /api/* (non-/api/v1/*) responses with Deprecation/Sunset headers
    so clients on the old build see the warning and we can track usage.
    """
    response = await call_next(request)
    p = request.url.path
    if p.startswith("/api/") and not p.startswith("/api/v1/"):
        response.headers["Deprecation"] = "true"
        response.headers["Link"] = '</api/v1/>; rel="successor-version"'
        response.headers["Sunset"] = "Sat, 01 Aug 2026 00:00:00 GMT"
    return response


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    """Catch-all so unhandled exceptions never leak stack traces / SQL / paths
    to the client. The full exception is logged server-side; the client gets
    a sanitized 500.
    """
    logger.exception("Unhandled error on %s %s", request.method, request.url.path)
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})


@app.get("/health/live", tags=["health"])
async def health_live():
    """Liveness probe — the process is up. Always 200 if FastAPI can answer."""
    return {"status": "ok"}


async def _ping_db(db, timeout: float = 2.0) -> tuple[bool, str | None]:
    """Run SELECT 1 with a hard timeout. Returns (ok, error_message)."""
    try:
        async with asyncio.timeout(timeout):
            await db.execute(text("SELECT 1"))
        return True, None
    except Exception as e:
        return False, type(e).__name__


async def _ping_s3(timeout: float = 2.0) -> tuple[bool, str | None]:
    """head_bucket through a thread (boto3 is sync) with a timeout."""
    try:
        client = _get_client()
        async with asyncio.timeout(timeout):
            await asyncio.to_thread(client.head_bucket, Bucket=settings.S3_BUCKET_NAME)
        return True, None
    except (ClientError, Exception) as e:
        return False, type(e).__name__


from fastapi import Depends  # noqa: E402

from app.core.database import get_db  # noqa: E402  (kept here for /health locality)


@app.get("/health/ready", tags=["health"])
async def health_ready(db=Depends(get_db)):
    """Readiness probe — process is ready to serve. 503 if any dependency fails.
    docker-compose's `depends_on: service_healthy` references this.
    """
    db_ok, db_err = await _ping_db(db)
    s3_ok, s3_err = await _ping_s3()
    body: dict = {
        "status": "ok" if (db_ok and s3_ok) else "degraded",
        "checks": {
            "db": {"ok": db_ok, **({"error": db_err} if db_err else {})},
            "s3": {"ok": s3_ok, **({"error": s3_err} if s3_err else {})},
        },
    }
    code = 200 if (db_ok and s3_ok) else 503
    return JSONResponse(status_code=code, content=body)


# Legacy /health alias — kept so existing healthcheck configurations don't break.
@app.get("/health", tags=["health"])
async def health(db=Depends(get_db)):
    return await health_ready(db)
