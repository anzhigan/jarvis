import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.metrics import Metric, MetricEntry
from app.models.user import User
from app.schemas.metrics import MetricCreate, MetricEntryCreate, MetricEntryOut, MetricOut, MetricUpdate

router = APIRouter(prefix="/metrics", tags=["metrics"])


async def _get_metric_or_404(metric_id: uuid.UUID, user: User, db: AsyncSession) -> Metric:
    result = await db.execute(
        select(Metric)
        .where(Metric.id == metric_id, Metric.user_id == user.id)
        .options(selectinload(Metric.entries))
    )
    metric = result.scalar_one_or_none()
    if not metric:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Metric not found")
    return metric


@router.get("", response_model=list[MetricOut])
async def list_metrics(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Metric)
        .where(Metric.user_id == user.id)
        .order_by(Metric.created_at)
        .options(selectinload(Metric.entries))
    )
    return result.scalars().all()


@router.post("", response_model=MetricOut, status_code=status.HTTP_201_CREATED)
async def create_metric(
    body: MetricCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    metric = Metric(user_id=user.id, **body.model_dump())
    db.add(metric)
    await db.flush()
    await db.refresh(metric, ["entries"])
    return metric


@router.get("/{metric_id}", response_model=MetricOut)
async def get_metric(
    metric_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await _get_metric_or_404(metric_id, user, db)


@router.patch("/{metric_id}", response_model=MetricOut)
async def update_metric(
    metric_id: uuid.UUID,
    body: MetricUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    metric = await _get_metric_or_404(metric_id, user, db)
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(metric, field, value)
    await db.flush()
    return metric


@router.delete("/{metric_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_metric(
    metric_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    metric = await _get_metric_or_404(metric_id, user, db)
    await db.delete(metric)


# ─── Entries ──────────────────────────────────────────────────────────────────

@router.post("/{metric_id}/entries", response_model=MetricEntryOut, status_code=status.HTTP_201_CREATED)
async def add_entry(
    metric_id: uuid.UUID,
    body: MetricEntryCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _get_metric_or_404(metric_id, user, db)
    entry = MetricEntry(metric_id=metric_id, **body.model_dump())
    db.add(entry)
    await db.flush()
    return entry


@router.delete("/{metric_id}/entries/{entry_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_entry(
    metric_id: uuid.UUID,
    entry_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _get_metric_or_404(metric_id, user, db)
    result = await db.execute(
        select(MetricEntry).where(MetricEntry.id == entry_id, MetricEntry.metric_id == metric_id)
    )
    entry = result.scalar_one_or_none()
    if not entry:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Entry not found")
    await db.delete(entry)
