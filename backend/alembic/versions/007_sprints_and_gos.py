"""replace todos with sprints + gos

Revision ID: 007_sprints_and_gos
Revises: 006_task_period_and_parent_todo
Create Date: 2026-04-24

Clean-break migration: removes todos/todo_entries tables entirely and creates the new
Sprint → Go → GoEntry hierarchy. All previous todo data is lost (user consented).
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '007_sprints_and_gos'
down_revision: Union[str, None] = '006_task_period_and_parent_todo'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Drop old todo tables entirely (user consented to clean break)
    op.drop_table('todo_entries')
    op.drop_table('todos')

    # Create sprints
    op.create_table(
        'sprints',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('task_id', sa.UUID(), nullable=False),
        sa.Column('user_id', sa.UUID(), nullable=False),
        sa.Column('title', sa.String(length=500), nullable=False),
        sa.Column('description', sa.Text(), nullable=False, server_default=''),
        sa.Column('start_date', sa.Date(), nullable=False),
        sa.Column('end_date', sa.Date(), nullable=False),
        sa.Column('is_completed', sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column('color', sa.String(length=20), nullable=False, server_default='#3b82f6'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['task_id'], ['tasks.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_sprints_task_id', 'sprints', ['task_id'])
    op.create_index('ix_sprints_user_id', 'sprints', ['user_id'])

    # Create gos
    op.create_table(
        'gos',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('user_id', sa.UUID(), nullable=False),
        sa.Column('task_id', sa.UUID(), nullable=True),
        sa.Column('sprint_id', sa.UUID(), nullable=True),
        sa.Column('title', sa.String(length=300), nullable=False),
        sa.Column('kind', sa.String(length=20), nullable=False, server_default='boolean'),
        sa.Column('unit', sa.String(length=50), nullable=False, server_default=''),
        sa.Column('target_value', sa.Float(), nullable=True),
        sa.Column('recurrence', sa.String(length=20), nullable=False, server_default='none'),
        sa.Column('due_date', sa.Date(), nullable=True),
        sa.Column('color', sa.String(length=20), nullable=False, server_default='#4f46e5'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['task_id'], ['tasks.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['sprint_id'], ['sprints.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_gos_user_id', 'gos', ['user_id'])
    op.create_index('ix_gos_task_id', 'gos', ['task_id'])
    op.create_index('ix_gos_sprint_id', 'gos', ['sprint_id'])

    # Create go_entries
    op.create_table(
        'go_entries',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('go_id', sa.UUID(), nullable=False),
        sa.Column('date', sa.Date(), nullable=False),
        sa.Column('value', sa.Float(), nullable=False, server_default='0.0'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['go_id'], ['gos.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('go_id', 'date', name='uq_go_entries_go_date'),
    )
    op.create_index('ix_go_entries_go_id', 'go_entries', ['go_id'])


def downgrade() -> None:
    op.drop_index('ix_go_entries_go_id', table_name='go_entries')
    op.drop_table('go_entries')
    op.drop_index('ix_gos_sprint_id', table_name='gos')
    op.drop_index('ix_gos_task_id', table_name='gos')
    op.drop_index('ix_gos_user_id', table_name='gos')
    op.drop_table('gos')
    op.drop_index('ix_sprints_user_id', table_name='sprints')
    op.drop_index('ix_sprints_task_id', table_name='sprints')
    op.drop_table('sprints')
    # We don't recreate todos (data is lost on downgrade too)
