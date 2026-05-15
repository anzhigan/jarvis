"""Pydantic schemas for AI features.

JobKind / JobStatus are intentionally string-based (not Enum at the schema
level) so adding new kinds doesn't require redeploying clients — they'll
just see an unknown value and can render a generic "AI job" entry.
"""
import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class AIJobCreate(BaseModel):
    """Generic enqueue request. `input` is handler-specific."""
    kind: str = Field(min_length=1, max_length=32, description="e.g. 'quiz', 'tasks_extract', 'schedule'")
    input: dict[str, Any] = Field(default_factory=dict)


class AIJobOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    kind: str
    status: str  # 'queued' | 'running' | 'done' | 'failed' | 'cancelled'
    input_json: dict[str, Any]
    output_json: dict[str, Any] | None = None
    error: str | None = None
    eta_seconds: int | None = None
    created_at: datetime
    started_at: datetime | None = None
    finished_at: datetime | None = None


class AIJobBrief(BaseModel):
    """Lightweight projection for history list — strips input/output to save bytes."""
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    kind: str
    status: str
    error: str | None = None
    created_at: datetime
    finished_at: datetime | None = None


# ── Quiz feature ─────────────────────────────────────────────────────────────


class QuizScope(BaseModel):
    """Phase 3 only supports kind='note'. Phase 4 expands to topic/way/tag/multi."""
    kind: str = Field(pattern=r"^(note|topic|way|tag|multi|recent)$")
    id: uuid.UUID | None = None
    ids: list[uuid.UUID] | None = None
    days: int | None = None  # for kind='recent'


class QuizCreate(BaseModel):
    """Request body for POST /ai/quiz."""
    scope: QuizScope
    difficulty: str = Field(default="medium", pattern=r"^(easy|medium|hard)$")
    count: int = Field(default=8, ge=3, le=20)


class QuizOptions(BaseModel):
    A: str
    B: str
    C: str
    D: str


class QuizQuestionOut(BaseModel):
    """One question as stored in AIQuiz.questions JSON.

    `source_note_id` / `source_note_title` only filled for multi-note scopes
    (Phase 4); for single-note quiz the whole quiz is from one note so the
    quiz-level title is enough.
    """
    question: str
    options: QuizOptions
    correct: str = Field(pattern=r"^[ABCD]$")
    explanation: str
    source_quote: str | None = None
    source_note_id: uuid.UUID | None = None
    source_note_title: str | None = None


class AIQuizOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    title: str
    scope_kind: str
    scope_ref: dict
    difficulty: str
    questions: list[QuizQuestionOut]
    created_at: datetime


class QuizAttemptAnswer(BaseModel):
    question_idx: int = Field(ge=0)
    selected: str = Field(pattern=r"^[ABCD]$")


class QuizAttemptCreate(BaseModel):
    answers: list[QuizAttemptAnswer]


class QuizAttemptItemOut(BaseModel):
    """Per-question feedback in the attempt response."""
    question_idx: int
    selected: str
    correct: bool
    correct_answer: str  # the actual letter — surfaced post-submit so UI can highlight
    explanation: str


class QuizAttemptOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    quiz_id: uuid.UUID
    score: int
    total: int
    items: list[QuizAttemptItemOut]
    next_review_at: datetime | None
    completed_at: datetime | None
