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
from datetime import UTC, date as date_cls, datetime, timedelta

from sqlalchemy import and_, distinct, func, or_, select

from app.core.database import AsyncSessionLocal
from app.models.notes import Note, Subsubtopic, Subtopic, Topic, Way
from app.models.tasks import Go, GoEntry
from app.services.ai.cache import (
    SCHEDULE_OVERDUE_WINDOW_DAYS,
    find_cached,
    quiz_cache_key,
    schedule_cache_key,
)
from app.services.ai.jobs import create_job
from app.services.ai.ollama_client import OllamaClient
from app.services.ai.queue import job_queue

logger = logging.getLogger(__name__)

# 04:00 UTC = 07:00 Moscow. Reasonable for the current single-user setup.
# Multi-user future: per-user TZ + spread runs across a window.
PRECOMPUTE_HOUR_UTC = 4

# Default hours used for the auto-generated schedule. Match the frontend default.
DEFAULT_START_H = 9
DEFAULT_END_H = 18

# Quiz precompute knobs. The goal: surface a fresh quiz for notes that have
# been actively edited, without burning the GPU on every keystroke-level edit.
PRECOMPUTE_QUIZ_LOOKBACK_DAYS = 7      # consider only notes touched in this window
PRECOMPUTE_QUIZ_MIN_NOTE_CHARS = 300   # ignore stubby notes — no useful quiz to make
PRECOMPUTE_QUIZ_PER_USER = 5           # cap per nightly run so Ollama isn't pinned for hours
DEFAULT_QUIZ_DIFFICULTY = "medium"
DEFAULT_QUIZ_COUNT = 8


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
        # Users with anything the schedule handler would actually load —
        # mirror its filter exactly: open one-off Gos in the overdue window /
        # today / next 14 days / dateless. Narrow filters here would skip
        # users whose backlog is only overdue or future, then their plan
        # would miss the cache when they open it. (Matches schedule.py.)
        overdue_cutoff = today - timedelta(days=SCHEDULE_OVERDUE_WINDOW_DAYS)
        future_cutoff = today + timedelta(days=14)
        done_subq = select(GoEntry.go_id).where(GoEntry.value > 0).scalar_subquery()
        users_q = await db.execute(
            select(distinct(Go.user_id)).where(
                Go.item_kind == "one_off",
                Go.id.notin_(done_subq),
                or_(
                    Go.due_date.is_(None),
                    Go.due_date == today,
                    and_(Go.due_date < today, Go.due_date >= overdue_cutoff),
                    and_(Go.due_date > today, Go.due_date <= future_cutoff),
                ),
            ),
        )
        user_ids = [row[0] for row in users_q.all()]

    logger.info("precompute: %d users with open Gos for %s", len(user_ids), today)
    for user_id in user_ids:
        try:
            await precompute_schedule_for_user(user_id, today)
        except Exception:  # noqa: BLE001
            logger.exception("precompute: schedule failed for user %s", user_id)

    # ── Quiz precompute: every user that owns at least one Way is a
    # candidate. Per-user we cheaply filter to recently-edited notes inside
    # `precompute_quizzes_for_user`, so a userless / inactive account just
    # exits early without spending Ollama time.
    async with AsyncSessionLocal() as db:
        quiz_users_q = await db.execute(select(distinct(Way.user_id)))
        quiz_user_ids = [row[0] for row in quiz_users_q.all()]

    logger.info("precompute: %d users to check for quiz freshness", len(quiz_user_ids))
    for user_id in quiz_user_ids:
        try:
            await precompute_quizzes_for_user(user_id, today)
        except Exception:  # noqa: BLE001
            logger.exception("precompute: quiz failed for user %s", user_id)


async def precompute_schedule_for_user(user_id: uuid.UUID, target_date) -> None:
    """Generate today's schedule for one user, if not already cached.

    Hands the job to the serial queue so it competes for Ollama capacity on
    equal footing with on-demand user requests instead of running in parallel
    with them. The loop continues to the next user without waiting.
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

    await job_queue.enqueue(job_id)
    logger.info("precompute: schedule queued for user=%s", user_id)


async def precompute_quizzes_for_user(user_id: uuid.UUID, today: date_cls) -> None:
    """Generate quizzes for the user's most recently-edited substantive notes
    that don't already have a cached quiz for their CURRENT content.

    "Significant change" is approximated by:
      - note.updated_at within the last PRECOMPUTE_QUIZ_LOOKBACK_DAYS days,
      - note length above PRECOMPUTE_QUIZ_MIN_NOTE_CHARS,
      - no cached quiz exists at the current content hash.
    The hash check is the real "have we already seen this version" signal —
    if the user only fixed a typo, the hash changes but we still regenerate
    once and then move on. Per-user run cap keeps the night bounded.
    """
    cutoff_dt = datetime.combine(
        today - timedelta(days=PRECOMPUTE_QUIZ_LOOKBACK_DAYS),
        datetime.min.time(),
    ).replace(tzinfo=UTC)

    # Phase 1: pick candidate notes (read-only session).
    # Note ownership flows via Way (directly via way_id, or via topic_id /
    # topic_inline_id → topic.way_id). We do it in two cheap reads: first
    # fetch the user's way + topic ids, then filter notes by inclusion.
    async with AsyncSessionLocal() as db:
        way_ids = list((await db.execute(
            select(Way.id).where(Way.user_id == user_id),
        )).scalars().all())
        topic_ids = list((await db.execute(
            select(Topic.id).join(Way, Topic.way_id == Way.id)
            .where(Way.user_id == user_id),
        )).scalars().all())
        subtopic_ids = list((await db.execute(
            select(Subtopic.id).join(Topic, Subtopic.topic_id == Topic.id)
            .join(Way, Topic.way_id == Way.id).where(Way.user_id == user_id),
        )).scalars().all())
        subsubtopic_ids = list((await db.execute(
            select(Subsubtopic.id).join(Subtopic, Subsubtopic.subtopic_id == Subtopic.id)
            .join(Topic, Subtopic.topic_id == Topic.id)
            .join(Way, Topic.way_id == Way.id).where(Way.user_id == user_id),
        )).scalars().all())
        if not way_ids and not topic_ids:
            return

        notes_q = await db.execute(
            select(Note).where(
                or_(
                    Note.way_id.in_(way_ids),
                    Note.topic_id.in_(topic_ids),
                    Note.topic_inline_id.in_(topic_ids),
                    Note.subtopic_id.in_(subtopic_ids),
                    Note.subtopic_inline_id.in_(subtopic_ids),
                    Note.subsubtopic_id.in_(subsubtopic_ids),
                    Note.subsubtopic_inline_id.in_(subsubtopic_ids),
                ),
                Note.updated_at >= cutoff_dt,
                func.length(Note.content) >= PRECOMPUTE_QUIZ_MIN_NOTE_CHARS,
            )
            .order_by(Note.updated_at.desc())
            # Pull more than needed; many may already be cached and skipped.
            .limit(PRECOMPUTE_QUIZ_PER_USER * 4),
        )
        candidates = list(notes_q.scalars().all())

    if not candidates:
        return

    generated = 0
    for note in candidates:
        if generated >= PRECOMPUTE_QUIZ_PER_USER:
            break
        async with AsyncSessionLocal() as db:
            cache_key = await quiz_cache_key(
                note.id, DEFAULT_QUIZ_DIFFICULTY, DEFAULT_QUIZ_COUNT, db,
            )
            if cache_key is None:
                continue
            cached = await find_cached(cache_key, user_id, "quiz", db)
            if cached is not None:
                continue
            job = await create_job(
                user_id=user_id,
                kind="quiz",
                input_data={
                    "scope": {"kind": "note", "id": str(note.id)},
                    "difficulty": DEFAULT_QUIZ_DIFFICULTY,
                    "count": DEFAULT_QUIZ_COUNT,
                },
                eta_seconds=180,
                cache_key=cache_key,
                db=db,
            )
            await db.commit()
            job_id = job.id

        await job_queue.enqueue(job_id)
        generated += 1
        logger.info(
            "precompute: quiz queued for user=%s note=%s (%d/%d)",
            user_id, note.id, generated, PRECOMPUTE_QUIZ_PER_USER,
        )

    if generated == 0:
        logger.info("precompute: no quiz changes for user=%s", user_id)
