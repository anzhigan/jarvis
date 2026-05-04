"""Add start_date to Go

Revision ID: 012_go_start_date
Revises: 011_goal_routine_links
Create Date: 2026-05-04
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = '012_go_start_date'
down_revision: Union[str, None] = '011_goal_routine_links'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'gos',
        sa.Column('start_date', sa.Date(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column('gos', 'start_date')
