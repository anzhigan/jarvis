"""AI feature endpoints — generic job queue surface.

Per-feature endpoints (quiz, tasks_extract, schedule, insights) build on
top of this: they validate their input shape, then call `create_job` with
the appropriate kind. The polling and history endpoints below are shared
across all features.

Auth: every endpoint requires the bearer token. Users can only see their
own jobs.

Ollama health: enqueue is gated by `OllamaClient.health()` so we fail fast
with 503 instead of queuing jobs that will all fail downstream.
"""
import uuid

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.ai import AIJob
from app.models.user import User
from app.schemas.ai import AIJobBrief, AIJobCreate, AIJobOut
from app.services.ai.jobs import (
    cancel_job,
    create_job,
    list_recent_jobs,
    run_job,
    supported_kinds,
)
from app.services.ai.ollama_client import OllamaClient

router = APIRouter(prefix="/ai", tags=["ai"])


@router.get("/health")
async def ai_health() -> dict:
    """Reports whether the local AI runtime is reachable. Used by the
    frontend to show 'AI offline' state before letting the user try."""
    async with OllamaClient() as ollama:
        ok = await ollama.health()
    return {"ok": ok, "kinds": supported_kinds()}


@router.post("/jobs", response_model=AIJobOut, status_code=status.HTTP_202_ACCEPTED)
async def enqueue_job(
    body: AIJobCreate,
    background_tasks: BackgroundTasks,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Enqueue an AI job. Returns immediately with the job in 'queued'
    status. Client polls GET /ai/jobs/{id} for status + output.

    Returns 503 if the AI runtime is unreachable so the user isn't left
    waiting on a job that will never complete.
    """
    # Health gate. If Ollama can't even respond to /api/tags, the job won't
    # succeed — better to surface that now.
    async with OllamaClient() as ollama:
        if not await ollama.health():
            raise HTTPException(
                status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="AI runtime is offline. Try again in a moment.",
            )

    try:
        job = await create_job(
            user_id=user.id,
            kind=body.kind,
            input_data=body.input,
            eta_seconds=_estimate_eta(body.kind, body.input),
            db=db,
        )
    except ValueError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=str(e)) from e

    background_tasks.add_task(run_job, job.id)
    return job


@router.get("/jobs/{job_id}", response_model=AIJobOut)
async def get_job(
    job_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Status + output (if completed) for a single job."""
    job = await db.get(AIJob, job_id)
    if job is None or job.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="job not found")
    return job


@router.get("/jobs", response_model=list[AIJobBrief])
async def list_jobs(
    kind: str | None = Query(default=None, description="filter by kind"),
    limit: int = Query(default=30, ge=1, le=100),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Recent jobs for the current user. Used for sidebar history."""
    return await list_recent_jobs(user_id=user.id, db=db, kind=kind, limit=limit)


@router.post("/jobs/{job_id}/cancel", response_model=AIJobOut)
async def cancel(
    job_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Best-effort cancel. Queued jobs become 'cancelled' immediately.
    Running jobs aren't preempted but their output will be discarded by
    the UI based on the status flag."""
    job = await cancel_job(job_id, user.id, db)
    if job is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="job not found")
    return job


def _estimate_eta(kind: str, input_data: dict) -> int:
    """Best-guess ETA for the loading UI. Tunes per kind."""
    # Tuned for Qwen 3 8B q4_K_M on 8 vCPU (~5 tok/s). Will get more
    # accurate as we measure real production runs.
    return {
        "quiz": 45,            # 8-14 questions ≈ 500-900 tokens
        "tasks_extract": 30,   # short structured output ≈ 300 tokens
        "schedule": 35,        # 10 slots ≈ 400 tokens
        "insights": 60,        # narrative reasoning ≈ 600-1000 tokens
    }.get(kind, 60)
