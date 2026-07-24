"""AI feature endpoints — generic job queue surface.

Per-feature endpoints (quiz, schedule, insights) build on top of this:
they validate their input shape, then call `create_job` with the
appropriate kind. The polling and history endpoints below are shared
across all features.

Auth: every endpoint requires the bearer token. Users can only see their
own jobs.

Ollama health: enqueue is gated by `OllamaClient.health()` so we fail fast
with 503 instead of queuing jobs that will all fail downstream.
"""
import logging
import uuid
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.ai import AIJob, AIQuiz, AIQuizAttempt
from app.models.notes import Note, Topic, Way
from app.models.tasks import Task
from app.models.user import User
from app.schemas.ai import (
    AIJobBrief,
    AIJobCreate,
    AIJobOut,
    AIQuizOut,
    CoachCreate,
    GoalPlanCreate,
    InsightsCreate,
    QuizAttemptCreate,
    QuizAttemptItemOut,
    QuizAttemptOut,
    QuizCreate,
    ScheduleCreate,
    SprintPlanCreate,
)
from app.services.ai.cache import (
    coach_cache_key,
    find_cached,
    goal_plan_cache_key,
    insights_cache_key,
    quiz_cache_key,
    schedule_cache_key,
)
from app.services.ai.jobs import (
    cancel_job,
    create_job,
    list_recent_jobs,
    supported_kinds,
)
from app.services.ai.queue import job_queue
from app.services.ai.ollama_client import OllamaClient

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ai", tags=["ai"])


@router.get("/health")
async def ai_health() -> dict:
    """Reports whether the local AI runtime is reachable. Used by the
    frontend to show 'AI offline' state before letting the user try."""
    async with OllamaClient() as ollama:
        ok = await ollama.health()
    return {"ok": ok, "kinds": supported_kinds()}


@router.post("/jobs", response_model=AIJobOut, status_code=status.HTTP_202_ACCEPTED)
async def enqueue_job(
    body: AIJobCreate,
    background_tasks: BackgroundTasks,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Enqueue an AI job. Returns immediately with the job in 'queued'
    status. Client polls GET /ai/jobs/{id} for status + output.

    Returns 503 if the AI runtime is unreachable so the user isn't left
    waiting on a job that will never complete.
    """
    # Health gate. If Ollama can't even respond to /api/tags, the job won't
    # succeed — better to surface that now.
    async with OllamaClient() as ollama:
        if not await ollama.health():
            raise HTTPException(
                status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="AI runtime is offline. Try again in a moment.",
            )

    try:
        job = await create_job(
            user_id=user.id,
            kind=body.kind,
            input_data=body.input,
            eta_seconds=_estimate_eta(body.kind, body.input),
            db=db,
        )
    except ValueError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=str(e)) from e

    # Commit BEFORE scheduling — the BackgroundTask opens a new session and
    # would otherwise race against the request's transaction, seeing 'job
    # not found'. The dependency's post-yield commit becomes a harmless no-op
    # after this point.
    await db.commit()
    await job_queue.enqueue(job.id)
    return job


@router.get("/jobs/{job_id}", response_model=AIJobOut)
async def get_job(
    job_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Status + output (if completed) for a single job."""
    job = await db.get(AIJob, job_id)
    if job is None or job.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="job not found")
    return job


@router.get("/jobs", response_model=list[AIJobBrief])
async def list_jobs(
    kind: str | None = Query(default=None, description="filter by kind"),
    limit: int = Query(default=30, ge=1, le=100),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Recent jobs for the current user — used to rehydrate the AI-jobs
    sidebar. Quiz / goal-plan titles are resolved here (batch SELECT on
    notes / tasks) so the frontend doesn't have to fetch each one
    individually."""
    jobs = await list_recent_jobs(user_id=user.id, db=db, kind=kind, limit=limit)

    # Collect the note ids referenced by single-note quizzes — we'll
    # resolve their titles in one round-trip.
    note_ids: set[uuid.UUID] = set()
    for j in jobs:
        if j.kind != "quiz":
            continue
        scope = (j.input_json or {}).get("scope") or {}
        if scope.get("kind") == "note" and scope.get("id"):
            try:
                note_ids.add(uuid.UUID(str(scope["id"])))
            except (ValueError, TypeError):
                continue

    note_titles: dict[uuid.UUID, str] = {}
    if note_ids:
        rows = await db.execute(
            select(Note.id, Note.name).where(Note.id.in_(note_ids)),
        )
        note_titles = {nid: name for (nid, name) in rows.all()}

    # Same batch-resolution pattern for goal_plan jobs: the toast / panel
    # need the goal's title ("Goal plan · <goal title> · <mode>") so the
    # user can tell which goal is being planned when several are in flight.
    goal_ids: set[uuid.UUID] = set()
    for j in jobs:
        if j.kind != "goal_plan":
            continue
        gid = (j.input_json or {}).get("goal_id")
        if gid:
            try:
                goal_ids.add(uuid.UUID(str(gid)))
            except (ValueError, TypeError):
                continue

    goal_titles: dict[uuid.UUID, str] = {}
    if goal_ids:
        rows = await db.execute(
            select(Task.id, Task.title).where(Task.id.in_(goal_ids)),
        )
        goal_titles = {gid: title for (gid, title) in rows.all()}

    # Mode → user-facing action label. Used to compose the toast/panel line
    # as: `<Action> for "<goal title>"`, e.g. `Fill missing dates for
    # "Изучить английский язык"`. The labels are sentence-case because they
    # become the toast headline (no "Goal plan ·" prefix). `dates_only` is
    # a legacy alias for `fill_dates`.
    GOAL_PLAN_MODE_LABELS = {
        "full":            "Full plan",
        "fill_dates":      "Fill missing dates",
        "dates_only":      "Fill missing dates",
        "rebalance_dates": "Rebalance dates",
    }

    def _title_for(j: AIJob) -> str | None:
        if j.kind == "quiz":
            scope = (j.input_json or {}).get("scope") or {}
            skind = scope.get("kind")
            if skind == "note":
                try:
                    nid = uuid.UUID(str(scope.get("id")))
                except (ValueError, TypeError):
                    return None
                return note_titles.get(nid)
            if skind == "all":
                return "all notes"
            if skind == "multi":
                ids = scope.get("ids") or []
                return f"{len(ids)} notes" if ids else "notes"
            return None
        if j.kind == "goal_plan":
            inp = j.input_json or {}
            gid_raw = inp.get("goal_id")
            mode = str(inp.get("mode") or "full")
            mode_label = GOAL_PLAN_MODE_LABELS.get(mode, mode.replace("_", " "))
            title = None
            if gid_raw:
                try:
                    gid = uuid.UUID(str(gid_raw))
                    title = goal_titles.get(gid)
                except (ValueError, TypeError):
                    title = None
            # Compose `<Action> for "<title>"` — full sentence the toast can
            # use verbatim ("Generating Fill missing dates for \"My goal\"").
            # Fall back to just the action when the goal was deleted.
            return f'{mode_label} for "{title}"' if title else mode_label
        return None

    out: list[AIJobBrief] = []
    for j in jobs:
        brief = AIJobBrief.model_validate(j)
        brief.display_title = _title_for(j)
        out.append(brief)
    return out


@router.post("/jobs/{job_id}/cancel", response_model=AIJobOut)
async def cancel(
    job_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Cancel a job. Pending → removed from queue + status=cancelled.
    Running → asyncio.Task cancelled (httpx connection closes, Ollama
    notices client-disconnect and aborts the generation). The next pending
    job starts immediately."""
    # Verify ownership + grab a snapshot for the response.
    job = await db.get(AIJob, job_id)
    if job is None or job.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="job not found")
    if job.status in {"done", "failed", "cancelled"}:
        return job

    # First: tell the queue. This either preempts the running asyncio.Task
    # (which causes the worker to write status=cancelled) or simply removes
    # the id from the pending deque.
    location = await job_queue.cancel(job_id)

    # For pending jobs the worker never sees them, so flip the DB row here.
    # For running jobs the worker's CancelledError handler will write it,
    # but we also write it eagerly so the API response reflects the new
    # state without waiting for that task to be torn down.
    job = await cancel_job(job_id, user.id, db)  # type: ignore[assignment]
    logger.info("cancel: job=%s location=%s", job_id, location)
    if job is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="job not found")
    return job


def _estimate_eta(kind: str, input_data: dict) -> int:
    """Best-guess ETA for the loading UI. Tunes per kind.

    These are warm-state estimates (Qwen 3 8B q4_K_M on 8 vCPU at ~4 tok/s).
    Add ~30s for cold start when the model has been unloaded from RAM —
    OLLAMA_KEEP_ALIVE=10m mitigates this for back-to-back requests.
    """
    return {
        "quiz": 90,            # 5-14 questions × ~80 tok each + JSON overhead
        "schedule": 60,
        "insights": 120,       # narrative reasoning is longest
        "sprint_plan": 90,     # title + rationale + ~5-12 items with reasons
        "coach": 75,           # smaller output than insights; tight prompt
        "goal_plan": 80,       # rationale + 3-7 steps × 2-4 gos each
    }.get(kind, 90)


# ── Quiz feature ─────────────────────────────────────────────────────────────


async def _check_note_owned(note_id: uuid.UUID, user_id: uuid.UUID, db: AsyncSession) -> Note:
    """Verify the user owns the note via its way/topic chain. 404 otherwise."""
    note = await db.get(Note, note_id)
    if note is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="note not found")
    # Note lives under either a Way (directly), a Topic (under a Way), or a Topic.inline.
    owner_id: uuid.UUID | None = None
    if note.way_id is not None:
        way = await db.get(Way, note.way_id)
        if way is not None:
            owner_id = way.user_id
    elif note.topic_id is not None or note.topic_inline_id is not None:
        topic_id = note.topic_id or note.topic_inline_id
        topic = await db.get(Topic, topic_id)
        if topic is not None:
            way = await db.get(Way, topic.way_id)
            if way is not None:
                owner_id = way.user_id
    if owner_id != user_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="note not found")
    return note


@router.post("/quiz", response_model=AIJobOut, status_code=status.HTTP_202_ACCEPTED)
async def create_quiz(
    body: QuizCreate,
    background_tasks: BackgroundTasks,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Enqueue a quiz generation job. Returns the job immediately (queued).

    Validates inputs (scope shape, note ownership) before enqueue so the
    user sees errors right away instead of via polling.

    Phase 3: scope.kind must be 'note'. Phase 4 expands to topic/way/tag/multi.
    """
    if body.scope.kind not in ("note", "all", "multi"):
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            detail="Only scope.kind in ('note','all','multi') is supported.",
        )

    if body.scope.kind == "note":
        if body.scope.id is None:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                detail="scope.id is required for scope.kind='note'",
            )
        await _check_note_owned(body.scope.id, user.id, db)
        cache_key = await quiz_cache_key(
            body.scope.id, body.difficulty, body.count, db,
        )
    elif body.scope.kind == "multi":
        if not body.scope.ids:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                detail="scope.ids is required for scope.kind='multi'",
            )
        from app.services.ai.cache import quiz_all_cache_key
        cache_key = await quiz_all_cache_key(
            user.id, body.difficulty, body.count, db,
            only_ids=list(body.scope.ids),
        )
    else:  # 'all'
        from app.services.ai.cache import quiz_all_cache_key
        cache_key = await quiz_all_cache_key(
            user.id, body.difficulty, body.count, db,
        )
    if cache_key is not None:
        cached = await find_cached(cache_key, user.id, "quiz", db)
        if cached is not None:
            return cached

    async with OllamaClient() as ollama:
        if not await ollama.health():
            raise HTTPException(
                status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="AI runtime is offline. Try again in a moment.",
            )

    job = await create_job(
        user_id=user.id,
        kind="quiz",
        input_data=body.model_dump(mode="json"),
        eta_seconds=_estimate_eta("quiz", body.model_dump()),
        cache_key=cache_key,
        db=db,
    )
    # Commit BEFORE scheduling: see comment in enqueue_job above.
    await db.commit()
    await job_queue.enqueue(job.id)
    return job


@router.get("/quizzes/{quiz_id}", response_model=AIQuizOut)
async def get_quiz(
    quiz_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    quiz = await db.get(AIQuiz, quiz_id)
    if quiz is None or quiz.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="quiz not found")
    return quiz


@router.post(
    "/quizzes/{quiz_id}/attempts",
    response_model=QuizAttemptOut,
    status_code=status.HTTP_201_CREATED,
)
async def submit_attempt(
    quiz_id: uuid.UUID,
    body: QuizAttemptCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Score an attempt and return per-question feedback.

    Spaced-repetition is intentionally minimal: ≥80% correct → +3 days,
    else +1 day. SM-2 / FSRS-style scheduling is a future polish.
    """
    quiz = await db.get(AIQuiz, quiz_id)
    if quiz is None or quiz.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="quiz not found")

    questions = quiz.questions or []
    total = len(questions)
    if total == 0:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="quiz has no questions")

    # Score + build per-question feedback. We accept partial attempts (user
    # skipped some questions) — unanswered indices just don't appear in body.answers.
    answer_by_idx: dict[int, str] = {a.question_idx: a.selected for a in body.answers}
    stored_answers: list[dict] = []
    items: list[QuizAttemptItemOut] = []
    score = 0
    for idx, q in enumerate(questions):
        if idx not in answer_by_idx:
            continue
        selected = answer_by_idx[idx]
        correct_letter = q["correct"]
        is_correct = selected == correct_letter
        if is_correct:
            score += 1
        stored_answers.append({
            "question_idx": idx,
            "selected": selected,
            "correct": is_correct,
        })
        items.append(QuizAttemptItemOut(
            question_idx=idx,
            selected=selected,
            correct=is_correct,
            correct_answer=correct_letter,
            explanation=q.get("explanation", ""),
        ))

    now = datetime.now(UTC)
    # Simple SR: +3 days if you nailed it, +1 day to drill the weak spots.
    answered = len(stored_answers)
    threshold = max(1, int(0.8 * answered))
    next_review = now + (timedelta(days=3) if score >= threshold else timedelta(days=1))

    attempt = AIQuizAttempt(
        quiz_id=quiz.id,
        user_id=user.id,
        answers=stored_answers,
        score=score,
        total=total,
        next_review_at=next_review,
        started_at=now,
        completed_at=now,
    )
    db.add(attempt)
    await db.flush()

    return QuizAttemptOut(
        id=attempt.id,
        quiz_id=quiz.id,
        score=score,
        total=total,
        items=items,
        next_review_at=next_review,
        completed_at=now,
    )


# ── Schedule (Plan day) feature ──────────────────────────────────────────────


@router.post("/schedule", response_model=AIJobOut, status_code=status.HTTP_202_ACCEPTED)
async def create_schedule(
    body: ScheduleCreate,
    background_tasks: BackgroundTasks,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Enqueue a schedule-generation job.

    Reads the user's open Go backlog and time-blocks it within the given work
    hours using a deterministic, rule-based planner (no LLM — see
    services/ai/schedule.py). No persistence beyond job.output_json in this
    phase — Phase 6b adds commit-to-sprint.
    """
    # Resolve date once — needed both for cache key and for the run itself.
    target_date = datetime.now(UTC).date()
    if body.date:
        try:
            target_date = datetime.fromisoformat(body.date).date()
        except ValueError:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                detail=f"invalid date {body.date!r}",
            )

    # Cache lookup: if backlog + mode unchanged since last run, return prior.
    cache_key = await schedule_cache_key(
        user.id, target_date, body.hours.start_h, body.hours.end_h,
        body.time_blocked, db,
    )
    # `force` (Regenerate) skips the cache and always runs the planner afresh.
    if not body.force:
        cached = await find_cached(cache_key, user.id, "schedule", db)
        if cached is not None:
            return cached

    # No AI-runtime health gate: "Plan day" is now a deterministic, rule-based
    # planner (see services/ai/schedule.py), so it runs fine with Ollama offline.

    try:
        job = await create_job(
            user_id=user.id,
            kind="schedule",
            input_data=body.model_dump(mode="json"),
            eta_seconds=_estimate_eta("schedule", body.model_dump()),
            cache_key=cache_key,
            db=db,
        )
    except ValueError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=str(e)) from e

    await db.commit()
    await job_queue.enqueue(job.id)
    return job


# ── Weekly insights feature ──────────────────────────────────────────────────


@router.post("/insights", response_model=AIJobOut, status_code=status.HTTP_202_ACCEPTED)
@router.post("/insights/weekly", response_model=AIJobOut, status_code=status.HTTP_202_ACCEPTED, include_in_schema=False)
async def create_insights(
    body: InsightsCreate,
    background_tasks: BackgroundTasks,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Enqueue an insights job for an arbitrary date window. Returns immediately.

    Body:
      - `range_days` — days back from today (default 7). 30/90/365 also work.
      - `week_start` — legacy: explicit Monday anchor; overrides range_days.
    """
    today = datetime.now(UTC).date()
    if body.week_start:
        try:
            window_start = datetime.fromisoformat(body.week_start).date()
            window_end = window_start + timedelta(days=6)
        except ValueError:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                detail=f"invalid week_start {body.week_start!r}",
            )
    else:
        window_start = today - timedelta(days=body.range_days - 1)
        window_end = today

    cache_key = await insights_cache_key(user.id, window_start, window_end, db)
    cached = await find_cached(cache_key, user.id, "insights", db)
    if cached is not None:
        return cached

    async with OllamaClient() as ollama:
        if not await ollama.health():
            raise HTTPException(
                status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="AI runtime is offline. Try again in a moment.",
            )

    job = await create_job(
        user_id=user.id,
        kind="insights",
        input_data=body.model_dump(mode="json"),
        eta_seconds=_estimate_eta("insights", body.model_dump()),
        cache_key=cache_key,
        db=db,
    )
    await db.commit()
    await job_queue.enqueue(job.id)
    return job


# ── Sprint planner feature ──────────────────────────────────────────────────


@router.post("/sprint-plan", response_model=AIJobOut, status_code=status.HTTP_202_ACCEPTED)
async def create_sprint_plan(
    body: SprintPlanCreate,
    background_tasks: BackgroundTasks,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Enqueue an AI sprint-plan generation job.

    The handler reads the user's active goals + pending Gos and emits a
    SprintPlanOutput proposal using a deterministic, rule-based planner (no
    LLM — see services/ai/sprint_plan.py). The client then materialises the
    proposal via the regular sprints endpoints once the user accepts it — no
    DB writes happen here.

    Cache: intentionally not used. The point of "regenerate" is to get a
    fresh take; caching would surface the previous plan instead.
    """
    try:
        job = await create_job(
            user_id=user.id,
            kind="sprint_plan",
            input_data=body.model_dump(mode="json"),
            eta_seconds=_estimate_eta("sprint_plan", body.model_dump()),
            db=db,
        )
    except ValueError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=str(e)) from e

    await db.commit()
    await job_queue.enqueue(job.id)
    return job


# ── Coach panel (Analysis) ──────────────────────────────────────────────────


@router.post("/coach", response_model=AIJobOut, status_code=status.HTTP_202_ACCEPTED)
async def create_coach(
    body: CoachCreate,
    background_tasks: BackgroundTasks,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Enqueue a coach job. Returns immediately; the cached entry is reused
    when activity hasn't meaningfully changed since the last run."""
    today = datetime.now(UTC).date()
    window_start = today - timedelta(days=body.range_days - 1)

    cache_key = await coach_cache_key(user.id, window_start, today, db)
    cached = await find_cached(cache_key, user.id, "coach", db)
    if cached is not None:
        return cached

    async with OllamaClient() as ollama:
        if not await ollama.health():
            raise HTTPException(
                status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="AI runtime is offline. Try again in a moment.",
            )

    job = await create_job(
        user_id=user.id,
        kind="coach",
        input_data=body.model_dump(mode="json"),
        eta_seconds=_estimate_eta("coach", body.model_dump()),
        cache_key=cache_key,
        db=db,
    )
    await db.commit()
    await job_queue.enqueue(job.id)
    return job


# ── Goal planner (Plan with AI on a Goal) ──────────────────────────────────


@router.post("/goal-plan", response_model=AIJobOut, status_code=status.HTTP_202_ACCEPTED)
async def create_goal_plan(
    body: GoalPlanCreate,
    background_tasks: BackgroundTasks,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Plan a Goal's steps + first gos (mode='full') or auto-place dates
    on existing steps (mode='dates_only'). Cache reuse: same goal in same
    state returns the previous result instantly."""
    try:
        goal_uuid = uuid.UUID(body.goal_id)
    except (ValueError, TypeError):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="invalid goal_id")

    cache_key = await goal_plan_cache_key(user.id, goal_uuid, body.mode, db)
    cached = await find_cached(cache_key, user.id, "goal_plan", db)
    if cached is not None:
        return cached

    async with OllamaClient() as ollama:
        if not await ollama.health():
            raise HTTPException(
                status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="AI runtime is offline. Try again in a moment.",
            )

    job = await create_job(
        user_id=user.id,
        kind="goal_plan",
        input_data=body.model_dump(mode="json"),
        eta_seconds=_estimate_eta("goal_plan", body.model_dump()),
        cache_key=cache_key,
        db=db,
    )
    await db.commit()
    await job_queue.enqueue(job.id)
    return job
