"""Routines router — recurring activities with schedule (formerly daily/weekly Gos)."""
import uuid
from datetime import date as date_cls

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.tasks import Routine, RoutineEntry, Task, Sprint
from app.models.user import User
from app.schemas.tasks import (
    RoutineCreate,
    RoutineEntryOut,
    RoutineEntryUpsert,
    RoutineOut,
    RoutineUpdate,
)


router = APIRouter(prefix="/routines", tags=["routines"])


VALID_SCHEDULE_TYPES = {"daily", "weekly_on_days", "every_n_days", "times_per_week"}
VALID_KINDS = {"boolean", "numeric"}


def _routine_dict(r: Routine) -> dict:
    return {
        "id": r.id,
        "user_id": r.user_id,
        "goal_id": r.goal_id,
        "step_id": r.step_id,
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
    }


async def _get_routine(rid: uuid.UUID, user: User, db: AsyncSession) -> Routine:
    res = await db.execute(
        select(Routine)
        .where(Routine.id == rid, Routine.user_id == user.id)
        .options(selectinload(Routine.entries))
    )
    r = res.scalar_one_or_none()
    if not r:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Routine not found")
    return r


# ─── List / Create ────────────────────────────────────────────────────────────

@router.get("", response_model=list[RoutineOut])
async def list_routines(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    res = await db.execute(
        select(Routine)
        .where(Routine.user_id == user.id)
        .options(selectinload(Routine.entries))
        .order_by(Routine.created_at.desc())
    )
    return [_routine_dict(r) for r in res.scalars().all()]


@router.post("", response_model=RoutineOut)
async def create_routine(
    body: RoutineCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if body.schedule_type not in VALID_SCHEDULE_TYPES:
        raise HTTPException(400, f"Invalid schedule_type. Must be one of {VALID_SCHEDULE_TYPES}")
    if body.kind not in VALID_KINDS:
        raise HTTPException(400, f"Invalid kind. Must be one of {VALID_KINDS}")

    # Verify goal/step belong to user (if provided)
    if body.goal_id:
        res = await db.execute(select(Task).where(Task.id == body.goal_id, Task.user_id == user.id))
        if not res.scalar_one_or_none():
            raise HTTPException(404, "Goal not found")
    if body.step_id:
        res = await db.execute(select(Sprint).where(Sprint.id == body.step_id, Sprint.user_id == user.id))
        if not res.scalar_one_or_none():
            raise HTTPException(404, "Step not found")

    r = Routine(
        user_id=user.id,
        goal_id=body.goal_id,
        step_id=body.step_id,
        title=body.title,
        description=body.description or "",
        color=body.color,
        schedule_type=body.schedule_type,
        schedule_days=body.schedule_days or "",
        schedule_n_days=body.schedule_n_days,
        schedule_count_per_period=body.schedule_count_per_period,
        schedule_period=body.schedule_period,
        start_date=body.start_date,
        end_date=body.end_date,
        kind=body.kind,
        unit=body.unit or "",
        target_value=body.target_value,
    )
    db.add(r)
    await db.commit()
    await db.refresh(r, ["entries"])
    return _routine_dict(r)


# ─── Update / Delete ──────────────────────────────────────────────────────────

@router.patch("/{routine_id}", response_model=RoutineOut)
async def update_routine(
    routine_id: uuid.UUID,
    body: RoutineUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    r = await _get_routine(routine_id, user, db)
    data = body.model_dump(exclude_unset=True)
    if "schedule_type" in data and data["schedule_type"] not in VALID_SCHEDULE_TYPES:
        raise HTTPException(400, f"Invalid schedule_type")
    if "kind" in data and data["kind"] not in VALID_KINDS:
        raise HTTPException(400, "Invalid kind")
    for k, v in data.items():
        setattr(r, k, v)
    await db.commit()
    await db.refresh(r, ["entries"])
    return _routine_dict(r)


@router.delete("/{routine_id}", status_code=204)
async def delete_routine(
    routine_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    r = await _get_routine(routine_id, user, db)
    await db.delete(r)
    await db.commit()


# ─── Entries: upsert (set value for a date) and delete ────────────────────────

@router.post("/{routine_id}/entries", response_model=RoutineEntryOut)
async def upsert_entry(
    routine_id: uuid.UUID,
    body: RoutineEntryUpsert,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    r = await _get_routine(routine_id, user, db)
    # Find existing entry for this date
    existing = next((e for e in r.entries if e.date == body.date), None)
    if existing:
        existing.value = body.value
        await db.commit()
        await db.refresh(existing)
        return {"id": existing.id, "routine_id": existing.routine_id, "date": existing.date, "value": existing.value}
    e = RoutineEntry(routine_id=r.id, date=body.date, value=body.value)
    db.add(e)
    await db.commit()
    await db.refresh(e)
    return {"id": e.id, "routine_id": e.routine_id, "date": e.date, "value": e.value}


@router.delete("/{routine_id}/entries/{entry_date}", status_code=204)
async def delete_entry(
    routine_id: uuid.UUID,
    entry_date: date_cls,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    r = await _get_routine(routine_id, user, db)
    entry = next((e for e in r.entries if e.date == entry_date), None)
    if entry:
        await db.delete(entry)
        await db.commit()


# ─── Agenda — what is due today / future / past for routines ───────────────────

def _routine_due_on(r: Routine, target: date_cls) -> bool:
    """Same logic as the frontend isRoutineDueToday but for any date."""
    if r.is_paused:
        return False
    if r.start_date and target < r.start_date:
        return False
    if r.end_date and target > r.end_date:
        return False
    if r.schedule_type == "daily":
        return True
    if r.schedule_type == "weekly_on_days":
        # 0=Sun..6=Sat (matches JS Date.getDay())
        # Python date.weekday() is 0=Mon..6=Sun, so map
        py_dow = target.weekday()  # Mon=0..Sun=6
        js_dow = (py_dow + 1) % 7  # Sun=0..Sat=6
        days = [int(x) for x in (r.schedule_days or "").split(",") if x.strip()]
        return js_dow in days
    if r.schedule_type == "every_n_days":
        if not r.created_at:
            return False
        diff = (target - r.created_at.date()).days
        return diff >= 0 and diff % max(1, r.schedule_n_days) == 0
    if r.schedule_type == "times_per_week":
        # Show until weekly quota is met for the target's week
        # Week starts on Sunday (matching JS getDay())
        py_dow = target.weekday()
        js_dow = (py_dow + 1) % 7
        from datetime import timedelta
        week_start = target - timedelta(days=js_dow)
        done = sum(
            1 for e in r.entries
            if e.value > 0 and week_start <= e.date <= target
        )
        return done < r.schedule_count_per_period
    return False


@router.get("/agenda/today", response_model=list[RoutineOut])
async def routines_due_today(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    today = date_cls.today()
    res = await db.execute(
        select(Routine)
        .where(Routine.user_id == user.id)
        .options(selectinload(Routine.entries))
    )
    routines = list(res.scalars().all())
    return [_routine_dict(r) for r in routines if _routine_due_on(r, today)]


@router.get("/by-goal/{goal_id}", response_model=list[RoutineOut])
async def routines_by_goal(
    goal_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    res = await db.execute(
        select(Routine)
        .where(Routine.user_id == user.id, Routine.goal_id == goal_id)
        .options(selectinload(Routine.entries))
    )
    return [_routine_dict(r) for r in res.scalars().all()]
