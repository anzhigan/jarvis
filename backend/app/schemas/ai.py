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
