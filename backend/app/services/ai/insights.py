"""Weekly insights — analytical narrative from the user's last 7 days of activity.

Reads:
  - Gos created / closed this week (GoEntry presence = "closed")
  - Notes added
  - Active goals overview
  - Overdue tasks at this moment

Outputs three short narrative sections (1-2 sentences each):
  - doing_well — where the user is on track
  - needs_attention — stale work, overdue, slipping streaks
  - focus — what to prioritise next week

Grounded in real numbers + entity titles. Empty strings if the model can't
observe something honestly.
"""
import json
import logging
from datetime import UTC, date as date_cls, datetime, timedelta
from typing import Any

from pydantic import ValidationError
from sqlalchemy import distinct, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.ai import AIJob
from app.models.notes import Note, Way
from app.models.tasks import Go, GoEntry, Task
from app.schemas.ai import InsightsCreate, InsightsMetrics, InsightsSummary
from app.services.ai.jobs import register_handler
from app.services.ai.ollama_client import OllamaClient

logger = logging.getLogger(__name__)


SYSTEM_PROMPT = """\
/no_think

You are a productivity coach. Given concrete metrics + entity titles for a \
date window, produce a SHORT narrative review with three sections:
1. doing_well — observable positive patterns (1-2 sentences, ground in numbers/titles)
2. needs_attention — stale work, overdue items, dropped routines (1-2 sentences)
3. focus — what to prioritise next (1-2 sentences)

Hard rules:
- Output language matches the language of goal/note titles in the data.
- Be CONCRETE — reference real numbers and titles, never platitudes.
- Match observations to the WINDOW LENGTH: don't talk about weekly patterns \
on a 365-day window, or annual trends on a 7-day window.
- If you genuinely can't observe something, return an empty string for that field.
- Output STRICTLY valid JSON. No prose, no markdown, no <think> blocks."""


def _resolve_window(params: InsightsCreate) -> tuple[date_cls, date_cls]:
    """Return (start, end) — inclusive on both ends.

    Priority:
      1. If params.week_start is set → that Monday-anchored 7-day window.
      2. Otherwise → today and (today - range_days + 1).
    """
    today = datetime.now(UTC).date()
    if params.week_start:
        start = date_cls.fromisoformat(params.week_start)
        return start, start + timedelta(days=6)
    start = today - timedelta(days=params.range_days - 1)
    return start, today


async def _load_weekly_metrics(
    user_id, week_start: date_cls, week_end: date_cls, db: AsyncSession,
) -> dict[str, Any]:
    """Gather raw metrics + entity titles to feed into the LLM."""
    # Gos created in window
    gos_created_q = await db.execute(
        select(func.count()).select_from(Go).where(
            Go.user_id == user_id,
            Go.created_at >= datetime.combine(week_start, datetime.min.time(), UTC),
            Go.created_at <= datetime.combine(week_end, datetime.max.time(), UTC),
        ),
    )
    gos_created = gos_created_q.scalar_one()

    # Gos "closed": those with at least one GoEntry in window (best-effort
    # without a dedicated completion field).
    gos_closed_q = await db.execute(
        select(func.count(distinct(GoEntry.go_id)))
        .join(Go, GoEntry.go_id == Go.id)
        .where(
            Go.user_id == user_id,
            GoEntry.date >= week_start,
            GoEntry.date <= week_end,
            GoEntry.value > 0,
        ),
    )
    gos_closed = gos_closed_q.scalar_one()

    # Overdue right now (not date-limited — surfaces accumulated drift)
    today = datetime.now(UTC).date()
    overdue_q = await db.execute(
        select(func.count()).select_from(Go).where(
            Go.user_id == user_id,
            Go.due_date.isnot(None),
            Go.due_date < today,
        ),
    )
    overdue_count = overdue_q.scalar_one()

    # Notes created in window — join through ways/topics to filter by user
    notes_q = await db.execute(
        select(func.count(Note.id))
        .outerjoin(Way, Note.way_id == Way.id)
        .where(
            Note.created_at >= datetime.combine(week_start, datetime.min.time(), UTC),
            Note.created_at <= datetime.combine(week_end, datetime.max.time(), UTC),
            Way.user_id == user_id,
        ),
    )
    notes_created = notes_q.scalar_one()

    # Active goals: titles + per-goal Go counts
    active_goals_q = await db.execute(
        select(Task).where(Task.user_id == user_id, Task.status == "active"),
    )
    active_goals: list[dict] = []
    for t in active_goals_q.scalars().all():
        active_goals.append({
            "title": t.title,
            "priority": t.priority,
            "has_due_date": t.due_date is not None,
        })

    # Sample of overdue items (titles) — gives the model material to reference
    overdue_sample_q = await db.execute(
        select(Go, Task).outerjoin(Task, Go.task_id == Task.id).where(
            Go.user_id == user_id,
            Go.due_date.isnot(None),
            Go.due_date < today,
        ).order_by(Go.due_date.asc()).limit(8),
    )
    overdue_sample: list[dict] = []
    for go, task in overdue_sample_q.all():
        days = (today - go.due_date).days if go.due_date else 0
        overdue_sample.append({
            "title": go.title,
            "goal": task.title if task else None,
            "days_overdue": days,
        })

    return {
        "metrics": {
            "gos_created": gos_created,
            "gos_closed": gos_closed,
            "notes_created": notes_created,
            "overdue_count": overdue_count,
            "active_goals": len(active_goals),
        },
        "active_goals": active_goals,
        "overdue_sample": overdue_sample,
    }


def _build_prompt(week_start: date_cls, week_end: date_cls, context: dict) -> str:
    m = context["metrics"]
    goals_block = json.dumps(context["active_goals"], ensure_ascii=False, indent=2)
    overdue_block = json.dumps(context["overdue_sample"], ensure_ascii=False, indent=2)

    days = (week_end - week_start).days + 1
    return f"""\
Review the user's activity from {week_start.isoformat()} to {week_end.isoformat()} \
({days} days).

═══ METRICS ═══
- Gos created:    {m['gos_created']}
- Gos closed:     {m['gos_closed']}  (had at least one entry this week)
- Notes added:    {m['notes_created']}
- Overdue count:  {m['overdue_count']}  (across all time)
- Active goals:   {m['active_goals']}

═══ ACTIVE GOALS ═══
{goals_block}

═══ OVERDUE SAMPLE (oldest first, up to 8) ═══
{overdue_block}

Produce a 3-section narrative review.

JSON schema:
{{
  "summary": {{
    "doing_well": "1-2 sentences with concrete data points",
    "needs_attention": "1-2 sentences, name overdue goals/items if patterns",
    "focus": "1-2 sentences with next-week priorities"
  }}
}}"""


def _parse_output(raw: str) -> InsightsSummary:
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

    summary_raw = data.get("summary") or {}
    try:
        return InsightsSummary.model_validate(summary_raw)
    except ValidationError as e:
        raise ValueError(f"summary fails schema: {e.errors()[:2]}") from e


@register_handler("insights")
async def run_insights_job(
    job: AIJob,
    db: AsyncSession,
    ollama: OllamaClient,
) -> dict[str, Any]:
    try:
        params = InsightsCreate.model_validate(job.input_json)
    except ValidationError as e:
        raise ValueError(f"invalid insights input: {e.errors()[:2]}") from e

    week_start, week_end = _resolve_window(params)

    context = await _load_weekly_metrics(job.user_id, week_start, week_end, db)
    if context["metrics"]["active_goals"] == 0 and context["metrics"]["gos_created"] == 0:
        raise ValueError("no activity this week — nothing to review")

    prompt = _build_prompt(week_start, week_end, context)

    raw = await ollama.generate(
        prompt, system=SYSTEM_PROMPT, json_mode=True, temperature=0.4, think=False,
    )
    try:
        summary = _parse_output(raw)
    except ValueError as e:
        logger.warning("insights parse failed (first try): %s — retrying", e)
        retry_prompt = prompt + "\n\nREMINDER: respond with ONLY a JSON object."
        raw = await ollama.generate(
            retry_prompt, system=SYSTEM_PROMPT, json_mode=True, temperature=0.2, think=False,
        )
        summary = _parse_output(raw)

    logger.info(
        "insights generated: week=%s metrics=%s",
        week_start.isoformat(), context["metrics"],
    )
    return {
        "week_start": week_start.isoformat(),
        "week_end": week_end.isoformat(),
        "summary": summary.model_dump(mode="json"),
        "metrics": InsightsMetrics(**context["metrics"]).model_dump(mode="json"),
    }
