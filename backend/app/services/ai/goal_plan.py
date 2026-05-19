"""Goal planner — given a new (or existing) goal, propose a coherent step
breakdown with dates, and (in 'full' mode) seed each step with concrete
first Gos. Reduces the cold-start «пальцем в небо» problem for the user.

Two modes:
  - **full**: generate steps + first gos for each step. Used right after
    a Goal is created (when it has no children yet).
  - **dates_only**: take the goal's existing steps/gos and propose dates
    for them. Used by the "I'll plan manually" → "auto-place dates" flow.

Distribution heuristics (baked into the prompt + server-side clamping):
  - All step dates land inside [goal.start_date, goal.due_date].
  - Steps don't overlap; one ends, next begins +1 day.
  - Spread is roughly even but biased toward smaller leading steps
    (research / setup) and larger trailing steps (execution / polish).
  - Avoids stacking goal deadlines on the same week as other active
    goals' deadlines — we feed the LLM a "busy weeks" hint.
"""
import json
import logging
import uuid
from datetime import UTC, date as date_cls, datetime, timedelta
from typing import Any

from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.ai import AIJob
from app.models.tasks import Step, Task
from app.schemas.ai import (
    GoalPlanCreate,
    GoalPlanGo,
    GoalPlanOutput,
    GoalPlanStep,
)
from app.services.ai.jobs import register_handler
from app.services.ai.ollama_client import OllamaClient

logger = logging.getLogger(__name__)


SYSTEM_PROMPT = """\
/no_think

You are a planning assistant. Given a Goal's title + description + window,
propose a concrete step breakdown with dates. Each step is a milestone
phase the user can ship before moving on.

GUIDING PRINCIPLES:
1. Steps cover the full goal window — first step starts at goal.start_date,
   last step ends at goal.due_date. No gaps, no overlaps.
2. Distribute work non-uniformly: lead with smaller setup/research steps
   (1-2 weeks), put larger execution steps in the middle, end with a
   shorter wrap-up/polish phase.
3. Generate 3-7 steps. Fewer for short goals (≤3 weeks), more for long
   ones (>3 months).
4. In FULL mode: each step gets 2-4 concrete first Gos with titles tied
   to the step's purpose. Boolean unless the work is naturally measurable.
5. In DATES_ONLY mode: the user already wrote step titles; you ONLY
   propose start_date / end_date for each, respecting the order they came
   in. Don't rename or reorder. Don't add or drop steps.
6. Output language matches the language of the goal title.
7. Output STRICTLY valid JSON matching the schema. No prose, no markdown,
   no <think> blocks."""


async def _load_context(
    user_id: uuid.UUID,
    goal_id: uuid.UUID,
    db: AsyncSession,
) -> dict[str, Any]:
    """Load goal + its existing steps/gos + a busy-weeks signal from other
    active goals' deadlines (so the model can avoid pile-ups)."""
    # The goal itself with its steps + gos eager-loaded.
    goal_q = await db.execute(
        select(Task).options(
            selectinload(Task.steps).selectinload(Step.gos),
            selectinload(Task.gos),
        ).where(Task.id == goal_id, Task.user_id == user_id),
    )
    goal = goal_q.scalar_one_or_none()
    if goal is None:
        raise ValueError("goal not found or access denied")

    # Other active goals — surface their due_dates so the planner can
    # avoid stacking this goal's milestones on the same dates.
    others_q = await db.execute(
        select(Task.title, Task.due_date).where(
            Task.user_id == user_id,
            Task.status == "active",
            Task.id != goal_id,
            Task.due_date.isnot(None),
        ).order_by(Task.due_date.asc()).limit(20),
    )
    other_dues: list[dict[str, str]] = []
    for t in others_q.all():
        if t.due_date:
            other_dues.append({
                "title": t.title,
                "due": t.due_date.isoformat(),
            })

    return {
        "goal": goal,
        "other_dues": other_dues,
    }


def _resolve_window(goal: Task) -> tuple[date_cls, date_cls]:
    """Pin start/end. Defaults: start = today; due = start + 60 days."""
    today = datetime.now(UTC).date()
    start = goal.start_date if goal.start_date else today
    if start < today:
        start = today  # don't plan into the past
    if goal.due_date and goal.due_date > start:
        end = goal.due_date
    else:
        end = start + timedelta(days=60)
    return start, end


def _build_prompt(
    mode: str,
    goal: Task,
    start: date_cls,
    end: date_cls,
    other_dues: list[dict[str, str]],
) -> str:
    days = (end - start).days + 1
    existing_steps: list[dict[str, Any]] = []
    for s in sorted(goal.steps, key=lambda x: x.position):
        existing_steps.append({
            "position": s.position,
            "title": s.title,
            "description": (s.description or "")[:200],
            "start_date": s.start_date.isoformat() if s.start_date else None,
            "end_date": s.end_date.isoformat() if s.end_date else None,
        })

    mode_block = ""
    if mode == "dates_only":
        # In dates_only we also surface each step's existing Gos so the
        # model can suggest a due_date per go (inside its step's window).
        # IDs are NOT exposed — frontend matches proposals to existing
        # steps/gos by position to avoid LLM ID hallucination.
        existing_with_gos: list[dict[str, Any]] = []
        for s in sorted(goal.steps, key=lambda x: x.position):
            step_gos: list[dict[str, Any]] = []
            for g in s.gos:  # ordered by created_at by default — preserve
                step_gos.append({
                    "title": g.title,
                    "due_date": g.due_date.isoformat() if g.due_date else None,
                })
            existing_with_gos.append({
                "position": s.position,
                "title": s.title,
                "description": (s.description or "")[:200],
                "start_date": s.start_date.isoformat() if s.start_date else None,
                "end_date": s.end_date.isoformat() if s.end_date else None,
                "gos": step_gos,
            })
        mode_block = f"""
MODE: dates_only

EXISTING STEPS WITH THEIR GOS (preserve order, titles, descriptions —
ONLY fill in dates):
{json.dumps(existing_with_gos, ensure_ascii=False, indent=2)}

For EACH step: set start_date + end_date inside the goal window.
For EACH go inside a step: set due_date inside that step's window.
Distribute evenly but bias earlier-step boundaries shorter; later
boundaries longer (lead-in is small, execution is big).
DO NOT add, remove, or rename steps or gos. Output the same lengths back."""
    else:
        mode_block = f"""
MODE: full

The goal has NO steps yet. Generate 3-7 step phases with titles + dates,
AND 2-4 first Gos per step. Existing items if any (won't appear in
output, FYI only):
{json.dumps(existing_steps, ensure_ascii=False, indent=2)}"""

    return f"""\
GOAL
====
Title: {goal.title}
Description: {(goal.description or "—")[:600]}
Priority: {goal.priority}
Window: {start.isoformat()} → {end.isoformat()} ({days} days)

OTHER ACTIVE GOAL DEADLINES (avoid stacking new step ends on these):
{json.dumps(other_dues, ensure_ascii=False, indent=2)}
{mode_block}

OUTPUT SCHEMA
=============
{{
  "rationale": "1-2 sentences on the breakdown approach",
  "steps": [
    {{
      "title": "Step phase title",
      "description": "1 sentence on what 'done' means for this step",
      "start_date": "YYYY-MM-DD",
      "end_date":   "YYYY-MM-DD",
      "gos": [
        {{
          "title": "Concrete action",
          "description": "",
          "kind": "boolean",
          "target_value": null,
          "unit": "",
          "due_date": "YYYY-MM-DD"
        }}
      ]
    }}
  ]
}}

Allowed `kind`: "boolean" or "numeric". For numeric set target_value + unit.
In dates_only mode `gos` must be []. In full mode `gos` has 2-4 items per
step with due_date inside that step's window."""


def _parse_output(raw: str) -> GoalPlanOutput:
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
    # We'll pre-fill goal_id/title/mode after parsing — let the model focus
    # on steps + rationale.
    data.setdefault("goal_id", "")
    data.setdefault("goal_title", "")
    try:
        return GoalPlanOutput.model_validate(data)
    except ValidationError as e:
        raise ValueError(f"output fails schema: {e.errors()[:2]}") from e


def _clamp_dates(
    plan: GoalPlanOutput,
    start: date_cls,
    end: date_cls,
    mode: str,
    goal: Task,
) -> GoalPlanOutput:
    """Defence-in-depth — even with the prompt instructions, the model
    sometimes returns dates outside the window or out-of-order. We clamp
    to goal window and force step monotonicity."""
    def clamp(s: str) -> date_cls | None:
        if not s:
            return None
        try:
            d = date_cls.fromisoformat(s)
        except ValueError:
            return None
        if d < start:
            return start
        if d > end:
            return end
        return d

    last_end: date_cls | None = None
    cleaned: list[GoalPlanStep] = []
    for st in plan.steps:
        s = clamp(st.start_date) or (last_end + timedelta(days=1) if last_end else start)
        if last_end and s <= last_end:
            s = last_end + timedelta(days=1)
            if s > end:
                continue  # no room left
        e = clamp(st.end_date) or s
        if e < s:
            e = s
        if e > end:
            e = end
        st.start_date = s.isoformat()
        st.end_date = e.isoformat()

        # Clamp Go due_dates into [s, e]. Both modes now propose dates for
        # gos — in dates_only we keep gos but only their due_date is honoured
        # downstream; in full we use everything (title, kind, target, etc.).
        cleaned_gos: list[GoalPlanGo] = []
        for g in st.gos:
            gd = clamp(g.due_date)
            if gd is None or gd < s or gd > e:
                # Place mid-step as default fallback when LLM gave an out-of-
                # range or unparsable date.
                gd = s + (e - s) // 2
            g.due_date = gd.isoformat()
            cleaned_gos.append(g)
        st.gos = cleaned_gos

        last_end = e
        cleaned.append(st)

    plan.steps = cleaned
    plan.goal_id = str(goal.id)
    plan.goal_title = goal.title
    plan.mode = mode
    return plan


@register_handler("goal_plan")
async def run_goal_plan_job(
    job: AIJob,
    db: AsyncSession,
    ollama: OllamaClient,
) -> dict[str, Any]:
    try:
        params = GoalPlanCreate.model_validate(job.input_json)
        goal_uuid = uuid.UUID(params.goal_id)
    except (ValidationError, ValueError) as e:
        raise ValueError(f"invalid goal_plan input: {e}") from e

    ctx = await _load_context(job.user_id, goal_uuid, db)
    goal: Task = ctx["goal"]

    if params.mode == "dates_only" and len(goal.steps) == 0:
        raise ValueError("dates_only mode requires existing steps to date")

    start, end = _resolve_window(goal)
    prompt = _build_prompt(params.mode, goal, start, end, ctx["other_dues"])

    raw = await ollama.generate(
        prompt, system=SYSTEM_PROMPT, json_mode=True, temperature=0.4, think=False,
    )
    try:
        plan = _parse_output(raw)
    except ValueError as e:
        logger.warning("goal_plan parse failed (first try): %s — retrying", e)
        retry_prompt = (
            prompt
            + "\n\nREMINDER: respond with ONLY a JSON object matching the schema."
        )
        raw = await ollama.generate(
            retry_prompt, system=SYSTEM_PROMPT, json_mode=True, temperature=0.2, think=False,
        )
        plan = _parse_output(raw)

    plan = _clamp_dates(plan, start, end, params.mode, goal)

    logger.info(
        "goal_plan generated: goal=%s mode=%s steps=%d total_gos=%d",
        goal.title, params.mode,
        len(plan.steps),
        sum(len(s.gos) for s in plan.steps),
    )
    return plan.model_dump(mode="json")
