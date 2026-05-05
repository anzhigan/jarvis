import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.database import engine
from app.models import *  # noqa: F401, F403
from app.routers import auth, focus_sprints, notes, routines, tags, tasks
from app.services.s3 import ensure_bucket_exists

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

app.include_router(auth.router, prefix="/api")
app.include_router(notes.router, prefix="/api")
app.include_router(tags.router, prefix="/api")
app.include_router(tasks.router, prefix="/api")
app.include_router(routines.router, prefix="/api")
app.include_router(focus_sprints.router, prefix="/api")


@app.get("/health")
async def health():
    return {"status": "ok"}
