import uuid
from datetime import date as date_cls, timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.tasks import Go, GoEntry, Sprint, Task
from app.models.user import User
from app.schemas.tasks import (
    GoCreate,
    GoEntryOut,
    GoEntryUpsert,
    GoOut,
    GoUpdate,
    SprintCreate,
    SprintOut,
    SprintUpdate,
    TaskCreate,
    TaskOut,
    TaskUpdate,
)

router = APIRouter(tags=["tasks"])

VALID_STATUSES = {"todo", "background", "in_progress", "done"}
VALID_PRIORITIES = {"low", "medium", "high"}
VALID_GO_KINDS = {"boolean", "numeric"}
VALID_RECURRENCE = {"none", "daily", "weekly"}


# ── loaders ──────────────────────────────────────────────────────────────────

def _task_opts():
    return (
        selectinload(Task.sprints).selectinload(Sprint.gos).selectinload(Go.entries),
        selectinload(Task.gos).selectinload(Go.entries),
        selectinload(Task.gos).selectinload(Go.sprint),
        selectinload(Task.tags),
    )


async def _get_task(task_id: uuid.UUID, user: User, db: AsyncSession) -> Task:
    r = await db.execute(
        select(Task).where(Task.id == task_id, Task.user_id == user.id).options(*_task_opts())
    )
    t = r.scalar_one_or_none()
    if not t:
        raise HTTPException(404, "Task not found")
    return t


async def _get_sprint(sprint_id: uuid.UUID, user: User, db: AsyncSession) -> Sprint:
    r = await db.execute(
        select(Sprint).where(Sprint.id == sprint_id, Sprint.user_id == user.id)
        .options(selectinload(Sprint.gos).selectinload(Go.entries), selectinload(Sprint.task))
    )
    s = r.scalar_one_or_none()
    if not s:
        raise HTTPException(404, "Sprint not found")
    return s


async def _get_go(go_id: uuid.UUID, user: User, db: AsyncSession) -> Go:
    r = await db.execute(
        select(Go).where(Go.id == go_id, Go.user_id == user.id)
        .options(selectinload(Go.entries), selectinload(Go.task), selectinload(Go.sprint))
    )
    g = r.scalar_one_or_none()
    if not g:
        raise HTTPException(404, "Go not found")
    return g


# ─── Progress calculation ────────────────────────────────────────────────────

def _is_go_done_today(go: Go) -> bool:
    """For boolean: has an entry with value>0 for today.
    For numeric one-off: cumulative total_value >= target_value.
    For numeric recurring: today's value >= target_value.
    """
    today = date_cls.today()
    if go.kind == "boolean":
        return any(e.value > 0 and e.date == today for e in go.entries)
    # numeric
    target = go.target_value or 0
    if go.recurrence == "none":
        total = sum(e.value for e in go.entries)
        return target > 0 and total >= target
    else:
        today_val = next((e.value for e in go.entries if e.date == today), 0)
        return target > 0 and today_val >= target


def _go_completion_ratio(g: Go, period_start: date_cls | None = None, period_end: date_cls | None = None) -> float:
    """Returns 0.0..1.0 — how complete this Go is.

    For daily-recurring boolean Go:
        ratio = entries_with_value>0 / possible_days
        possible_days = days from max(g.created_at, period_start) to min(today, period_end or due_date)
    For other Go (one-off or numeric):
        boolean → 1.0 if any positive entry else 0.0
        numeric → min(1.0, sum(values) / target_value) or 1.0 if no target & has entries
    """
    today = date_cls.today()

    # Recurring boolean (daily or weekly) is the special case
    if g.kind == "boolean" and g.recurrence in ("daily", "weekly"):
        # Establish window
        start = g.created_at.date() if g.created_at else today
        if period_start and period_start > start:
            start = period_start
        end = today
        # Cap by due_date or period_end
        if g.due_date and g.due_date < end:
            end = g.due_date
        if period_end and period_end < end:
            end = period_end
        if end < start:
            return 0.0
        possible_days = (end - start).days + 1
        if possible_days <= 0:
            return 0.0
        # For weekly — convert to weeks, count weeks with ≥1 entry
        if g.recurrence == "weekly":
            possible_weeks = max(1, (possible_days + 6) // 7)
            seen_weeks = set()
            for e in g.entries:
                if e.value > 0 and start <= e.date <= end:
                    # Week index from start
                    seen_weeks.add((e.date - start).days // 7)
            return min(1.0, len(seen_weeks) / possible_weeks)
        # Daily: count days with value > 0
        done_days = sum(
            1 for e in g.entries
            if e.value > 0 and start <= e.date <= end
        )
        return min(1.0, done_days / possible_days)

    # Non-recurring boolean
    if g.kind == "boolean":
        return 1.0 if any(e.value > 0 for e in g.entries) else 0.0

    # numeric
    total = sum(e.value for e in g.entries)
    target = g.target_value or 0
    if target > 0:
        return min(1.0, total / target)
    return 1.0 if total > 0 else 0.0


def _go_total_value(go: Go) -> float:
    return sum(e.value for e in go.entries)


def _sprint_progress(sprint: Sprint) -> int:
    """Progress % = average of completion ratios across all Gos."""
    if not sprint.gos:
        return 0
    period_start = sprint.start_date
    period_end = sprint.end_date
    ratios = [_go_completion_ratio(g, period_start, period_end) for g in sprint.gos]
    return int(round(100 * sum(ratios) / len(ratios)))


def _task_progress(task: Task) -> int:
    """Average of completion ratios across sprints + direct gos."""
    direct_gos = [g for g in task.gos if not g.sprint_id]
    sprint_progresses = [_sprint_progress(s) for s in task.sprints]
    direct_ratios = [
        _go_completion_ratio(g, task.start_date, task.due_date) * 100
        for g in direct_gos
    ]
    all_values = sprint_progresses + direct_ratios
    if not all_values:
        return 0
    result = int(round(sum(all_values) / len(all_values)))
    # Debug — log what we're seeing
    import logging
    log = logging.getLogger("task_progress")
    log.warning(
        f"TASK[{task.title}] progress={result}% | sprints={sprint_progresses} direct_ratios={direct_ratios} | "
        f"direct_gos={[(g.title, g.recurrence, len(g.entries)) for g in direct_gos]} | "
        f"all_gos={[(g.title, g.sprint_id, g.recurrence, len(g.entries)) for g in task.gos]}"
    )
    return result


# ─── Serializers ─────────────────────────────────────────────────────────────

def _go_dict(g: Go, task_title: str | None = None, sprint_title: str | None = None) -> dict:
    return {
        "id": g.id,
        "user_id": g.user_id,
        "task_id": g.task_id,
        "sprint_id": g.sprint_id,
        "title": g.title,
        "description": g.description or "",
        "kind": g.kind,
        "unit": g.unit,
        "target_value": g.target_value,
        "recurrence": g.recurrence,
        "due_date": g.due_date,
        "color": g.color,
        "entries": [
            {"id": e.id, "go_id": e.go_id, "date": e.date, "value": e.value}
            for e in g.entries
        ],
        "task_title": task_title,
        "sprint_title": sprint_title,
        "total_value": _go_total_value(g),
        "is_done_today": _is_go_done_today(g),
        "created_at": g.created_at,
    }


def _sprint_dict(s: Sprint, task_title: str | None = None) -> dict:
    gos_out = []
    for g in s.gos:
        gos_out.append(_go_dict(g, task_title=s.task.title if s.task else task_title, sprint_title=s.title))
    return {
        "id": s.id,
        "task_id": s.task_id,
        "user_id": s.user_id,
        "title": s.title,
        "description": s.description,
        "start_date": s.start_date,
        "end_date": s.end_date,
        "is_completed": s.is_completed,
        "color": s.color,
        "gos": gos_out,
        "task_title": task_title,
        "progress": _sprint_progress(s),
        "created_at": s.created_at,
        "updated_at": s.updated_at,
    }


def _task_dict(t: Task) -> dict:
    sprints_out = [_sprint_dict(s, task_title=t.title) for s in t.sprints]
    # Only include top-level gos (no sprint) — those are "direct" task gos
    direct_gos = [g for g in t.gos if not g.sprint_id]
    gos_out = [_go_dict(g, task_title=t.title) for g in direct_gos]
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
        "sprints": sprints_out,
        "gos": gos_out,
        "tags": t.tags,
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
    t = Task(
        user_id=user.id, title=body.title, description=body.description, status=body.status,
        priority=body.priority, start_date=body.start_date, due_date=body.due_date,
        order=body.order, is_completed=body.status == "done",
    )
    db.add(t)
    await db.flush()
    await db.refresh(t, ["sprints", "gos", "tags"])
    return _task_dict(t)


@router.patch("/tasks/{task_id}", response_model=TaskOut)
async def update_task(task_id: uuid.UUID, body: TaskUpdate, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    t = await _get_task(task_id, user, db)
    data = body.model_dump(exclude_unset=True)
    if "status" in data:
        if data["status"] not in VALID_STATUSES:
            raise HTTPException(400, f"Invalid status: {data['status']}")
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


# ─── Sprint endpoints ────────────────────────────────────────────────────────

@router.post("/sprints", response_model=SprintOut, status_code=status.HTTP_201_CREATED)
async def create_sprint(body: SprintCreate, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    task = await _get_task(body.task_id, user, db)
    if body.start_date > body.end_date:
        raise HTTPException(400, "start_date must be <= end_date")
    s = Sprint(
        task_id=task.id, user_id=user.id, title=body.title, description=body.description,
        start_date=body.start_date, end_date=body.end_date, color=body.color,
    )
    db.add(s)
    await db.flush()
    await db.refresh(s, ["gos", "task"])
    return _sprint_dict(s, task_title=task.title)


@router.patch("/sprints/{sprint_id}", response_model=SprintOut)
async def update_sprint(sprint_id: uuid.UUID, body: SprintUpdate, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    s = await _get_sprint(sprint_id, user, db)
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(s, k, v)
    if s.start_date > s.end_date:
        raise HTTPException(400, "start_date must be <= end_date")
    await db.flush()
    await db.refresh(s, ["gos", "task"])
    return _sprint_dict(s, task_title=s.task.title if s.task else None)


@router.delete("/sprints/{sprint_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_sprint(sprint_id: uuid.UUID, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    s = await _get_sprint(sprint_id, user, db)
    await db.delete(s)


@router.post("/sprints/{sprint_id}/attach/{go_id}", response_model=GoOut)
async def attach_go_to_sprint(sprint_id: uuid.UUID, go_id: uuid.UUID, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    s = await _get_sprint(sprint_id, user, db)
    g = await _get_go(go_id, user, db)
    if g.task_id and g.task_id != s.task_id:
        raise HTTPException(400, "Go belongs to a different task")
    g.sprint_id = s.id
    if not g.task_id:
        g.task_id = s.task_id
    await db.flush()
    return _go_dict(g, task_title=g.task.title if g.task else None, sprint_title=s.title)


@router.post("/sprints/{sprint_id}/detach/{go_id}", response_model=GoOut)
async def detach_go_from_sprint(sprint_id: uuid.UUID, go_id: uuid.UUID, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    s = await _get_sprint(sprint_id, user, db)
    g = await _get_go(go_id, user, db)
    if g.sprint_id != s.id:
        raise HTTPException(400, "Go is not attached to this sprint")
    g.sprint_id = None
    await db.flush()
    return _go_dict(g, task_title=g.task.title if g.task else None, sprint_title=None)


# ─── Go endpoints ────────────────────────────────────────────────────────────

@router.post("/gos", response_model=GoOut, status_code=status.HTTP_201_CREATED)
async def create_go(body: GoCreate, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if body.kind not in VALID_GO_KINDS:
        raise HTTPException(400, f"Invalid kind: {body.kind}")
    if body.recurrence not in VALID_RECURRENCE:
        raise HTTPException(400, f"Invalid recurrence: {body.recurrence}")

    task = None
    sprint = None
    if body.task_id:
        task = await _get_task(body.task_id, user, db)
    if body.sprint_id:
        sprint = await _get_sprint(body.sprint_id, user, db)
        if body.task_id and sprint.task_id != body.task_id:
            raise HTTPException(400, "Sprint belongs to a different task")
        # if only sprint_id is given, inherit task_id from sprint
        if not body.task_id:
            task = await _get_task(sprint.task_id, user, db)

    g = Go(
        user_id=user.id,
        task_id=task.id if task else None,
        sprint_id=sprint.id if sprint else None,
        title=body.title, kind=body.kind, unit=body.unit, target_value=body.target_value,
        recurrence=body.recurrence, due_date=body.due_date, color=body.color,
    )
    db.add(g)
    await db.flush()
    await db.refresh(g, ["entries"])
    return _go_dict(
        g,
        task_title=task.title if task else None,
        sprint_title=sprint.title if sprint else None,
    )


@router.patch("/gos/{go_id}", response_model=GoOut)
async def update_go(go_id: uuid.UUID, body: GoUpdate, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    g = await _get_go(go_id, user, db)
    data = body.model_dump(exclude_unset=True)

    # Validate sprint_id change
    if "sprint_id" in data and data["sprint_id"]:
        sp = await _get_sprint(data["sprint_id"], user, db)
        if g.task_id and sp.task_id != g.task_id:
            raise HTTPException(400, "Sprint belongs to a different task")
        if not g.task_id:
            data["task_id"] = sp.task_id

    for k, v in data.items():
        setattr(g, k, v)
    await db.flush()
    await db.refresh(g, ["entries", "task", "sprint"])
    return _go_dict(
        g,
        task_title=g.task.title if g.task else None,
        sprint_title=g.sprint.title if g.sprint else None,
    )


@router.delete("/gos/{go_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_go(go_id: uuid.UUID, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    g = await _get_go(go_id, user, db)
    await db.delete(g)


@router.post("/gos/{go_id}/entries", response_model=GoEntryOut)
async def upsert_go_entry(go_id: uuid.UUID, body: GoEntryUpsert, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    g = await _get_go(go_id, user, db)
    rr = await db.execute(select(GoEntry).where(GoEntry.go_id == g.id, GoEntry.date == body.date))
    e = rr.scalar_one_or_none()
    if body.value == 0 and e:
        await db.delete(e)
        await db.flush()
        return GoEntryOut(id=e.id, go_id=g.id, date=body.date, value=0.0)
    if e:
        e.value = body.value
    else:
        e = GoEntry(go_id=g.id, date=body.date, value=body.value)
        db.add(e)
    await db.flush()
    return GoEntryOut(id=e.id, go_id=g.id, date=body.date, value=e.value)


@router.get("/gos/agenda")
async def gos_agenda(
    section: str = "today",  # today | future | past
    days_back: int = 30,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    today = date_cls.today()
    q = await db.execute(
        select(Go).where(Go.user_id == user.id)
        .options(selectinload(Go.entries), selectinload(Go.task), selectinload(Go.sprint))
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
            if include:
                result.append(_go_dict(
                    g,
                    task_title=g.task.title if g.task else None,
                    sprint_title=g.sprint.title if g.sprint else None,
                ))

    elif section == "future":
        for g in all_gos:
            if g.recurrence != "none":
                continue
            if g.due_date and g.due_date > today:
                result.append(_go_dict(
                    g,
                    task_title=g.task.title if g.task else None,
                    sprint_title=g.sprint.title if g.sprint else None,
                ))
        result.sort(key=lambda d: d["due_date"] or "9999")

    elif section == "past":
        cutoff = today - timedelta(days=days_back)
        for g in all_gos:
            if g.recurrence != "none":
                continue
            if g.due_date and cutoff <= g.due_date < today:
                result.append(_go_dict(
                    g,
                    task_title=g.task.title if g.task else None,
                    sprint_title=g.sprint.title if g.sprint else None,
                ))
        result.sort(key=lambda d: d["due_date"] or "0000", reverse=True)

    return result


@router.get("/sprints/agenda")
async def sprints_agenda(
    section: str = "current",  # current | future | past
    days_back: int = 90,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    today = date_cls.today()
    q = await db.execute(
        select(Sprint).where(Sprint.user_id == user.id)
        .options(selectinload(Sprint.gos).selectinload(Go.entries), selectinload(Sprint.task))
    )
    all_sprints = list(q.scalars().all())

    result = []
    if section == "current":
        for s in all_sprints:
            if s.start_date <= today <= s.end_date:
                result.append(_sprint_dict(s, task_title=s.task.title if s.task else None))
        result.sort(key=lambda d: (d["end_date"], d["start_date"]))

    elif section == "future":
        for s in all_sprints:
            if s.start_date > today:
                result.append(_sprint_dict(s, task_title=s.task.title if s.task else None))
        result.sort(key=lambda d: d["start_date"])

    elif section == "past":
        cutoff = today - timedelta(days=days_back)
        for s in all_sprints:
            if s.end_date < today and s.end_date >= cutoff:
                result.append(_sprint_dict(s, task_title=s.task.title if s.task else None))
        result.sort(key=lambda d: d["end_date"], reverse=True)

    return result
