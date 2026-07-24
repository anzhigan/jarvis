"""Add routine_entries.note — free-text of what was done on a given day.

Boolean routines previously stored only a done/skip value per day. This adds
an optional note so the user can record *what* they actually did when they
mark a day done (e.g. "ran 5km in the park"). Empty string for days with no
note. Non-null with a server default so existing rows backfill cleanly.

Revision ID: 026_routine_entry_note
Revises: 025_admin_dashboard
Create Date: 2026-07-15
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = '026_routine_entry_note'
down_revision: Union[str, None] = '025_admin_dashboard'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'routine_entries',
        sa.Column('note', sa.Text(), nullable=False, server_default=''),
    )


def downgrade() -> None:
    op.drop_column('routine_entries', 'note')
