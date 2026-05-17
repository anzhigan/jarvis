"""In-process serial job queue for AI generations.

Why serial: there's exactly one Ollama runtime on a CPU-only host. Letting
FastAPI fire BackgroundTasks in parallel just stacks requests on Ollama's
internal queue with no visibility and no way to reorder/cancel. This module
makes the queue explicit: one job at a time, FIFO, with real preemption.

Lifecycle:
  - `job_queue.start()` spawns a long-running worker task (boot, in lifespan).
  - Routers call `await job_queue.enqueue(job_id)` instead of BackgroundTasks.
  - Worker pulls one id at a time, runs the handler via `run_job` inside an
    asyncio.Task it can `.cancel()` on demand.
  - `await job_queue.cancel(job_id)` either preempts the running task or
    removes the id from the pending queue. Both paths also flip the DB row
    to status='cancelled' so the UI sees the new state immediately.

Preemption mechanics:
  Cancelling the asyncio.Task that's awaiting httpx → httpx closes the TCP
  connection to Ollama → Ollama sees client-disconnect and aborts the in-flight
  generation. The model stays loaded; the next queued job starts right away.
"""
import asyncio
import logging
import uuid
from collections import deque
from datetime import UTC, datetime

from app.core.database import AsyncSessionLocal
from app.models.ai import AIJob
from app.services.ai.jobs import run_job

logger = logging.getLogger(__name__)


class _JobQueue:
    def __init__(self) -> None:
        # `deque` instead of asyncio.Queue so we can scan + remove arbitrary
        # ids when the user cancels a still-pending job.
        self._pending: deque[uuid.UUID] = deque()
        self._signal = asyncio.Event()
        self._lock = asyncio.Lock()
        self._current_task: asyncio.Task | None = None
        self._current_job_id: uuid.UUID | None = None
        self._worker_task: asyncio.Task | None = None

    async def enqueue(self, job_id: uuid.UUID) -> None:
        async with self._lock:
            self._pending.append(job_id)
            self._signal.set()
        logger.info("queue: enqueued %s (pending=%d)", job_id, len(self._pending))

    async def cancel(self, job_id: uuid.UUID) -> str:
        """Returns the location the job was found in: 'running' | 'pending'
        | 'unknown'. 'unknown' covers cases where the job already finished
        or was never queued through this worker."""
        async with self._lock:
            # Hot path: this is the currently-running job.
            if self._current_job_id == job_id and self._current_task is not None:
                if not self._current_task.done():
                    self._current_task.cancel()
                return "running"
            # Cold path: still waiting in the deque.
            if job_id in self._pending:
                self._pending.remove(job_id)
                logger.info("queue: removed pending %s", job_id)
                return "pending"
        return "unknown"

    def position(self, job_id: uuid.UUID) -> int | None:
        """0 = running, 1 = next, etc. None = not in queue."""
        if self._current_job_id == job_id:
            return 0
        try:
            idx = list(self._pending).index(job_id)
            return idx + 1
        except ValueError:
            return None

    def snapshot(self) -> dict:
        """Lightweight introspection — used by health endpoint / debugging."""
        return {
            "current": str(self._current_job_id) if self._current_job_id else None,
            "pending": [str(j) for j in self._pending],
            "depth": len(self._pending) + (1 if self._current_job_id else 0),
        }

    async def _mark_cancelled(self, job_id: uuid.UUID, reason: str) -> None:
        async with AsyncSessionLocal() as db:
            job = await db.get(AIJob, job_id)
            if job is None or job.status in {"done", "failed", "cancelled"}:
                return
            job.status = "cancelled"
            job.error = reason
            job.finished_at = datetime.now(UTC)
            await db.commit()

    async def _worker(self) -> None:
        logger.info("queue: worker started")
        while True:
            # Wait for work. Releases the lock while sleeping.
            await self._signal.wait()
            async with self._lock:
                if not self._pending:
                    self._signal.clear()
                    continue
                job_id = self._pending.popleft()
                if not self._pending:
                    self._signal.clear()
                self._current_job_id = job_id
                self._current_task = asyncio.create_task(
                    run_job(job_id), name=f"ai_run_job:{job_id}",
                )
                task = self._current_task

            try:
                await task
            except asyncio.CancelledError:
                # User-initiated preemption (see cancel()). run_job swallows
                # the exception's effects on its own session, but the DB row
                # is left in 'running' — write 'cancelled' here.
                await self._mark_cancelled(job_id, "cancelled by user")
                logger.info("queue: job %s cancelled mid-run", job_id)
            except Exception:  # noqa: BLE001 — worker must not die on a single bad job
                logger.exception("queue: worker exception for %s", job_id)
            finally:
                async with self._lock:
                    self._current_job_id = None
                    self._current_task = None

    def start(self) -> None:
        if self._worker_task is None or self._worker_task.done():
            self._worker_task = asyncio.create_task(self._worker(), name="ai_queue_worker")

    async def stop(self) -> None:
        if self._worker_task and not self._worker_task.done():
            self._worker_task.cancel()
            try:
                await self._worker_task
            except asyncio.CancelledError:
                pass
        self._worker_task = None


# Module-level singleton — one queue per process. Don't construct elsewhere.
job_queue = _JobQueue()
