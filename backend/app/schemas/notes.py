import uuid
from datetime import datetime

from pydantic import BaseModel, Field


# ── Tag ───────────────────────────────────────────────────────────────────────

class TagCreate(BaseModel):
    name: str = Field(min_length=1, max_length=50)
    color: str = Field(default="#4f46e5", max_length=20)


class TagUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=50)
    color: str | None = Field(default=None, max_length=20)


class TagOut(BaseModel):
    id: uuid.UUID
    name: str
    color: str
    created_at: datetime

    model_config = {"from_attributes": True}


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
    pinned: bool | None = None


class NoteReparent(BaseModel):
    # Exactly one of these should be provided (to move the note to new parent)
    way_id: uuid.UUID | None = None
    topic_id: uuid.UUID | None = None


class NoteOut(BaseModel):
    id: uuid.UUID
    name: str
    content: str
    order: int
    pinned: bool = False
    way_id: uuid.UUID | None
    topic_id: uuid.UUID | None
    topic_inline_id: uuid.UUID | None
    tags: list[TagOut] = []
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
    notes: list[NoteOut] = []
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# ── Image ─────────────────────────────────────────────────────────────────────

class ImageOut(BaseModel):
    id: uuid.UUID
    url: str
    filename: str
    size_bytes: int

    model_config = {"from_attributes": True}


# ── Share ─────────────────────────────────────────────────────────────────────

class ShareOut(BaseModel):
    """Returned when a share is created or fetched. `url` is the public link
    relative to the API base — the frontend prepends window.location.origin."""
    token: str
    url: str
    created_at: datetime


class PublicNoteOut(BaseModel):
    """Subset of the note exposed to anonymous readers. Image URLs in `content`
    are rewritten by the server to anonymous-accessible paths before serialization."""
    name: str
    content: str
    created_at: datetime
    updated_at: datetime
    shared_at: datetime
    tags: list[TagOut] = []
