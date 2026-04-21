import uuid
from datetime import date, datetime, timezone

from sqlalchemy import Boolean, Column, Date, DateTime, Float, ForeignKey, Integer, String, Table, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


# ── Many-to-many: task_tags ─────────────────────────────────────────────────
task_tags = Table(
    "task_tags",
    Base.metadata,
    Column("task_id", UUID(as_uuid=True), ForeignKey("tasks.id", ondelete="CASCADE"), primary_key=True),
    Column("tag_id", UUID(as_uuid=True), ForeignKey("tags.id", ondelete="CASCADE"), primary_key=True),
)


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
    todos: Mapped[list["Todo"]] = relationship(
        back_populates="task", cascade="all, delete-orphan", order_by="Todo.created_at"
    )
    tags: Mapped[list["Tag"]] = relationship(  # noqa: F821
        secondary=task_tags, back_populates="tasks", order_by="Tag.name"
    )


class Todo(Base):
    """A todo-item linked to a Task. Either one-off (with due_date)
    or recurring (daily/weekly)."""
    __tablename__ = "todos"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    task_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("tasks.id", ondelete="CASCADE"), nullable=True, index=True)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    # kind: 'boolean' (done/not done) | 'numeric' (logged value, e.g. pages read)
    kind: Mapped[str] = mapped_column(String(20), default="boolean")
    unit: Mapped[str] = mapped_column(String(50), default="")          # e.g. pages, km, min
    target_value: Mapped[float | None] = mapped_column(Float, nullable=True)
    # recurrence: 'none' | 'daily' | 'weekly'
    recurrence: Mapped[str] = mapped_column(String(20), default="none")
    # one-off todos have a concrete due_date
    due_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    color: Mapped[str] = mapped_column(String(20), default="#4f46e5")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    task: Mapped["Task | None"] = relationship(back_populates="todos")
    user: Mapped["User"] = relationship(back_populates="todos")  # noqa: F821
    entries: Mapped[list["TodoEntry"]] = relationship(
        back_populates="todo", cascade="all, delete-orphan", order_by="TodoEntry.date"
    )


class TodoEntry(Base):
    """Single day's completion log for a Todo."""
    __tablename__ = "todo_entries"
    __table_args__ = (UniqueConstraint("todo_id", "date", name="uq_todo_entries_todo_date"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    todo_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("todos.id", ondelete="CASCADE"), nullable=False, index=True)
    date: Mapped[date] = mapped_column(Date, nullable=False)
    # For boolean: value>0 = done, 0 = not done
    # For numeric: actual logged value (pages, km, etc.)
    value: Mapped[float] = mapped_column(Float, default=0.0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    todo: Mapped["Todo"] = relationship(back_populates="entries")
