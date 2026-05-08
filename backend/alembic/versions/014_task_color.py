"""Add color column to tasks table.

Revision ID: 014_task_color
Revises: 013_refresh_tokens
Create Date: 2026-05-08
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = '014_task_color'
down_revision: Union[str, None] = '013_refresh_tokens'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'tasks',
        sa.Column(
            'color',
            sa.String(length=20),
            nullable=False,
            server_default='#5B5BD6',
        ),
    )


def downgrade() -> None:
    op.drop_column('tasks', 'color')
