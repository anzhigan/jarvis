"""AI feature endpoints — generic job queue surface.

Per-feature endpoints (quiz, tasks_extract, schedule, insights) build on
top of this: they validate their input shape, then call `create_job` with
the appropriate kind. The polling and history endpoints below are shared
across all features.

Auth: every endpoint requires the bearer token. Users can only see their
own jobs.

Ollama health: enqueue is gated by `OllamaClient.health()` so we fail fast
with 503 instead of queuing jobs that will all fail downstream.
"""
import uuid
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.ai import AIJob, AIQuiz, AIQuizAttempt
from app.models.notes import Note, Topic, Way
from app.models.user import User
from app.schemas.ai import (
    AIJobBrief,
    AIJobCreate,
    AIJobOut,
    AIQuizOut,
    QuizAttemptCreate,
    QuizAttemptItemOut,
    QuizAttemptOut,
    QuizCreate,
)
from app.services.ai.jobs import (
    cancel_job,
    create_job,
    list_recent_jobs,
    run_job,
    supported_kinds,
)
from app.services.ai.ollama_client import OllamaClient

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
    background_tasks.add_task(run_job, job.id)
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
    """Recent jobs for the current user. Used for sidebar history."""
    return await list_recent_jobs(user_id=user.id, db=db, kind=kind, limit=limit)


@router.post("/jobs/{job_id}/cancel", response_model=AIJobOut)
async def cancel(
    job_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Best-effort cancel. Queued jobs become 'cancelled' immediately.
    Running jobs aren't preempted but their output will be discarded by
    the UI based on the status flag."""
    job = await cancel_job(job_id, user.id, db)
    if job is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="job not found")
    return job


def _estimate_eta(kind: str, input_data: dict) -> int:
    """Best-guess ETA for the loading UI. Tunes per kind."""
    # Tuned for Qwen 3 8B q4_K_M on 8 vCPU (~5 tok/s). Will get more
    # accurate as we measure real production runs.
    return {
        "quiz": 45,            # 8-14 questions ≈ 500-900 tokens
        "tasks_extract": 30,   # short structured output ≈ 300 tokens
        "schedule": 35,        # 10 slots ≈ 400 tokens
        "insights": 60,        # narrative reasoning ≈ 600-1000 tokens
    }.get(kind, 60)


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
    if body.scope.kind != "note":
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            detail="Only scope.kind='note' is supported right now. "
                   "Cross-notes quizzes are coming in the next release.",
        )
    if body.scope.id is None:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            detail="scope.id is required for scope.kind='note'",
        )

    # Ownership check up-front (catches "wrong UUID" or "someone else's note").
    await _check_note_owned(body.scope.id, user.id, db)

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
        db=db,
    )
    # Commit BEFORE scheduling: see comment in enqueue_job above.
    await db.commit()
    background_tasks.add_task(run_job, job.id)
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
