"""Coach — action-oriented AI panel for the Analysis view.

Unlike `insights` (which narrates a past window), Coach focuses on the
present and the next 7 days. It surfaces:
  1. ONE PLAY — single highest-leverage action right now.
  2. AT RISK — concrete losses if no action (loss-aversion framing).
  3. IF-THEN — one implementation intention plan to pre-commit.
  4. CAPACITY — honest math: due-load vs throughput, plus a note.
  5. HIDDEN LEVER — Eisenhower Q2 (important, not urgent).

Design notes
============
- We do NOT trust the LLM with arithmetic. Capacity numbers (due count,
  weekly throughput, gap) are computed deterministically in Python and
  fed into the prompt. The model contributes the surrounding narrative.
- Risks are pre-computed as candidates (streak about to die, goal slip
  projection, overdue clustering) — the LLM picks the 2-3 most relevant
  and rewrites them as user-facing prose. Hallucinated risks are dropped
  by id-matching against the candidate pool.
- One play and hidden lever are model picks from candidate lists too;
  for one_play we narrow to "stagnant goal with closest deadline" type
  candidates so the model can't invent goals that don't exist.
"""
import json
import logging
from datetime import UTC, date as date_cls, datetime, timedelta
from typing import Any

from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.ai import AIJob
from app.models.tasks import Go, GoEntry, Routine, Task
from app.schemas.ai import (
    CoachCapacity,
    CoachCreate,
    CoachHiddenLever,
    CoachIfThen,
    CoachOnePlay,
    CoachOutput,
    CoachRisk,
)
from app.services.ai.jobs import register_handler
from app.services.ai.ollama_client import OllamaClient
from app.services.tasks import task_progress_pct

logger = logging.getLogger(__name__)


SYSTEM_PROMPT = """\
/no_think

You are a productivity coach acting on real numbers, not opinions. The
user already sees the dashboard; your job is to surface ONE leveraged
action and a few concrete risks they'd otherwise miss. Be short, specific,
and rooted in the data block — no platitudes, no generic advice.

HARD RULES:
1. Output language matches the language of titles in the data.
2. Reference real entity titles wherever possible — e.g. instead of
   "your stagnant goal", name the goal.
3. The IF-THEN trigger must be a concrete cue the user reliably hits
   (morning standup, finishing coffee, end of work day). NOT a clock time.
4. The HIDDEN LEVER is Eisenhower Q2: pick a goal that is important
   (high priority OR closest payoff) but has no recent activity.
5. Output STRICTLY valid JSON. No prose, no markdown, no <think> blocks."""


# ── Data gathering ───────────────────────────────────────────────────────


async def _load_context(
    user_id, period_start: date_cls, today: date_cls, db: AsyncSession,
) -> dict[str, Any]:
    """Gather everything the coach needs. Goals + their Gos + their entries
    via selectinload chains to avoid lazy-load in async session."""
    soon = today + timedelta(days=7)

    # Active goals with full Go/entry chain — needed for pace + risk math.
    goals_q = await db.execute(
        select(Task).options(
            selectinload(Task.gos).selectinload(Go.entries),
        ).where(Task.user_id == user_id, Task.status == "active"),
    )
    goals = list(goals_q.scalars().all())

    # Routines + entries — for streak risk detection.
    routines_q = await db.execute(
        select(Routine).where(Routine.user_id == user_id, Routine.is_paused.is_(False)),
    )
    routines = list(routines_q.scalars().all())

    # Overdue Gos (any goal) — concrete loss candidates.
    overdue_q = await db.execute(
        select(Go).where(
            Go.user_id == user_id,
            Go.due_date.isnot(None),
            Go.due_date < today,
            Go.item_kind == "one_off",
        ).order_by(Go.due_date.asc()),
    )
    overdue = list(overdue_q.scalars().all())

    # Closed-this-week entries — denominator for throughput.
    week_ago = today - timedelta(days=7)
    entries_q = await db.execute(
        select(GoEntry).join(Go, GoEntry.go_id == Go.id).where(
            Go.user_id == user_id,
            GoEntry.date >= week_ago,
            GoEntry.date <= today,
            GoEntry.value > 0,
        ),
    )
    week_entries = list(entries_q.scalars().all())

    # Period-wide closed entries for the longer-window throughput baseline.
    period_entries_q = await db.execute(
        select(GoEntry).join(Go, GoEntry.go_id == Go.id).where(
            Go.user_id == user_id,
            GoEntry.date >= period_start,
            GoEntry.date <= today,
            GoEntry.value > 0,
        ),
    )
    period_entries = list(period_entries_q.scalars().all())

    return {
        "goals": goals,
        "routines": routines,
        "overdue": overdue,
        "week_entries": week_entries,
        "period_entries": period_entries,
        "today": today,
        "soon": soon,
        "period_start": period_start,
    }


# ── Deterministic facts (LLM doesn't do math) ────────────────────────────


def _compute_capacity(ctx: dict[str, Any]) -> dict[str, int]:
    """Due count in next 7d vs throughput observed in last 7d."""
    today = ctx["today"]
    soon = ctx["soon"]

    due_count = 0
    for g in ctx["goals"]:
        for go in g.gos:
            if go.due_date and today <= go.due_date <= soon:
                # "Open" = no completion entry today
                done_today = any(e.date == today and e.value > 0 for e in go.entries)
                if not done_today:
                    due_count += 1

    throughput = len(ctx["week_entries"])
    return {
        "due_count": due_count,
        "throughput_per_week": throughput,
        "gap": due_count - throughput,
    }


def _build_risk_candidates(ctx: dict[str, Any]) -> list[dict[str, Any]]:
    """Concrete loss candidates with a stable id so we can validate later."""
    today: date_cls = ctx["today"]
    candidates: list[dict[str, Any]] = []

    # ── Routine streak deaths ────────────────────────────────────────
    for r in ctx["routines"]:
        # Only daily/weekly routines that have actually been done recently
        # have a meaningful "streak about to die" risk. Skip cold routines
        # (no entries in the last 30 days) — those aren't at risk; they're
        # already broken.
        recent = [e for e in r.entries if e.value > 0 and e.date >= today - timedelta(days=30)]
        if not recent:
            continue
        last_done = max(e.date for e in recent)
        days_since = (today - last_done).days
        if r.schedule_type == "daily" and days_since == 0:
            # Doing well today already
            continue
        # Estimate streak length (consecutive days back from last_done).
        streak = 1
        cur = last_done
        days_set = {e.date for e in recent}
        while True:
            prev = cur - timedelta(days=1)
            if prev in days_set:
                streak += 1
                cur = prev
            else:
                break
        if streak >= 3 and days_since <= 1:
            # "Streak at risk" — N-day streak with one missed day already
            candidates.append({
                "kind": "streak",
                "id": f"streak:{r.id}",
                "what": f"{streak}-day «{r.title}» streak dies if not logged today",
                "when_label": "today" if days_since == 0 else f"{days_since}d gap",
                "severity": "high" if streak >= 7 else "warn",
            })

    # ── Goal slip projections ───────────────────────────────────────
    for g in ctx["goals"]:
        if not g.due_date or not g.start_date:
            continue
        total_ms = (g.due_date - g.start_date).days
        if total_ms <= 0:
            continue
        elapsed = max(0, (today - g.start_date).days)
        expected_pct = min(100, int((elapsed / total_ms) * 100))
        actual_pct = int(task_progress_pct(g))
        gap = expected_pct - actual_pct
        if gap >= 15:
            # At current pace, days to finish remaining work:
            remaining_pct = max(1, 100 - actual_pct)
            days_per_pct = max(1, elapsed) / max(1, actual_pct) if actual_pct > 0 else 0
            extra_days = int(remaining_pct * days_per_pct) - max(0, (g.due_date - today).days)
            if extra_days > 0:
                candidates.append({
                    "kind": "slip",
                    "id": f"slip:{g.id}",
                    "what": f"«{g.title}» projected +{extra_days}d past its deadline at current pace",
                    "when_label": f"+{extra_days}d slip",
                    "severity": "high" if extra_days > 14 else "warn",
                })

    # ── Overdue chronic-cluster ─────────────────────────────────────
    overdue = ctx["overdue"]
    if len(overdue) >= 3:
        threshold = today - timedelta(days=7)
        crossing = sum(1 for g in overdue if g.due_date and g.due_date <= threshold)
        if crossing > 0:
            candidates.append({
                "kind": "overdue",
                "id": "overdue:cluster",
                "what": f"{len(overdue)} overdue Gos · {crossing} cross the 7-day threshold this week",
                "when_label": "7d",
                "severity": "warn",
            })
        else:
            # Soft warning: overdue exists but none chronic yet
            candidates.append({
                "kind": "overdue",
                "id": "overdue:cluster",
                "what": f"{len(overdue)} overdue Gos accumulating — handle before they become chronic",
                "when_label": "7d",
                "severity": "low",
            })

    return candidates


def _pick_one_play_candidate(ctx: dict[str, Any]) -> dict[str, Any] | None:
    """Best-leverage candidate for THE ONE PLAY. Heuristic:
       1. Stagnant active goal (no entry in 7d) AND has nearest due_date.
       2. Otherwise, the active goal with the largest pace gap (most behind).
       3. Otherwise, the highest-priority overdue Go.
    """
    today: date_cls = ctx["today"]
    week_ago = today - timedelta(days=7)

    # 1. Stagnant + close-deadline goals
    stagnant: list[tuple[Task, int]] = []
    for g in ctx["goals"]:
        last_entry = None
        for go in g.gos:
            for e in go.entries:
                if e.value > 0 and (last_entry is None or e.date > last_entry):
                    last_entry = e.date
        is_stagnant = last_entry is None or last_entry < week_ago
        if is_stagnant and g.due_date:
            days_left = (g.due_date - today).days
            stagnant.append((g, days_left))
    if stagnant:
        # Nearest deadline first; allow negative (overdue) → highest priority
        stagnant.sort(key=lambda t: t[1])
        g = stagnant[0][0]
        return {
            "kind": "goal",
            "id": str(g.id),
            "title": g.title,
            "reason": "stagnant + nearest deadline",
        }

    # 2. Largest pace gap
    gaps: list[tuple[Task, int]] = []
    for g in ctx["goals"]:
        if not g.due_date or not g.start_date:
            continue
        total = (g.due_date - g.start_date).days
        if total <= 0:
            continue
        elapsed = max(0, (today - g.start_date).days)
        expected = int((elapsed / total) * 100)
        actual = int(task_progress_pct(g))
        gaps.append((g, expected - actual))
    if gaps:
        gaps.sort(key=lambda t: -t[1])
        g = gaps[0][0]
        return {
            "kind": "goal",
            "id": str(g.id),
            "title": g.title,
            "reason": "biggest pace gap",
        }

    # 3. Earliest overdue Go
    overdue = ctx["overdue"]
    if overdue:
        g = overdue[0]
        return {
            "kind": "go",
            "id": str(g.id),
            "title": g.title,
            "reason": "earliest overdue",
        }

    return None


def _pick_hidden_lever_candidate(ctx: dict[str, Any]) -> dict[str, Any] | None:
    """Eisenhower Q2 — high-priority active goal that hasn't been touched
    recently. Differs from one_play in that we DON'T pick the same target."""
    today: date_cls = ctx["today"]
    week_ago = today - timedelta(days=14)

    for g in ctx["goals"]:
        if g.priority != "high":
            continue
        last_entry = None
        for go in g.gos:
            for e in go.entries:
                if e.value > 0 and (last_entry is None or e.date > last_entry):
                    last_entry = e.date
        if last_entry is None or last_entry < week_ago:
            return {
                "kind": "goal",
                "id": str(g.id),
                "title": g.title,
                "reason": "high priority + cold",
            }
    return None


# ── LLM prompt + parsing ─────────────────────────────────────────────────


def _build_prompt(
    capacity: dict[str, int],
    risks: list[dict[str, Any]],
    one_play: dict[str, Any] | None,
    hidden_lever: dict[str, Any] | None,
    ctx: dict[str, Any],
) -> str:
    today = ctx["today"]

    # Goals titles + priorities, so the model has language to riff with.
    goal_titles = [
        {"id": str(g.id), "title": g.title, "priority": g.priority}
        for g in ctx["goals"][:20]
    ]

    return f"""\
Today is {today.isoformat()}.

═══ COMPUTED FACTS — use these numbers verbatim ═══
- due_count (next 7d):         {capacity['due_count']}
- throughput_per_week:         {capacity['throughput_per_week']}
- gap (overload if positive):  {capacity['gap']}
- active goals:                {len(ctx['goals'])}
- routines (active):           {len(ctx['routines'])}
- overdue total:               {len(ctx['overdue'])}

═══ GOAL TITLES (for language) ═══
{json.dumps(goal_titles, ensure_ascii=False, indent=2)}

═══ RISK CANDIDATES — pick at most 3 most concrete ═══
{json.dumps(risks, ensure_ascii=False, indent=2)}

═══ ONE PLAY CANDIDATE ═══
{json.dumps(one_play, ensure_ascii=False, indent=2)}

═══ HIDDEN LEVER CANDIDATE ═══
{json.dumps(hidden_lever, ensure_ascii=False, indent=2)}

Produce a Coach panel. JSON schema:
{{
  "one_play": {{
    "what": "Short verb-first action sentence referencing a real title",
    "why": "1-sentence justification grounded in the data",
    "est_minutes": 25
  }},
  "at_risk": [
    {{
      "what": "Rewrite of a risk candidate in user-facing prose",
      "when_label": "≤8 chars chip like '14h left' / '+23d slip' / '7d'",
      "severity": "low|warn|high"
    }}
  ],
  "if_then": {{
    "trigger": "Concrete cue (NOT a clock time)",
    "action": "Specific action referencing the one_play target if possible"
  }},
  "hidden_lever": {{
    "what": "Name the goal + the lever it represents (1 sentence)",
    "why": "Why this is high-value but never urgent (1 sentence)"
  }},
  "capacity_note": "ONE sentence framing the due_count/throughput math"
}}

Pick at most 3 risks. If a candidate list is empty, return null for the
corresponding field. Do not invent ids or titles. Keep total output tight."""


def _parse_output(raw: str) -> dict[str, Any]:
    if not raw or not raw.strip():
        raise ValueError("empty response from model")
    text = raw.strip()
    if text.startswith("```"):
        text = text.strip("`")
        if text.startswith("json"):
            text = text[4:]
        text = text.strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError as e:
        raise ValueError(f"model returned invalid JSON: {e}") from e


def _assemble_output(
    period_start: date_cls,
    period_end: date_cls,
    parsed: dict[str, Any],
    capacity: dict[str, int],
    risks: list[dict[str, Any]],
) -> CoachOutput:
    # One play — model output trumps candidate if both exist; we keep
    # est_minutes within a sane range.
    op_raw = parsed.get("one_play") or {}
    one_play = CoachOnePlay(
        what=str(op_raw.get("what") or "").strip()[:200] or "Open your most stagnant goal",
        why=str(op_raw.get("why") or "").strip()[:300],
        est_minutes=max(5, min(180, int(op_raw.get("est_minutes") or 25))),
    )

    # Risks — accept at most 3, drop empties.
    at_risk: list[CoachRisk] = []
    for r in (parsed.get("at_risk") or [])[:3]:
        what = str(r.get("what") or "").strip()
        if not what:
            continue
        when = str(r.get("when_label") or "").strip()[:12] or "soon"
        sev_raw = (r.get("severity") or "warn").strip().lower()
        sev = sev_raw if sev_raw in {"low", "warn", "high"} else "warn"
        at_risk.append(CoachRisk(what=what[:240], when_label=when, severity=sev))

    # If-then — only emit if both fields present.
    ift_raw = parsed.get("if_then") or {}
    trigger = str(ift_raw.get("trigger") or "").strip()
    action = str(ift_raw.get("action") or "").strip()
    if_then = (
        CoachIfThen(trigger=trigger[:160], action=action[:240])
        if trigger and action
        else None
    )

    # Hidden lever — same null-rule.
    hl_raw = parsed.get("hidden_lever") or {}
    hl_what = str(hl_raw.get("what") or "").strip()
    hl_why = str(hl_raw.get("why") or "").strip()
    hidden_lever = (
        CoachHiddenLever(what=hl_what[:240], why=hl_why[:300])
        if hl_what
        else None
    )

    # Capacity — math is server-computed; only the note comes from LLM.
    note = str(parsed.get("capacity_note") or "").strip()[:240]
    cap = CoachCapacity(
        due_count=capacity["due_count"],
        throughput_per_week=capacity["throughput_per_week"],
        gap=capacity["gap"],
        note=note,
    )

    # Drop AT-RISK rows the LLM hallucinated by checking against the
    # candidate pool's "what" sentences — if every risk has 0-token overlap
    # with any candidate, treat as hallucination and fall back to the raw
    # candidate text. (Cheap defence: many LLMs paraphrase faithfully.)
    if at_risk and risks:
        candidate_words = {w for c in risks for w in c["what"].lower().split() if len(w) > 3}
        kept: list[CoachRisk] = []
        for r in at_risk:
            words = {w for w in r.what.lower().split() if len(w) > 3}
            if not candidate_words or words.intersection(candidate_words):
                kept.append(r)
        if kept:
            at_risk = kept

    return CoachOutput(
        period_start=period_start.isoformat(),
        period_end=period_end.isoformat(),
        one_play=one_play,
        at_risk=at_risk,
        if_then=if_then,
        capacity=cap,
        hidden_lever=hidden_lever,
    )


# ── Handler ─────────────────────────────────────────────────────────────


@register_handler("coach")
async def run_coach_job(
    job: AIJob,
    db: AsyncSession,
    ollama: OllamaClient,
) -> dict[str, Any]:
    try:
        params = CoachCreate.model_validate(job.input_json)
    except ValidationError as e:
        raise ValueError(f"invalid coach input: {e.errors()[:2]}") from e

    today = datetime.now(UTC).date()
    period_start = today - timedelta(days=params.range_days - 1)

    ctx = await _load_context(job.user_id, period_start, today, db)
    if not ctx["goals"] and not ctx["routines"]:
        raise ValueError("no active goals or routines — nothing to coach on")

    capacity = _compute_capacity(ctx)
    risks = _build_risk_candidates(ctx)
    one_play = _pick_one_play_candidate(ctx)
    hidden_lever = _pick_hidden_lever_candidate(ctx)

    prompt = _build_prompt(capacity, risks, one_play, hidden_lever, ctx)

    raw = await ollama.generate(
        prompt, system=SYSTEM_PROMPT, json_mode=True, temperature=0.35, think=False,
    )
    try:
        parsed = _parse_output(raw)
    except ValueError as e:
        logger.warning("coach parse failed (first try): %s — retrying", e)
        retry_prompt = prompt + "\n\nREMINDER: respond with ONLY a JSON object."
        raw = await ollama.generate(
            retry_prompt, system=SYSTEM_PROMPT, json_mode=True, temperature=0.2, think=False,
        )
        parsed = _parse_output(raw)

    output = _assemble_output(period_start, today, parsed, capacity, risks)
    logger.info(
        "coach generated: due=%d throughput=%d gap=%d risks=%d if_then=%s lever=%s",
        capacity["due_count"], capacity["throughput_per_week"], capacity["gap"],
        len(output.at_risk),
        bool(output.if_then), bool(output.hidden_lever),
    )
    return output.model_dump(mode="json")
