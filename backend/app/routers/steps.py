"""Step CRUD endpoints.

A Step is a milestone phase inside a Goal (Task). Steps are ordered and can
contain Gos (Go.step_id is an optional FK). Endpoints mirror the project's
ownership-by-user_id convention.
"""
import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.tasks import Step, Task
from app.models.user import User
from app.schemas.tasks import StepCreate, StepOut, StepReorder, StepUpdate
from app.services.tasks import (
    VALID_STEP_STATUSES,
    get_step_or_404,
    get_task_or_404,
    is_go_done_today,
)

router = APIRouter(tags=["steps"])


def _step_dict(s: Step, gos_count: int = 0, gos_done: int = 0) -> dict:
    return {
        "id": s.id,
        "user_id": s.user_id,
        "goal_id": s.goal_id,
        "title": s.title,
        "description": s.description or "",
        "position": s.position,
        "status": s.status,
        "start_date": s.start_date,
        "end_date": s.end_date,
        "completed_at": s.completed_at,
        "gos_count": gos_count,
        "gos_done": gos_done,
        "created_at": s.created_at,
        "updated_at": s.updated_at,
    }


async def _serialize_steps_for_goal(goal: Task, db: AsyncSession) -> list[dict]:
    """Compute (gos_count, gos_done) for each step from the parent goal's gos."""
    # Reload steps explicitly to guarantee ordering by position even after edits.
    r = await db.execute(
        select(Step).where(Step.goal_id == goal.id).order_by(Step.position, Step.created_at),
    )
    steps = r.scalars().all()
    by_id: dict[uuid.UUID, dict] = {}
    for s in steps:
        by_id[s.id] = _step_dict(s)
    for g in goal.gos:
        if g.step_id is None or g.item_kind == "routine_legacy":
            continue
        d = by_id.get(g.step_id)
        if d is None:
            continue
        d["gos_count"] += 1
        if is_go_done_today(g):
            d["gos_done"] += 1
    return list(by_id.values())


@router.get("/tasks/{task_id}/steps", response_model=list[StepOut])
async def list_steps(
    task_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List steps inside a goal, ordered by position. Counts are computed
    against the goal's gos (gos_count = total, gos_done = done today)."""
    goal = await get_task_or_404(task_id, user, db)
    return await _serialize_steps_for_goal(goal, db)


@router.post(
    "/tasks/{task_id}/steps",
    response_model=StepOut,
    status_code=status.HTTP_201_CREATED,
)
async def create_step(
    task_id: uuid.UUID,
    body: StepCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if body.status not in VALID_STEP_STATUSES:
        raise HTTPException(400, f"Invalid step status: {body.status}")
    goal = await get_task_or_404(task_id, user, db)

    # If no explicit position, append at the end.
    next_pos = body.position
    if next_pos == 0 or any(s.position == body.position for s in goal.steps):
        existing = [s.position for s in goal.steps]
        next_pos = (max(existing) + 1) if existing else 0

    s = Step(
        user_id=user.id,
        goal_id=goal.id,
        title=body.title,
        description=body.description,
        position=next_pos,
        status=body.status,
        start_date=body.start_date,
        end_date=body.end_date,
        completed_at=datetime.now(UTC) if body.status == "done" else None,
    )
    db.add(s)
    await db.commit()
    await db.refresh(s)
    return _step_dict(s)


@router.patch("/steps/{step_id}", response_model=StepOut)
async def update_step(
    step_id: uuid.UUID,
    body: StepUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    s = await get_step_or_404(step_id, user, db)
    if body.title is not None:
        s.title = body.title
    if body.description is not None:
        s.description = body.description
    if body.position is not None:
        s.position = body.position
    if body.start_date is not None:
        s.start_date = body.start_date
    if body.end_date is not None:
        s.end_date = body.end_date
    if body.status is not None:
        if body.status not in VALID_STEP_STATUSES:
            raise HTTPException(400, f"Invalid step status: {body.status}")
        # Auto-stamp completed_at when transitioning to/from done.
        if body.status == "done" and s.status != "done":
            s.completed_at = datetime.now(UTC)
        elif body.status != "done" and s.status == "done":
            s.completed_at = None
        s.status = body.status
    await db.commit()
    await db.refresh(s)
    return _step_dict(s)


@router.delete("/steps/{step_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_step(
    step_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    s = await get_step_or_404(step_id, user, db)
    await db.delete(s)
    await db.commit()
    return None


@router.post("/tasks/{task_id}/steps/reorder", response_model=list[StepOut])
async def reorder_steps(
    task_id: uuid.UUID,
    body: StepReorder,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Set step positions according to the provided ordering. Any step IDs
    not in the list keep their relative order at the tail."""
    goal = await get_task_or_404(task_id, user, db)
    r = await db.execute(
        select(Step).where(Step.goal_id == goal.id),
    )
    by_id = {s.id: s for s in r.scalars().all()}
    seen: set[uuid.UUID] = set()
    pos = 0
    for sid in body.step_ids:
        s = by_id.get(sid)
        if s is None:
            raise HTTPException(400, f"Step {sid} not found in goal {task_id}")
        s.position = pos
        seen.add(sid)
        pos += 1
    # Append any remaining steps at the tail, preserving original position order.
    remaining = sorted([s for s in by_id.values() if s.id not in seen], key=lambda x: x.position)
    for s in remaining:
        s.position = pos
        pos += 1
    await db.commit()

    # Re-read goal with gos preloaded so counts hydrate correctly.
    r = await db.execute(
        select(Task)
        .where(Task.id == task_id, Task.user_id == user.id)
        .options(selectinload(Task.gos), selectinload(Task.steps)),
    )
    goal = r.scalar_one()
    return await _serialize_steps_for_goal(goal, db)
