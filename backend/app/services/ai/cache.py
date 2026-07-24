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


# Minimum char length for an "all-notes" quiz fingerprint — match the picker
# threshold inside the quiz handler so the cache key reflects exactly the
# notes that would actually feed the prompt.
QUIZ_ALL_MIN_NOTE_CHARS = 200


async def quiz_all_cache_key(
    user_id: uuid.UUID,
    difficulty: str,
    count: int,
    db: AsyncSession,
    only_ids: list[uuid.UUID] | None = None,
) -> str | None:
    """Cache key for an "all notes" / "multi notes" quiz. Depends on the
    user's substantive notes (id + length + short content hash). When
    `only_ids` is set, the fingerprint covers just that subset — picking the
    exact same set with the same params hits the cache."""
    from sqlalchemy import func
    from app.models.notes import Note, Subsubtopic, Subtopic, Topic, Way

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
        return None

    stmt = select(Note.id, Note.name, Note.content).where(
        or_(
            Note.way_id.in_(way_ids),
            Note.topic_id.in_(topic_ids),
            Note.topic_inline_id.in_(topic_ids),
            Note.subtopic_id.in_(subtopic_ids),
            Note.subtopic_inline_id.in_(subtopic_ids),
            Note.subsubtopic_id.in_(subsubtopic_ids),
            Note.subsubtopic_inline_id.in_(subsubtopic_ids),
        ),
        func.length(Note.content) >= QUIZ_ALL_MIN_NOTE_CHARS,
    )
    if only_ids is not None:
        stmt = stmt.where(Note.id.in_(only_ids))
    stmt = stmt.order_by(Note.id)
    rows = list((await db.execute(stmt)).all())
    if not rows:
        return None
    sig = "|".join(
        f"{nid}:{len(content or '')}:{_short_hash((name or '') + (content or ''))}"
        for (nid, name, content) in rows
    )
    scope_prefix = "multi" if only_ids is not None else "all"
    return f"quiz:{scope_prefix}:{user_id}:{difficulty}:{count}:{_short_hash(sig)}"


async def schedule_cache_key(
    user_id: uuid.UUID,
    target_date: date_cls,
    start_h: int,
    end_h: int,
    time_blocked: bool,
    db: AsyncSession,
) -> str:
    """Cache key for a day's schedule. Depends on every Go that would feed
    into the prompt — the whole open one-off backlog (overdue + today + future
    + dateless), plus time_blocked mode. Step membership/position is included
    so adding/changing a Step relationship invalidates the cache."""
    from app.models.tasks import GoEntry

    future_cutoff = target_date + timedelta(days=14)
    overdue_cutoff = target_date - timedelta(days=SCHEDULE_OVERDUE_WINDOW_DAYS)

    done_subq = select(GoEntry.go_id).where(GoEntry.value > 0).scalar_subquery()
    backlog_q = await db.execute(
        select(Go).where(
            Go.user_id == user_id,
            Go.item_kind == "one_off",
            Go.id.notin_(done_subq),
            or_(
                Go.due_date.is_(None),
                Go.due_date == target_date,
                (Go.due_date < target_date) & (Go.due_date >= overdue_cutoff),
                (Go.due_date > target_date) & (Go.due_date <= future_cutoff),
            ),
        ).order_by(Go.id),
    )
    backlog_signature = [
        f"{g.id}|{g.title}|{g.due_date.isoformat() if g.due_date else 'none'}|{g.step_id or 'no-step'}"
        for g in backlog_q.scalars().all()
    ]
    fingerprint = json.dumps({"backlog": backlog_signature}, ensure_ascii=False, sort_keys=True)
    mode = "t" if time_blocked else "f"
    return f"schedule:{user_id}:{target_date}:{start_h}-{end_h}:{mode}:{_short_hash(fingerprint)}"


async def insights_cache_key(
    user_id: uuid.UUID,
    window_start: date_cls,
    window_end: date_cls,
    db: AsyncSession,
) -> str:
    """Cache key for insights. Depends on metrics that would feed into the LLM
    — any user activity within the window (new Gos, GoEntries, Notes) invalidates
    the cache, but a passive day produces an identical fingerprint."""
    from datetime import datetime as _dt
    from sqlalchemy import func
    from app.models.notes import Note, Way
    from app.models.tasks import GoEntry, Task

    week_start = window_start
    week_end = window_end
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

    days = (week_end - week_start).days + 1
    fingerprint = f"{gos_count}|{entries_count}|{notes_count}|{active_goals_count}"
    return f"insights:{user_id}:{week_start.isoformat()}:{days}d:{_short_hash(fingerprint)}"


async def coach_cache_key(
    user_id: uuid.UUID,
    window_start: date_cls,
    window_end: date_cls,
    db: AsyncSession,
) -> str:
    """Cache key for coach. Similar to insights but ALSO includes near-future
    state (due date counts in the next 7 days) so coach output invalidates
    when something newly becomes due — not just when something happens."""
    from datetime import datetime as _dt
    from datetime import timedelta as _td
    from sqlalchemy import func
    from app.models.tasks import GoEntry, Task

    today = window_end  # treat the right edge of window as "today"
    soon = today + _td(days=7)
    window_start_dt = _dt.combine(window_start, _dt.min.time())
    window_end_dt = _dt.combine(window_end, _dt.max.time())

    entries_count = (await db.execute(
        select(func.count()).select_from(GoEntry).join(Go, GoEntry.go_id == Go.id).where(
            Go.user_id == user_id,
            GoEntry.date >= window_start,
            GoEntry.date <= window_end,
        ),
    )).scalar_one()

    gos_due_soon = (await db.execute(
        select(func.count()).select_from(Go).where(
            Go.user_id == user_id,
            Go.due_date.isnot(None),
            Go.due_date >= today,
            Go.due_date <= soon,
        ),
    )).scalar_one()

    gos_created = (await db.execute(
        select(func.count()).select_from(Go).where(
            Go.user_id == user_id,
            Go.created_at >= window_start_dt,
            Go.created_at <= window_end_dt,
        ),
    )).scalar_one()

    active_goals = (await db.execute(
        select(func.count()).select_from(Task).where(
            Task.user_id == user_id, Task.status == "active",
        ),
    )).scalar_one()

    days = (window_end - window_start).days + 1
    fingerprint = f"{entries_count}|{gos_due_soon}|{gos_created}|{active_goals}"
    return f"coach:{user_id}:{window_end.isoformat()}:{days}d:{_short_hash(fingerprint)}"


async def goal_plan_cache_key(
    user_id: uuid.UUID,
    goal_id: uuid.UUID,
    mode: str,
    db: AsyncSession,
) -> str:
    """Cache key for goal_plan. Invalidates when the goal's window changes,
    when its steps count changes, or when goals around it shift load (we
    surface the global active-goal count so re-planning after adding a new
    goal proposes different dates)."""
    from sqlalchemy import func
    from app.models.tasks import Step, Task

    goal_q = await db.execute(
        select(Task.start_date, Task.due_date)
        .where(Task.id == goal_id, Task.user_id == user_id),
    )
    row = goal_q.first()
    g_start = (row[0].isoformat() if row and row[0] else "")
    g_due   = (row[1].isoformat() if row and row[1] else "")

    steps_count = (await db.execute(
        select(func.count()).select_from(Step).where(
            Step.user_id == user_id, Step.goal_id == goal_id,
        ),
    )).scalar_one()

    # Orphan gos = attached to this goal but with no step. Their count
    # belongs in the fingerprint so adding/removing one invalidates the
    # cached plan (otherwise dates_only with only orphan-gos would reuse
    # a stale empty-steps cache entry).
    orphan_gos_count = (await db.execute(
        select(func.count()).select_from(Go).where(
            Go.user_id == user_id,
            Go.task_id == goal_id,
            Go.step_id.is_(None),
        ),
    )).scalar_one()

    other_active = (await db.execute(
        select(func.count()).select_from(Task).where(
            Task.user_id == user_id,
            Task.status == "active",
            Task.id != goal_id,
        ),
    )).scalar_one()

    fingerprint = (
        f"{g_start}|{g_due}|{steps_count}|{orphan_gos_count}|{other_active}|{mode}"
    )
    return f"goal_plan:{user_id}:{goal_id}:{_short_hash(fingerprint)}"


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
