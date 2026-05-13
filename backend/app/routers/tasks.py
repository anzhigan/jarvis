import uuid
from datetime import date as date_cls
from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import delete as sa_delete
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.tasks import Go, GoEntry, Task
from app.models.user import User
from app.schemas.tasks import (
    GoCreate,
    GoEntryOut,
    GoEntryUpsert,
    GoOut,
    GoUpdate,
    TaskCreate,
    TaskOut,
    TaskUpdate,
)
from app.services.tasks import (
    VALID_GO_KINDS,
    VALID_PRIORITIES,
    VALID_RECURRENCE,
    VALID_STATUSES,
)
from app.services.tasks import (
    get_go_or_404 as _get_go,
)
from app.services.tasks import (
    get_task_or_404 as _get_task,
)
from app.services.tasks import (
    go_total_value as _go_total_value,
)
from app.services.tasks import (
    is_go_done_today as _is_go_done_today,
)
from app.services.tasks import (
    normalize_status as _normalize_status,
)
from app.services.tasks import (
    task_eager_options as _task_opts,
)
from app.services.tasks import (
    task_progress_pct as _task_progress,
)

router = APIRouter(tags=["tasks"])


# ─── Serializers ─────────────────────────────────────────────────────────────

def _go_dict(g: Go, task_title: str | None = None) -> dict:
    return {
        "id": g.id,
        "user_id": g.user_id,
        "task_id": g.task_id,
        "title": g.title,
        "description": g.description or "",
        "kind": g.kind,
        "unit": g.unit,
        "target_value": g.target_value,
        "recurrence": g.recurrence,
        "start_date": g.start_date,
        "due_date": g.due_date,
        "color": g.color,
        "entries": [
            {"id": e.id, "go_id": e.go_id, "date": e.date, "value": e.value}
            for e in g.entries
        ],
        "task_title": task_title,
        "total_value": _go_total_value(g),
        "is_done_today": _is_go_done_today(g),
        "created_at": g.created_at,
    }


def _task_dict(t: Task) -> dict:
    # Only one-off Gos belong here (routine_legacy → Routines).
    direct_gos = [g for g in t.gos if g.item_kind != "routine_legacy"]
    gos_out = [_go_dict(g, task_title=t.title) for g in direct_gos]
    routines_out = []
    for link in getattr(t, "routine_links", []) or []:
        r = link.routine
        if r is None:
            continue
        routines_out.append({
            "id": link.id,
            "goal_id": link.goal_id,
            "routine_id": link.routine_id,
            "start_date": link.start_date,
            "end_date": link.end_date,
            "target_count": link.target_count,
            "routine": {
                "id": r.id,
                "user_id": r.user_id,
                "goal_id": r.goal_id,
                "title": r.title,
                "description": r.description or "",
                "color": r.color,
                "schedule_type": r.schedule_type,
                "schedule_days": r.schedule_days or "",
                "schedule_n_days": r.schedule_n_days,
                "schedule_count_per_period": r.schedule_count_per_period,
                "schedule_period": r.schedule_period,
                "start_date": r.start_date,
                "end_date": r.end_date,
                "is_paused": r.is_paused,
                "kind": r.kind,
                "unit": r.unit or "",
                "target_value": r.target_value,
                "entries": [
                    {"id": e.id, "routine_id": e.routine_id, "date": e.date, "value": e.value}
                    for e in r.entries
                ],
                "created_at": r.created_at,
                "updated_at": r.updated_at,
            },
        })
    return {
        "id": t.id,
        "title": t.title,
        "description": t.description,
        "status": t.status,
        "priority": t.priority,
        "start_date": t.start_date,
        "due_date": t.due_date,
        "is_completed": t.is_completed,
        "order": t.order,
        "color": t.color,
        "gos": gos_out,
        "tags": t.tags,
        "routines": routines_out,
        "progress": _task_progress(t),
        "created_at": t.created_at,
        "updated_at": t.updated_at,
    }


# ─── Task endpoints ──────────────────────────────────────────────────────────

@router.get("/tasks", response_model=list[TaskOut])
async def list_tasks(
    status_filter: str | None = None,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    q = select(Task).where(Task.user_id == user.id).options(*_task_opts())
    if status_filter:
        q = q.where(Task.status == status_filter)
    q = q.order_by(Task.order, Task.created_at)
    r = await db.execute(q)
    return [_task_dict(t) for t in r.scalars().all()]


@router.post("/tasks", response_model=TaskOut, status_code=status.HTTP_201_CREATED)
async def create_task(body: TaskCreate, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if body.status not in VALID_STATUSES:
        raise HTTPException(400, f"Invalid status: {body.status}")
    if body.priority not in VALID_PRIORITIES:
        raise HTTPException(400, f"Invalid priority: {body.priority}")
    norm_status = _normalize_status(body.status)
    t = Task(
        user_id=user.id, title=body.title, description=body.description, status=norm_status,
        priority=body.priority, start_date=body.start_date, due_date=body.due_date,
        order=body.order, is_completed=norm_status == "done", color=body.color,
    )
    db.add(t)
    await db.flush()
    # Bulk-attach tags in one round-trip rather than N HTTP calls from the client.
    if body.tag_ids:
        from app.models.notes import Tag
        from app.models.tasks import task_tags
        valid = (
            await db.execute(select(Tag.id).where(Tag.id.in_(body.tag_ids), Tag.user_id == user.id))
        ).scalars().all()
        if valid:
            await db.execute(
                pg_insert(task_tags).values([{"task_id": t.id, "tag_id": tid} for tid in valid])
                .on_conflict_do_nothing(),
            )
    await db.refresh(t, ["gos", "tags", "routine_links"])
    return _task_dict(t)


@router.patch("/tasks/{task_id}", response_model=TaskOut)
async def update_task(task_id: uuid.UUID, body: TaskUpdate, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    t = await _get_task(task_id, user, db)
    data = body.model_dump(exclude_unset=True)
    if "status" in data:
        if data["status"] not in VALID_STATUSES:
            raise HTTPException(400, f"Invalid status: {data['status']}")
        data["status"] = _normalize_status(data["status"])
        data["is_completed"] = data["status"] == "done"
    if "priority" in data and data["priority"] not in VALID_PRIORITIES:
        raise HTTPException(400, f"Invalid priority: {data['priority']}")
    for k, v in data.items():
        setattr(t, k, v)
    await db.flush()
    return _task_dict(t)


@router.delete("/tasks/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_task(task_id: uuid.UUID, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    t = await _get_task(task_id, user, db)
    await db.delete(t)


# ─── Go endpoints ────────────────────────────────────────────────────────────

@router.post("/gos", response_model=GoOut, status_code=status.HTTP_201_CREATED)
async def create_go(body: GoCreate, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if body.kind not in VALID_GO_KINDS:
        raise HTTPException(400, f"Invalid kind: {body.kind}")
    if body.recurrence not in VALID_RECURRENCE:
        raise HTTPException(400, f"Invalid recurrence: {body.recurrence}")

    task = await _get_task(body.task_id, user, db) if body.task_id else None

    g = Go(
        user_id=user.id,
        task_id=task.id if task else None,
        title=body.title, description=body.description, kind=body.kind, unit=body.unit,
        target_value=body.target_value,
        recurrence=body.recurrence, start_date=body.start_date, due_date=body.due_date,
        color=body.color,
    )
    db.add(g)
    await db.flush()
    await db.refresh(g, ["entries"])
    return _go_dict(g, task_title=task.title if task else None)


@router.patch("/gos/{go_id}", response_model=GoOut)
async def update_go(go_id: uuid.UUID, body: GoUpdate, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    g = await _get_go(go_id, user, db)
    data = body.model_dump(exclude_unset=True)
    for k, v in data.items():
        setattr(g, k, v)
    await db.flush()
    await db.refresh(g, ["entries", "task"])
    return _go_dict(g, task_title=g.task.title if g.task else None)


@router.delete("/gos/{go_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_go(go_id: uuid.UUID, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    g = await _get_go(go_id, user, db)
    await db.delete(g)


@router.post("/gos/{go_id}/entries", response_model=GoEntryOut)
async def upsert_go_entry(go_id: uuid.UUID, body: GoEntryUpsert, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    g = await _get_go(go_id, user, db)
    if body.value == 0:
        await db.execute(
            sa_delete(GoEntry).where(GoEntry.go_id == g.id, GoEntry.date == body.date),
        )
        await db.flush()
        return GoEntryOut(id=uuid.uuid4(), go_id=g.id, date=body.date, value=0.0)
    # Race-safe upsert via Postgres ON CONFLICT
    stmt = pg_insert(GoEntry).values(go_id=g.id, date=body.date, value=body.value)
    stmt = stmt.on_conflict_do_update(
        constraint="uq_go_entries_go_date",
        set_={"value": stmt.excluded.value},
    ).returning(GoEntry.id)
    rr = await db.execute(stmt)
    entry_id = rr.scalar_one()
    await db.flush()
    return GoEntryOut(id=entry_id, go_id=g.id, date=body.date, value=body.value)


@router.get("/gos", response_model=list[GoOut])
async def list_all_gos(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all (non-routine-legacy) Gos for the user."""
    q = await db.execute(
        select(Go).where(Go.user_id == user.id, Go.item_kind != "routine_legacy")
        .options(selectinload(Go.entries), selectinload(Go.task))
        .order_by(Go.created_at.desc()),
    )
    return [_go_dict(g, task_title=g.task.title if g.task else None)
            for g in q.scalars().all()]


@router.get("/gos/agenda")
async def gos_agenda(
    section: str = "today",  # today | future | past
    days_back: int = 30,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    today = date_cls.today()
    q = await db.execute(
        select(Go).where(Go.user_id == user.id, Go.item_kind != "routine_legacy")
        .options(selectinload(Go.entries), selectinload(Go.task)),
    )
    all_gos = list(q.scalars().all())

    result = []
    if section == "today":
        for g in all_gos:
            include = False
            if g.recurrence in ("daily", "weekly"):
                include = True
            elif g.due_date == today:
                include = True
            elif g.start_date and g.due_date and g.start_date <= today <= g.due_date:
                # Period-bound one-off Go covering today.
                include = True
            if include:
                result.append(_go_dict(g, task_title=g.task.title if g.task else None))

    elif section == "future":
        for g in all_gos:
            if g.recurrence != "none":
                continue
            anchor = g.start_date or g.due_date
            if anchor and anchor > today:
                result.append(_go_dict(g, task_title=g.task.title if g.task else None))
        result.sort(key=lambda d: d["start_date"] or d["due_date"] or "9999")

    elif section == "past":
        cutoff = today - timedelta(days=days_back)
        for g in all_gos:
            if g.recurrence != "none":
                continue
            if g.due_date and cutoff <= g.due_date < today:
                result.append(_go_dict(g, task_title=g.task.title if g.task else None))
        result.sort(key=lambda d: d["due_date"] or "0000", reverse=True)

    return result
