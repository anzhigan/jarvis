"""add task.start_date and todo.parent_todo_id

Revision ID: 006_task_period_and_parent_todo
Revises: 005_todos
Create Date: 2026-04-21

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '006_task_period_and_parent_todo'
down_revision: Union[str, None] = '005_todos'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Task: period -> start_date + due_date (due_date already exists)
    op.add_column('tasks', sa.Column('start_date', sa.Date(), nullable=True))

    # Todo: parent_todo_id (self-FK) for weekly->daily hierarchy
    op.add_column(
        'todos',
        sa.Column('parent_todo_id', sa.UUID(), nullable=True),
    )
    op.create_foreign_key(
        'fk_todos_parent_todo_id',
        'todos', 'todos',
        ['parent_todo_id'], ['id'],
        ondelete='CASCADE',
    )
    op.create_index('ix_todos_parent_todo_id', 'todos', ['parent_todo_id'])


def downgrade() -> None:
    op.drop_index('ix_todos_parent_todo_id', table_name='todos')
    op.drop_constraint('fk_todos_parent_todo_id', 'todos', type_='foreignkey')
    op.drop_column('todos', 'parent_todo_id')
    op.drop_column('tasks', 'start_date')
