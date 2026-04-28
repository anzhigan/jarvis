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
    """Top-level long-running goal."""
    __tablename__ = "tasks"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    description: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String(50), default="backlog")  # backlog | active | paused | done
    priority: Mapped[str] = mapped_column(String(20), default="medium")  # low | medium | high
    start_date: Mapped[date | None] = mapped_column(Date, nullable=True)
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
    sprints: Mapped[list["Sprint"]] = relationship(
        back_populates="task", cascade="all, delete-orphan", order_by="Sprint.start_date"
    )
    gos: Mapped[list["Go"]] = relationship(
        back_populates="task", cascade="all, delete-orphan", order_by="Go.created_at"
    )
    tags: Mapped[list["Tag"]] = relationship(  # noqa: F821
        secondary=task_tags, back_populates="tasks", order_by="Tag.name"
    )


class Sprint(Base):
    """A period-bound milestone inside a Task. Has start/end dates and holds Go items.
    Sprint progress = (completed Go / total Go) * 100.
    Sprint is always one-off (never recurring) and never numeric.
    """
    __tablename__ = "sprints"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    task_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    description: Mapped[str] = mapped_column(Text, default="")
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date] = mapped_column(Date, nullable=False)
    is_completed: Mapped[bool] = mapped_column(Boolean, default=False)
    color: Mapped[str] = mapped_column(String(20), default="#3b82f6")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    task: Mapped["Task"] = relationship(back_populates="sprints")
    user: Mapped["User"] = relationship(back_populates="sprints")  # noqa: F821
    gos: Mapped[list["Go"]] = relationship(
        back_populates="sprint", order_by="Go.due_date",
        # Note: deleting a sprint should NOT delete its gos (they become unattached)
        foreign_keys="Go.sprint_id",
    )


class Go(Base):
    """A 'to-go' item — smallest unit of work. Optionally belongs to a Sprint and/or a Task.
    kind_legacy: boolean | numeric. recurrence: none | daily | weekly.
    kind (new): one_off | routine_legacy — when 'routine_legacy', the Go has been migrated
    to the new Routine table but kept here for backward compat with the old UI.
    """
    __tablename__ = "gos"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    task_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("tasks.id", ondelete="CASCADE"), nullable=True, index=True
    )
    sprint_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("sprints.id", ondelete="SET NULL"), nullable=True, index=True
    )
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    description: Mapped[str] = mapped_column(Text, default="")
    kind: Mapped[str] = mapped_column(String(20), default="boolean")  # boolean | numeric
    unit: Mapped[str] = mapped_column(String(50), default="")
    target_value: Mapped[float | None] = mapped_column(Float, nullable=True)
    recurrence: Mapped[str] = mapped_column(String(20), default="none")  # none | daily | weekly
    due_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    color: Mapped[str] = mapped_column(String(20), default="#4f46e5")
    # New: 'one_off' (real Go) | 'routine_legacy' (was migrated to Routine table)
    item_kind: Mapped[str] = mapped_column(String(30), default="one_off", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    task: Mapped["Task | None"] = relationship(back_populates="gos")
    sprint: Mapped["Sprint | None"] = relationship(back_populates="gos", foreign_keys=[sprint_id])
    user: Mapped["User"] = relationship(back_populates="gos")  # noqa: F821
    entries: Mapped[list["GoEntry"]] = relationship(
        back_populates="go", cascade="all, delete-orphan", order_by="GoEntry.date"
    )


class GoEntry(Base):
    """One day's log for a Go."""
    __tablename__ = "go_entries"
    __table_args__ = (UniqueConstraint("go_id", "date", name="uq_go_entries_go_date"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    go_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("gos.id", ondelete="CASCADE"), nullable=False, index=True)
    date: Mapped[date] = mapped_column(Date, nullable=False)
    value: Mapped[float] = mapped_column(Float, default=0.0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    go: Mapped["Go"] = relationship(back_populates="entries")


# ─── New: Routine — recurring activity with schedule ──────────────────────────

class Routine(Base):
    """Recurring activity (was previously Go with recurrence='daily'/'weekly').
    Has a schedule and a history of executions.

    schedule_type:
        - 'daily'           every day
        - 'weekly_on_days'  specific weekdays (schedule_days = [0=Mon..6=Sun])
        - 'every_n_days'    every N days (schedule_n_days)
        - 'times_per_week'  X times per week (schedule_count_per_period)

    Linked to a Goal (optional) and a Step (optional, formerly Sprint within Task).
    """
    __tablename__ = "routines"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    goal_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("tasks.id", ondelete="SET NULL"), nullable=True, index=True
    )
    step_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("sprints.id", ondelete="SET NULL"), nullable=True, index=True
    )
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    description: Mapped[str] = mapped_column(Text, default="")
    color: Mapped[str] = mapped_column(String(20), default="#10b981")
    # Schedule
    schedule_type: Mapped[str] = mapped_column(String(30), default="daily")
    schedule_days: Mapped[str] = mapped_column(String(20), default="")  # CSV like "0,2,4" for Mon/Wed/Fri
    schedule_n_days: Mapped[int] = mapped_column(Integer, default=1)
    schedule_count_per_period: Mapped[int] = mapped_column(Integer, default=1)  # for times_per_week/month
    schedule_period: Mapped[str] = mapped_column(String(20), default="week")  # week | month
    # Optional active window
    start_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    end_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    is_paused: Mapped[bool] = mapped_column(Boolean, default=False)
    # Numeric routine? (e.g. "10 problems per day")
    kind: Mapped[str] = mapped_column(String(20), default="boolean")  # boolean | numeric
    unit: Mapped[str] = mapped_column(String(50), default="")
    target_value: Mapped[float | None] = mapped_column(Float, nullable=True)
    # Link back to old Go row if migrated (so we can keep backward compat in old UI)
    legacy_go_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("gos.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    user: Mapped["User"] = relationship(back_populates="routines")  # noqa: F821
    goal: Mapped["Task | None"] = relationship(foreign_keys=[goal_id])
    step: Mapped["Sprint | None"] = relationship(foreign_keys=[step_id])
    entries: Mapped[list["RoutineEntry"]] = relationship(
        back_populates="routine", cascade="all, delete-orphan", order_by="RoutineEntry.date"
    )


class RoutineEntry(Base):
    """One day's log for a Routine."""
    __tablename__ = "routine_entries"
    __table_args__ = (UniqueConstraint("routine_id", "date", name="uq_routine_entries_routine_date"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    routine_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("routines.id", ondelete="CASCADE"), nullable=False, index=True)
    date: Mapped[date] = mapped_column(Date, nullable=False)
    value: Mapped[float] = mapped_column(Float, default=0.0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    routine: Mapped["Routine"] = relationship(back_populates="entries")


# ─── New: FocusSprint — temporal focus referencing existing Goals/Steps/Gos/Routines ──

class FocusSprint(Base):
    """A new-style Sprint: a date-bound period of focus. Contains references to
    existing Goals/Steps/Gos/Routines (does not own them). When deleted, references
    are removed but the underlying entities stay.
    """
    __tablename__ = "focus_sprints"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    description: Mapped[str] = mapped_column(Text, default="")
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date] = mapped_column(Date, nullable=False)
    color: Mapped[str] = mapped_column(String(20), default="#4f46e5")
    is_archived: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    user: Mapped["User"] = relationship(back_populates="focus_sprints")  # noqa: F821
    items: Mapped[list["FocusSprintItem"]] = relationship(
        back_populates="focus_sprint", cascade="all, delete-orphan", order_by="FocusSprintItem.created_at"
    )


class FocusSprintItem(Base):
    """A single reference inside a FocusSprint. Polymorphic — either goal, step, go, or routine."""
    __tablename__ = "focus_sprint_items"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    focus_sprint_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("focus_sprints.id", ondelete="CASCADE"), nullable=False, index=True
    )
    item_type: Mapped[str] = mapped_column(String(20), nullable=False)  # goal | step | go | routine
    goal_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("tasks.id", ondelete="CASCADE"), nullable=True)
    step_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("sprints.id", ondelete="CASCADE"), nullable=True)
    go_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("gos.id", ondelete="CASCADE"), nullable=True)
    routine_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("routines.id", ondelete="CASCADE"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    focus_sprint: Mapped["FocusSprint"] = relationship(back_populates="items")
