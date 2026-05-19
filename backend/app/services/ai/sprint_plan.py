"""Sprint planner — propose a complete N-day focus sprint from the user's
current state (active goals + pending Gos + active routines).

Data flow:
  1. Load the user's active goals (with priorities/due dates/progress).
  2. Load open Gos in a wide window (overdue + today + ~30 days out).
  3. Load active routines.
  4. Build prompt that asks the model to pick ~5-10 items that, together,
     form a coherent N-day sprint with a memorable title + rationale.
  5. LLM emits the SprintPlanOutput JSON. We validate per-item ids exist
     and belong to the user; foreign/hallucinated ids are dropped before
     the result reaches the user.

The output is the proposal only — the user reviews it in a drawer and
clicks "Create sprint" to materialise it (router does the actual writes
via sprintsApi.create + addItem).
"""
import json
import logging
import uuid
from datetime import UTC, date as date_cls, datetime, timedelta
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

# Cap context sent to the model so the prompt stays tight.
MAX_GOALS = 20
MAX_GOS = 40

# Item count guidance for the model — tuned with prompt-engineering tweaks
# so the result feels like a manageable sprint, not a wishlist dump.
SUGGESTED_ITEMS_MIN = 4
SUGGESTED_ITEMS_MAX = 12


SYSTEM_PROMPT = """\
/no_think

You are a productivity planner. The user wants a focused, time-bounded \
SPRINT — a coherent batch of work to ship over the next N days. From their \
current goals and pending tasks, pick the items that belong in this sprint \
and write a memorable title + rationale.

A sprint is a finite commitment to concrete deliverables. RECURRING \
routines (daily habits etc.) are tracked elsewhere and MUST NOT appear in \
a sprint — pick only goals and one-off "Go" tasks.

GUIDING PRINCIPLES:
1. A sprint has a THEME — items hang together around one direction \
   (e.g. "ship v2 polish", "winter health reset"). Don't pick random items \
   from unrelated goals.
2. Favor overdue + due-soon items (they're already past their planning \
   horizon).
3. Aim for SUGGESTED_ITEMS_MIN..SUGGESTED_ITEMS_MAX items total. Tight is \
   better than sprawling — a sprint of 5 things you'll actually finish \
   beats a sprint of 15 you'll feel guilty about.
4. Item ids MUST come from the lists provided below. Do NOT invent ids — \
   any unrecognised id is dropped before the user sees the result.
5. Output language matches the language of the user's titles.
6. Output STRICTLY valid JSON matching the schema. No prose, no markdown, \
   no <think> blocks."""


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
            "bucket": bucket,
        })

    # Routines are tracked elsewhere — a sprint is a finite scope, not a
    # cadence container — so we don't surface them to the planner at all.
    return {"goals": goals, "gos": gos, "routines": []}


def _build_prompt(
    days: int,
    start: date_cls,
    end: date_cls,
    context: dict[str, list[dict[str, Any]]],
) -> str:
    sys = SYSTEM_PROMPT.replace("SUGGESTED_ITEMS_MIN", str(SUGGESTED_ITEMS_MIN))
    sys = sys.replace("SUGGESTED_ITEMS_MAX", str(SUGGESTED_ITEMS_MAX))

    return f"""\
{sys}

CONTEXT
=======

Sprint window:
  - length: {days} days
  - start: {start.isoformat()}
  - end:   {end.isoformat()}

Active goals (id, title, priority, progress%, due_date):
{json.dumps(context["goals"], ensure_ascii=False, indent=2)}

Open Gos (id, title, goal_id, due_date, bucket):
{json.dumps(context["gos"], ensure_ascii=False, indent=2)}

OUTPUT SCHEMA
=============

Respond with JSON of this exact shape:
{{
  "title": "Short, memorable name for the sprint (≤ 60 chars)",
  "description": "1-2 sentence pitch — what this sprint is about",
  "start_date": "{start.isoformat()}",
  "end_date":   "{end.isoformat()}",
  "rationale":  "Why these items, why now — 1-2 sentences",
  "items": [
    {{ "kind": "goal", "id": "<id from list>", "title": "<for reference>", "reason": "Why this goal belongs in the sprint" }},
    {{ "kind": "go",   "id": "<id from list>", "title": "<for reference>", "reason": "..." }}
  ]
}}

Allowed "kind" values: "goal", "go". Do not output items with kind="routine"."""


def _parse_output(raw: str) -> SprintPlanOutput:
    text = raw.strip()
    if text.startswith("```"):
        text = text.strip("`")
        if text.startswith("json"):
            text = text[4:]
        text = text.strip()
    try:
        data = json.loads(text)
    except json.JSONDecodeError as e:
        raise ValueError(f"model returned invalid JSON: {e}") from e
    try:
        return SprintPlanOutput.model_validate(data)
    except ValidationError as e:
        raise ValueError(f"output fails schema: {e.errors()[:2]}") from e


def _validate_items(
    raw_items: list[SprintPlanItem],
    context: dict[str, list[dict[str, Any]]],
) -> list[SprintPlanItem]:
    """Filter out items whose ids don't appear in the context lists. The
    model occasionally invents ids; we silently drop those rather than
    erroring the whole job — a sprint with 4 valid items + 1 dropped is
    still useful."""
    valid_goal_ids = {g["id"] for g in context["goals"]}
    valid_go_ids = {g["id"] for g in context["gos"]}
    valid_routine_ids = {r["id"] for r in context["routines"]}
    out: list[SprintPlanItem] = []
    dropped = 0
    for it in raw_items:
        pool = (valid_goal_ids if it.kind == "goal"
                else valid_go_ids if it.kind == "go"
                else valid_routine_ids)
        if it.id in pool:
            out.append(it)
        else:
            dropped += 1
    if dropped:
        logger.warning("sprint_plan: dropped %d items with hallucinated ids", dropped)
    return out


@register_handler("sprint_plan")
async def run_sprint_plan_job(
    job: AIJob,
    db: AsyncSession,
    ollama: OllamaClient,
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

    prompt = _build_prompt(params.days, start, end, context)

    raw = await ollama.generate(
        prompt, system=SYSTEM_PROMPT, json_mode=True, temperature=0.4, think=False,
    )
    try:
        plan = _parse_output(raw)
    except ValueError as e:
        # One retry with a tighter "follow the schema" reminder.
        logger.warning("sprint_plan parse failed (first try): %s — retrying", e)
        retry_prompt = (
            prompt
            + "\n\nREMINDER: respond with ONLY a JSON object matching the schema."
        )
        raw = await ollama.generate(
            retry_prompt, system=SYSTEM_PROMPT, json_mode=True, temperature=0.2, think=False,
        )
        plan = _parse_output(raw)

    # Force the dates back to our resolved window — model sometimes echoes
    # them with off-by-one drift.
    plan.start_date = start.isoformat()
    plan.end_date = end.isoformat()
    plan.items = _validate_items(plan.items, context)

    logger.info(
        "sprint_plan generated: items=%d (goals=%d gos=%d routines=%d) days=%d",
        len(plan.items),
        sum(1 for i in plan.items if i.kind == "goal"),
        sum(1 for i in plan.items if i.kind == "go"),
        sum(1 for i in plan.items if i.kind == "routine"),
        params.days,
    )
    return plan.model_dump(mode="json")
