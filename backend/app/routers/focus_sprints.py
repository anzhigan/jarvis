"""FocusSprints router — temporal focus collections referencing Goals/Steps/Gos/Routines.

Note: a FocusSprint is the NEW Sprint concept (separate from old `sprints` table which
is now used for Steps within a Goal).
"""
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.tasks import FocusSprint, FocusSprintItem, Go, Routine, Sprint, Task
from app.models.user import User
from app.schemas.tasks import (
    FocusSprintCreate,
    FocusSprintItemAdd,
    FocusSprintOut,
    FocusSprintUpdate,
)


router = APIRouter(prefix="/focus-sprints", tags=["focus-sprints"])


VALID_ITEM_TYPES = {"goal", "step", "go", "routine"}


async def _hydrate_item(it: FocusSprintItem, db: AsyncSession) -> dict:
    """Fetch title and color of the referenced entity for client display."""
    title = None
    color = None
    if it.item_type == "goal" and it.goal_id:
        res = await db.execute(select(Task).where(Task.id == it.goal_id))
        t = res.scalar_one_or_none()
        if t:
            title = t.title
    elif it.item_type == "step" and it.step_id:
        res = await db.execute(select(Sprint).where(Sprint.id == it.step_id))
        s = res.scalar_one_or_none()
        if s:
            title = s.title
            color = s.color
    elif it.item_type == "go" and it.go_id:
        res = await db.execute(select(Go).where(Go.id == it.go_id))
        g = res.scalar_one_or_none()
        if g:
            title = g.title
            color = g.color
    elif it.item_type == "routine" and it.routine_id:
        res = await db.execute(select(Routine).where(Routine.id == it.routine_id))
        r = res.scalar_one_or_none()
        if r:
            title = r.title
            color = r.color
    return {
        "id": it.id,
        "item_type": it.item_type,
        "goal_id": it.goal_id,
        "step_id": it.step_id,
        "go_id": it.go_id,
        "routine_id": it.routine_id,
        "title": title,
        "color": color,
    }


async def _focus_sprint_dict(fs: FocusSprint, db: AsyncSession) -> dict:
    items = [await _hydrate_item(it, db) for it in fs.items]
    return {
        "id": fs.id,
        "user_id": fs.user_id,
        "title": fs.title,
        "description": fs.description or "",
        "start_date": fs.start_date,
        "end_date": fs.end_date,
        "color": fs.color,
        "is_archived": fs.is_archived,
        "items": items,
        "created_at": fs.created_at,
        "updated_at": fs.updated_at,
    }


async def _get_focus_sprint(fid: uuid.UUID, user: User, db: AsyncSession) -> FocusSprint:
    res = await db.execute(
        select(FocusSprint)
        .where(FocusSprint.id == fid, FocusSprint.user_id == user.id)
        .options(selectinload(FocusSprint.items))
    )
    fs = res.scalar_one_or_none()
    if not fs:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "FocusSprint not found")
    return fs


# ─── List / Create ────────────────────────────────────────────────────────────

@router.get("", response_model=list[FocusSprintOut])
async def list_focus_sprints(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    res = await db.execute(
        select(FocusSprint)
        .where(FocusSprint.user_id == user.id)
        .options(selectinload(FocusSprint.items))
        .order_by(FocusSprint.start_date.desc())
    )
    return [await _focus_sprint_dict(fs, db) for fs in res.scalars().all()]


@router.post("", response_model=FocusSprintOut)
async def create_focus_sprint(
    body: FocusSprintCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if body.end_date < body.start_date:
        raise HTTPException(400, "end_date must be >= start_date")
    fs = FocusSprint(
        user_id=user.id,
        title=body.title,
        description=body.description or "",
        start_date=body.start_date,
        end_date=body.end_date,
        color=body.color,
    )
    db.add(fs)
    await db.commit()
    await db.refresh(fs, ["items"])
    return await _focus_sprint_dict(fs, db)


# ─── Update / Delete ──────────────────────────────────────────────────────────

@router.patch("/{focus_sprint_id}", response_model=FocusSprintOut)
async def update_focus_sprint(
    focus_sprint_id: uuid.UUID,
    body: FocusSprintUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    fs = await _get_focus_sprint(focus_sprint_id, user, db)
    data = body.model_dump(exclude_unset=True)
    for k, v in data.items():
        setattr(fs, k, v)
    if fs.end_date < fs.start_date:
        raise HTTPException(400, "end_date must be >= start_date")
    await db.commit()
    await db.refresh(fs, ["items"])
    return await _focus_sprint_dict(fs, db)


@router.delete("/{focus_sprint_id}", status_code=204)
async def delete_focus_sprint(
    focus_sprint_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    fs = await _get_focus_sprint(focus_sprint_id, user, db)
    await db.delete(fs)
    await db.commit()


# ─── Items: add / remove ──────────────────────────────────────────────────────

@router.post("/{focus_sprint_id}/items", response_model=FocusSprintOut)
async def add_item(
    focus_sprint_id: uuid.UUID,
    body: FocusSprintItemAdd,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if body.item_type not in VALID_ITEM_TYPES:
        raise HTTPException(400, f"item_type must be one of {VALID_ITEM_TYPES}")

    fs = await _get_focus_sprint(focus_sprint_id, user, db)

    # Verify entity exists and belongs to user
    if body.item_type == "goal":
        if not body.goal_id:
            raise HTTPException(400, "goal_id required")
        res = await db.execute(select(Task).where(Task.id == body.goal_id, Task.user_id == user.id))
        if not res.scalar_one_or_none():
            raise HTTPException(404, "Goal not found")
    elif body.item_type == "step":
        if not body.step_id:
            raise HTTPException(400, "step_id required")
        res = await db.execute(select(Sprint).where(Sprint.id == body.step_id, Sprint.user_id == user.id))
        if not res.scalar_one_or_none():
            raise HTTPException(404, "Step not found")
    elif body.item_type == "go":
        if not body.go_id:
            raise HTTPException(400, "go_id required")
        res = await db.execute(select(Go).where(Go.id == body.go_id, Go.user_id == user.id))
        if not res.scalar_one_or_none():
            raise HTTPException(404, "Go not found")
    elif body.item_type == "routine":
        if not body.routine_id:
            raise HTTPException(400, "routine_id required")
        res = await db.execute(select(Routine).where(Routine.id == body.routine_id, Routine.user_id == user.id))
        if not res.scalar_one_or_none():
            raise HTTPException(404, "Routine not found")

    item = FocusSprintItem(
        focus_sprint_id=fs.id,
        item_type=body.item_type,
        goal_id=body.goal_id,
        step_id=body.step_id,
        go_id=body.go_id,
        routine_id=body.routine_id,
    )
    db.add(item)
    await db.commit()
    await db.refresh(fs, ["items"])
    return await _focus_sprint_dict(fs, db)


@router.delete("/{focus_sprint_id}/items/{item_id}", status_code=204)
async def remove_item(
    focus_sprint_id: uuid.UUID,
    item_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    fs = await _get_focus_sprint(focus_sprint_id, user, db)
    item = next((i for i in fs.items if i.id == item_id), None)
    if item:
        await db.delete(item)
        await db.commit()
