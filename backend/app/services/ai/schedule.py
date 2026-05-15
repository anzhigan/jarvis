"""Schedule handler — turn the user's open Gos into a time-blocked plan,
plus a short narrative reading their broader state (focus / strengths /
weaknesses). Routines are intentionally excluded — they live in their
own cadence and the user manages them separately.

Data flow:
  1. Load Gos due_date == target_date (today's targets — to schedule).
  2. Load overdue Gos (due_date < target_date, within 30-day window — for
     "needs attention" narrative).
  3. Load active Goals (Task rows with status='active' — for "focus" /
     overall context).
  4. Build prompt with this context + work hours.
  5. LLM emits {date, summary, slots[]} JSON.
  6. Parse + post-process.

The output is stored as job.output_json. Phase 6b will add commit-to-sprint.
"""
import json
import logging
from datetime import date as date_cls, timedelta
from typing import Any

from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.ai import AIJob
from app.models.tasks import Go, Task
from app.schemas.ai import ScheduleCreate, ScheduleSlot, ScheduleSummary
from app.services.ai.jobs import register_handler
from app.services.ai.ollama_client import OllamaClient

logger = logging.getLogger(__name__)

# How far back we look for overdue items — past this, an item is essentially
# abandoned and not worth surfacing in today's narrative.
OVERDUE_WINDOW_DAYS = 30


SYSTEM_PROMPT = """\
/no_think

You are a productivity planner + coach. Given the user's Go-tasks for today, \
overdue tasks, and active goals — you produce TWO things:
  a) a short narrative reading their state (focus / strengths / weaknesses),
  b) a time-blocked schedule of TODAY's go-tasks only.

Hard rules:
1. Output language matches the language of the user's task titles.
2. Schedule slots come ONLY from today's go-tasks. Do NOT invent slots; do NOT \
include routines or backlog items. Group breaks/lunch sensibly between blocks.
3. Slot times fall within the work hours and do not overlap.
4. Always include at least one 10-15 min break between deep blocks, and a \
30-60 min lunch around mid-day.
5. The narrative summary is grounded in the actual data — no platitudes. \
Each of {focus, doing_well, needs_attention} is 1-2 sentences. If you genuinely \
can't observe something, leave that field as empty string "".
6. Output STRICTLY valid JSON. No prose, no markdown, no <think> blocks."""


async def _load_today_context(
    user_id, target_date: date_cls, db: AsyncSession,
) -> dict[str, list[dict[str, Any]]]:
    """Return today's gos + overdue gos + active goals (for narrative)."""
    # --- Today's Go items (scheduling input) ---
    today_q = await db.execute(
        select(Go, Task).outerjoin(Task, Go.task_id == Task.id)
        .where(Go.user_id == user_id, Go.due_date == target_date),
    )
    today_gos: list[dict] = []
    for go, task in today_q.all():
        today_gos.append({
            "id": str(go.id),
            "title": go.title,
            "goal": task.title if task else None,
        })

    # --- Overdue Go items (narrative input only — NOT scheduled) ---
    overdue_cutoff = target_date - timedelta(days=OVERDUE_WINDOW_DAYS)
    overdue_q = await db.execute(
        select(Go, Task).outerjoin(Task, Go.task_id == Task.id).where(
            Go.user_id == user_id,
            Go.due_date.isnot(None),
            Go.due_date < target_date,
            Go.due_date >= overdue_cutoff,
        ),
    )
    overdue_gos: list[dict] = []
    for go, task in overdue_q.all():
        days_overdue = (target_date - go.due_date).days if go.due_date else None
        overdue_gos.append({
            "id": str(go.id),
            "title": go.title,
            "goal": task.title if task else None,
            "days_overdue": days_overdue,
        })

    # --- Active goals (high-level context for the narrative) ---
    goals_q = await db.execute(
        select(Task).where(Task.user_id == user_id, Task.status == "active"),
    )
    active_goals: list[dict] = []
    for t in goals_q.scalars().all():
        active_goals.append({
            "title": t.title,
            "priority": t.priority,
            "has_due_date": t.due_date is not None,
        })

    return {
        "today_gos": today_gos,
        "overdue_gos": overdue_gos,
        "active_goals": active_goals,
    }


def _build_prompt(
    target_date: date_cls,
    start_h: int,
    end_h: int,
    context: dict,
    prefs: list[str],
) -> str:
    today_block    = json.dumps(context["today_gos"],   ensure_ascii=False, indent=2)
    overdue_block  = json.dumps(context["overdue_gos"], ensure_ascii=False, indent=2)
    goals_block    = json.dumps(context["active_goals"], ensure_ascii=False, indent=2)
    prefs_block    = ", ".join(prefs) if prefs else "(no special preferences)"

    return f"""\
Plan the day {target_date.isoformat()} for the user.

Work hours: {start_h:02d}:00 to {end_h:02d}:00.
Preferences: {prefs_block}.

═══ TODAY'S GO ITEMS (the ONLY source for schedule slots) ═══
{today_block}

═══ OVERDUE GO ITEMS (for narrative only — do NOT schedule) ═══
{overdue_block}

═══ ACTIVE GOALS (high-level context for narrative) ═══
{goals_block}

Build:
1. `summary`: 3 short observations about the user's state.
   - focus: what to prioritise today (lean on today's gos + their goals).
   - doing_well: anything observably on track (e.g. high-priority goal has \
items moving today, no overdue items in some goal, etc.).
   - needs_attention: stale work, overdue items, goals without due dates, etc.
   Be concrete and reference real numbers/titles. Empty string "" if you genuinely \
can't observe something.
2. `slots`: time-blocked schedule from TODAY'S go-tasks only. For each goal-work \
slot, set source_kind="go" and source_id to the Go's id. For breaks/lunch, omit \
both. Do NOT include overdue items, routines, or invented tasks.

JSON schema:
{{
  "date": "{target_date.isoformat()}",
  "summary": {{
    "focus": "...",
    "doing_well": "...",
    "needs_attention": "..."
  }},
  "slots": [
    {{
      "start_time": "09:00",
      "end_time": "09:45",
      "kind": "goal" | "deep_work" | "admin" | "break" | "lunch" | "other",
      "title": "Short title",
      "source_kind": "go" | null,
      "source_id": "<uuid>" | null,
      "note": "1-line rationale"
    }}
  ],
  "total_active_minutes": <int — sum of non-break minutes>
}}"""


def _parse_output(raw: str) -> dict:
    if not raw or not raw.strip():
        raise ValueError("empty response from model")
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
    if not isinstance(data, dict):
        raise ValueError("output must be a JSON object")

    slots_raw = data.get("slots") or []
    if not isinstance(slots_raw, list):
        raise ValueError("'slots' must be an array")

    slots: list[ScheduleSlot] = []
    for i, s in enumerate(slots_raw):
        try:
            slots.append(ScheduleSlot.model_validate(s))
        except ValidationError as e:
            raise ValueError(f"slot {i} fails schema: {e.errors()[:2]}") from e

    # Sort by start_time; light post-processing.
    slots.sort(key=lambda s: s.start_time)

    # Summary — best-effort parse. Missing keys default to "".
    summary_raw = data.get("summary") or {}
    try:
        summary = ScheduleSummary.model_validate(summary_raw if isinstance(summary_raw, dict) else {})
    except ValidationError:
        summary = ScheduleSummary()

    return {
        "date": str(data.get("date", "")),
        "summary": summary.model_dump(mode="json"),
        "slots": [s.model_dump(mode="json") for s in slots],
        "total_active_minutes": int(data.get("total_active_minutes") or 0),
    }


@register_handler("schedule")
async def run_schedule_job(
    job: AIJob,
    db: AsyncSession,
    ollama: OllamaClient,
) -> dict[str, Any]:
    try:
        params = ScheduleCreate.model_validate(job.input_json)
    except ValidationError as e:
        raise ValueError(f"invalid schedule input: {e.errors()[:2]}") from e

    # Resolve date — empty string means "today" in user's locale. Without
    # timezone info we use UTC date; client-side fixup can pass explicit date.
    if params.date:
        try:
            target_date = date_cls.fromisoformat(params.date)
        except ValueError as e:
            raise ValueError(f"invalid date {params.date!r}: {e}") from e
    else:
        from datetime import datetime, UTC
        target_date = datetime.now(UTC).date()

    if params.hours.end_h <= params.hours.start_h:
        raise ValueError("hours.end_h must be greater than hours.start_h")

    context = await _load_today_context(job.user_id, target_date, db)
    if not context["today_gos"]:
        # Even with overdue items + active goals, without anything due TODAY we
        # have no slots to build — let the UI surface a friendly empty state.
        raise ValueError(
            "no open go-tasks due on this date — add a task with today's "
            "due date to plan your day",
        )

    prompt = _build_prompt(
        target_date, params.hours.start_h, params.hours.end_h, context, params.prefs,
    )

    raw = await ollama.generate(
        prompt, system=SYSTEM_PROMPT, json_mode=True, temperature=0.4, think=False,
    )
    try:
        output = _parse_output(raw)
    except ValueError as e:
        logger.warning("schedule parse failed (first try): %s — retrying", e)
        retry_prompt = prompt + "\n\nREMINDER: respond with ONLY a JSON object."
        raw = await ollama.generate(
            retry_prompt, system=SYSTEM_PROMPT, json_mode=True, temperature=0.2, think=False,
        )
        output = _parse_output(raw)

    logger.info(
        "schedule generated: date=%s slots=%d today_gos=%d overdue=%d goals=%d",
        target_date, len(output["slots"]),
        len(context["today_gos"]), len(context["overdue_gos"]),
        len(context["active_goals"]),
    )
    return output
