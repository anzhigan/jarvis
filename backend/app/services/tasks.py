"""Business logic for the Tasks (Goal) domain.

This module owns:
  • status normalization + validation constants
  • progress / completion calculations (pure, deterministic, unit-testable)
  • DB loaders for Task / Go entities

Routers stay thin: parse request → call a service function → return.
"""
import uuid
from datetime import date as date_cls

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.tasks import Go, Task
from app.models.user import User

# ─── Vocabularies ────────────────────────────────────────────────────────────

# Old client builds may still send legacy names; we accept and normalize them.
VALID_STATUSES = {"backlog", "active", "paused", "done",
                  "todo", "in_progress", "background"}
VALID_PRIORITIES = {"low", "medium", "high"}
VALID_GO_KINDS = {"boolean", "numeric"}
VALID_RECURRENCE = {"none", "daily", "weekly"}

_STATUS_MIGRATION = {
    "todo": "backlog",
    "in_progress": "active",
    "background": "active",
}


def normalize_status(s: str) -> str:
    """Map old status names → canonical new ones."""
    return _STATUS_MIGRATION.get(s, s)


# ─── Loaders ─────────────────────────────────────────────────────────────────

def task_eager_options():
    """Eager-load the relationship tree we always need to render a Task.
    Centralized so endpoints don't drift on what's preloaded.
    """
    from app.models.tasks import GoalRoutineLink, Routine
    return (
        selectinload(Task.gos).selectinload(Go.entries),
        selectinload(Task.tags),
        selectinload(Task.routine_links)
            .selectinload(GoalRoutineLink.routine)
            .selectinload(Routine.entries),
        selectinload(Task.steps),
    )


async def get_task_or_404(task_id: uuid.UUID, user: User, db: AsyncSession) -> Task:
    r = await db.execute(
        select(Task)
        .where(Task.id == task_id, Task.user_id == user.id)
        .options(*task_eager_options()),
    )
    t = r.scalar_one_or_none()
    if not t:
        raise HTTPException(404, "Task not found")
    return t


async def get_go_or_404(go_id: uuid.UUID, user: User, db: AsyncSession) -> Go:
    r = await db.execute(
        select(Go)
        .where(Go.id == go_id, Go.user_id == user.id)
        .options(selectinload(Go.entries), selectinload(Go.task)),
    )
    g = r.scalar_one_or_none()
    if not g:
        raise HTTPException(404, "Go not found")
    return g


async def get_step_or_404(step_id: uuid.UUID, user: User, db: AsyncSession):
    """Load a Step ensuring the requesting user owns it."""
    from app.models.tasks import Step
    r = await db.execute(
        select(Step).where(Step.id == step_id, Step.user_id == user.id),
    )
    s = r.scalar_one_or_none()
    if not s:
        raise HTTPException(404, "Step not found")
    return s


VALID_STEP_STATUSES = {"not_started", "in_progress", "done"}


# ─── Pure progress helpers (no DB, no HTTP — unit-testable) ──────────────────

def is_go_done_today(go: Go, today: date_cls | None = None) -> bool:
    """For boolean: has an entry with value>0 for today.
    For numeric one-off: cumulative total_value >= target_value.
    For numeric recurring: today's value >= target_value.
    """
    today = today or date_cls.today()
    if go.kind == "boolean":
        return any(e.value > 0 and e.date == today for e in go.entries)
    target = go.target_value or 0
    if go.recurrence == "none":
        total = sum(e.value for e in go.entries)
        return target > 0 and total >= target
    today_val = next((e.value for e in go.entries if e.date == today), 0)
    return target > 0 and today_val >= target


def go_total_value(go: Go) -> float:
    return sum(e.value for e in go.entries)


def go_completion_ratio(
    g: Go,
    period_start: date_cls | None = None,
    period_end: date_cls | None = None,
) -> float:
    """Returns 0.0..1.0 — how complete this Go is.

    Recurring boolean (daily/weekly): done-days ÷ possible-days within window.
    One-off boolean: 1.0 if any positive entry, else 0.0.
    Numeric: min(1.0, sum(entries) / target). 1.0 if target unset and any entry.
    """
    today = date_cls.today()

    if g.kind == "boolean" and g.recurrence in ("daily", "weekly"):
        start = g.created_at.date() if g.created_at else today
        if period_start and period_start > start:
            start = period_start
        end = today
        if g.due_date and g.due_date < end:
            end = g.due_date
        if period_end and period_end < end:
            end = period_end
        if end < start:
            return 0.0
        possible_days = (end - start).days + 1
        if possible_days <= 0:
            return 0.0
        if g.recurrence == "weekly":
            possible_weeks = max(1, (possible_days + 6) // 7)
            seen_weeks = set()
            for e in g.entries:
                if e.value > 0 and start <= e.date <= end:
                    seen_weeks.add((e.date - start).days // 7)
            return min(1.0, len(seen_weeks) / possible_weeks)
        done_days = sum(
            1 for e in g.entries
            if e.value > 0 and start <= e.date <= end
        )
        return min(1.0, done_days / possible_days)

    if g.kind == "boolean":
        return 1.0 if any(e.value > 0 for e in g.entries) else 0.0

    total = sum(e.value for e in g.entries)
    target = g.target_value or 0
    if target > 0:
        return min(1.0, total / target)
    return 1.0 if total > 0 else 0.0


def task_progress_pct(task: Task) -> int:
    """Average completion % across all non-routine Gos in the task."""
    gos = [g for g in task.gos if g.item_kind != "routine_legacy"]
    if not gos:
        return 0
    pcts = [
        go_completion_ratio(g, task.start_date, task.due_date) * 100
        for g in gos
    ]
    return int(round(sum(pcts) / len(pcts)))
