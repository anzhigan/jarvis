"""replace practices with todos

Revision ID: 005_todos
Revises: 004_note_pinned
Create Date: 2026-04-20

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '005_todos'
down_revision: Union[str, None] = '004_note_pinned'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Drop old practice tables entirely (clean-slate, no migration of data)
    op.drop_table('practice_entries')
    op.drop_table('practices')

    # New todos table
    op.create_table(
        'todos',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('task_id', sa.UUID(), nullable=True),
        sa.Column('user_id', sa.UUID(), nullable=False),
        sa.Column('title', sa.String(length=300), nullable=False),
        sa.Column('kind', sa.String(length=20), nullable=False, server_default='boolean'),
        sa.Column('unit', sa.String(length=50), nullable=False, server_default=''),
        sa.Column('target_value', sa.Float(), nullable=True),
        sa.Column('recurrence', sa.String(length=20), nullable=False, server_default='none'),
        sa.Column('due_date', sa.Date(), nullable=True),
        sa.Column('color', sa.String(length=20), nullable=False, server_default='#4f46e5'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['task_id'], ['tasks.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_todos_task_id', 'todos', ['task_id'])
    op.create_index('ix_todos_user_id', 'todos', ['user_id'])

    # New todo_entries table
    op.create_table(
        'todo_entries',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('todo_id', sa.UUID(), nullable=False),
        sa.Column('date', sa.Date(), nullable=False),
        sa.Column('value', sa.Float(), nullable=False, server_default='0.0'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['todo_id'], ['todos.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('todo_id', 'date', name='uq_todo_entries_todo_date'),
    )
    op.create_index('ix_todo_entries_todo_id', 'todo_entries', ['todo_id'])


def downgrade() -> None:
    op.drop_index('ix_todo_entries_todo_id', table_name='todo_entries')
    op.drop_table('todo_entries')
    op.drop_index('ix_todos_user_id', table_name='todos')
    op.drop_index('ix_todos_task_id', table_name='todos')
    op.drop_table('todos')
    # Note: we do NOT recreate practices (it's a clean break; downgrading loses all todo data).
