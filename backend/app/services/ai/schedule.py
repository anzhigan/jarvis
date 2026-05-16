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
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.ai import AIJob
from app.models.tasks import Go, GoEntry, Step, Task
from app.schemas.ai import ScheduleCreate, ScheduleSlot, ScheduleSummary
from app.services.ai.jobs import register_handler
from app.services.ai.ollama_client import OllamaClient

logger = logging.getLogger(__name__)

# How far back we look for overdue items — past this, an item is essentially
# abandoned and not worth surfacing in today's narrative.
OVERDUE_WINDOW_DAYS = 30
# Cap on the total OPEN backlog we hand to the model. Prevents prompt blow-up
# while still giving enough context to find step precedence.
MAX_OPEN_GOS = 30


SYSTEM_PROMPT = """\
/no_think

You are a productivity planner + coach. Given the user's FULL open backlog of \
Go-tasks (overdue, today, future, dateless), active goals + step structure, \
you produce TWO things:
  a) a short narrative reading their state (focus / strengths / weaknesses),
  b) a schedule of WHAT THEY SHOULD DO TODAY — pulled from across the backlog.

CORE PRINCIPLE — STEP PRECEDENCE:
Many Gos belong to a Step (a sub-phase of a Goal). Steps have an ordering: \
position 0 first, then 1, etc. If a Step has multiple Gos, do the LOWER-POSITION \
Go before the HIGHER one. Don't schedule a later-step Go when its prerequisite \
is still open. If a higher-position Go is "due today" but a lower-position Go in \
the same Step is incomplete — INCLUDE BOTH today, with the lower-position one \
ranked higher and noted as "blocking the next step".

PRIORITY ORDER:
1. Overdue Gos (due_date < today) — top priority, slip-handling.
2. Step prerequisites — unblocking work, even if dated future.
3. Today's Gos (due_date == today).
4. Dateless backlog — opportunistic fill.
5. Future-dated Gos — only if they unblock today's chain.

Hard rules:
1. Output language matches the language of the user's task titles.
2. Time-blocked mode: slot times fall within work hours, do not overlap, include \
breaks every ~90 min + a lunch.
3. Free-order mode (time_blocked=false): leave start_time/end_time as empty \
strings. Order slots by priority — first slot is most important.
4. The narrative is grounded in the actual backlog — reference real Steps + Gos \
+ overdue counts. If something is genuinely absent, return "" for that field.
5. Output STRICTLY valid JSON. No prose, no markdown, no <think> blocks."""


async def _load_today_context(
    user_id, target_date: date_cls, db: AsyncSession,
) -> dict[str, list[dict[str, Any]]]:
    """Load the user's whole open backlog + step structure + active goals.

    "Open" here = item_kind='one_off' AND has no GoEntry with value > 0 (no
    progress recorded). For numeric tasks this is approximate; refining
    completion logic per-kind is Phase 6b territory.
    """
    overdue_cutoff = target_date - timedelta(days=OVERDUE_WINDOW_DAYS)

    # --- All OPEN one-off Gos for this user ---
    # We pull: overdue (due_date < today, within window), today (==), future
    # (> today, within ~14 days), and dateless. Capped via MAX_OPEN_GOS so the
    # prompt doesn't blow up on a 200-row backlog.
    future_cutoff = target_date + timedelta(days=14)
    done_subq = (
        select(GoEntry.go_id)
        .where(GoEntry.value > 0)
        .scalar_subquery()
    )
    open_q = await db.execute(
        select(Go, Task, Step).outerjoin(Task, Go.task_id == Task.id)
        .outerjoin(Step, Go.step_id == Step.id)
        .where(
            Go.user_id == user_id,
            Go.item_kind == "one_off",
            Go.id.notin_(done_subq),
            or_(
                Go.due_date.is_(None),
                Go.due_date == target_date,
                (Go.due_date < target_date) & (Go.due_date >= overdue_cutoff),
                (Go.due_date > target_date) & (Go.due_date <= future_cutoff),
            ),
        )
        .order_by(
            # Overdue first, then today, then near-future, then dateless.
            Go.due_date.asc().nullslast(),
            Step.position.asc().nullslast(),
            Go.created_at.desc(),
        )
        .limit(MAX_OPEN_GOS),
    )
    open_gos: list[dict] = []
    overdue_gos: list[dict] = []
    for go, task, step in open_q.all():
        bucket: str
        if go.due_date is None:
            bucket = "dateless"
        elif go.due_date < target_date:
            bucket = "overdue"
        elif go.due_date == target_date:
            bucket = "today"
        else:
            bucket = "future"

        item = {
            "id": str(go.id),
            "title": go.title,
            "goal": task.title if task else None,
            "step": step.title if step else None,
            "step_id": str(step.id) if step else None,
            "step_position": step.position if step else None,
            "due_date": go.due_date.isoformat() if go.due_date else None,
            "bucket": bucket,
        }
        open_gos.append(item)
        if bucket == "overdue":
            days_overdue = (target_date - go.due_date).days
            overdue_gos.append({**item, "days_overdue": days_overdue})

    # --- Active goals + their steps (for structural awareness) ---
    goals_q = await db.execute(
        select(Task).where(Task.user_id == user_id, Task.status == "active"),
    )
    active_goals: list[dict] = []
    for t in goals_q.scalars().all():
        active_goals.append({
            "id": str(t.id),
            "title": t.title,
            "priority": t.priority,
            "has_due_date": t.due_date is not None,
        })

    return {
        "open_gos": open_gos,
        "overdue_gos": overdue_gos,
        "active_goals": active_goals,
    }


def _build_prompt(
    target_date: date_cls,
    start_h: int,
    end_h: int,
    context: dict,
    prefs: list[str],
    time_blocked: bool,
) -> str:
    open_block     = json.dumps(context["open_gos"], ensure_ascii=False, indent=2)
    goals_block    = json.dumps(context["active_goals"], ensure_ascii=False, indent=2)
    prefs_block    = ", ".join(prefs) if prefs else "(none)"

    n_overdue = sum(1 for g in context["open_gos"] if g["bucket"] == "overdue")
    n_today   = sum(1 for g in context["open_gos"] if g["bucket"] == "today")
    n_future  = sum(1 for g in context["open_gos"] if g["bucket"] == "future")
    n_dateless= sum(1 for g in context["open_gos"] if g["bucket"] == "dateless")

    mode_intro = (
        "Output a TIME-BLOCKED schedule: each slot has start_time/end_time within "
        f"{start_h:02d}:00–{end_h:02d}:00, no overlaps, breaks every ~90 min, lunch mid-day."
    ) if time_blocked else (
        "Output a FREE-ORDER list: leave start_time and end_time as empty strings. "
        "Order slots by priority — first = most important. No need for breaks/lunch slots."
    )

    return f"""\
Plan {target_date.isoformat()} for the user.

Work hours: {start_h:02d}:00–{end_h:02d}:00.   Prefs: {prefs_block}.
Backlog snapshot: {n_overdue} overdue · {n_today} due today · {n_future} due-soon · {n_dateless} dateless.

═══ OPEN GO BACKLOG (single source — pick what goes into today) ═══
Each item: bucket = where it sits in time; step + step_position = its place in a
Step (lower position blocks higher). Look at SAME-STEP groups: if a low-position
Go is incomplete and a high-position Go in the SAME step has due_date=today —
include BOTH today, with the low-position one ranked above (mark in note that it
unblocks the next).

{open_block}

═══ ACTIVE GOALS (high-level context) ═══
{goals_block}

Build:
1. `summary` — three concrete observations, grounded in titles + numbers above:
   - focus: priority area for today, citing the actual goal/step under load.
   - doing_well: where the backlog is healthy (low overdue, step chains
     advancing, etc.).
   - needs_attention: overdue clusters, blocked step chains, abandoned items.
   Empty "" if you can't say it honestly.

2. `slots` — what to do today.
   {mode_intro}
   Every slot MUST include a non-empty `title` (even for break/lunch — e.g.
   "Lunch break", "Coffee").
   Work slots (kind="goal" | "deep_work" | "admin") MUST be tied to a
   specific Go from the OPEN BACKLOG above: set source_kind="go" and
   source_id=<that Go's id> (copy VERBATIM, never invent ids).
   Do NOT emit a work slot without a real Go — if an active goal has no
   concrete Go yet, OMIT it from this plan; the user sees those goals in
   a separate follow-up list outside the plan.
   For breaks/lunch (time-blocked mode only), set source_kind=null and
   source_id=null.
   In `note` (1 line) explain WHY this item now — overdue / unblocks step X /
   continues yesterday's chain / etc.

JSON schema:
{{
  "date": "{target_date.isoformat()}",
  "summary": {{ "focus": "...", "doing_well": "...", "needs_attention": "..." }},
  "slots": [
    {{
      "start_time": "{('09:00' if time_blocked else '')}",
      "end_time":   "{('09:45' if time_blocked else '')}",
      "kind": "goal" | "deep_work" | "admin" | "break" | "lunch" | "other",
      "title": "Short title",
      "source_kind": "go" | null,
      "source_id": "<uuid>" | null,
      "note": "1-line rationale"
    }}
  ],
  "total_active_minutes": <int — sum of non-break minutes>
}}"""


def _parse_output(raw: str, valid_go_ids: set[str] | None = None) -> dict:
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
    work_kinds = {"goal", "deep_work", "admin"}
    for s in slots_raw:
        if not isinstance(s, dict):
            continue
        # Backfill self-describing kinds when the model forgets a title — we'd
        # rather show a generic-labelled lunch/break than discard a whole day.
        if not s.get("title"):
            kind = (s.get("kind") or "").lower()
            if kind == "lunch":
                s["title"] = "Lunch"
            elif kind == "break":
                s["title"] = "Break"
        # Normalise any unexpected kind into "other" so the regex doesn't bite.
        if s.get("kind") not in {"goal", "routine", "admin", "break", "lunch", "deep_work", "other"}:
            s["kind"] = "other"
        # Work slots MUST be tied to a real Go. Goal-only slots are surfaced
        # separately in the UI (the "empty goals" follow-up), so drop them
        # from the timeline regardless of source_kind.
        if s.get("kind") in work_kinds:
            sid = s.get("source_id")
            sk = s.get("source_kind")
            if sk != "go" or not sid:
                continue
            if valid_go_ids is not None and sid not in valid_go_ids:
                continue
        try:
            slots.append(ScheduleSlot.model_validate(s))
        except ValidationError:
            continue

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
    if not context["open_gos"]:
        # Truly nothing — no overdue, no today, no future, no dateless.
        raise ValueError(
            "no open go-tasks anywhere — create at least one go-item, then try again",
        )

    prompt = _build_prompt(
        target_date,
        params.hours.start_h,
        params.hours.end_h,
        context,
        params.prefs,
        params.time_blocked,
    )

    valid_go_ids = {g["id"] for g in context["open_gos"]}

    raw = await ollama.generate(
        prompt, system=SYSTEM_PROMPT, json_mode=True, temperature=0.4, think=False,
    )
    try:
        output = _parse_output(raw, valid_go_ids)
    except ValueError as e:
        logger.warning("schedule parse failed (first try): %s — retrying", e)
        retry_prompt = prompt + "\n\nREMINDER: respond with ONLY a JSON object."
        raw = await ollama.generate(
            retry_prompt, system=SYSTEM_PROMPT, json_mode=True, temperature=0.2, think=False,
        )
        output = _parse_output(raw, valid_go_ids)

    logger.info(
        "schedule generated: date=%s mode=%s slots=%d open=%d overdue=%d goals=%d",
        target_date,
        "time" if params.time_blocked else "free",
        len(output["slots"]),
        len(context["open_gos"]),
        len(context["overdue_gos"]),
        len(context["active_goals"]),
    )
    return output
