"""Schedule handler — deterministic "Plan day".

Turns the user's open Go backlog into a prioritised, optionally time-blocked
plan. This used to build a prompt and ask an LLM to time-block the backlog; it
now runs a plain rule-based algorithm — no model call — so "Plan day" is
instant and works even with the AI runtime offline. The output shape
(`ScheduleOutput`) is unchanged, so the drawer UI and schema are untouched.

Priority order (highest first): overdue → today → dateless. Future-dated Gos
ride along only when their Step also has an overdue/today Go (to advance that
chain). Gos in the same Step are kept together and in the Step's own order
(creation order — Gos have no explicit per-step position), placed by the Step's
most urgent Go, so urgency never scrambles the intra-step order.

Time-blocked mode lays these into 45-min work blocks within work hours, with a
short break after ~90 min of work and a lunch near mid-day. Free-order mode
leaves the times empty and just orders slots by priority. Routines are
intentionally excluded — they live in their own cadence.
"""
import logging
from collections import Counter
from datetime import date as date_cls, timedelta
from typing import Any

from pydantic import ValidationError
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.ai import AIJob
from app.models.tasks import Go, GoEntry, Step, Task
from app.schemas.ai import ScheduleCreate, ScheduleSlot
from app.services.ai.jobs import register_handler
from app.services.ai.ollama_client import OllamaClient

logger = logging.getLogger(__name__)

# How far back we look for overdue items — past this, an item is essentially
# abandoned and not worth surfacing in today's plan.
OVERDUE_WINDOW_DAYS = 30
# Cap on the total OPEN backlog we consider. Keeps a huge backlog from
# producing an unusable wall of slots.
MAX_OPEN_GOS = 30

# Time-blocking knobs (minutes).
WORK_BLOCK_MIN = 45          # length of one work slot
BREAK_MIN = 15               # short break slot
LUNCH_MIN = 45               # mid-day lunch slot
WORK_BEFORE_BREAK_MIN = 90   # insert a break after ~this much accumulated work
LUNCH_ANCHOR_MIN = 13 * 60   # aim lunch around 13:00
MIN_DAY_FOR_LUNCH_MIN = 5 * 60  # only bother with lunch on a workday ≥ 5h


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
    # (> today, within ~14 days), and dateless. Capped via MAX_OPEN_GOS so a
    # 200-row backlog doesn't turn into an unusable wall of slots.
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
            # Skip Gos whose parent goal sits in the Done column — that whole
            # goal is finished, so its steps/gos shouldn't reappear in the plan.
            # Standalone Gos (no parent Task) are kept.
            or_(Task.id.is_(None), Task.status != "done"),
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
            # Gos have no explicit per-step order field — their order within a
            # Step is creation order (the UI lists Step.gos by created_at). Keep
            # it so the plan preserves that order for same-step items.
            "created_at": go.created_at.isoformat(),
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


# ── Prioritisation ────────────────────────────────────────────────────────────

_BIG_DUE = "9999-12-31"  # sorts after every real ISO date
# Bucket urgency — lower = do sooner.
_BUCKET_TIER = {"overdue": 0, "today": 1, "dateless": 2, "future": 3}


def _prioritise(open_gos: list[dict]) -> list[tuple[dict, bool]]:
    """Rank the open backlog into the day's work order.

    Returns a list of (go, is_prereq) in the order they should be tackled.

    Gos that belong to the same Step are kept TOGETHER and in the Step's own
    order (creation order) — you can't do a step's later item before its
    earlier one. Each step is placed by its most urgent Go, so an overdue item
    still pulls its whole step forward without scrambling the intra-step order.

    Future-dated Gos are dropped unless their Step also has an overdue/today Go
    (then they ride along to advance that chain). Standalone Gos (no Step) rank
    on their own bucket + due date. Falls back to the raw backlog order if the
    future filter would leave nothing to do.
    """
    # Steps that have at least one overdue/today Go are "active" — their other
    # (future/dateless) Gos ride along so the chain advances as a unit.
    active_steps = {
        g["step_id"] for g in open_gos
        if g["step_id"] and g["bucket"] in ("overdue", "today")
    }

    kept = [
        g for g in open_gos
        if not (g["bucket"] == "future" and g["step_id"] not in active_steps)
    ]
    if not kept:
        # Everything was future-and-not-in-an-active-step — still give a plan
        # rather than an empty drawer; use the backlog's natural order.
        kept = list(open_gos)

    # Rank each Step by its most urgent Go (lowest tier, then earliest due).
    step_rank: dict[str, tuple[int, str]] = {}
    for g in kept:
        sid = g["step_id"]
        if not sid:
            continue
        key = (_BUCKET_TIER[g["bucket"]], g["due_date"] or _BIG_DUE)
        cur = step_rank.get(sid)
        if cur is None or key < cur:
            step_rank[sid] = key

    def sort_key(g: dict) -> tuple:
        sid = g["step_id"]
        if sid and sid in step_rank:
            rank_tier, rank_due = step_rank[sid]
            step_pos = g["step_position"] if g["step_position"] is not None else 9999
            # Cluster by the Step's urgency, then Step order, then the Step id
            # (keeps a step's Gos contiguous), then the Go's own creation order
            # WITHIN the step (== the order shown under the Step).
            return (rank_tier, rank_due, step_pos, sid, g["created_at"])
        # Standalone Go — ranked on its own bucket + due date.
        return (_BUCKET_TIER[g["bucket"]], g["due_date"] or _BIG_DUE, 9999, "", g["created_at"])

    kept.sort(key=sort_key)

    # A Go is "pulled in" (prereq-style rationale) when it's a future/dateless
    # item riding along because its Step is active.
    def is_pulled_in(g: dict) -> bool:
        return bool(g["step_id"] in active_steps and g["bucket"] in ("future", "dateless"))

    return [(g, is_pulled_in(g)) for g in kept]


def _note_for(g: dict, pulled_in: bool, target_date: date_cls) -> str:
    """One-line rationale, mirroring what the model used to write per slot."""
    bucket = g["bucket"]
    if bucket == "overdue":
        due = date_cls.fromisoformat(g["due_date"])
        d = (target_date - due).days
        return f"{d} day{'s' if d != 1 else ''} overdue — clear this first"
    if pulled_in:
        step = g.get("step")
        return f"Advances the “{step}” step" if step else "Advances an active step"
    if bucket == "today":
        return "Due today"
    if bucket == "dateless":
        return "Backlog — good opportunistic fill"
    return "Pulled in to advance today's chain"


# ── Slot building ─────────────────────────────────────────────────────────────

def _fmt(minutes: int) -> str:
    """Minutes-from-midnight → 'HH:MM'."""
    return f"{minutes // 60:02d}:{minutes % 60:02d}"


def _work_slot(g: dict, note: str, start: int | None = None, end: int | None = None) -> ScheduleSlot:
    return ScheduleSlot(
        start_time=_fmt(start) if start is not None else "",
        end_time=_fmt(end) if end is not None else "",
        kind="goal",
        title=g["title"],
        source_kind="go",
        source_id=g["id"],
        note=note,
    )


def _build_time_blocked(
    items: list[tuple[dict, bool]],
    start_h: int,
    end_h: int,
    target_date: date_cls,
) -> tuple[list[ScheduleSlot], int]:
    """Lay the prioritised items into work blocks within [start_h, end_h).

    Inserts a break after ~90 min of work and a single lunch near mid-day.
    Stops once the next work block wouldn't fit — leftover items stay in the
    backlog rather than overflowing the day.
    """
    start_min, end_min = start_h * 60, end_h * 60
    wants_lunch = (
        start_min <= LUNCH_ANCHOR_MIN < end_min
        and (end_min - start_min) >= MIN_DAY_FOR_LUNCH_MIN
    )
    slots: list[ScheduleSlot] = []
    active_minutes = 0
    work_since_break = 0
    lunch_done = not wants_lunch
    cursor = start_min

    for g, prereq in items:
        # Lunch first — as soon as we reach the anchor and it still fits.
        if not lunch_done and cursor >= LUNCH_ANCHOR_MIN:
            if cursor + LUNCH_MIN <= end_min:
                slots.append(ScheduleSlot(
                    start_time=_fmt(cursor), end_time=_fmt(cursor + LUNCH_MIN),
                    kind="lunch", title="Lunch break",
                ))
                cursor += LUNCH_MIN
                work_since_break = 0
            lunch_done = True  # don't keep retrying if it didn't fit

        # Short break after a stretch of work — only if real work still follows.
        if (
            work_since_break >= WORK_BEFORE_BREAK_MIN
            and cursor + BREAK_MIN + WORK_BLOCK_MIN <= end_min
        ):
            slots.append(ScheduleSlot(
                start_time=_fmt(cursor), end_time=_fmt(cursor + BREAK_MIN),
                kind="break", title="Break",
            ))
            cursor += BREAK_MIN
            work_since_break = 0

        if cursor + WORK_BLOCK_MIN > end_min:
            break  # day is full — remaining items stay in the backlog

        slots.append(_work_slot(g, _note_for(g, prereq, target_date), cursor, cursor + WORK_BLOCK_MIN))
        cursor += WORK_BLOCK_MIN
        work_since_break += WORK_BLOCK_MIN
        active_minutes += WORK_BLOCK_MIN

    return slots, active_minutes


def _build_free_order(
    items: list[tuple[dict, bool]],
    target_date: date_cls,
) -> tuple[list[ScheduleSlot], int]:
    """Priority-ordered list with no times (time_blocked=false)."""
    slots = [_work_slot(g, _note_for(g, prereq, target_date)) for g, prereq in items]
    # No timeline → no honest "active minutes" figure; the drawer hides it at 0.
    return slots, 0


# ── Narrative summary ─────────────────────────────────────────────────────────

def _build_summary(
    context: dict,
    selected: list[tuple[dict, bool]],
    target_date: date_cls,
) -> dict[str, str]:
    """Focus / on-track / needs-attention lines derived from the backlog."""
    open_gos = context["open_gos"]
    overdue_gos = context["overdue_gos"]
    n_overdue = len(overdue_gos)
    n_today = sum(1 for g in open_gos if g["bucket"] == "today")
    n_dateless = sum(1 for g in open_gos if g["bucket"] == "dateless")
    n_pulled = sum(1 for _, pulled_in in selected if pulled_in)

    # Which goal carries the most of today's picked work.
    goal_counts = Counter(g["goal"] for g, _ in selected if g["goal"])
    top_goal = goal_counts.most_common(1)[0][0] if goal_counts else None

    # focus
    if n_overdue:
        focus = f"Clear {n_overdue} overdue item{'s' if n_overdue != 1 else ''} before starting anything new"
        focus += f" — most load sits on “{top_goal}”." if top_goal else "."
    elif top_goal:
        focus = f"Push “{top_goal}” forward — it has the most on your plate today."
    elif n_today:
        focus = f"{n_today} item{'s' if n_today != 1 else ''} due today — work them top-down."
    else:
        focus = "No dated work — pull from the backlog and build momentum."

    # doing_well
    if n_overdue == 0 and (n_today or n_dateless):
        doing_well = "Nothing overdue — you're keeping pace with the backlog."
    elif n_overdue and n_today == 0:
        doing_well = "No new items due today, so the slip is contained to older work."
    else:
        doing_well = ""

    # needs_attention
    if n_overdue:
        oldest = max(g["days_overdue"] for g in overdue_gos)
        needs_attention = (
            f"{n_overdue} overdue, oldest {oldest} day{'s' if oldest != 1 else ''} back "
            "— tackle these before they pile up."
        )
    elif n_pulled:
        needs_attention = (
            f"{n_pulled} item{'s' if n_pulled != 1 else ''} pulled in to keep active step "
            "chains moving — don't let them stall."
        )
    else:
        needs_attention = ""

    return {"focus": focus, "doing_well": doing_well, "needs_attention": needs_attention}


# ── Handler ───────────────────────────────────────────────────────────────────

@register_handler("schedule")
async def run_schedule_job(
    job: AIJob,
    db: AsyncSession,
    ollama: OllamaClient,  # unused — kept to satisfy the handler contract
) -> dict[str, Any]:
    try:
        params = ScheduleCreate.model_validate(job.input_json)
    except ValidationError as e:
        raise ValueError(f"invalid schedule input: {e.errors()[:2]}") from e

    # Resolve date — empty string means "today". Without timezone info we use
    # UTC date; the client can pass an explicit date to override.
    if params.date:
        try:
            target_date = date_cls.fromisoformat(params.date)
        except ValueError as e:
            raise ValueError(f"invalid date {params.date!r}: {e}") from e
    else:
        from datetime import UTC, datetime
        target_date = datetime.now(UTC).date()

    if params.hours.end_h <= params.hours.start_h:
        raise ValueError("hours.end_h must be greater than hours.start_h")

    context = await _load_today_context(job.user_id, target_date, db)
    if not context["open_gos"]:
        # Truly nothing — no overdue, no today, no future, no dateless.
        raise ValueError(
            "no open go-tasks anywhere — create at least one go-item, then try again",
        )

    selected = _prioritise(context["open_gos"])
    if params.time_blocked:
        slots, active_minutes = _build_time_blocked(
            selected, params.hours.start_h, params.hours.end_h, target_date,
        )
    else:
        slots, active_minutes = _build_free_order(selected, target_date)

    output = {
        "date": target_date.isoformat(),
        "summary": _build_summary(context, selected, target_date),
        "slots": [s.model_dump(mode="json") for s in slots],
        "total_active_minutes": active_minutes,
    }

    logger.info(
        "schedule built (rule-based): date=%s mode=%s slots=%d open=%d overdue=%d goals=%d",
        target_date,
        "time" if params.time_blocked else "free",
        len(slots),
        len(context["open_gos"]),
        len(context["overdue_gos"]),
        len(context["active_goals"]),
    )
    return output
