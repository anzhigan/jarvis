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
    cache_key: str | None = None
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


# ── Tasks extraction feature ─────────────────────────────────────────────────


class TasksExtractScope(BaseModel):
    """Phase 5: kind='note' only. Phase 4-style multi-source can come later."""
    kind: str = Field(pattern=r"^note$")
    id: uuid.UUID


class TasksExtractCreate(BaseModel):
    scope: TasksExtractScope


class TaskItem(BaseModel):
    """One action item the model found in the note."""
    title: str
    quote: str = Field(default="", description="Short verbatim quote from the note supporting this item")


class TasksExtractOutput(BaseModel):
    """Shape that the tasks_extract handler stores in job.output_json."""
    items: list[TaskItem]
    source_note_id: uuid.UUID
    source_note_title: str


class TasksCommitInput(BaseModel):
    """Body for POST /ai/tasks/commit — turns picked AI suggestions into real Go rows."""
    job_id: uuid.UUID
    # 0-based indices into the job's output.items array.
    picked: list[int] = Field(min_length=1)
    # Target: optional Goal (task_id) and optional Step within it.
    task_id: uuid.UUID | None = None
    step_id: uuid.UUID | None = None


class TasksCommitOutput(BaseModel):
    created_count: int
    created_ids: list[uuid.UUID]


# ── Schedule (Plan day) feature ──────────────────────────────────────────────


class ScheduleHours(BaseModel):
    start_h: int = Field(default=9, ge=0, le=23)
    end_h: int = Field(default=18, ge=1, le=24)


class ScheduleCreate(BaseModel):
    """Body for POST /ai/schedule. `date` defaults to today (resolved server-side
    if absent so client doesn't need to compute timezone-aware today)."""
    date: str = Field(description="ISO date YYYY-MM-DD; today if empty", default="")
    hours: ScheduleHours = Field(default_factory=ScheduleHours)
    # Free-form prefs (e.g. ["lunch:13", "coffee:11,15"]) — Phase 6b.
    prefs: list[str] = Field(default_factory=list)


class ScheduleSlot(BaseModel):
    """One block in the generated day. Times are HH:MM strings within work
    hours; the LLM ensures non-overlapping ordering."""
    start_time: str = Field(pattern=r"^[0-2]\d:[0-5]\d$")
    end_time: str = Field(pattern=r"^[0-2]\d:[0-5]\d$")
    kind: str = Field(pattern=r"^(goal|routine|admin|break|lunch|deep_work|other)$")
    title: str
    source_kind: str | None = None  # 'go' | 'task' | 'routine'
    source_id: str | None = None     # original entity id, if attributed
    note: str = ""                    # 1-line rationale from the model


class ScheduleSummary(BaseModel):
    """Narrative observations the model adds alongside the schedule."""
    focus: str = ""           # what to prioritise today
    doing_well: str = ""      # where the user is on/ahead of track
    needs_attention: str = "" # stale work, falling behind, gaps


class ScheduleOutput(BaseModel):
    date: str
    summary: ScheduleSummary = Field(default_factory=ScheduleSummary)
    slots: list[ScheduleSlot]
    total_active_minutes: int


# ── Weekly insights feature ──────────────────────────────────────────────────


class InsightsCreate(BaseModel):
    """Body for POST /ai/insights.

    `range_days`: how many days back from today to analyze. 7=this week,
    30=last month, 90=last quarter, 365=last year. Defaults to 7.
    `week_start` is kept for backward compat — if set, takes precedence over
    range_days (anchors the window to a specific week).
    """
    range_days: int = Field(default=7, ge=1, le=730)
    week_start: str = Field(default="", description="Legacy: ISO YYYY-MM-DD anchor")


class InsightsSummary(BaseModel):
    doing_well: str = ""
    needs_attention: str = ""
    focus: str = ""


class InsightsMetrics(BaseModel):
    """Raw metrics shown alongside the narrative for transparency."""
    gos_created: int = 0
    gos_closed: int = 0       # gos that had at least one GoEntry this week
    notes_created: int = 0
    overdue_count: int = 0
    active_goals: int = 0


class InsightsOutput(BaseModel):
    week_start: str
    week_end: str
    summary: InsightsSummary
    metrics: InsightsMetrics
