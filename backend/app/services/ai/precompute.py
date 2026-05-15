"""Background pre-computation of AI results.

Why: AI generation is slow on CPU (~3 min/quiz, ~1 min/schedule on 8B). If we
pre-compute the predictable daily artefacts (today's schedule) overnight,
user opens Goals in the morning and sees an instant cached result.

What we pre-compute (Phase 8):
  - Today's schedule for every user that has open Gos.

Future (Phase 9+):
  - Weekly insights every Friday
  - Quiz on recently-edited notes ~5 min after the last edit

When: once per day at PRECOMPUTE_HOUR_UTC. With UTC=04:00 we hit ~07:00
Moscow / ~04:00 London / ~23:00 PST.

Failure isolation: per-user errors are caught and logged. A single broken
generation doesn't abort the run for everyone else.
"""
import asyncio
import logging
import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import distinct, or_, select

from app.core.database import AsyncSessionLocal
from app.models.tasks import Go
from app.services.ai.cache import find_cached, schedule_cache_key
from app.services.ai.jobs import create_job, run_job
from app.services.ai.ollama_client import OllamaClient

logger = logging.getLogger(__name__)

# 04:00 UTC = 07:00 Moscow. Reasonable for the current single-user setup.
# Multi-user future: per-user TZ + spread runs across a window.
PRECOMPUTE_HOUR_UTC = 4

# Default hours used for the auto-generated schedule. Match the frontend default.
DEFAULT_START_H = 9
DEFAULT_END_H = 18


async def precompute_loop() -> None:
    """Long-running asyncio task. Sleeps until next PRECOMPUTE_HOUR_UTC, then runs."""
    while True:
        try:
            now = datetime.now(UTC)
            target = now.replace(
                hour=PRECOMPUTE_HOUR_UTC, minute=0, second=0, microsecond=0,
            )
            if target <= now:
                target += timedelta(days=1)
            sleep_s = (target - now).total_seconds()
            logger.info(
                "precompute: sleeping %.0fs until next run at %s",
                sleep_s, target.isoformat(),
            )
            await asyncio.sleep(sleep_s)
            await run_daily_precompute()
        except asyncio.CancelledError:
            logger.info("precompute: loop cancelled, exiting")
            raise
        except Exception:  # noqa: BLE001 — last-line catch, must not propagate
            logger.exception("precompute: loop iteration failed; sleeping 1h then retry")
            await asyncio.sleep(3600)


async def run_daily_precompute() -> None:
    """One pass: find active users, pre-compute today's schedule for each."""
    # Health gate: if ollama is down, skip this run entirely.
    async with OllamaClient() as ollama:
        if not await ollama.health():
            logger.warning("precompute: ollama unhealthy, skipping today's run")
            return

    today = datetime.now(UTC).date()

    async with AsyncSessionLocal() as db:
        # Users with any schedulable Go: dated-today or dateless backlog.
        users_q = await db.execute(
            select(distinct(Go.user_id)).where(
                or_(Go.due_date == today, Go.due_date.is_(None)),
            ),
        )
        user_ids = [row[0] for row in users_q.all()]

    logger.info("precompute: %d users with open Gos for %s", len(user_ids), today)
    for user_id in user_ids:
        try:
            await precompute_schedule_for_user(user_id, today)
        except Exception:  # noqa: BLE001
            logger.exception("precompute: failed for user %s", user_id)


async def precompute_schedule_for_user(user_id: uuid.UUID, target_date) -> None:
    """Generate today's schedule for one user, if not already cached.

    Synchronous from the loop's perspective — we await run_job rather than
    scheduling a BackgroundTask. The loop runs at night, so blocking is fine.
    """
    async with AsyncSessionLocal() as db:
        # Default to time-blocked schedule for the morning precompute — most
        # users want a structured plan to land into.
        cache_key = await schedule_cache_key(
            user_id, target_date, DEFAULT_START_H, DEFAULT_END_H, True, db,
        )
        cached = await find_cached(cache_key, user_id, "schedule", db)
        if cached is not None:
            logger.info("precompute: schedule already cached for user=%s", user_id)
            return

        job = await create_job(
            user_id=user_id,
            kind="schedule",
            input_data={
                "date": target_date.isoformat(),
                "hours": {"start_h": DEFAULT_START_H, "end_h": DEFAULT_END_H},
                "prefs": [],
                "time_blocked": True,
            },
            eta_seconds=120,
            cache_key=cache_key,
            db=db,
        )
        await db.commit()
        job_id = job.id

    # Run the job synchronously — opens its own DB session inside.
    await run_job(job_id)
    logger.info("precompute: schedule done for user=%s", user_id)
