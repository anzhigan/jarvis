"""Sprint planner — propose a complete N-day focus sprint from the user's
current state (active goals + pending Gos).

This used to ask an LLM to pick a themed batch of items; it now runs a plain
rule-based algorithm — no model call — so "AI sprint" is instant and works
with the AI runtime offline. The output shape (`SprintPlanOutput`) is
unchanged, so the sprint drawer UI and schema are untouched.

How it selects:
  1. Load active goals (priority / due / progress) and open Gos in a window
     (overdue + due-within-sprint + dateless).
  2. Anchor the sprint on the most urgent goal, then walk goals in urgency
     order, emitting each goal followed by its pressing Gos — so items hang
     together by goal rather than being a flat dump.
  3. Cap the total at MAX_ITEMS; standalone Gos (no goal) fill any remainder.
  4. Synthesize a title / description / rationale and a per-item reason.

The output is the proposal only — the user reviews it in a drawer and clicks
"Create sprint" to materialise it (router does the actual writes).
"""
import logging
import uuid
from datetime import date as date_cls, datetime, UTC, timedelta
from typing import Any

from pydantic import ValidationError
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.ai import AIJob
from app.models.tasks import Go, GoEntry, Task
from app.schemas.ai import SprintPlanCreate, SprintPlanItem, SprintPlanOutput
from app.services.ai.jobs import register_handler
from app.services.ai.ollama_client import OllamaClient
from app.services.tasks import task_progress_pct

logger = logging.getLogger(__name__)

# Cap context we load so a huge backlog can't blow the plan up.
MAX_GOALS = 20
MAX_GOS = 40

# Keep the sprint tight — a batch you'll actually finish beats a wishlist dump.
MAX_ITEMS = 12
# Gos ranked by how pressing they are; lower = include sooner.
_GO_BUCKET_RANK = {"overdue": 0, "in_window": 1, "dateless": 2, "after_window": 3}


async def _gather_context(
    user_id: uuid.UUID,
    target_start: date_cls,
    target_end: date_cls,
    db: AsyncSession,
) -> dict[str, list[dict[str, Any]]]:
    """Load active goals, pending Gos and active routines for prompt context."""
    today = target_start

    # Active goals — surfaces priority + due_date so the model can match
    # urgency against the sprint window. We eager-load `gos` AND each Go's
    # `entries` here so `task_progress_pct` → `go_completion_ratio` (which
    # iterates `go.entries`) doesn't trigger lazy loads inside an async
    # session (which would raise MissingGreenlet).
    from sqlalchemy.orm import selectinload
    goals_q = await db.execute(
        select(Task)
        .options(selectinload(Task.gos).selectinload(Go.entries))
        .where(Task.user_id == user_id, Task.status == "active")
        .order_by(Task.due_date.asc().nullslast(), Task.priority.asc())
        .limit(MAX_GOALS),
    )
    goals: list[dict[str, Any]] = []
    for t in goals_q.scalars().all():
        # `progress` isn't a column on Task — it's computed from child Gos
        # by the same helper the /tasks endpoints use.
        goals.append({
            "id": str(t.id),
            "title": t.title,
            "priority": t.priority,
            "progress": task_progress_pct(t),
            "due_date": t.due_date.isoformat() if t.due_date else None,
            "is_overdue": bool(t.due_date and t.due_date < today),
        })

    # Open one-off Gos within a ±window. Same "done" heuristic as schedule.py:
    # if there's any GoEntry with value>0, treat as already-done and skip.
    done_subq = (
        select(GoEntry.go_id).where(GoEntry.value > 0).scalar_subquery()
    )
    overdue_cutoff = today - timedelta(days=30)
    future_cutoff = target_end + timedelta(days=7)
    gos_q = await db.execute(
        select(Go).where(
            Go.user_id == user_id,
            Go.item_kind == "one_off",
            Go.id.notin_(done_subq),
            or_(
                Go.due_date.is_(None),
                (Go.due_date >= overdue_cutoff) & (Go.due_date <= future_cutoff),
            ),
        )
        .order_by(Go.due_date.asc().nullslast(), Go.created_at.desc())
        .limit(MAX_GOS),
    )
    gos: list[dict[str, Any]] = []
    for g in gos_q.scalars().all():
        bucket: str
        if g.due_date is None:
            bucket = "dateless"
        elif g.due_date < today:
            bucket = "overdue"
        elif g.due_date <= target_end:
            bucket = "in_window"
        else:
            bucket = "after_window"
        gos.append({
            "id": str(g.id),
            "title": g.title,
            "goal_id": str(g.task_id) if g.task_id else None,
            "due_date": g.due_date.isoformat() if g.due_date else None,
            "created_at": g.created_at.isoformat(),
            "bucket": bucket,
        })

    # Routines are tracked elsewhere — a sprint is a finite scope, not a
    # cadence container — so we don't surface them to the planner at all.
    return {"goals": goals, "gos": gos, "routines": []}


def _truncate(text: str, limit: int) -> str:
    text = text.strip()
    return text if len(text) <= limit else text[: limit - 1].rstrip() + "…"


def _goal_urgency_key(g: dict) -> tuple:
    """Most urgent goals first: overdue, then earliest due, then priority."""
    return (
        0 if g["is_overdue"] else 1,
        g["due_date"] or "9999-12-31",
        g["priority"],
        g["title"],
    )


def _go_key(g: dict) -> tuple:
    """Pressing Gos first: overdue → in-window → dateless, then due, then age."""
    return (
        _GO_BUCKET_RANK.get(g["bucket"], 9),
        g["due_date"] or "9999-12-31",
        g["created_at"],
    )


def _goal_reason(g: dict, end: date_cls, is_anchor: bool) -> str:
    pct = g["progress"]
    if g["is_overdue"]:
        return f"Overdue goal · {pct}% done"
    if g["due_date"] and g["due_date"] <= end.isoformat():
        return f"Due within the sprint · {pct}% done"
    if is_anchor:
        return f"Sprint anchor · {pct}% done"
    return f"Home for the tasks below · {pct}% done"


def _go_reason(g: dict, today: date_cls) -> str:
    bucket = g["bucket"]
    if bucket == "overdue":
        d = (today - date_cls.fromisoformat(g["due_date"])).days
        return f"{d} day{'s' if d != 1 else ''} overdue"
    if bucket == "in_window":
        return "Due within the sprint window"
    if bucket == "dateless":
        return "Open task — good to close out"
    return "Due just after the window"


def _build_plan(
    days: int,
    start: date_cls,
    end: date_cls,
    context: dict[str, list[dict[str, Any]]],
) -> SprintPlanOutput:
    """Assemble the sprint proposal deterministically from the context."""
    goals = sorted(context["goals"], key=_goal_urgency_key)
    # Only pressing Gos belong in a sprint — drop the "after window" tail.
    candidate_gos = sorted(
        (g for g in context["gos"] if g["bucket"] != "after_window"),
        key=_go_key,
    )
    gos_by_goal: dict[str, list[dict]] = {}
    standalone_gos: list[dict] = []
    for g in candidate_gos:
        if g["goal_id"]:
            gos_by_goal.setdefault(g["goal_id"], []).append(g)
        else:
            standalone_gos.append(g)

    def goal_is_pressing(g: dict) -> bool:
        return bool(
            g["is_overdue"]
            or (g["due_date"] and g["due_date"] <= end.isoformat())
            or gos_by_goal.get(g["id"])
        )

    items: list[SprintPlanItem] = []
    anchor_goal: dict | None = next((g for g in goals if goal_is_pressing(g)), None)

    # Walk goals in urgency order; emit each pressing goal then its Gos, so the
    # sprint reads as coherent goal-groups rather than a flat list.
    for goal in goals:
        if len(items) >= MAX_ITEMS:
            break
        if not goal_is_pressing(goal):
            continue
        items.append(SprintPlanItem(
            kind="goal", id=goal["id"], title=goal["title"],
            reason=_goal_reason(goal, end, is_anchor=goal is anchor_goal),
        ))
        for g in gos_by_goal.get(goal["id"], []):
            if len(items) >= MAX_ITEMS:
                break
            items.append(SprintPlanItem(
                kind="go", id=g["id"], title=g["title"], reason=_go_reason(g, start),
            ))

    # Fill any remaining room with standalone Gos (no parent goal).
    for g in standalone_gos:
        if len(items) >= MAX_ITEMS:
            break
        items.append(SprintPlanItem(
            kind="go", id=g["id"], title=g["title"], reason=_go_reason(g, start),
        ))

    # Counts for the narrative.
    n_goals = sum(1 for it in items if it.kind == "goal")
    n_gos = sum(1 for it in items if it.kind == "go")
    n_overdue = sum(1 for g in candidate_gos if g["bucket"] == "overdue")

    if anchor_goal is not None:
        headline = _truncate(anchor_goal["title"], 44)
        title = _truncate(f"{headline} · {days}-day sprint", 60)
        description = (
            f"A {days}-day push anchored on “{anchor_goal['title']}”, "
            f"pulling in {n_gos} task{'s' if n_gos != 1 else ''} across "
            f"{n_goals} goal{'s' if n_goals != 1 else ''}."
        )
    else:
        title = f"{days}-day focus sprint"
        description = (
            f"A {days}-day batch of {n_gos} open task{'s' if n_gos != 1 else ''} "
            "to close out."
        )

    if n_overdue:
        rationale = (
            f"Front-loads {n_overdue} overdue item{'s' if n_overdue != 1 else ''} "
            f"and the work due before {end.isoformat()} into one finishable batch."
        )
    else:
        rationale = (
            f"Gathers the work due through {end.isoformat()} into one "
            "finishable batch so nothing slips."
        )

    return SprintPlanOutput(
        title=title,
        description=description,
        start_date=start.isoformat(),
        end_date=end.isoformat(),
        items=items,
        rationale=rationale,
    )


@register_handler("sprint_plan")
async def run_sprint_plan_job(
    job: AIJob,
    db: AsyncSession,
    ollama: OllamaClient,  # unused — kept to satisfy the handler contract
) -> dict[str, Any]:
    try:
        params = SprintPlanCreate.model_validate(job.input_json)
    except ValidationError as e:
        raise ValueError(f"invalid sprint_plan input: {e.errors()[:2]}") from e

    start = datetime.now(UTC).date()
    end = start + timedelta(days=params.days - 1)

    context = await _gather_context(job.user_id, start, end, db)
    if not context["goals"] and not context["gos"]:
        raise ValueError(
            "no active goals or open tasks to plan a sprint from",
        )

    plan = _build_plan(params.days, start, end, context)

    logger.info(
        "sprint_plan built (rule-based): items=%d (goals=%d gos=%d) days=%d",
        len(plan.items),
        sum(1 for i in plan.items if i.kind == "goal"),
        sum(1 for i in plan.items if i.kind == "go"),
        params.days,
    )
    return plan.model_dump(mode="json")
