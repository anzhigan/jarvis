import uuid
from datetime import date, datetime

from pydantic import BaseModel, Field

from app.schemas.notes import TagOut


# ─── Go ─────────────────────────────────────────────────────────────────────

class GoCreate(BaseModel):
    title: str = Field(min_length=1, max_length=300)
    description: str = ""
    kind: str = Field(default="boolean")
    unit: str = Field(default="", max_length=50)
    target_value: float | None = None
    recurrence: str = Field(default="none")
    due_date: date | None = None
    color: str = Field(default="#4f46e5", max_length=20)
    task_id: uuid.UUID | None = None
    sprint_id: uuid.UUID | None = None


class GoUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=300)
    description: str | None = None
    kind: str | None = None
    unit: str | None = None
    target_value: float | None = None
    recurrence: str | None = None
    due_date: date | None = None
    color: str | None = None
    task_id: uuid.UUID | None = None
    sprint_id: uuid.UUID | None = None


class GoEntryUpsert(BaseModel):
    date: date
    value: float


class GoEntryOut(BaseModel):
    id: uuid.UUID
    go_id: uuid.UUID
    date: date
    value: float

    model_config = {"from_attributes": True}


class GoOut(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    task_id: uuid.UUID | None
    sprint_id: uuid.UUID | None
    title: str
    description: str = ""
    kind: str
    unit: str
    target_value: float | None
    recurrence: str
    due_date: date | None
    color: str
    entries: list[GoEntryOut] = []
    task_title: str | None = None
    sprint_title: str | None = None
    total_value: float = 0.0
    is_done_today: bool = False
    created_at: datetime

    model_config = {"from_attributes": True}


# ─── Sprint ─────────────────────────────────────────────────────────────────

class SprintCreate(BaseModel):
    task_id: uuid.UUID
    title: str = Field(min_length=1, max_length=500)
    description: str = ""
    start_date: date
    end_date: date
    color: str = Field(default="#3b82f6", max_length=20)


class SprintUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=500)
    description: str | None = None
    start_date: date | None = None
    end_date: date | None = None
    is_completed: bool | None = None
    color: str | None = None


class SprintOut(BaseModel):
    id: uuid.UUID
    task_id: uuid.UUID
    user_id: uuid.UUID
    title: str
    description: str
    start_date: date
    end_date: date
    is_completed: bool
    color: str
    gos: list[GoOut] = []
    task_title: str | None = None
    progress: int = 0
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# ─── Task ───────────────────────────────────────────────────────────────────

class TaskCreate(BaseModel):
    title: str = Field(min_length=1, max_length=500)
    description: str = ""
    status: str = "backlog"
    priority: str = "medium"
    start_date: date | None = None
    due_date: date | None = None
    order: int = 0


class TaskUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=500)
    description: str | None = None
    status: str | None = None
    priority: str | None = None
    start_date: date | None = None
    due_date: date | None = None
    is_completed: bool | None = None
    order: int | None = None


class TaskOut(BaseModel):
    id: uuid.UUID
    title: str
    description: str
    status: str
    priority: str
    start_date: date | None
    due_date: date | None
    is_completed: bool
    order: int
    sprints: list[SprintOut] = []
    gos: list[GoOut] = []
    tags: list[TagOut] = []
    progress: int = 0
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# ═══════════════════════════════════════════════════════════════════════════
# Routine — recurring activity (new in v009)
# ═══════════════════════════════════════════════════════════════════════════

class RoutineEntryOut(BaseModel):
    id: uuid.UUID
    routine_id: uuid.UUID
    date: date
    value: float
    model_config = {"from_attributes": True}


class RoutineCreate(BaseModel):
    title: str = Field(min_length=1, max_length=300)
    description: str = ""
    color: str = "#10b981"
    goal_id: uuid.UUID | None = None
    step_id: uuid.UUID | None = None
    schedule_type: str = "daily"  # daily | weekly_on_days | every_n_days | times_per_week
    schedule_days: str = ""  # CSV: "0,2,4"
    schedule_n_days: int = 1
    schedule_count_per_period: int = 1
    schedule_period: str = "week"  # week | month
    start_date: date | None = None
    end_date: date | None = None
    kind: str = "boolean"  # boolean | numeric
    unit: str = ""
    target_value: float | None = None


class RoutineUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=300)
    description: str | None = None
    color: str | None = None
    goal_id: uuid.UUID | None = None
    step_id: uuid.UUID | None = None
    schedule_type: str | None = None
    schedule_days: str | None = None
    schedule_n_days: int | None = None
    schedule_count_per_period: int | None = None
    schedule_period: str | None = None
    start_date: date | None = None
    end_date: date | None = None
    is_paused: bool | None = None
    kind: str | None = None
    unit: str | None = None
    target_value: float | None = None


class RoutineOut(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    goal_id: uuid.UUID | None
    step_id: uuid.UUID | None
    title: str
    description: str
    color: str
    schedule_type: str
    schedule_days: str
    schedule_n_days: int
    schedule_count_per_period: int
    schedule_period: str
    start_date: date | None
    end_date: date | None
    is_paused: bool
    kind: str
    unit: str
    target_value: float | None
    entries: list[RoutineEntryOut] = []
    created_at: datetime
    updated_at: datetime
    model_config = {"from_attributes": True}


class RoutineEntryUpsert(BaseModel):
    date: date
    value: float


# ═══════════════════════════════════════════════════════════════════════════
# FocusSprint — temporal focus referencing existing entities
# ═══════════════════════════════════════════════════════════════════════════

class FocusSprintItemOut(BaseModel):
    id: uuid.UUID
    item_type: str  # goal | step | go | routine
    goal_id: uuid.UUID | None
    step_id: uuid.UUID | None
    go_id: uuid.UUID | None
    routine_id: uuid.UUID | None
    # Hydrated fields (populated server-side for convenience)
    title: str | None = None
    color: str | None = None
    model_config = {"from_attributes": True}


class FocusSprintCreate(BaseModel):
    title: str = Field(min_length=1, max_length=500)
    description: str = ""
    start_date: date
    end_date: date
    color: str = "#4f46e5"


class FocusSprintUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=500)
    description: str | None = None
    start_date: date | None = None
    end_date: date | None = None
    color: str | None = None
    is_archived: bool | None = None


class FocusSprintOut(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    title: str
    description: str
    start_date: date
    end_date: date
    color: str
    is_archived: bool
    items: list[FocusSprintItemOut] = []
    created_at: datetime
    updated_at: datetime
    model_config = {"from_attributes": True}


class FocusSprintItemAdd(BaseModel):
    item_type: str  # goal | step | go | routine
    goal_id: uuid.UUID | None = None
    step_id: uuid.UUID | None = None
    go_id: uuid.UUID | None = None
    routine_id: uuid.UUID | None = None
