"""
Notes hierarchy:
  /ways                          — CRUD for Ways
  /ways/{way_id}/topics          — CRUD for Topics
  /topics/{topic_id}/subtopics   — CRUD for Subtopics (optional Topic → Note level)
  /subtopics/{id}/subsubtopics   — CRUD for Subsubtopics (optional Subtopic → Note level)
  /notes                         — Create note (at any level)
  /notes/{note_id}               — Read / Update / Delete
  /notes/{note_id}/images        — Upload image
  /notes/{note_id}/share         — Create / revoke public read-only share
  /public/notes/{token}          — Anonymous read of a shared note
  /public/notes/{token}/images/  — Anonymous image fetch for a shared note
"""
import asyncio
import re
import secrets
import uuid
from datetime import UTC, datetime

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    HTTPException,
    Query,
    Request,
    Response,
    UploadFile,
    status,
)
from jose import JWTError
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.deps import get_current_user
from app.core.rate_limit import limiter
from app.core.security import decode_token
from app.models.notes import (
    Note,
    NoteAttachment,
    NoteImage,
    NoteShare,
    Subsubtopic,
    Subtopic,
    Topic,
    Way,
)
from app.models.user import User
from app.schemas.notes import (
    AttachmentOut,
    ImageOut,
    NoteCreate,
    NoteOut,
    NoteReparent,
    NoteUpdate,
    PublicNoteOut,
    ShareOut,
    SubsubtopicCreate,
    SubsubtopicOut,
    SubsubtopicUpdate,
    SubtopicCreate,
    SubtopicOut,
    SubtopicUpdate,
    TopicCreate,
    TopicOut,
    TopicUpdate,
    WayCreate,
    WayOut,
    WayUpdate,
)
from app.services.ai.tasks import reembed_note_task
from app.services.s3 import (
    delete_attachment,
    delete_image,
    get_attachment_bytes,
    get_image_bytes,
    upload_attachment,
    upload_image,
)

router = APIRouter(tags=["notes"])


# ── helpers ───────────────────────────────────────────────────────────────────

def _way_load_options():
    return (
        selectinload(Way.topics).selectinload(Topic.notes).selectinload(Note.tags),
        selectinload(Way.topics).selectinload(Topic.inline_note).selectinload(Note.tags),
        # Subtopics under each topic, with their own notes + inline note.
        selectinload(Way.topics).selectinload(Topic.subtopics)
            .selectinload(Subtopic.notes).selectinload(Note.tags),
        selectinload(Way.topics).selectinload(Topic.subtopics)
            .selectinload(Subtopic.inline_note).selectinload(Note.tags),
        # Subsubtopics under each subtopic, with their own notes + inline note.
        selectinload(Way.topics).selectinload(Topic.subtopics)
            .selectinload(Subtopic.subsubtopics)
            .selectinload(Subsubtopic.notes).selectinload(Note.tags),
        selectinload(Way.topics).selectinload(Topic.subtopics)
            .selectinload(Subtopic.subsubtopics)
            .selectinload(Subsubtopic.inline_note).selectinload(Note.tags),
        selectinload(Way.notes).selectinload(Note.tags),
    )


def _topic_load_options():
    return (
        selectinload(Topic.notes).selectinload(Note.tags),
        selectinload(Topic.inline_note).selectinload(Note.tags),
        selectinload(Topic.subtopics).selectinload(Subtopic.notes).selectinload(Note.tags),
        selectinload(Topic.subtopics).selectinload(Subtopic.inline_note).selectinload(Note.tags),
        selectinload(Topic.subtopics).selectinload(Subtopic.subsubtopics)
            .selectinload(Subsubtopic.notes).selectinload(Note.tags),
        selectinload(Topic.subtopics).selectinload(Subtopic.subsubtopics)
            .selectinload(Subsubtopic.inline_note).selectinload(Note.tags),
    )


def _subtopic_load_options():
    return (
        selectinload(Subtopic.notes).selectinload(Note.tags),
        selectinload(Subtopic.inline_note).selectinload(Note.tags),
        selectinload(Subtopic.subsubtopics).selectinload(Subsubtopic.notes).selectinload(Note.tags),
        selectinload(Subtopic.subsubtopics).selectinload(Subsubtopic.inline_note).selectinload(Note.tags),
    )


def _subsubtopic_load_options():
    return (
        selectinload(Subsubtopic.notes).selectinload(Note.tags),
        selectinload(Subsubtopic.inline_note).selectinload(Note.tags),
    )


async def _get_way_or_404(way_id: uuid.UUID, user: User, db: AsyncSession) -> Way:
    result = await db.execute(
        select(Way)
        .where(Way.id == way_id, Way.user_id == user.id)
        .options(*_way_load_options()),
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
        .options(*_topic_load_options()),
    )
    topic = result.scalar_one_or_none()
    if not topic:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Topic not found")
    return topic


async def _get_subtopic_or_404(subtopic_id: uuid.UUID, user: User, db: AsyncSession) -> Subtopic:
    result = await db.execute(
        select(Subtopic)
        .join(Topic, Subtopic.topic_id == Topic.id)
        .join(Way, Topic.way_id == Way.id)
        .where(Subtopic.id == subtopic_id, Way.user_id == user.id)
        .options(*_subtopic_load_options()),
    )
    subtopic = result.scalar_one_or_none()
    if not subtopic:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Subtopic not found")
    return subtopic


async def _get_subsubtopic_or_404(
    subsubtopic_id: uuid.UUID, user: User, db: AsyncSession,
) -> Subsubtopic:
    result = await db.execute(
        select(Subsubtopic)
        .join(Subtopic, Subsubtopic.subtopic_id == Subtopic.id)
        .join(Topic, Subtopic.topic_id == Topic.id)
        .join(Way, Topic.way_id == Way.id)
        .where(Subsubtopic.id == subsubtopic_id, Way.user_id == user.id)
        .options(*_subsubtopic_load_options()),
    )
    subsubtopic = result.scalar_one_or_none()
    if not subsubtopic:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Subsubtopic not found")
    return subsubtopic


async def _user_owns_note_row(note_row: Note, user_id, db: AsyncSession) -> bool:
    """Ownership check for an already-loaded Note row, resolving through
    whichever parent it hangs off: Way directly, Topic (leaf/inline), or
    Subtopic (leaf/inline). Used by the image/attachment serving endpoints,
    which authorize by s3 key rather than through `_get_note_or_404`."""
    if note_row.way_id:
        return bool((await db.execute(
            select(Way.id).where(Way.id == note_row.way_id, Way.user_id == user_id),
        )).scalar_one_or_none())
    if note_row.topic_id or note_row.topic_inline_id:
        tid = note_row.topic_id or note_row.topic_inline_id
        return bool((await db.execute(
            select(Topic.id).join(Way).where(Topic.id == tid, Way.user_id == user_id),
        )).scalar_one_or_none())
    if note_row.subtopic_id or note_row.subtopic_inline_id:
        sid = note_row.subtopic_id or note_row.subtopic_inline_id
        return bool((await db.execute(
            select(Subtopic.id)
            .join(Topic, Subtopic.topic_id == Topic.id)
            .join(Way, Topic.way_id == Way.id)
            .where(Subtopic.id == sid, Way.user_id == user_id),
        )).scalar_one_or_none())
    if note_row.subsubtopic_id or note_row.subsubtopic_inline_id:
        ssid = note_row.subsubtopic_id or note_row.subsubtopic_inline_id
        return bool((await db.execute(
            select(Subsubtopic.id)
            .join(Subtopic, Subsubtopic.subtopic_id == Subtopic.id)
            .join(Topic, Subtopic.topic_id == Topic.id)
            .join(Way, Topic.way_id == Way.id)
            .where(Subsubtopic.id == ssid, Way.user_id == user_id),
        )).scalar_one_or_none())
    return False


async def _get_note_or_404(note_id: uuid.UUID, user: User, db: AsyncSession) -> Note:
    """Verify note belongs to user through any of its possible parents.

    A note hangs off exactly one of: a Way directly, a Topic (leaf or inline),
    or a Subtopic (leaf or inline). We outer-join every path up to the owning
    Way and filter on user ownership in WHERE. Hot path on every autosave PATCH.
    """
    # Topic reached either as a leaf-note parent or an inline-note parent.
    topic_alias = Topic.__table__.alias("t")
    # Subtopic (leaf or inline) → its Topic → its Way.
    sub_alias = Subtopic.__table__.alias("st")
    sub_topic_alias = Topic.__table__.alias("stt")
    # Subsubtopic (leaf or inline) → Subtopic → Topic → Way.
    ss_alias = Subsubtopic.__table__.alias("sst")
    ss_sub_alias = Subtopic.__table__.alias("ssst")
    ss_topic_alias = Topic.__table__.alias("ssstt")
    way_alias = Way.__table__.alias("w")

    stmt = (
        select(Note)
        .outerjoin(
            topic_alias,
            topic_alias.c.id == func.coalesce(Note.topic_id, Note.topic_inline_id),
        )
        .outerjoin(
            sub_alias,
            sub_alias.c.id == func.coalesce(Note.subtopic_id, Note.subtopic_inline_id),
        )
        .outerjoin(sub_topic_alias, sub_topic_alias.c.id == sub_alias.c.topic_id)
        .outerjoin(
            ss_alias,
            ss_alias.c.id == func.coalesce(Note.subsubtopic_id, Note.subsubtopic_inline_id),
        )
        .outerjoin(ss_sub_alias, ss_sub_alias.c.id == ss_alias.c.subtopic_id)
        .outerjoin(ss_topic_alias, ss_topic_alias.c.id == ss_sub_alias.c.topic_id)
        .outerjoin(
            way_alias,
            or_(
                way_alias.c.id == Note.way_id,
                way_alias.c.id == topic_alias.c.way_id,
                way_alias.c.id == sub_topic_alias.c.way_id,
                way_alias.c.id == ss_topic_alias.c.way_id,
            ),
        )
        .where(Note.id == note_id)
        .where(way_alias.c.user_id == user.id)
        .options(
            selectinload(Note.images),
            selectinload(Note.attachments),
            selectinload(Note.tags),
        )
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
        .options(*_way_load_options()),
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
    await db.refresh(way, ["topics", "notes"])
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
    await db.refresh(topic, ["notes", "inline_note", "subtopics"])
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


# ─── Subtopics ──────────────────────────────────────────────────────────────────

@router.post(
    "/topics/{topic_id}/subtopics",
    response_model=SubtopicOut,
    status_code=status.HTTP_201_CREATED,
)
async def create_subtopic(
    topic_id: uuid.UUID,
    body: SubtopicCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _get_topic_or_404(topic_id, user, db)
    subtopic = Subtopic(topic_id=topic_id, name=body.name, order=body.order)
    db.add(subtopic)
    await db.flush()
    await db.refresh(subtopic, ["notes", "inline_note", "subsubtopics"])
    return subtopic


@router.patch("/subtopics/{subtopic_id}", response_model=SubtopicOut)
async def update_subtopic(
    subtopic_id: uuid.UUID,
    body: SubtopicUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    subtopic = await _get_subtopic_or_404(subtopic_id, user, db)
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(subtopic, field, value)
    await db.flush()
    return subtopic


@router.delete("/subtopics/{subtopic_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_subtopic(
    subtopic_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    subtopic = await _get_subtopic_or_404(subtopic_id, user, db)
    await db.delete(subtopic)


# ─── Subsubtopics ─────────────────────────────────────────────────────────────

@router.post(
    "/subtopics/{subtopic_id}/subsubtopics",
    response_model=SubsubtopicOut,
    status_code=status.HTTP_201_CREATED,
)
async def create_subsubtopic(
    subtopic_id: uuid.UUID,
    body: SubsubtopicCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _get_subtopic_or_404(subtopic_id, user, db)
    subsubtopic = Subsubtopic(subtopic_id=subtopic_id, name=body.name, order=body.order)
    db.add(subsubtopic)
    await db.flush()
    await db.refresh(subsubtopic, ["notes", "inline_note"])
    return subsubtopic


@router.patch("/subsubtopics/{subsubtopic_id}", response_model=SubsubtopicOut)
async def update_subsubtopic(
    subsubtopic_id: uuid.UUID,
    body: SubsubtopicUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    subsubtopic = await _get_subsubtopic_or_404(subsubtopic_id, user, db)
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(subsubtopic, field, value)
    await db.flush()
    return subsubtopic


@router.delete("/subsubtopics/{subsubtopic_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_subsubtopic(
    subsubtopic_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    subsubtopic = await _get_subsubtopic_or_404(subsubtopic_id, user, db)
    await db.delete(subsubtopic)


# ─── Notes ────────────────────────────────────────────────────────────────────

@router.post("/notes", response_model=NoteOut, status_code=status.HTTP_201_CREATED)
async def create_note(
    body: NoteCreate,
    background_tasks: BackgroundTasks,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    parent_fields = (
        "way_id", "topic_id", "topic_inline_id", "subtopic_id", "subtopic_inline_id",
        "subsubtopic_id", "subsubtopic_inline_id",
    )
    set_fields = [f for f in parent_fields if getattr(body, f) is not None]
    if len(set_fields) != 1:
        raise HTTPException(400, f"Provide exactly one of: {', '.join(parent_fields)}")

    # Verify user owns the parent
    if body.way_id:
        await _get_way_or_404(body.way_id, user, db)
    elif body.topic_id:
        await _get_topic_or_404(body.topic_id, user, db)
    elif body.topic_inline_id:
        await _get_topic_or_404(body.topic_inline_id, user, db)
    elif body.subtopic_id:
        await _get_subtopic_or_404(body.subtopic_id, user, db)
    elif body.subtopic_inline_id:
        await _get_subtopic_or_404(body.subtopic_inline_id, user, db)
    elif body.subsubtopic_id:
        await _get_subsubtopic_or_404(body.subsubtopic_id, user, db)
    elif body.subsubtopic_inline_id:
        await _get_subsubtopic_or_404(body.subsubtopic_inline_id, user, db)

    note = Note(**body.model_dump())
    db.add(note)
    await db.flush()
    await db.refresh(note, ["images", "attachments", "tags"])
    # Re-index for RAG after the response is sent. Failures are logged inside
    # the task and never surface to the user — embedding is opportunistic.
    background_tasks.add_task(reembed_note_task, note.id)
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
    background_tasks: BackgroundTasks,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    note = await _get_note_or_404(note_id, user, db)
    body_dict = body.model_dump(exclude_none=True)
    # Only re-embed when the embeddable surface changed. Pin/order/move
    # operations don't affect the text, so skip the LLM round-trip.
    needs_reembed = (
        ("name" in body_dict and body_dict["name"] != note.name)
        or ("content" in body_dict and body_dict["content"] != note.content)
    )
    for field, value in body_dict.items():
        setattr(note, field, value)
    await db.flush()
    if needs_reembed:
        background_tasks.add_task(reembed_note_task, note.id)
    return note


@router.post("/notes/{note_id}/move", response_model=NoteOut)
async def move_note(
    note_id: uuid.UUID,
    body: NoteReparent,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    note = await _get_note_or_404(note_id, user, db)

    targets = [
        t for t in (body.way_id, body.topic_id, body.subtopic_id, body.subsubtopic_id)
        if t is not None
    ]
    if len(targets) != 1:
        raise HTTPException(400, "Specify exactly one of: way_id, topic_id, subtopic_id, subsubtopic_id")

    # Clear every parent link, then set the requested one — a note lives under
    # exactly one container at a time.
    note.way_id = None
    note.topic_id = None
    note.topic_inline_id = None
    note.subtopic_id = None
    note.subtopic_inline_id = None
    note.subsubtopic_id = None
    note.subsubtopic_inline_id = None

    if body.way_id is not None:
        w = await db.execute(select(Way).where(Way.id == body.way_id, Way.user_id == user.id))
        if not w.scalar_one_or_none():
            raise HTTPException(404, "Way not found")
        note.way_id = body.way_id
    elif body.topic_id is not None:
        t = await db.execute(
            select(Topic).join(Way).where(Topic.id == body.topic_id, Way.user_id == user.id),
        )
        if not t.scalar_one_or_none():
            raise HTTPException(404, "Topic not found")
        note.topic_id = body.topic_id
    elif body.subtopic_id is not None:
        await _get_subtopic_or_404(body.subtopic_id, user, db)
        note.subtopic_id = body.subtopic_id
    else:
        await _get_subsubtopic_or_404(body.subsubtopic_id, user, db)
        note.subsubtopic_id = body.subsubtopic_id

    await db.flush()
    return note


@router.delete("/notes/{note_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_note(
    note_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    note = await _get_note_or_404(note_id, user, db)
    # Clean up S3 objects first (best-effort, parallel)
    cleanup = [delete_image(img.s3_key) for img in note.images]
    cleanup += [delete_attachment(a.s3_key) for a in note.attachments]
    if cleanup:
        await asyncio.gather(*cleanup)
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
        if not await _user_owns_note_row(note_row, user_id, db):
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
        select(NoteImage).where(NoteImage.id == image_id, NoteImage.note_id == note_id),
    )
    img = result.scalar_one_or_none()
    if not img:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Image not found")
    await delete_image(img.s3_key)
    await db.delete(img)


# ─── Attachments (xlsx / docx / pdf / csv …) ─────────────────────────────────

@router.post(
    "/notes/{note_id}/attachments",
    response_model=AttachmentOut,
    status_code=status.HTTP_201_CREATED,
)
@limiter.limit("30/minute")
async def upload_note_attachment(
    request: Request,
    note_id: uuid.UUID,
    file: UploadFile,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _get_note_or_404(note_id, user, db)
    s3_key, _, mime_type, size = await upload_attachment(file, note_id)

    # Served through our API to keep auth/CORS consistent and let us authorize
    # downloads against note ownership. Same pattern as /api/images/.
    public_url = f"/api/attachments/{s3_key}"

    record = NoteAttachment(
        note_id=note_id,
        s3_key=s3_key,
        url=public_url,
        filename=file.filename or "file",
        mime_type=mime_type,
        size_bytes=size,
    )
    db.add(record)
    await db.flush()
    return record


@router.get("/attachments/{s3_key:path}")
async def serve_attachment(
    s3_key: str,
    token: str = Query(
        ...,
        description="Access JWT — passed as query so links can be opened directly.",
    ),
    db: AsyncSession = Depends(get_db),
):
    """Streams attachment bytes from S3 after verifying the requester owns the note.

    Auth: a short-lived access JWT is passed as ?token=... — same scheme as
    /api/images, so plain <a href> links work in the rich-text editor.
    Cache-Control is `private` so shared caches don't store tokenized URLs.
    """
    try:
        payload = decode_token(token)
        user_id = payload.get("sub")
        token_type = payload.get("type", "access")
        if not user_id or token_type != "access":
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid token")
    except JWTError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired token")

    # Key layout: notes/{note_id}/attachments/{uuid}.{ext}
    parts = s3_key.split("/", 3)
    if len(parts) < 3 or parts[0] != "notes" or parts[2] != "attachments":
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Attachment not found")
    try:
        note_uuid = uuid.UUID(parts[1])
    except ValueError:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Attachment not found")

    note_row = (
        await db.execute(select(Note).where(Note.id == note_uuid))
    ).scalar_one_or_none()
    if not note_row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Attachment not found")
    if not await _user_owns_note_row(note_row, user_id, db):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Not your attachment")

    # Look up the stored filename so the browser uses it in the Save dialog.
    att_row = (
        await db.execute(
            select(NoteAttachment).where(NoteAttachment.s3_key == s3_key),
        )
    ).scalar_one_or_none()
    filename = att_row.filename if att_row else parts[-1]

    data, content_type = await get_attachment_bytes(s3_key)
    # `inline` lets browsers preview PDFs in a new tab; for office formats the
    # browser falls back to download. Either way Content-Disposition preserves
    # the original filename.
    safe = filename.replace('"', "")
    return Response(
        content=data,
        media_type=content_type,
        headers={
            "Cache-Control": "private, max-age=300",
            "Content-Disposition": f'inline; filename="{safe}"',
        },
    )


@router.delete(
    "/notes/{note_id}/attachments/{attachment_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_note_attachment(
    note_id: uuid.UUID,
    attachment_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _get_note_or_404(note_id, user, db)
    result = await db.execute(
        select(NoteAttachment).where(
            NoteAttachment.id == attachment_id, NoteAttachment.note_id == note_id,
        ),
    )
    att = result.scalar_one_or_none()
    if not att:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Attachment not found")
    await delete_attachment(att.s3_key)
    await db.delete(att)


# ─── Public sharing ──────────────────────────────────────────────────────────

# Match /api/images/<key> AND /api/v1/images/<key> in stored HTML, with an
# optional ?token=... that the editor appends client-side so <img> tags load
# under JWT auth. We strip everything after the s3 key when rewriting.
_IMAGE_URL_RE = re.compile(r'/api(?:/v\d+)?/images/([^"\'\s?]+)(\?[^"\'\s]*)?')


async def _active_share_for(note_id: uuid.UUID, db: AsyncSession) -> NoteShare | None:
    row = (
        await db.execute(
            select(NoteShare)
            .where(NoteShare.note_id == note_id, NoteShare.is_active.is_(True))
            .order_by(NoteShare.created_at.desc()),
        )
    ).scalar_one_or_none()
    return row


@router.post("/notes/{note_id}/share", response_model=ShareOut)
async def create_share(
    note_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create (or return existing) public share for a note. Idempotent — calling
    twice returns the same active link.
    """
    await _get_note_or_404(note_id, user, db)
    existing = await _active_share_for(note_id, db)
    if existing:
        return ShareOut(
            token=existing.token,
            url=f"/share/{existing.token}",
            created_at=existing.created_at,
        )
    token = secrets.token_urlsafe(32)
    share = NoteShare(note_id=note_id, token=token)
    db.add(share)
    await db.flush()
    return ShareOut(token=token, url=f"/share/{token}", created_at=share.created_at)


@router.get("/notes/{note_id}/share", response_model=ShareOut | None)
async def get_share(
    note_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return the active share for a note, or null if not shared. Used by the
    Share dialog to know whether to show 'Create' or 'Copy/Stop'.
    """
    await _get_note_or_404(note_id, user, db)
    row = await _active_share_for(note_id, db)
    if not row:
        return None
    return ShareOut(token=row.token, url=f"/share/{row.token}", created_at=row.created_at)


@router.delete("/notes/{note_id}/share", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_share(
    note_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Revoke the active share. Subsequent visits to /share/<token> return 404."""
    await _get_note_or_404(note_id, user, db)
    row = await _active_share_for(note_id, db)
    if not row:
        return  # already not shared — idempotent
    row.is_active = False
    row.revoked_at = datetime.now(UTC)
    await db.flush()


async def _share_or_404(token: str, db: AsyncSession) -> tuple[NoteShare, Note]:
    share = (
        await db.execute(
            select(NoteShare).where(NoteShare.token == token, NoteShare.is_active.is_(True)),
        )
    ).scalar_one_or_none()
    if not share:
        # Generic 404 — don't reveal whether the link was revoked vs never existed.
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Not found")
    note = (
        await db.execute(
            select(Note)
            .where(Note.id == share.note_id)
            .options(selectinload(Note.images), selectinload(Note.tags)),
        )
    ).scalar_one_or_none()
    if not note:
        # The underlying note was deleted; share should be considered dead.
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Not found")
    return share, note


@router.get("/public/notes/{token}", response_model=PublicNoteOut)
async def public_get_note(token: str, db: AsyncSession = Depends(get_db)):
    """Anonymous read of a shared note. Image URLs in the HTML body are rewritten
    so they go through the matching public image endpoint scoped to this token.
    """
    share, note = await _share_or_404(token, db)
    rewritten = _IMAGE_URL_RE.sub(
        lambda m: f"/api/v1/public/notes/{token}/images/{m.group(1)}",
        note.content or "",
    )
    return PublicNoteOut(
        name=note.name,
        content=rewritten,
        created_at=note.created_at,
        updated_at=note.updated_at,
        shared_at=share.created_at,
        tags=list(note.tags),
    )


@router.get("/public/notes/{token}/images/{s3_key:path}")
async def public_get_image(token: str, s3_key: str, db: AsyncSession = Depends(get_db)):
    """Stream an image of a shared note. Authorization happens by verifying that
    `s3_key` is one of NoteImage.s3_key for that share's note — no JWT involved.
    """
    _share, note = await _share_or_404(token, db)
    owns = any(img.s3_key == s3_key for img in note.images)
    if not owns:
        # The s3 key isn't an image of the shared note (could be the user's
        # other private note's image), so deny without revealing existence.
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Not found")
    data, content_type = await get_image_bytes(s3_key)
    return Response(
        content=data,
        media_type=content_type,
        headers={"Cache-Control": "public, max-age=300"},
    )
