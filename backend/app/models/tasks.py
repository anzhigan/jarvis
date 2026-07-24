import uuid
from datetime import UTC, date, datetime

from sqlalchemy import (
    Boolean,
    Column,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Table,
    Text,
    UniqueConstraint,
)
from sqlalchemy import Uuid as UUID
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
    color: Mapped[str] = mapped_column(String(20), default="#2C4A60", server_default="#2C4A60")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
    )

    user: Mapped["User"] = relationship(back_populates="tasks")  # noqa: F821
    gos: Mapped[list["Go"]] = relationship(
        back_populates="task", cascade="all, delete-orphan", order_by="Go.created_at",
    )
    tags: Mapped[list["Tag"]] = relationship(  # noqa: F821
        secondary=task_tags, back_populates="tasks", order_by="Tag.name",
    )
    routine_links: Mapped[list["GoalRoutineLink"]] = relationship(
        back_populates="goal",
        cascade="all, delete-orphan",
        foreign_keys="GoalRoutineLink.goal_id",
        order_by="GoalRoutineLink.created_at",
    )
    steps: Mapped[list["Step"]] = relationship(
        back_populates="goal",
        cascade="all, delete-orphan",
        foreign_keys="Step.goal_id",
        order_by="Step.position",
    )


class Step(Base):
    """A milestone phase within a Goal. Goal → Step → Go.

    Steps are ordered (position) and have a lifecycle: not_started | in_progress | done.
    A Go may belong to a Step (Go.step_id) — optional.
    """

    __tablename__ = "steps"
    __table_args__ = (UniqueConstraint("goal_id", "position", name="uq_steps_goal_position"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True,
    )
    goal_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False, index=True,
    )
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    description: Mapped[str] = mapped_column(Text, default="")
    position: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[str] = mapped_column(String(20), default="not_started")
    start_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    end_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
    )

    goal: Mapped["Task"] = relationship(back_populates="steps", foreign_keys=[goal_id])
    gos: Mapped[list["Go"]] = relationship(
        back_populates="step", foreign_keys="Go.step_id",
    )


class Go(Base):
    """A work item attached (optionally) to a Goal. Has start_date/due_date so it
    can be either single-day or span a period — the former Sprint/Step concept
    is now expressed by `start_date`+`due_date` on the Go itself.

    item_kind:
      - 'one_off'         a real Go (default)
      - 'routine_legacy'  this Go was migrated to the Routine table; kept here for backward compat
    """

    __tablename__ = "gos"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    task_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("tasks.id", ondelete="CASCADE"), nullable=True, index=True,
    )
    step_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("steps.id", ondelete="SET NULL"), nullable=True, index=True,
    )
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    description: Mapped[str] = mapped_column(Text, default="")
    kind: Mapped[str] = mapped_column(String(20), default="boolean")  # boolean | numeric
    unit: Mapped[str] = mapped_column(String(50), default="")
    target_value: Mapped[float | None] = mapped_column(Float, nullable=True)
    recurrence: Mapped[str] = mapped_column(String(20), default="none")  # none | daily | weekly
    start_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    due_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    color: Mapped[str] = mapped_column(String(20), default="#4f46e5")
    item_kind: Mapped[str] = mapped_column(String(30), default="one_off", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))

    task: Mapped["Task | None"] = relationship(back_populates="gos")
    step: Mapped["Step | None"] = relationship(back_populates="gos", foreign_keys=[step_id])
    user: Mapped["User"] = relationship(back_populates="gos")  # noqa: F821
    entries: Mapped[list["GoEntry"]] = relationship(
        back_populates="go", cascade="all, delete-orphan", order_by="GoEntry.date",
    )


class GoEntry(Base):
    """One day's log for a Go."""

    __tablename__ = "go_entries"
    __table_args__ = (UniqueConstraint("go_id", "date", name="uq_go_entries_go_date"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    go_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("gos.id", ondelete="CASCADE"), nullable=False, index=True)
    date: Mapped[date] = mapped_column(Date, nullable=False)
    value: Mapped[float] = mapped_column(Float, default=0.0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))

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

    Linked to a Goal (optional).
    """

    __tablename__ = "routines"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    goal_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("tasks.id", ondelete="SET NULL"), nullable=True, index=True,
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
        ForeignKey("gos.id", ondelete="SET NULL"), nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
    )

    user: Mapped["User"] = relationship(back_populates="routines")  # noqa: F821
    goal: Mapped["Task | None"] = relationship(foreign_keys=[goal_id])
    entries: Mapped[list["RoutineEntry"]] = relationship(
        back_populates="routine", cascade="all, delete-orphan", order_by="RoutineEntry.date",
    )


class RoutineEntry(Base):
    """One day's log for a Routine."""

    __tablename__ = "routine_entries"
    __table_args__ = (UniqueConstraint("routine_id", "date", name="uq_routine_entries_routine_date"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    routine_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("routines.id", ondelete="CASCADE"), nullable=False, index=True)
    date: Mapped[date] = mapped_column(Date, nullable=False)
    # NULL = the day has no status (note-only row); 0 = skipped; > 0 = done.
    value: Mapped[float | None] = mapped_column(Float, nullable=True, default=None)
    # Optional free-text of what was actually done on this day (e.g. "ran 5km
    # in the park"). Empty string when the user only marked done/skipped.
    note: Mapped[str] = mapped_column(Text, default="", server_default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))

    routine: Mapped["Routine"] = relationship(back_populates="entries")


# ─── New: GoalRoutineLink — many-to-many between Goals and Routines ────────────

class GoalRoutineLink(Base):
    """Link a Routine to a Goal for a bounded period.

    A single Routine can be linked to multiple Goals (e.g. "Don't smoke daily"
    might be tracked toward both "Quit smoking" and "Be healthy" goals at the
    same time, in different windows).
    """

    __tablename__ = "goal_routine_links"
    __table_args__ = (
        UniqueConstraint("goal_id", "routine_id", name="uq_goal_routine_link"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    goal_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False, index=True,
    )
    routine_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("routines.id", ondelete="CASCADE"), nullable=False, index=True,
    )
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    target_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))

    goal: Mapped["Task"] = relationship(back_populates="routine_links", foreign_keys=[goal_id])
    routine: Mapped["Routine"] = relationship(foreign_keys=[routine_id])


# ─── FocusSprint — temporal focus referencing existing Goals/Gos/Routines ──

class FocusSprint(Base):
    """A Sprint (UI): a date-bound period of focus. Contains references to
    existing Goals/Gos/Routines (does not own them). When deleted, references
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
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
    )

    user: Mapped["User"] = relationship(back_populates="focus_sprints")  # noqa: F821
    items: Mapped[list["FocusSprintItem"]] = relationship(
        back_populates="focus_sprint", cascade="all, delete-orphan", order_by="FocusSprintItem.created_at",
    )


class FocusSprintItem(Base):
    """A single reference inside a FocusSprint. Polymorphic — either goal, go, or routine."""

    __tablename__ = "focus_sprint_items"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    focus_sprint_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("focus_sprints.id", ondelete="CASCADE"), nullable=False, index=True,
    )
    item_type: Mapped[str] = mapped_column(String(20), nullable=False)  # goal | go | routine
    goal_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("tasks.id", ondelete="CASCADE"), nullable=True)
    go_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("gos.id", ondelete="CASCADE"), nullable=True)
    routine_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("routines.id", ondelete="CASCADE"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))

    focus_sprint: Mapped["FocusSprint"] = relationship(back_populates="items")
