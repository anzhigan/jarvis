"""Cache-key computation for AI features.

A cache_key is a deterministic content-fingerprint of a job's *inputs*:
if the same user re-requests the same generation and nothing meaningful
has changed, the key matches and we return the prior result.

Design notes:
  - We use SHA-256 truncated to 16 hex chars (~64 bits). Collision risk for
    a single user's job history is effectively zero.
  - The key shape is human-readable for debugging: `<kind>:<refs>:<hash>`.
  - We DO load the relevant DB rows (note content, today's gos) here. This
    is wasted work on a cache miss (handler reloads), but cheap relative to
    the LLM call we're trying to avoid.

Invalidation is automatic: any change to the source data flips the hash,
so future requests miss and re-compute.
"""
import hashlib
import json
import uuid
from datetime import date as date_cls, timedelta

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.ai import AIJob
from app.models.notes import Note
from app.models.tasks import Go


# How far back overdue items influence the schedule fingerprint. Must match
# OVERDUE_WINDOW_DAYS in services/ai/schedule.py — keep both in sync.
SCHEDULE_OVERDUE_WINDOW_DAYS = 30


def _short_hash(text: str) -> str:
    """16-hex-char SHA-256 prefix — enough collision resistance for per-user history."""
    return hashlib.sha256(text.encode("utf-8")).hexdigest()[:16]


async def quiz_cache_key(
    note_id: uuid.UUID,
    difficulty: str,
    count: int,
    db: AsyncSession,
) -> str | None:
    """Cache key for a single-note quiz. Returns None if the note doesn't exist."""
    note = await db.get(Note, note_id)
    if note is None:
        return None
    body = (note.name or "") + "\n" + (note.content or "")
    return f"quiz:{note_id}:{difficulty}:{count}:{_short_hash(body)}"


async def tasks_extract_cache_key(note_id: uuid.UUID, db: AsyncSession) -> str | None:
    """Cache key for tasks-extract on a single note."""
    note = await db.get(Note, note_id)
    if note is None:
        return None
    body = (note.name or "") + "\n" + (note.content or "")
    return f"tasks:{note_id}:{_short_hash(body)}"


async def schedule_cache_key(
    user_id: uuid.UUID,
    target_date: date_cls,
    start_h: int,
    end_h: int,
    db: AsyncSession,
) -> str:
    """Cache key for a day's schedule. Depends on every Go that would feed
    into the prompt — today's dated items, dateless backlog, and overdue."""
    # Today + dateless (schedule input)
    today_q = await db.execute(
        select(Go).where(
            Go.user_id == user_id,
            or_(Go.due_date == target_date, Go.due_date.is_(None)),
        ).order_by(Go.id),
    )
    today_signature = [
        f"{g.id}|{g.title}|{g.due_date.isoformat() if g.due_date else 'none'}"
        for g in today_q.scalars().all()
    ]

    # Overdue (narrative input)
    overdue_q = await db.execute(
        select(Go).where(
            Go.user_id == user_id,
            Go.due_date.isnot(None),
            Go.due_date < target_date,
            Go.due_date >= target_date - timedelta(days=SCHEDULE_OVERDUE_WINDOW_DAYS),
        ).order_by(Go.id),
    )
    overdue_signature = [str(g.id) for g in overdue_q.scalars().all()]

    fingerprint = json.dumps(
        {"today": today_signature, "overdue": overdue_signature},
        ensure_ascii=False,
        sort_keys=True,
    )
    return f"schedule:{user_id}:{target_date}:{start_h}-{end_h}:{_short_hash(fingerprint)}"


async def insights_cache_key(
    user_id: uuid.UUID,
    week_start: date_cls,
    db: AsyncSession,
) -> str:
    """Cache key for weekly insights. Depends on metrics that would feed into
    the LLM — so any user activity within the week (new Gos, GoEntries, Notes)
    invalidates the cache, but a passive day produces an identical fingerprint."""
    from datetime import datetime as _dt
    from sqlalchemy import func
    from app.models.notes import Note, Way
    from app.models.tasks import GoEntry, Task

    week_end = week_start + timedelta(days=6)
    week_start_dt = _dt.combine(week_start, _dt.min.time())
    week_end_dt = _dt.combine(week_end, _dt.max.time())

    gos_count = (await db.execute(
        select(func.count()).select_from(Go).where(
            Go.user_id == user_id,
            Go.created_at >= week_start_dt,
            Go.created_at <= week_end_dt,
        ),
    )).scalar_one()

    entries_count = (await db.execute(
        select(func.count()).select_from(GoEntry).join(Go, GoEntry.go_id == Go.id).where(
            Go.user_id == user_id,
            GoEntry.date >= week_start,
            GoEntry.date <= week_end,
        ),
    )).scalar_one()

    notes_count = (await db.execute(
        select(func.count(Note.id)).outerjoin(Way, Note.way_id == Way.id).where(
            Note.created_at >= week_start_dt,
            Note.created_at <= week_end_dt,
            Way.user_id == user_id,
        ),
    )).scalar_one()

    active_goals_count = (await db.execute(
        select(func.count()).select_from(Task).where(
            Task.user_id == user_id, Task.status == "active",
        ),
    )).scalar_one()

    fingerprint = f"{gos_count}|{entries_count}|{notes_count}|{active_goals_count}"
    return f"insights:{user_id}:{week_start.isoformat()}:{_short_hash(fingerprint)}"


async def find_cached(
    cache_key: str,
    user_id: uuid.UUID,
    kind: str,
    db: AsyncSession,
) -> AIJob | None:
    """Return the most recent done-job with the same cache_key, or None."""
    stmt = (
        select(AIJob)
        .where(
            AIJob.cache_key == cache_key,
            AIJob.user_id == user_id,
            AIJob.kind == kind,
            AIJob.status == "done",
        )
        .order_by(AIJob.finished_at.desc())
        .limit(1)
    )
    result = await db.execute(stmt)
    return result.scalar_one_or_none()
