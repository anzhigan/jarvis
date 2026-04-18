from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.database import engine
from app.models import *  # noqa: F401, F403 — import all models for Alembic
from app.routers import auth, metrics, notes, tasks
from app.services.s3 import ensure_bucket_exists


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    try:
        ensure_bucket_exists()
    except Exception as e:
        print(f"[S3] Warning: could not ensure bucket exists: {e}")
    yield
    # Shutdown
    await engine.dispose()


app = FastAPI(
    title="Knowledge Base & Task Manager API",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api")
app.include_router(notes.router, prefix="/api")
app.include_router(tasks.router, prefix="/api")
app.include_router(metrics.router, prefix="/api")


@app.get("/health")
async def health():
    return {"status": "ok"}
