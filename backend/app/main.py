from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.database import engine
from app.models import *  # noqa: F401, F403
from app.routers import ai, auth, focus_sprints, notes, routines, tags, tasks
from app.services.s3 import ensure_bucket_exists


@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        ensure_bucket_exists()
    except Exception as e:
        print(f"[S3] Warning: could not ensure bucket exists: {e}")
    yield
    await engine.dispose()


app = FastAPI(
    title="Jarvnote API",
    description="Personal knowledge base, tasks, and metrics",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.origins,
    # Native apps run from capacitor://localhost or http://localhost (WKWebView)
    allow_origin_regex=r"^(capacitor|ionic)://localhost$|^http://localhost(:[0-9]+)?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api")
app.include_router(notes.router, prefix="/api")
app.include_router(tags.router, prefix="/api")
app.include_router(tasks.router, prefix="/api")
app.include_router(routines.router, prefix="/api")
app.include_router(focus_sprints.router, prefix="/api")
app.include_router(ai.router, prefix="/api")


@app.get("/health")
async def health():
    return {"status": "ok"}
