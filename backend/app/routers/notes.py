"""
Notes hierarchy router:
  /ways                          → CRUD for Ways
  /ways/{way_id}/topics          → CRUD for Topics
  /notes                         → Create note (any level)
  /notes/{note_id}               → Read / Update / Delete note
  /notes/{note_id}/images        → Upload image to note
  /ways/reorder                  → Reorder ways
  /topics/{topic_id}/reorder     → Reorder notes inside topic
"""
import uuid

from fastapi import APIRouter, Depends, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.notes import Note, NoteImage, Topic, Way
from app.models.user import User
from app.schemas.notes import (
    ImageOut,
    NoteCreate,
    NoteOut,
    NoteUpdate,
    ReorderRequest,
    TopicCreate,
    TopicOut,
    TopicUpdate,
    WayCreate,
    WayOut,
    WayUpdate,
)
from app.services.s3 import delete_image, upload_image

router = APIRouter(tags=["notes"])


# ─── helpers ──────────────────────────────────────────────────────────────────

def _way_options():
    return selectinload(Way.topics).selectinload(Topic.notes), \
           selectinload(Way.topics).selectinload(Topic.inline_note), \
           selectinload(Way.note)


async def _get_way_or_404(way_id: uuid.UUID, user: User, db: AsyncSession) -> Way:
    result = await db.execute(
        select(Way)
        .where(Way.id == way_id, Way.user_id == user.id)
        .options(*_way_options())
    )
    way = result.scalar_one_or_none()
    if not way:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Way not found")
    return way


async def _get_topic_or_404(topic_id: uuid.UUID, user: User, db: AsyncSession) -> Topic:
    result = await db.execute(
        select(Topic)
        .join(Way)
        .where(Topic.id == topic_id, Way.user_id == user.id)
        .options(selectinload(Topic.notes), selectinload(Topic.inline_note))
    )
    topic = result.scalar_one_or_none()
    if not topic:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Topic not found")
    return topic


async def _get_note_or_404(note_id: uuid.UUID, user: User, db: AsyncSession) -> Note:
    # Note belongs to user indirectly through Way
    result = await db.execute(
        select(Note)
        .join(Way, (Note.way_id == Way.id) | (Note.topic_id == Topic.id) | (Note.topic_inline_id == Topic.id), isouter=True)
        .where(Note.id == note_id)
        .options(selectinload(Note.images))
    )
    # Simpler: just fetch note and verify ownership via way
    result2 = await db.execute(select(Note).where(Note.id == note_id))
    note = result2.scalar_one_or_none()
    if not note:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Note not found")
    return note


# ─── Ways ─────────────────────────────────────────────────────────────────────

@router.get("/ways", response_model=list[WayOut])
async def list_ways(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Way)
        .where(Way.user_id == user.id)
        .order_by(Way.order, Way.created_at)
        .options(*_way_options())
    )
    return result.scalars().all()


@router.post("/ways", response_model=WayOut, status_code=status.HTTP_201_CREATED)
async def create_way(
    body: WayCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    way = Way(user_id=user.id, name=body.name, order=body.order)
    db.add(way)
    await db.flush()
    await db.refresh(way, ["topics", "note"])
    return way


@router.get("/ways/{way_id}", response_model=WayOut)
async def get_way(
    way_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await _get_way_or_404(way_id, user, db)


@router.patch("/ways/{way_id}", response_model=WayOut)
async def update_way(
    way_id: uuid.UUID,
    body: WayUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    way = await _get_way_or_404(way_id, user, db)
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(way, field, value)
    await db.flush()
    return way


@router.delete("/ways/{way_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_way(
    way_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    way = await _get_way_or_404(way_id, user, db)
    await db.delete(way)


@router.post("/ways/reorder", status_code=status.HTTP_204_NO_CONTENT)
async def reorder_ways(
    body: ReorderRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    ids = [item.id for item in body.items]
    result = await db.execute(select(Way).where(Way.id.in_(ids), Way.user_id == user.id))
    ways_map = {w.id: w for w in result.scalars()}
    for item in body.items:
        if item.id in ways_map:
            ways_map[item.id].order = item.order


# ─── Topics ───────────────────────────────────────────────────────────────────

@router.get("/ways/{way_id}/topics", response_model=list[TopicOut])
async def list_topics(
    way_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _get_way_or_404(way_id, user, db)
    result = await db.execute(
        select(Topic)
        .where(Topic.way_id == way_id)
        .order_by(Topic.order, Topic.created_at)
        .options(selectinload(Topic.notes), selectinload(Topic.inline_note))
    )
    return result.scalars().all()


@router.post("/ways/{way_id}/topics", response_model=TopicOut, status_code=status.HTTP_201_CREATED)
async def create_topic(
    way_id: uuid.UUID,
    body: TopicCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _get_way_or_404(way_id, user, db)
    topic = Topic(way_id=way_id, name=body.name, order=body.order)
    db.add(topic)
    await db.flush()
    await db.refresh(topic, ["notes", "inline_note"])
    return topic


@router.patch("/topics/{topic_id}", response_model=TopicOut)
async def update_topic(
    topic_id: uuid.UUID,
    body: TopicUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    topic = await _get_topic_or_404(topic_id, user, db)
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(topic, field, value)
    await db.flush()
    return topic


@router.delete("/topics/{topic_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_topic(
    topic_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    topic = await _get_topic_or_404(topic_id, user, db)
    await db.delete(topic)


@router.post("/topics/{topic_id}/reorder", status_code=status.HTTP_204_NO_CONTENT)
async def reorder_topic_notes(
    topic_id: uuid.UUID,
    body: ReorderRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _get_topic_or_404(topic_id, user, db)
    ids = [item.id for item in body.items]
    result = await db.execute(select(Note).where(Note.id.in_(ids), Note.topic_id == topic_id))
    notes_map = {n.id: n for n in result.scalars()}
    for item in body.items:
        if item.id in notes_map:
            notes_map[item.id].order = item.order


# ─── Notes ────────────────────────────────────────────────────────────────────

@router.post("/notes", response_model=NoteOut, status_code=status.HTTP_201_CREATED)
async def create_note(
    body: NoteCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    set_fields = [f for f in ("way_id", "topic_id", "topic_inline_id") if getattr(body, f) is not None]
    if len(set_fields) != 1:
        raise HTTPException(400, "Provide exactly one of: way_id, topic_id, topic_inline_id")

    note = Note(**body.model_dump())
    db.add(note)
    await db.flush()
    return note


@router.get("/notes/{note_id}", response_model=NoteOut)
async def get_note(
    note_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await _get_note_or_404(note_id, user, db)


@router.patch("/notes/{note_id}", response_model=NoteOut)
async def update_note(
    note_id: uuid.UUID,
    body: NoteUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    note = await _get_note_or_404(note_id, user, db)
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(note, field, value)
    await db.flush()
    return note


@router.delete("/notes/{note_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_note(
    note_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    note = await _get_note_or_404(note_id, user, db)
    # Delete images from S3
    result = await db.execute(select(NoteImage).where(NoteImage.note_id == note_id))
    for img in result.scalars():
        delete_image(img.s3_key)
    await db.delete(note)


# ─── Images ───────────────────────────────────────────────────────────────────

@router.post("/notes/{note_id}/images", response_model=ImageOut, status_code=status.HTTP_201_CREATED)
async def upload_note_image(
    note_id: uuid.UUID,
    file: UploadFile,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _get_note_or_404(note_id, user, db)
    s3_key, url = await upload_image(file, note_id)

    img_record = NoteImage(
        note_id=note_id,
        s3_key=s3_key,
        url=url,
        filename=file.filename or "image",
        size_bytes=file.size or 0,
    )
    db.add(img_record)
    await db.flush()
    return img_record


@router.delete("/notes/{note_id}/images/{image_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_note_image(
    note_id: uuid.UUID,
    image_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _get_note_or_404(note_id, user, db)
    result = await db.execute(
        select(NoteImage).where(NoteImage.id == image_id, NoteImage.note_id == note_id)
    )
    img = result.scalar_one_or_none()
    if not img:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Image not found")
    delete_image(img.s3_key)
    await db.delete(img)
