"""Schedule handler — turn the user's open Gos + active routines into a
time-blocked plan for the day.

Data flow:
  1. Load Gos with due_date == target_date (owned by user).
  2. Load active routines that fire on target_date (non-paused, in window,
     and schedule_type indicates today).
  3. Build prompt with this context + work hours.
  4. LLM emits {date, slots[]} JSON.
  5. Parse + light post-processing (sort by start_time, compute active minutes).

The output is stored as job.output_json. Phase 6b will add commit-to-sprint.
"""
import json
import logging
from datetime import date as date_cls
from typing import Any

from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.ai import AIJob
from app.models.tasks import Go, Routine, Task
from app.schemas.ai import ScheduleCreate, ScheduleSlot
from app.services.ai.jobs import register_handler
from app.services.ai.ollama_client import OllamaClient

logger = logging.getLogger(__name__)


SYSTEM_PROMPT = """\
/no_think

You are a productivity planner. Given a user's tasks for today and their work \
hours, you produce a realistic time-blocked schedule. Hard rules:
1. Output language must match the language of the user's task titles.
2. Slot times must fall within the given work hours and not overlap.
3. Always include at least one short break (10-15 min) between deep blocks. \
Include a 30-60 min lunch around mid-day.
4. Each slot is concrete: a single goal-work block (not "miscellaneous tasks").
5. Group routines into one routine_block if there are 3+ on the same day.
6. Output STRICTLY valid JSON. No prose, no markdown, no <think> blocks."""


def _routine_fires_on(r: Routine, d: date_cls) -> bool:
    """Best-effort: include daily routines and weekly_on_days that match weekday.

    every_n_days / times_per_week / month — phase-6b territory. We don't have
    last-fire data here, so we conservatively SKIP them rather than over-include.
    """
    if r.is_paused:
        return False
    if r.start_date and r.start_date > d:
        return False
    if r.end_date and r.end_date < d:
        return False
    if r.schedule_type == "daily":
        return True
    if r.schedule_type == "weekly_on_days":
        weekday = d.weekday()  # 0=Mon
        days = [int(x) for x in (r.schedule_days or "").split(",") if x.strip().isdigit()]
        return weekday in days
    return False


async def _load_today_context(
    user_id, target_date: date_cls, db: AsyncSession,
) -> dict[str, list[dict[str, Any]]]:
    """Return {gos: [...], routines: [...]} for the prompt."""
    # Gos due today, owned by user.
    gos_q = await db.execute(
        select(Go, Task).outerjoin(Task, Go.task_id == Task.id)
        .where(Go.user_id == user_id, Go.due_date == target_date),
    )
    gos: list[dict] = []
    for go, task in gos_q.all():
        gos.append({
            "id": str(go.id),
            "title": go.title,
            "goal": task.title if task else None,
            "kind": go.kind,
            "target_value": go.target_value,
            "unit": go.unit or None,
        })

    # Active routines firing today.
    routines_q = await db.execute(
        select(Routine).where(Routine.user_id == user_id, Routine.is_paused.is_(False)),
    )
    routines: list[dict] = []
    for r in routines_q.scalars().all():
        if not _routine_fires_on(r, target_date):
            continue
        routines.append({
            "id": str(r.id),
            "title": r.title,
            "kind": r.kind,
            "target_value": r.target_value,
            "unit": r.unit or None,
        })

    return {"gos": gos, "routines": routines}


def _build_prompt(
    target_date: date_cls,
    start_h: int,
    end_h: int,
    context: dict,
    prefs: list[str],
) -> str:
    gos_block = json.dumps(context["gos"], ensure_ascii=False, indent=2)
    routines_block = json.dumps(context["routines"], ensure_ascii=False, indent=2)
    prefs_block = ", ".join(prefs) if prefs else "(no special preferences)"

    return f"""\
Plan the day {target_date.isoformat()} for the user.

Work hours: {start_h:02d}:00 to {end_h:02d}:00.
Preferences: {prefs_block}.

Today's GO items (one-off tasks due today):
{gos_block}

Today's active ROUTINES:
{routines_block}

Build a time-blocked schedule. For each goal-work block, set source_kind="go" \
and source_id to the Go's id from above. For routine blocks, source_kind="routine" \
(or use one consolidated block if there are 3+ routines). For breaks/lunch, omit \
source_kind/source_id.

JSON schema:
{{
  "date": "{target_date.isoformat()}",
  "slots": [
    {{
      "start_time": "09:00",
      "end_time": "09:45",
      "kind": "goal" | "routine" | "deep_work" | "admin" | "break" | "lunch" | "other",
      "title": "Short title",
      "source_kind": "go" | "task" | "routine" | null,
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
    return {
        "date": str(data.get("date", "")),
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
    if not context["gos"] and not context["routines"]:
        raise ValueError(
            "no open gos or active routines for this date — nothing to schedule",
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
        "schedule generated: date=%s slots=%d gos=%d routines=%d",
        target_date, len(output["slots"]),
        len(context["gos"]), len(context["routines"]),
    )
    return output
