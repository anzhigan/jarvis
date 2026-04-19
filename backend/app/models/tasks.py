import uuid
from datetime import date, datetime, timezone

from sqlalchemy import Boolean, Date, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class Task(Base):
    __tablename__ = "tasks"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    description: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String(50), default="todo")  # todo | in_progress | done
    priority: Mapped[str] = mapped_column(String(20), default="medium")  # low | medium | high
    due_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    is_completed: Mapped[bool] = mapped_column(Boolean, default=False)
    order: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    user: Mapped["User"] = relationship(back_populates="tasks")  # noqa: F821
    practices: Mapped[list["Practice"]] = relationship(
        back_populates="task", cascade="all, delete-orphan", order_by="Practice.created_at"
    )


class Practice(Base):
    """A recurring action linked to a Task (e.g. 'don't smoke' for task 'quit smoking')."""
    __tablename__ = "practices"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    task_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    # kind: 'boolean' (did/didn't) | 'numeric' (logged a value, e.g. km ran)
    kind: Mapped[str] = mapped_column(String(20), default="boolean")
    unit: Mapped[str] = mapped_column(String(50), default="")  # e.g. "day", "km", "pages"
    target_value: Mapped[float | None] = mapped_column(Float, nullable=True)
    duration_days: Mapped[int | None] = mapped_column(Integer, nullable=True)  # e.g. 30 days
    color: Mapped[str] = mapped_column(String(20), default="#4f46e5")
    status: Mapped[str] = mapped_column(String(20), default="active")  # active | paused | done
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    task: Mapped["Task"] = relationship(back_populates="practices")
    entries: Mapped[list["PracticeEntry"]] = relationship(
        back_populates="practice", cascade="all, delete-orphan", order_by="PracticeEntry.date"
    )


class PracticeEntry(Base):
    __tablename__ = "practice_entries"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    practice_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("practices.id", ondelete="CASCADE"), nullable=False, index=True)
    date: Mapped[date] = mapped_column(Date, nullable=False)
    # For boolean practices: value>0 = success, 0 = fail
    # For numeric practices: actual logged value
    value: Mapped[float] = mapped_column(Float, default=0.0)
    note: Mapped[str] = mapped_column(String(500), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    practice: Mapped["Practice"] = relationship(back_populates="entries")
