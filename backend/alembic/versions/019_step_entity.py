"""Add Step entity: milestone phases inside a Goal, plus Go.step_id FK.

Steps belong to a Task (goal_id), are ordered (position), and have a
not_started | in_progress | done lifecycle. A Go may optionally belong
to a Step (Go.step_id, SET NULL on step delete).

Revision ID: 019_step_entity
Revises: 018_note_attachments
Create Date: 2026-05-14
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = '019_step_entity'
down_revision: Union[str, None] = '018_note_attachments'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'steps',
        sa.Column('id', sa.Uuid(as_uuid=True), primary_key=True),
        sa.Column(
            'user_id',
            sa.Uuid(as_uuid=True),
            sa.ForeignKey('users.id', ondelete='CASCADE'),
            nullable=False,
        ),
        sa.Column(
            'goal_id',
            sa.Uuid(as_uuid=True),
            sa.ForeignKey('tasks.id', ondelete='CASCADE'),
            nullable=False,
        ),
        sa.Column('title', sa.String(length=300), nullable=False),
        sa.Column('description', sa.Text(), nullable=False, server_default=''),
        sa.Column('position', sa.Integer(), nullable=False, server_default='0'),
        sa.Column(
            'status',
            sa.String(length=20),
            nullable=False,
            server_default='not_started',
        ),
        sa.Column('start_date', sa.Date(), nullable=True),
        sa.Column('end_date', sa.Date(), nullable=True),
        sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            'created_at',
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            'updated_at',
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.UniqueConstraint('goal_id', 'position', name='uq_steps_goal_position'),
    )
    op.create_index('ix_steps_user_id', 'steps', ['user_id'])
    op.create_index('ix_steps_goal_id', 'steps', ['goal_id'])

    # Add Go.step_id (nullable FK with SET NULL on step deletion).
    op.add_column(
        'gos',
        sa.Column('step_id', sa.Uuid(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        'fk_gos_step_id_steps',
        'gos', 'steps',
        ['step_id'], ['id'],
        ondelete='SET NULL',
    )
    op.create_index('ix_gos_step_id', 'gos', ['step_id'])


def downgrade() -> None:
    op.drop_index('ix_gos_step_id', table_name='gos')
    op.drop_constraint('fk_gos_step_id_steps', 'gos', type_='foreignkey')
    op.drop_column('gos', 'step_id')
    op.drop_index('ix_steps_goal_id', table_name='steps')
    op.drop_index('ix_steps_user_id', table_name='steps')
    op.drop_table('steps')
