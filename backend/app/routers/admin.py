"""Admin dashboard endpoints.

Gated by `require_admin` (User.is_admin must be true). Exposes:
- GET /admin/overview — top-line KPI for the dashboard header
- GET /admin/users    — paginated user list with per-user product counts

`get_current_user` is still on the chain via `require_admin`, so the
last_seen_at bump happens for the admin themselves on every request.
"""
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import require_admin
from app.models.ai import AIJob
from app.models.notes import Note
from app.models.tasks import Routine, Task
from app.models.user import User
from app.schemas.admin import AdminOverview, AdminUserRow, AdminUsersResponse

router = APIRouter(prefix="/admin", tags=["admin"], dependencies=[Depends(require_admin)])


@router.get("/overview", response_model=AdminOverview)
async def get_overview(db: AsyncSession = Depends(get_db)) -> AdminOverview:
    """Top-line KPIs. Each metric is its own SELECT — chatty, but at
    single-digit-thousands-of-users scale this is fine and easier to evolve
    than a single window-function chimera."""
    now = datetime.now(UTC)
    cutoff_7d = now - timedelta(days=7)
    cutoff_30d = now - timedelta(days=30)

    total_users = await db.scalar(select(func.count(User.id))) or 0
    active_7d = await db.scalar(
        select(func.count(User.id)).where(User.last_seen_at >= cutoff_7d),
    ) or 0
    signups_7d = await db.scalar(
        select(func.count(User.id)).where(User.created_at >= cutoff_7d),
    ) or 0
    signups_30d = await db.scalar(
        select(func.count(User.id)).where(User.created_at >= cutoff_30d),
    ) or 0

    total_notes = await db.scalar(select(func.count(Note.id))) or 0
    total_tasks = await db.scalar(select(func.count(Task.id))) or 0
    total_routines = await db.scalar(select(func.count(Routine.id))) or 0
    total_ai_jobs = await db.scalar(select(func.count(AIJob.id))) or 0

    return AdminOverview(
        total_users=total_users,
        active_users_7d=active_7d,
        signups_7d=signups_7d,
        signups_30d=signups_30d,
        total_notes=total_notes,
        total_tasks=total_tasks,
        total_routines=total_routines,
        total_ai_jobs=total_ai_jobs,
    )


@router.get("/users", response_model=AdminUsersResponse)
async def list_users(
    db: AsyncSession = Depends(get_db),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    q: str | None = Query(default=None, description="Search by email or username (ILIKE)"),
) -> AdminUsersResponse:
    """Paginated users with their product counts.

    Counts are computed via correlated scalar subqueries instead of GROUP BY,
    so a user with zero notes still gets a `note_count: 0` row (LEFT JOIN +
    GROUP BY also works, but reads worse and forces the joins to materialise
    rows even with empty children)."""
    base = select(User)
    if q:
        like = f"%{q.lower()}%"
        base = base.where(
            (func.lower(User.email).like(like)) | (func.lower(User.username).like(like)),
        )

    total = await db.scalar(select(func.count()).select_from(base.subquery())) or 0

    note_count = (
        select(func.count(Note.id))
        .where(Note.user_id == User.id)
        .correlate(User)
        .scalar_subquery()
        .label("note_count")
    )
    task_count = (
        select(func.count(Task.id))
        .where(Task.user_id == User.id)
        .correlate(User)
        .scalar_subquery()
        .label("task_count")
    )
    routine_count = (
        select(func.count(Routine.id))
        .where(Routine.user_id == User.id)
        .correlate(User)
        .scalar_subquery()
        .label("routine_count")
    )
    ai_job_count = (
        select(func.count(AIJob.id))
        .where(AIJob.user_id == User.id)
        .correlate(User)
        .scalar_subquery()
        .label("ai_job_count")
    )

    stmt = (
        select(User, note_count, task_count, routine_count, ai_job_count)
        .order_by(User.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    if q:
        like = f"%{q.lower()}%"
        stmt = stmt.where(
            (func.lower(User.email).like(like)) | (func.lower(User.username).like(like)),
        )

    rows = (await db.execute(stmt)).all()
    items = [
        AdminUserRow(
            id=u.id,
            email=u.email,
            username=u.username,
            is_active=u.is_active,
            is_admin=u.is_admin,
            avatar_url=u.avatar_url,
            created_at=u.created_at,
            last_seen_at=u.last_seen_at,
            note_count=int(nc),
            task_count=int(tc),
            routine_count=int(rc),
            ai_job_count=int(ac),
        )
        for u, nc, tc, rc, ac in rows
    ]

    return AdminUsersResponse(items=items, total=total, limit=limit, offset=offset)
