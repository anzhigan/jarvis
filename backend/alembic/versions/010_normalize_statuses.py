"""Normalize task statuses: todo→backlog, in_progress→active, background→active.

Revision ID: 010_normalize_statuses
Revises: 009_routines_and_focus_sprints
Create Date: 2026-04-28

WARNING: downgrade is LOSSY.
The forward migration collapses three legacy statuses (`todo`, `background`,
`in_progress`) onto two new statuses (`backlog`, `active`). Any row that
was originally `background` becomes indistinguishable from one that was
`in_progress` after upgrade, so downgrade cannot reconstruct the original
value. The downgrade restores `todo`/`in_progress` only — `background` is
permanently lost. If you need a reversible migration, snapshot the column
to a temporary table before running this.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = '010_normalize_statuses'
down_revision: Union[str, None] = '009_routines_and_focus_sprints'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    conn.execute(sa.text("UPDATE tasks SET status = 'backlog' WHERE status = 'todo'"))
    conn.execute(sa.text("UPDATE tasks SET status = 'active' WHERE status = 'in_progress'"))
    # background → active by default (per user spec)
    conn.execute(sa.text("UPDATE tasks SET status = 'active' WHERE status = 'background'"))


def downgrade() -> None:
    # Best-effort rollback (we lose info about original todo vs background)
    conn = op.get_bind()
    conn.execute(sa.text("UPDATE tasks SET status = 'todo' WHERE status = 'backlog'"))
    conn.execute(sa.text("UPDATE tasks SET status = 'in_progress' WHERE status = 'active'"))
