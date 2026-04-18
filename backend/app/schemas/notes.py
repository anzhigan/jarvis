import uuid
from datetime import datetime

from pydantic import BaseModel, Field


# ── Note ──────────────────────────────────────────────────────────────────────

class NoteCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    content: str = ""
    way_id: uuid.UUID | None = None
    topic_id: uuid.UUID | None = None
    topic_inline_id: uuid.UUID | None = None
    order: int = 0


class NoteUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    content: str | None = None
    order: int | None = None


class NoteOut(BaseModel):
    id: uuid.UUID
    name: str
    content: str
    order: int
    way_id: uuid.UUID | None
    topic_id: uuid.UUID | None
    topic_inline_id: uuid.UUID | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# ── Topic ─────────────────────────────────────────────────────────────────────

class TopicCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    order: int = 0


class TopicUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    order: int | None = None


class TopicOut(BaseModel):
    id: uuid.UUID
    way_id: uuid.UUID
    name: str
    order: int
    notes: list[NoteOut] = []
    inline_note: NoteOut | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# ── Way ───────────────────────────────────────────────────────────────────────

class WayCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    order: int = 0


class WayUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    order: int | None = None


class WayOut(BaseModel):
    id: uuid.UUID
    name: str
    order: int
    topics: list[TopicOut] = []
    note: NoteOut | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# ── Reorder ───────────────────────────────────────────────────────────────────

class ReorderItem(BaseModel):
    id: uuid.UUID
    order: int


class ReorderRequest(BaseModel):
    items: list[ReorderItem]


# ── Image ─────────────────────────────────────────────────────────────────────

class ImageOut(BaseModel):
    id: uuid.UUID
    url: str
    filename: str
    size_bytes: int

    model_config = {"from_attributes": True}
