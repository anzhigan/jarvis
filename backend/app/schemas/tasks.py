import uuid
from datetime import date, datetime

from pydantic import BaseModel, Field


class TaskCreate(BaseModel):
    title: str = Field(min_length=1, max_length=500)
    description: str = ""
    status: str = "todo"
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
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
