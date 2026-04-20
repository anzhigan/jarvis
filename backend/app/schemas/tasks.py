import uuid
from datetime import date, datetime

from pydantic import BaseModel, Field

from app.schemas.notes import TagOut


# ── Practice Entry ────────────────────────────────────────────────────────────

class PracticeEntryCreate(BaseModel):
    date: date
    value: float = 1.0  # for boolean: 1=did, 0=didn't; for numeric: actual value
    note: str = ""


class PracticeEntryOut(BaseModel):
    id: uuid.UUID
    practice_id: uuid.UUID
    date: date
    value: float
    note: str
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Practice ──────────────────────────────────────────────────────────────────

class PracticeCreate(BaseModel):
    title: str = Field(min_length=1, max_length=300)
    kind: str = "boolean"          # 'boolean' | 'numeric'
    unit: str = ""
    target_value: float | None = None
    duration_days: int | None = None
    color: str = "#4f46e5"


class PracticeUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=300)
    kind: str | None = None
    unit: str | None = None
    target_value: float | None = None
    duration_days: int | None = None
    color: str | None = None
    status: str | None = None      # 'active' | 'paused' | 'done'


class PracticeOut(BaseModel):
    id: uuid.UUID
    task_id: uuid.UUID
    title: str
    kind: str
    unit: str
    target_value: float | None
    duration_days: int | None
    color: str
    status: str
    entries: list[PracticeEntryOut] = []
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Task ──────────────────────────────────────────────────────────────────────

class TaskCreate(BaseModel):
    title: str = Field(min_length=1, max_length=500)
    description: str = ""
    status: str = "todo"            # todo | in_progress | done
    priority: str = "medium"
    due_date: date | None = None
    order: int = 0


class TaskUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=500)
    description: str | None = None
    status: str | None = None
    priority: str | None = None
    due_date: date | None = None
    is_completed: bool | None = None
    order: int | None = None


class TaskOut(BaseModel):
    id: uuid.UUID
    title: str
    description: str
    status: str
    priority: str
    due_date: date | None
    is_completed: bool
    order: int
    practices: list[PracticeOut] = []
    tags: list[TagOut] = []
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
