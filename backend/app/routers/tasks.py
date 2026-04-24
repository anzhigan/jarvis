import uuid
from datetime import date as date_cls, datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.tasks import Task, Todo, TodoEntry
from app.models.user import User
from app.schemas.tasks import (
    TaskCreate,
    TaskOut,
    TaskUpdate,
    TodoCreate,
    TodoEntryOut,
    TodoEntryUpsert,
    TodoOut,
    TodoUpdate,
)

router = APIRouter(tags=["tasks"])

VALID_STATUSES = {"todo", "background", "in_progress", "done"}
VALID_PRIORITIES = {"low", "medium", "high"}
VALID_TODO_KINDS = {"boolean", "numeric"}
VALID_RECURRENCE = {"none", "daily", "weekly"}


# ── helpers ───────────────────────────────────────────────────────────────────

def _task_opts():
    return (
        selectinload(Task.todos).selectinload(Todo.entries),
        selectinload(Task.tags),
    )


async def _get_task_or_404(task_id: uuid.UUID, user: User, db: AsyncSession) -> Task:
    result = await db.execute(
        select(Task)
        .where(Task.id == task_id, Task.user_id == user.id)
        .options(*_task_opts())
    )
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Task not found")
    return task


async def _get_todo_or_404(todo_id: uuid.UUID, user: User, db: AsyncSession) -> Todo:
    result = await db.execute(
        select(Todo)
        .where(Todo.id == todo_id, Todo.user_id == user.id)
        .options(selectinload(Todo.entries), selectinload(Todo.task))
    )
    todo = result.scalar_one_or_none()
    if not todo:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Todo not found")
    return todo


# ─── Progress calculation ─────────────────────────────────────────────────────

def _expected_occurrences_for_recurring(todo: Todo, task: Task | None) -> int:
    """How many occurrences are expected in the task period."""
    if todo.recurrence == "none":
        return 1
    # Period = task.created_at..task.due_date (or today if no due_date)
    start = task.created_at.date() if task else todo.created_at.date()
    end = task.due_date if (task and task.due_date) else date_cls.today()
    if end < start:
        end = start
    total_days = (end - start).days + 1
    if todo.recurrence == "daily":
        return max(1, total_days)
    if todo.recurrence == "weekly":
        return max(1, (total_days + 6) // 7)
    return 1


def _compute_task_progress(task: Task) -> int:
    """Progress % for the task based on todo completion (0..100).

    For boolean one-off: done = 100, else 0.
    For boolean recurring: sum(completed days) / expected days.
    For numeric: sum(values) / (target * expected_occurrences).
    Task progress = avg of todo progresses.

    Children todos (those with a parent) are skipped — their values are
    rolled up into the parent's total_value which we compute from entries."""
    top_level = [t for t in task.todos if t.parent_todo_id is None]
    if not top_level:
        return 0

    # For each todo, gather all entries including descendants'
    children_map: dict[uuid.UUID, list[Todo]] = {}
    for t in task.todos:
        if t.parent_todo_id:
            children_map.setdefault(t.parent_todo_id, []).append(t)

    per_todo: list[float] = []
    for todo in top_level:
        expected = _expected_occurrences_for_recurring(todo, task)

        # Gather entries from self + descendants
        own_entries = list(todo.entries)
        for child in children_map.get(todo.id, []):
            own_entries.extend(child.entries)

        if todo.kind == "boolean":
            if todo.recurrence == "none":
                done = any(e.value > 0 for e in own_entries)
                per_todo.append(1.0 if done else 0.0)
            else:
                done_count = sum(1 for e in own_entries if e.value > 0)
                per_todo.append(min(1.0, done_count / expected) if expected > 0 else 0.0)
        else:
            total_value = sum(e.value for e in own_entries)
            if todo.target_value and todo.target_value > 0:
                target = todo.target_value * expected
                per_todo.append(min(1.0, total_value / target) if target > 0 else 0.0)
            else:
                per_todo.append(1.0 if total_value > 0 else 0.0)

    if not per_todo:
        return 0
    avg = sum(per_todo) / len(per_todo)
    return int(round(avg * 100))


def _serialize_todo(t: Todo, task_title: str | None, children_map: dict[uuid.UUID, list[Todo]]) -> dict:
    """Serialize a todo, computing total_value = own entries + children's entries (recursive)."""
    own_total = sum(e.value for e in t.entries)
    children = children_map.get(t.id, [])
    children_total = sum(
        sum(e.value for e in c.entries) for c in children
    )
    return {
        "id": t.id,
        "task_id": t.task_id,
        "user_id": t.user_id,
        "parent_todo_id": t.parent_todo_id,
        "title": t.title,
        "kind": t.kind,
        "unit": t.unit,
        "target_value": t.target_value,
        "recurrence": t.recurrence,
        "due_date": t.due_date,
        "color": t.color,
        "entries": [
            {"id": e.id, "todo_id": e.todo_id, "date": e.date, "value": e.value}
            for e in t.entries
        ],
        "task_title": task_title,
        "total_value": own_total + children_total,
        "created_at": t.created_at,
    }


def _serialize_task(task: Task) -> dict:
    """Turn a Task + todos + entries into a TaskOut dict with computed progress."""
    # Build children map: parent_id -> [child todos]
    children_map: dict[uuid.UUID, list[Todo]] = {}
    for t in task.todos:
        if t.parent_todo_id:
            children_map.setdefault(t.parent_todo_id, []).append(t)

    todos_out = [
        _serialize_todo(t, task.title, children_map)
        for t in task.todos
    ]

    return {
        "id": task.id,
        "title": task.title,
        "description": task.description,
        "status": task.status,
        "priority": task.priority,
        "start_date": task.start_date,
        "due_date": task.due_date,
        "is_completed": task.is_completed,
        "order": task.order,
        "todos": todos_out,
        "tags": task.tags,
        "progress": _compute_task_progress(task),
        "created_at": task.created_at,
        "updated_at": task.updated_at,
    }


# ─── Task endpoints ───────────────────────────────────────────────────────────

@router.get("/tasks", response_model=list[TaskOut])
async def list_tasks(
    status_filter: str | None = None,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = select(Task).where(Task.user_id == user.id).options(*_task_opts())
    if status_filter:
        query = query.where(Task.status == status_filter)
    query = query.order_by(Task.order, Task.created_at)
    result = await db.execute(query)
    tasks = list(result.scalars().all())
    return [_serialize_task(t) for t in tasks]


@router.post("/tasks", response_model=TaskOut, status_code=status.HTTP_201_CREATED)
async def create_task(
    body: TaskCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if body.status not in VALID_STATUSES:
        raise HTTPException(400, f"Invalid status: {body.status}")
    if body.priority not in VALID_PRIORITIES:
        raise HTTPException(400, f"Invalid priority: {body.priority}")

    task = Task(
        user_id=user.id,
        title=body.title,
        description=body.description,
        status=body.status,
        priority=body.priority,
        start_date=body.start_date,
        due_date=body.due_date,
        order=body.order,
        is_completed=body.status == "done",
    )
    db.add(task)
    await db.flush()
    await db.refresh(task, ["todos", "tags"])
    return _serialize_task(task)


@router.patch("/tasks/{task_id}", response_model=TaskOut)
async def update_task(
    task_id: uuid.UUID,
    body: TaskUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    task = await _get_task_or_404(task_id, user, db)
    data = body.model_dump(exclude_unset=True)

    if "status" in data:
        if data["status"] not in VALID_STATUSES:
            raise HTTPException(400, f"Invalid status: {data['status']}")
        data["is_completed"] = data["status"] == "done"
    if "priority" in data and data["priority"] not in VALID_PRIORITIES:
        raise HTTPException(400, f"Invalid priority: {data['priority']}")

    for field, value in data.items():
        setattr(task, field, value)
    await db.flush()
    return _serialize_task(task)


@router.delete("/tasks/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_task(
    task_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    task = await _get_task_or_404(task_id, user, db)
    await db.delete(task)


# ─── Todo endpoints ───────────────────────────────────────────────────────────

@router.post("/tasks/{task_id}/todos", response_model=TodoOut, status_code=status.HTTP_201_CREATED)
async def create_todo(
    task_id: uuid.UUID,
    body: TodoCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    task = await _get_task_or_404(task_id, user, db)
    if body.kind not in VALID_TODO_KINDS:
        raise HTTPException(400, f"Invalid kind: {body.kind}")
    if body.recurrence not in VALID_RECURRENCE:
        raise HTTPException(400, f"Invalid recurrence: {body.recurrence}")

    # Validate parent_todo_id if provided
    if body.parent_todo_id:
        parent_q = await db.execute(
            select(Todo).where(Todo.id == body.parent_todo_id, Todo.user_id == user.id)
        )
        parent = parent_q.scalar_one_or_none()
        if not parent:
            raise HTTPException(400, "Parent todo not found")
        if parent.task_id != task.id:
            raise HTTPException(400, "Parent todo must belong to the same task")
        if parent.parent_todo_id is not None:
            raise HTTPException(400, "Nesting todos more than one level deep is not allowed")

    todo = Todo(
        task_id=task.id,
        user_id=user.id,
        parent_todo_id=body.parent_todo_id,
        title=body.title,
        kind=body.kind,
        unit=body.unit,
        target_value=body.target_value,
        recurrence=body.recurrence,
        due_date=body.due_date,
        color=body.color,
    )
    db.add(todo)
    await db.flush()
    await db.refresh(todo, ["entries"])
    return TodoOut(
        id=todo.id, task_id=todo.task_id, user_id=todo.user_id,
        parent_todo_id=todo.parent_todo_id,
        title=todo.title,
        kind=todo.kind, unit=todo.unit, target_value=todo.target_value,
        recurrence=todo.recurrence, due_date=todo.due_date, color=todo.color,
        entries=[], task_title=task.title, total_value=0.0,
        created_at=todo.created_at,
    )


@router.post("/todos/standalone", response_model=TodoOut, status_code=status.HTTP_201_CREATED)
async def create_standalone_todo(
    body: TodoCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a todo not attached to any task (ad-hoc daily/weekly todo)."""
    if body.kind not in VALID_TODO_KINDS:
        raise HTTPException(400, f"Invalid kind: {body.kind}")
    if body.recurrence not in VALID_RECURRENCE:
        raise HTTPException(400, f"Invalid recurrence: {body.recurrence}")

    todo = Todo(
        task_id=None,
        user_id=user.id,
        title=body.title,
        kind=body.kind,
        unit=body.unit,
        target_value=body.target_value,
        recurrence=body.recurrence,
        due_date=body.due_date,
        color=body.color,
    )
    db.add(todo)
    await db.flush()
    return TodoOut(
        id=todo.id, task_id=None, user_id=todo.user_id,
        parent_todo_id=None,
        title=todo.title,
        kind=todo.kind, unit=todo.unit, target_value=todo.target_value,
        recurrence=todo.recurrence, due_date=todo.due_date, color=todo.color,
        entries=[], task_title=None, total_value=0.0,
        created_at=todo.created_at,
    )


@router.patch("/todos/{todo_id}", response_model=TodoOut)
async def update_todo(
    todo_id: uuid.UUID,
    body: TodoUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    todo = await _get_todo_or_404(todo_id, user, db)
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(todo, field, value)
    await db.flush()
    await db.refresh(todo, ["entries", "task"])
    total = sum(e.value for e in todo.entries)
    return TodoOut(
        id=todo.id, task_id=todo.task_id, user_id=todo.user_id,
        parent_todo_id=todo.parent_todo_id,
        title=todo.title,
        kind=todo.kind, unit=todo.unit, target_value=todo.target_value,
        recurrence=todo.recurrence, due_date=todo.due_date, color=todo.color,
        entries=[TodoEntryOut.model_validate(e) for e in todo.entries],
        task_title=todo.task.title if todo.task else None,
        total_value=total,
        created_at=todo.created_at,
    )


@router.delete("/todos/{todo_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_todo(
    todo_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    todo = await _get_todo_or_404(todo_id, user, db)
    await db.delete(todo)


@router.post("/todos/{todo_id}/entries", response_model=TodoEntryOut)
async def upsert_todo_entry(
    todo_id: uuid.UUID,
    body: TodoEntryUpsert,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Check/uncheck or log a numeric value for a todo on a specific date.
    If value==0 and entry exists — delete it."""
    todo = await _get_todo_or_404(todo_id, user, db)

    # Find existing entry
    existing_q = await db.execute(
        select(TodoEntry).where(TodoEntry.todo_id == todo.id, TodoEntry.date == body.date)
    )
    entry = existing_q.scalar_one_or_none()

    if body.value == 0 and entry:
        await db.delete(entry)
        await db.flush()
        return TodoEntryOut(id=entry.id, todo_id=todo.id, date=body.date, value=0.0)

    if entry:
        entry.value = body.value
    else:
        entry = TodoEntry(todo_id=todo.id, date=body.date, value=body.value)
        db.add(entry)
    await db.flush()
    return TodoEntryOut(id=entry.id, todo_id=todo.id, date=body.date, value=entry.value)


@router.get("/todos/agenda")
async def agenda(
    section: str = "today",  # today | week | future | past
    days_back: int = 30,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return todos relevant to a section.

    - today: daily-recurring todos OR todos with due_date=today OR task in-period on today
             (daily children of weeklies ARE shown — duplicated as user requested)
    - week: weekly-recurring todos OR todos with due_date in next 7 days
    - future: todos/tasks where period starts after today
    - past: completed/expired todos (default 30 days back)
    """
    today = date_cls.today()
    q = await db.execute(
        select(Todo).where(Todo.user_id == user.id)
        .options(
            selectinload(Todo.entries),
            selectinload(Todo.task),
            selectinload(Todo.children).selectinload(Todo.entries),
        )
    )
    all_todos = list(q.scalars().all())

    def task_period_contains(task: Task | None, d: date_cls) -> bool:
        if not task:
            return False
        start = task.start_date or task.created_at.date()
        end = task.due_date or d
        return start <= d <= end

    def serialize(todo: Todo) -> dict:
        own_total = sum(e.value for e in todo.entries)
        children_total = sum(sum(e.value for e in c.entries) for c in (todo.children or []))
        return {
            "id": str(todo.id),
            "task_id": str(todo.task_id) if todo.task_id else None,
            "user_id": str(todo.user_id),
            "parent_todo_id": str(todo.parent_todo_id) if todo.parent_todo_id else None,
            "title": todo.title,
            "kind": todo.kind,
            "unit": todo.unit,
            "target_value": todo.target_value,
            "recurrence": todo.recurrence,
            "due_date": todo.due_date.isoformat() if todo.due_date else None,
            "color": todo.color,
            "entries": [
                {"id": str(e.id), "todo_id": str(e.todo_id),
                 "date": e.date.isoformat(), "value": e.value}
                for e in todo.entries
            ],
            "task_title": todo.task.title if todo.task else None,
            "total_value": own_total + children_total,
            "created_at": todo.created_at.isoformat(),
        }

    result: list[dict] = []

    if section == "today":
        # Today = daily-recurring + one-off today + todos whose task period covers today
        #         + daily children of weeklies also included (duplicated)
        for t in all_todos:
            if t.recurrence == "daily":
                result.append(serialize(t))
            elif t.due_date == today:
                result.append(serialize(t))
            elif (t.recurrence == "none" and not t.due_date and
                  task_period_contains(t.task, today) and
                  t.parent_todo_id is None):
                # Task-level todo that's currently "active" — show it
                result.append(serialize(t))

    elif section == "week":
        # Week = weekly-recurring todos OR todos with due_date in [today, today+6]
        week_end = today + timedelta(days=6)
        for t in all_todos:
            if t.recurrence == "weekly":
                result.append(serialize(t))
            elif t.due_date and today <= t.due_date <= week_end and t.recurrence == "none":
                # Only show if not already counted as weekly
                result.append(serialize(t))

    elif section == "future":
        # Future = todos with due_date > today+6, or task.start_date > today
        week_end = today + timedelta(days=6)
        for t in all_todos:
            if t.due_date and t.due_date > week_end:
                result.append(serialize(t))
            elif (not t.due_date and t.recurrence == "none" and
                  t.task and t.task.start_date and t.task.start_date > today and
                  t.parent_todo_id is None):
                result.append(serialize(t))
        # Sort by effective date
        def fut_key(d):
            return d["due_date"] or "9999"
        result.sort(key=fut_key)

    elif section == "past":
        past_cutoff = today - timedelta(days=days_back)
        for t in all_todos:
            # Past = due_date in past, OR task.due_date in past
            was_past = False
            if t.due_date and past_cutoff <= t.due_date < today:
                was_past = True
            elif (t.task and t.task.due_date and
                  past_cutoff <= t.task.due_date < today and
                  t.parent_todo_id is None):
                was_past = True
            if was_past:
                result.append(serialize(t))
        def past_key(d):
            return d["due_date"] or d["created_at"]
        result.sort(key=past_key, reverse=True)

    return result
