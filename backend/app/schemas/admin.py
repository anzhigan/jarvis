"""Pydantic schemas for the /admin dashboard API."""
import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class AdminOverview(BaseModel):
    """KPI block at the top of the dashboard."""
    total_users: int
    active_users_7d: int
    signups_7d: int
    signups_30d: int
    total_notes: int
    total_tasks: int
    total_routines: int
    total_ai_jobs: int


class AdminUserRow(BaseModel):
    """One row in the users table, with per-user product counts."""
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: str
    username: str
    is_active: bool
    is_admin: bool
    avatar_url: str | None
    created_at: datetime
    last_seen_at: datetime | None
    # Product counts — joined-in via the admin endpoint, not stored on the model.
    note_count: int
    task_count: int
    routine_count: int
    ai_job_count: int


class AdminUsersResponse(BaseModel):
    items: list[AdminUserRow]
    total: int
    limit: int
    offset: int
