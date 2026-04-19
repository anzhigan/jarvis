import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.tasks import Practice, PracticeEntry, Task
from app.models.user import User
from app.schemas.tasks import (
    PracticeCreate,
    PracticeEntryCreate,
    PracticeEntryOut,
    PracticeOut,
    PracticeUpdate,
    TaskCreate,
    TaskOut,
    TaskUpdate,
)

router = APIRouter(tags=["tasks"])

VALID_STATUSES = {"todo", "in_progress", "done"}
VALID_PRIORITIES = {"low", "medium", "high"}
VALID_PRACTICE_KINDS = {"boolean", "numeric"}
VALID_PRACTICE_STATUSES = {"active", "paused", "done"}


# ── helpers ───────────────────────────────────────────────────────────────────

def _task_opts():
    return (
        selectinload(Task.practices).selectinload(Practice.entries),
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


async def _get_practice_or_404(practice_id: uuid.UUID, user: User, db: AsyncSession) -> Practice:
    result = await db.execute(
        select(Practice)
        .join(Task, Practice.task_id == Task.id)
        .where(Practice.id == practice_id, Task.user_id == user.id)
        .options(selectinload(Practice.entries))
    )
    practice = result.scalar_one_or_none()
    if not practice:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Practice not found")
    return practice


# ── Tasks ─────────────────────────────────────────────────────────────────────

@router.get("/tasks", response_model=list[TaskOut])
async def list_tasks(
    status_filter: str | None = None,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = select(Task).where(Task.user_id == user.id).order_by(Task.order, Task.created_at).options(*_task_opts())
    if status_filter:
        query = query.where(Task.status == status_filter)
    result = await db.execute(query)
    return list(result.scalars().all())


@router.post("/tasks", response_model=TaskOut, status_code=status.HTTP_201_CREATED)
async def create_task(
    body: TaskCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if body.status not in VALID_STATUSES:
        raise HTTPException(400, f"status must be one of {VALID_STATUSES}")
    if body.priority not in VALID_PRIORITIES:
        raise HTTPException(400, f"priority must be one of {VALID_PRIORITIES}")

    task = Task(user_id=user.id, **body.model_dump())
    db.add(task)
    await db.flush()
    await db.refresh(task, ["practices"])
    return task


@router.get("/tasks/{task_id}", response_model=TaskOut)
async def get_task(
    task_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await _get_task_or_404(task_id, user, db)


@router.patch("/tasks/{task_id}", response_model=TaskOut)
async def update_task(
    task_id: uuid.UUID,
    body: TaskUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    task = await _get_task_or_404(task_id, user, db)
    data = body.model_dump(exclude_none=True)

    if "status" in data and data["status"] not in VALID_STATUSES:
        raise HTTPException(400, f"status must be one of {VALID_STATUSES}")
    if "priority" in data and data["priority"] not in VALID_PRIORITIES:
        raise HTTPException(400, f"priority must be one of {VALID_PRIORITIES}")

    for field, value in data.items():
        setattr(task, field, value)

    if data.get("status") == "done":
        task.is_completed = True

    await db.flush()
    return task


@router.delete("/tasks/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_task(
    task_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    task = await _get_task_or_404(task_id, user, db)
    await db.delete(task)


# ── Practices ─────────────────────────────────────────────────────────────────

@router.post("/tasks/{task_id}/practices", response_model=PracticeOut, status_code=status.HTTP_201_CREATED)
async def create_practice(
    task_id: uuid.UUID,
    body: PracticeCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _get_task_or_404(task_id, user, db)
    if body.kind not in VALID_PRACTICE_KINDS:
        raise HTTPException(400, f"kind must be one of {VALID_PRACTICE_KINDS}")
    practice = Practice(task_id=task_id, **body.model_dump())
    db.add(practice)
    await db.flush()
    await db.refresh(practice, ["entries"])
    return practice


@router.patch("/practices/{practice_id}", response_model=PracticeOut)
async def update_practice(
    practice_id: uuid.UUID,
    body: PracticeUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    practice = await _get_practice_or_404(practice_id, user, db)
    data = body.model_dump(exclude_none=True)
    if "kind" in data and data["kind"] not in VALID_PRACTICE_KINDS:
        raise HTTPException(400, f"kind must be one of {VALID_PRACTICE_KINDS}")
    if "status" in data and data["status"] not in VALID_PRACTICE_STATUSES:
        raise HTTPException(400, f"status must be one of {VALID_PRACTICE_STATUSES}")
    for field, value in data.items():
        setattr(practice, field, value)
    await db.flush()
    return practice


@router.delete("/practices/{practice_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_practice(
    practice_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    practice = await _get_practice_or_404(practice_id, user, db)
    await db.delete(practice)


# ── Practice Entries ──────────────────────────────────────────────────────────

@router.post("/practices/{practice_id}/entries", response_model=PracticeEntryOut, status_code=status.HTTP_201_CREATED)
async def add_entry(
    practice_id: uuid.UUID,
    body: PracticeEntryCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _get_practice_or_404(practice_id, user, db)
    # If an entry for this date exists, update it (idempotent logging)
    existing = await db.execute(
        select(PracticeEntry).where(
            PracticeEntry.practice_id == practice_id, PracticeEntry.date == body.date
        )
    )
    ent = existing.scalar_one_or_none()
    if ent:
        ent.value = body.value
        ent.note = body.note
        await db.flush()
        return ent
    entry = PracticeEntry(practice_id=practice_id, **body.model_dump())
    db.add(entry)
    await db.flush()
    return entry


@router.delete("/practices/{practice_id}/entries/{entry_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_entry(
    practice_id: uuid.UUID,
    entry_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _get_practice_or_404(practice_id, user, db)
    result = await db.execute(
        select(PracticeEntry).where(
            PracticeEntry.id == entry_id, PracticeEntry.practice_id == practice_id
        )
    )
    entry = result.scalar_one_or_none()
    if not entry:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Entry not found")
    await db.delete(entry)
