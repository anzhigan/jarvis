"""Drop the Sprint (UI: Step) concept entirely.

Goals now contain Gos directly (a Go has start_date/due_date so it can be
single-day or span a period). FocusSprintItem loses 'step' as a polymorphic
option. Existing Sprint rows are deleted; Gos that pointed at them keep
their sprint_id set to NULL via the FK's ON DELETE SET NULL.

Revision ID: 017_drop_sprints
Revises: 016_note_shares
Create Date: 2026-05-12
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = '017_drop_sprints'
down_revision: Union[str, None] = '016_note_shares'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Drop step-typed FocusSprintItem rows (they reference sprints we're dropping).
    op.execute(sa.text("DELETE FROM focus_sprint_items WHERE item_type = 'step'"))

    # 2. Drop FK columns that reference sprints from other tables BEFORE we drop
    #    the table itself. SET NULL on the FK means existing referring rows
    #    keep working — the FK constraint goes away with the column.
    op.drop_column('gos', 'sprint_id')
    op.drop_column('routines', 'step_id')
    op.drop_column('focus_sprint_items', 'step_id')

    # 3. Drop the table.
    op.drop_table('sprints')


def downgrade() -> None:
    # Re-creating the dropped data is not possible (titles/dates are gone),
    # but rebuild the schema so a downgrade leaves the DB in a coherent
    # structural state matching the pre-017 migration.
    op.create_table(
        'sprints',
        sa.Column('id', sa.Uuid(as_uuid=True), primary_key=True),
        sa.Column('task_id', sa.Uuid(as_uuid=True), sa.ForeignKey('tasks.id', ondelete='CASCADE'), nullable=False),
        sa.Column('user_id', sa.Uuid(as_uuid=True), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('title', sa.String(length=500), nullable=False),
        sa.Column('description', sa.Text(), nullable=False, server_default=''),
        sa.Column('start_date', sa.Date(), nullable=False),
        sa.Column('end_date', sa.Date(), nullable=False),
        sa.Column('is_completed', sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column('color', sa.String(length=20), nullable=False, server_default='#3b82f6'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index('ix_sprints_task_id', 'sprints', ['task_id'])
    op.create_index('ix_sprints_user_id', 'sprints', ['user_id'])

    op.add_column('gos', sa.Column('sprint_id', sa.Uuid(as_uuid=True),
                  sa.ForeignKey('sprints.id', ondelete='SET NULL'), nullable=True))
    op.add_column('routines', sa.Column('step_id', sa.Uuid(as_uuid=True),
                  sa.ForeignKey('sprints.id', ondelete='SET NULL'), nullable=True))
    op.add_column('focus_sprint_items', sa.Column('step_id', sa.Uuid(as_uuid=True),
                  sa.ForeignKey('sprints.id', ondelete='CASCADE'), nullable=True))
