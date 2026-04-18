import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class Way(Base):
    __tablename__ = "ways"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    order: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    user: Mapped["User"] = relationship(back_populates="ways")  # noqa: F821
    topics: Mapped[list["Topic"]] = relationship(back_populates="way", cascade="all, delete-orphan", order_by="Topic.order")
    note: Mapped["Note | None"] = relationship(
        back_populates="way",
        foreign_keys="Note.way_id",
        uselist=False,
        cascade="all, delete-orphan",
    )


class Topic(Base):
    __tablename__ = "topics"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    way_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("ways.id", ondelete="CASCADE"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    order: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    way: Mapped["Way"] = relationship(back_populates="topics")
    notes: Mapped[list["Note"]] = relationship(
        back_populates="topic",
        foreign_keys="Note.topic_id",
        cascade="all, delete-orphan",
        order_by="Note.order",
    )
    inline_note: Mapped["Note | None"] = relationship(
        back_populates="topic_inline",
        foreign_keys="Note.topic_inline_id",
        uselist=False,
        cascade="all, delete-orphan",
    )


class Note(Base):
    __tablename__ = "notes"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    content: Mapped[str] = mapped_column(Text, default="")
    order: Mapped[int] = mapped_column(Integer, default=0)

    # Exactly one of these will be set
    way_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("ways.id", ondelete="CASCADE"), nullable=True, index=True)
    topic_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("topics.id", ondelete="CASCADE"), nullable=True, index=True)
    topic_inline_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("topics.id", ondelete="CASCADE"), nullable=True, index=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    way: Mapped["Way | None"] = relationship(back_populates="note", foreign_keys=[way_id])
    topic: Mapped["Topic | None"] = relationship(back_populates="notes", foreign_keys=[topic_id])
    topic_inline: Mapped["Topic | None"] = relationship(back_populates="inline_note", foreign_keys=[topic_inline_id])
    images: Mapped[list["NoteImage"]] = relationship(back_populates="note", cascade="all, delete-orphan")


class NoteImage(Base):
    __tablename__ = "note_images"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    note_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("notes.id", ondelete="CASCADE"), nullable=False, index=True)
    s3_key: Mapped[str] = mapped_column(String(500), nullable=False)
    url: Mapped[str] = mapped_column(String(1000), nullable=False)
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    size_bytes: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    note: Mapped["Note"] = relationship(back_populates="images")
