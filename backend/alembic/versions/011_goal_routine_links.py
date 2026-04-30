"""goal_routine_links

Revision ID: 011_goal_routine_links
Revises: 010_normalize_statuses
Create Date: 2026-04-30

Introduces a join table between Goals (tasks) and Routines so that a Routine
can be associated with a Goal for a bounded period, with optional target.
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID


revision: str = '011_goal_routine_links'
down_revision: Union[str, None] = '010_normalize_statuses'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'goal_routine_links',
        sa.Column('id', UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('goal_id', UUID(as_uuid=True), sa.ForeignKey('tasks.id', ondelete='CASCADE'), nullable=False),
        sa.Column('routine_id', UUID(as_uuid=True), sa.ForeignKey('routines.id', ondelete='CASCADE'), nullable=False),
        sa.Column('start_date', sa.Date(), nullable=False),
        sa.Column('end_date', sa.Date(), nullable=True),
        sa.Column('target_count', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('NOW()'), nullable=False),
        sa.UniqueConstraint('goal_id', 'routine_id', name='uq_goal_routine_link'),
    )
    op.create_index('ix_goal_routine_links_goal_id', 'goal_routine_links', ['goal_id'])
    op.create_index('ix_goal_routine_links_routine_id', 'goal_routine_links', ['routine_id'])


def downgrade() -> None:
    op.drop_index('ix_goal_routine_links_routine_id', table_name='goal_routine_links')
    op.drop_index('ix_goal_routine_links_goal_id', table_name='goal_routine_links')
    op.drop_table('goal_routine_links')
