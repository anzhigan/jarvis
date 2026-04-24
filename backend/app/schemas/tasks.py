import uuid
from datetime import date, datetime

from pydantic import BaseModel, Field

from app.schemas.notes import TagOut


# ─── Todo ────────────────────────────────────────────────────────────────────

class TodoCreate(BaseModel):
    title: str = Field(min_length=1, max_length=300)
    kind: str = Field(default="boolean")  # boolean | numeric
    unit: str = Field(default="", max_length=50)
    target_value: float | None = None
    recurrence: str = Field(default="none")  # none | daily | weekly
    due_date: date | None = None
    color: str = Field(default="#4f46e5", max_length=20)
    parent_todo_id: uuid.UUID | None = None


class TodoUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=300)
    kind: str | None = None
    unit: str | None = None
    target_value: float | None = None
    recurrence: str | None = None
    due_date: date | None = None
    color: str | None = None
    parent_todo_id: uuid.UUID | None = None


class TodoEntryUpsert(BaseModel):
    date: date
    value: float  # for boolean, 1 = done, 0 = not done


class TodoEntryOut(BaseModel):
    id: uuid.UUID
    todo_id: uuid.UUID
    date: date
    value: float

    model_config = {"from_attributes": True}


class TodoOut(BaseModel):
    id: uuid.UUID
    task_id: uuid.UUID | None
    user_id: uuid.UUID
    parent_todo_id: uuid.UUID | None = None
    title: str
    kind: str
    unit: str
    target_value: float | None
    recurrence: str
    due_date: date | None
    color: str
    entries: list[TodoEntryOut] = []
    # Backref task title for showing in global todo list
    task_title: str | None = None
    # Sum of own entries + all children's entries (for weekly progress display)
    total_value: float = 0.0
    created_at: datetime

    model_config = {"from_attributes": True}


# ─── Task ────────────────────────────────────────────────────────────────────

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
    todos: list[TodoOut] = []
    tags: list[TagOut] = []
    # Computed progress % (0..100)
    progress: int = 0
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
