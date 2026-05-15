"""Generic AI job queue + dispatcher.

Design:
  - Handler registry: kind → async fn(job, db, ollama) → dict (the output).
  - `enqueue` writes a row, returns the id, and schedules `run_job` as a
    FastAPI BackgroundTask. The task opens its own DB session.
  - `run_job` flips status to 'running', dispatches to the handler, then
    flips to 'done' (with output) or 'failed' (with error). Either way the
    transition is committed.
  - Handlers are added by Phase 3+ (quiz, tasks_extract, schedule, insights)
    via `@register_handler("kind")` decorator.

Why no Redis/Celery yet:
  Single-user / low-volume workload. FastAPI BackgroundTasks keep this in
  one process — losing jobs across restarts is rare and acceptable. When
  we hit limits (multi-user, durability needs), swap to arq/Celery and
  keep this API unchanged.

Failure modes handled:
  - Ollama unreachable → status=failed, error="AI runtime is offline".
  - Handler raises → status=failed with the exception string.
  - Cancelled mid-run → we *don't* preempt the task; cancel is a hint, the
    handler checks `job.status` on next yield point (handlers usually run
    a single long ollama call, so cancel mostly affects queued jobs).
"""
import logging
import uuid
from datetime import UTC, datetime
from typing import Any, Awaitable, Callable

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import AsyncSessionLocal
from app.models.ai import AIJob
from app.services.ai.ollama_client import OllamaClient, OllamaError

logger = logging.getLogger(__name__)


# Signature: handler(job, db, ollama) → output dict
JobHandler = Callable[[AIJob, AsyncSession, OllamaClient], Awaitable[dict[str, Any]]]

_HANDLERS: dict[str, JobHandler] = {}


def register_handler(kind: str) -> Callable[[JobHandler], JobHandler]:
    """Decorator to register a handler for a given job kind.

        @register_handler("quiz")
        async def run_quiz(job, db, ollama):
            ...
            return {"questions": [...]}
    """
    def decorator(fn: JobHandler) -> JobHandler:
        if kind in _HANDLERS:
            raise RuntimeError(f"Duplicate handler registration for kind={kind!r}")
        _HANDLERS[kind] = fn
        return fn
    return decorator


def supported_kinds() -> list[str]:
    return sorted(_HANDLERS.keys())


async def create_job(
    user_id: uuid.UUID,
    kind: str,
    input_data: dict[str, Any],
    eta_seconds: int | None,
    db: AsyncSession,
) -> AIJob:
    """Insert a queued job row. Caller must commit (or rely on get_db's commit)."""
    if kind not in _HANDLERS:
        raise ValueError(f"unknown job kind: {kind!r}")
    job = AIJob(
        user_id=user_id,
        kind=kind,
        status="queued",
        input_json=input_data,
        eta_seconds=eta_seconds,
    )
    db.add(job)
    await db.flush()
    await db.refresh(job)
    return job


async def run_job(job_id: uuid.UUID) -> None:
    """Execute a job by id. Designed to be called from BackgroundTasks.

    Opens its own DB session — request-scoped session is closed by the time
    BackgroundTasks run.
    """
    async with AsyncSessionLocal() as db:
        job = await db.get(AIJob, job_id)
        if job is None:
            logger.warning("run_job: job %s not found", job_id)
            return
        if job.status != "queued":
            # Could be re-queued, cancelled, or already running — don't double-process.
            logger.info("run_job: skipping %s (status=%s)", job_id, job.status)
            return

        handler = _HANDLERS.get(job.kind)
        if handler is None:
            await _mark_failed(db, job, f"no handler for kind {job.kind!r}")
            return

        job.status = "running"
        job.started_at = datetime.now(UTC)
        await db.commit()

        try:
            async with OllamaClient() as ollama:
                output = await handler(job, db, ollama)
        except OllamaError as e:
            await _mark_failed(db, job, f"AI runtime error: {e}")
            return
        except Exception as e:  # noqa: BLE001 — last-line catch, must not propagate
            logger.exception("run_job: handler %s raised", job.kind)
            await _mark_failed(db, job, f"{type(e).__name__}: {e}")
            return

        job.status = "done"
        job.output_json = output
        job.finished_at = datetime.now(UTC)
        await db.commit()
        logger.info("run_job: %s kind=%s done", job_id, job.kind)


async def _mark_failed(db: AsyncSession, job: AIJob, error: str) -> None:
    job.status = "failed"
    job.error = error
    job.finished_at = datetime.now(UTC)
    await db.commit()
    logger.warning("run_job: %s failed: %s", job.id, error)


async def list_recent_jobs(
    user_id: uuid.UUID,
    db: AsyncSession,
    kind: str | None = None,
    limit: int = 30,
) -> list[AIJob]:
    stmt = (
        select(AIJob)
        .where(AIJob.user_id == user_id)
        .order_by(AIJob.created_at.desc())
        .limit(limit)
    )
    if kind:
        stmt = stmt.where(AIJob.kind == kind)
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def cancel_job(job_id: uuid.UUID, user_id: uuid.UUID, db: AsyncSession) -> AIJob | None:
    """Best-effort cancel. Sets status=cancelled if currently queued.

    Jobs already running aren't preempted — they keep running but the result
    will be discarded by the UI based on this status flag.
    """
    job = await db.get(AIJob, job_id)
    if job is None or job.user_id != user_id:
        return None
    if job.status in {"done", "failed", "cancelled"}:
        return job
    job.status = "cancelled"
    job.finished_at = datetime.now(UTC)
    await db.commit()
    return job
