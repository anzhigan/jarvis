"""
Tag management — user-scoped tags + note-tag attachment.

  GET    /tags
  POST   /tags
  PATCH  /tags/{tag_id}
  DELETE /tags/{tag_id}
  POST   /notes/{note_id}/tags/{tag_id}    — attach
  DELETE /notes/{note_id}/tags/{tag_id}    — detach
"""
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.notes import Note, Tag, Topic, Way
from app.models.user import User
from app.schemas.notes import TagCreate, TagOut, TagUpdate

router = APIRouter(tags=["tags"])


async def _get_tag_or_404(tag_id: uuid.UUID, user: User, db: AsyncSession) -> Tag:
    result = await db.execute(
        select(Tag).where(Tag.id == tag_id, Tag.user_id == user.id)
    )
    tag = result.scalar_one_or_none()
    if not tag:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Tag not found")
    return tag


async def _get_note_for_user_or_404(note_id: uuid.UUID, user: User, db: AsyncSession) -> Note:
    result = await db.execute(
        select(Note)
        .where(Note.id == note_id)
        .options(selectinload(Note.tags))
    )
    note = result.scalar_one_or_none()
    if not note:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Note not found")
    # ownership via parent
    if note.way_id:
        r = await db.execute(select(Way).where(Way.id == note.way_id, Way.user_id == user.id))
        if not r.scalar_one_or_none():
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Note not found")
    elif note.topic_id or note.topic_inline_id:
        target_topic_id = note.topic_id or note.topic_inline_id
        r = await db.execute(
            select(Topic).join(Way, Topic.way_id == Way.id)
            .where(Topic.id == target_topic_id, Way.user_id == user.id)
        )
        if not r.scalar_one_or_none():
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Note not found")
    else:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Orphan note")
    return note


# ── Tag CRUD ──────────────────────────────────────────────────────────────────

@router.get("/tags", response_model=list[TagOut])
async def list_tags(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Tag).where(Tag.user_id == user.id).order_by(Tag.name)
    )
    return list(result.scalars().all())


@router.post("/tags", response_model=TagOut, status_code=status.HTTP_201_CREATED)
async def create_tag(
    body: TagCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    name = body.name.strip()
    if not name:
        raise HTTPException(400, "Tag name cannot be empty")

    # Case-insensitive dup check
    existing = await db.execute(
        select(Tag).where(Tag.user_id == user.id)
    )
    for t in existing.scalars().all():
        if t.name.lower() == name.lower():
            raise HTTPException(409, "Tag with this name already exists")

    tag = Tag(user_id=user.id, name=name, color=body.color)
    db.add(tag)
    await db.flush()
    return tag


@router.patch("/tags/{tag_id}", response_model=TagOut)
async def update_tag(
    tag_id: uuid.UUID,
    body: TagUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    tag = await _get_tag_or_404(tag_id, user, db)
    data = body.model_dump(exclude_none=True)

    if "name" in data:
        new_name = data["name"].strip()
        if new_name.lower() != tag.name.lower():
            existing = await db.execute(
                select(Tag).where(Tag.user_id == user.id, Tag.id != tag.id)
            )
            for t in existing.scalars().all():
                if t.name.lower() == new_name.lower():
                    raise HTTPException(409, "Tag with this name already exists")
        data["name"] = new_name

    for field, value in data.items():
        setattr(tag, field, value)
    await db.flush()
    return tag


@router.delete("/tags/{tag_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_tag(
    tag_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    tag = await _get_tag_or_404(tag_id, user, db)
    await db.delete(tag)


# ── Note-tag attach/detach ────────────────────────────────────────────────────

@router.post("/notes/{note_id}/tags/{tag_id}", status_code=status.HTTP_204_NO_CONTENT)
async def attach_tag(
    note_id: uuid.UUID,
    tag_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    note = await _get_note_for_user_or_404(note_id, user, db)
    tag = await _get_tag_or_404(tag_id, user, db)
    if tag not in note.tags:
        note.tags.append(tag)
        await db.flush()


@router.delete("/notes/{note_id}/tags/{tag_id}", status_code=status.HTTP_204_NO_CONTENT)
async def detach_tag(
    note_id: uuid.UUID,
    tag_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    note = await _get_note_for_user_or_404(note_id, user, db)
    tag = await _get_tag_or_404(tag_id, user, db)
    if tag in note.tags:
        note.tags.remove(tag)
        await db.flush()
