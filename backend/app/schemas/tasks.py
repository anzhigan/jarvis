import uuid
from datetime import date, datetime

from pydantic import BaseModel, Field

from app.schemas.notes import TagOut


# ─── Go ─────────────────────────────────────────────────────────────────────

class GoCreate(BaseModel):
    title: str = Field(min_length=1, max_length=300)
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
    status: str = "todo"
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
