"""Make routine_entries.value nullable — NULL means "no status, note only".

A day used to have exactly three states: no row (empty), value 0 (skipped),
value > 0 (done). That made notes unusable on anything but a done day: saving
a note had to invent a value, which flipped the day green. NULL adds the
missing fourth state — a row that carries a note without asserting anything
about whether the day was done or skipped, so the square still renders empty.

Revision ID: 027_routine_entry_value_nullable
Revises: 026_routine_entry_note
Create Date: 2026-07-20
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = '027_routine_entry_value_nullable'
down_revision: Union[str, None] = '026_routine_entry_note'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column(
        'routine_entries', 'value',
        existing_type=sa.Float(),
        nullable=True,
    )


def downgrade() -> None:
    # Note-only rows have no meaningful value; 0 ("skipped") is the closest
    # pre-existing state, so they collapse into that on the way back.
    op.execute("UPDATE routine_entries SET value = 0 WHERE value IS NULL")
    op.alter_column(
        'routine_entries', 'value',
        existing_type=sa.Float(),
        nullable=False,
    )
