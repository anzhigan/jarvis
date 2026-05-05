"""
Notes hierarchy:
  /ways                          — CRUD for Ways
  /ways/{way_id}/topics          — CRUD for Topics
  /notes                         — Create note (at any level)
  /notes/{note_id}               — Read / Update / Delete
  /notes/{note_id}/images        — Upload image
"""
import asyncio
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, UploadFile, status
from jose import JWTError
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.deps import get_current_user
from app.core.rate_limit import limiter
from app.core.security import decode_token
from app.models.notes import Note, NoteImage, Topic, Way
from app.models.user import User
from app.schemas.notes import (
    ImageOut,
    NoteCreate,
    NoteOut,
    NoteReparent,
    NoteUpdate,
    TopicCreate,
    TopicOut,
    TopicUpdate,
    WayCreate,
    WayOut,
    WayUpdate,
)
from app.services.s3 import delete_image, get_image_bytes, upload_image

router = APIRouter(tags=["notes"])


# ── helpers ───────────────────────────────────────────────────────────────────

def _way_load_options():
    return (
        selectinload(Way.topics).selectinload(Topic.notes).selectinload(Note.tags),
        selectinload(Way.topics).selectinload(Topic.inline_note).selectinload(Note.tags),
        selectinload(Way.notes).selectinload(Note.tags),
    )


async def _get_way_or_404(way_id: uuid.UUID, user: User, db: AsyncSession) -> Way:
    result = await db.execute(
        select(Way)
        .where(Way.id == way_id, Way.user_id == user.id)
        .options(*_way_load_options())
    )
    way = result.scalar_one_or_none()
    if not way:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Way not found")
    return way


async def _get_topic_or_404(topic_id: uuid.UUID, user: User, db: AsyncSession) -> Topic:
    result = await db.execute(
        select(Topic)
        .join(Way, Topic.way_id == Way.id)
        .where(Topic.id == topic_id, Way.user_id == user.id)
        .options(
            selectinload(Topic.notes).selectinload(Note.tags),
            selectinload(Topic.inline_note).selectinload(Note.tags),
        )
    )
    topic = result.scalar_one_or_none()
    if not topic:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Topic not found")
    return topic


async def _get_note_or_404(note_id: uuid.UUID, user: User, db: AsyncSession) -> Note:
    """Verify note belongs to user through its parent way/topic.

    One query: outer-joins both possible parents (Way directly, or Way via Topic)
    and filters on user ownership in WHERE. Hot path on every autosave PATCH.
    """
    topic_alias = Topic.__table__.alias("t")
    way_alias = Way.__table__.alias("w")

    stmt = (
        select(Note)
        .outerjoin(topic_alias, topic_alias.c.id == Note.topic_id)
        .outerjoin(
            way_alias,
            (way_alias.c.id == Note.way_id) | (way_alias.c.id == topic_alias.c.way_id),
        )
        .where(Note.id == note_id)
        .where(way_alias.c.user_id == user.id)
        .options(selectinload(Note.images), selectinload(Note.tags))
    )
    note = (await db.execute(stmt)).scalar_one_or_none()
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
        .options(*_way_load_options())
    )
    return list(result.scalars().all())


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


# ─── Topics ───────────────────────────────────────────────────────────────────

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

    # Verify user owns the parent
    if body.way_id:
        await _get_way_or_404(body.way_id, user, db)
    elif body.topic_id:
        await _get_topic_or_404(body.topic_id, user, db)
    elif body.topic_inline_id:
        await _get_topic_or_404(body.topic_inline_id, user, db)

    note = Note(**body.model_dump())
    db.add(note)
    await db.flush()
    await db.refresh(note, ["images", "tags"])
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


@router.post("/notes/{note_id}/move", response_model=NoteOut)
async def move_note(
    note_id: uuid.UUID,
    body: NoteReparent,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    note = await _get_note_or_404(note_id, user, db)

    if body.way_id is None and body.topic_id is None:
        raise HTTPException(400, "Specify way_id or topic_id")
    if body.way_id is not None and body.topic_id is not None:
        raise HTTPException(400, "Cannot specify both way_id and topic_id")

    if body.way_id is not None:
        # Validate ownership
        w = await db.execute(select(Way).where(Way.id == body.way_id, Way.user_id == user.id))
        if not w.scalar_one_or_none():
            raise HTTPException(404, "Way not found")
        note.way_id = body.way_id
        note.topic_id = None
        note.topic_inline_id = None
    else:
        # topic_id
        t = await db.execute(
            select(Topic).join(Way).where(Topic.id == body.topic_id, Way.user_id == user.id)
        )
        if not t.scalar_one_or_none():
            raise HTTPException(404, "Topic not found")
        note.topic_id = body.topic_id
        note.way_id = None
        note.topic_inline_id = None

    await db.flush()
    return note


@router.delete("/notes/{note_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_note(
    note_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    note = await _get_note_or_404(note_id, user, db)
    # Clean up S3 images first (best-effort, parallel)
    if note.images:
        await asyncio.gather(*(delete_image(img.s3_key) for img in note.images))
    await db.delete(note)


# ─── Images ───────────────────────────────────────────────────────────────────

@router.post("/notes/{note_id}/images", response_model=ImageOut, status_code=status.HTTP_201_CREATED)
@limiter.limit("60/minute")
async def upload_note_image(
    request: Request,
    note_id: uuid.UUID,
    file: UploadFile,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _get_note_or_404(note_id, user, db)
    s3_key, _ = await upload_image(file, note_id)

    # Always serve images via our API so CORS and auth headers are consistent
    # regardless of whether MinIO is exposed publicly.
    public_url = f"/api/images/{s3_key}"

    img_record = NoteImage(
        note_id=note_id,
        s3_key=s3_key,
        url=public_url,
        filename=file.filename or "image",
        size_bytes=file.size or 0,
    )
    db.add(img_record)
    await db.flush()
    return img_record


@router.get("/images/{s3_key:path}")
async def serve_image(
    s3_key: str,
    token: str = Query(..., description="Access JWT — passed as query so <img> tags work."),
    db: AsyncSession = Depends(get_db),
):
    """Streams image bytes from S3 after verifying the requester owns the object.

    Auth: a short-lived access JWT is passed as ?token=... because <img> elements
    cannot send Authorization headers. The token is the same one used for
    Bearer auth on JSON endpoints. Cache-Control is `private` so shared caches
    don't store it under the token-bearing URL.
    """
    # 1. Validate token and resolve the user.
    try:
        payload = decode_token(token)
        user_id = payload.get("sub")
        token_type = payload.get("type", "access")
        if not user_id or token_type != "access":
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid token")
    except JWTError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired token")

    # 2. Authorize: the s3 key must belong to the requesting user.
    parts = s3_key.split("/", 2)
    if len(parts) < 2:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Image not found")

    if parts[0] == "avatars":
        # avatars/{user_id}/{uuid}.{ext}
        if parts[1] != str(user_id):
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Not your image")
    elif parts[0] == "notes":
        # notes/{note_id}/{uuid}.{ext} — verify the requesting user owns the note.
        try:
            note_uuid = uuid.UUID(parts[1])
        except ValueError:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Image not found")
        # Two queries are fine here — small, indexed, on a cached path. Mirrors _get_note_or_404.
        note_row = (
            await db.execute(select(Note).where(Note.id == note_uuid))
        ).scalar_one_or_none()
        if not note_row:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Image not found")
        if note_row.way_id:
            owns = (
                await db.execute(
                    select(Way.id).where(Way.id == note_row.way_id, Way.user_id == user_id)
                )
            ).scalar_one_or_none()
        else:
            tid = note_row.topic_id or note_row.topic_inline_id
            owns = (
                await db.execute(
                    select(Topic.id).join(Way).where(Topic.id == tid, Way.user_id == user_id)
                )
            ).scalar_one_or_none()
        if not owns:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Not your image")
    else:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Image not found")

    # 3. Stream the bytes.
    data, content_type = await get_image_bytes(s3_key)
    return Response(
        content=data,
        media_type=content_type,
        headers={"Cache-Control": "private, max-age=300"},
    )


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
    await delete_image(img.s3_key)
    await db.delete(img)
