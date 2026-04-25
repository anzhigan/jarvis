"""Add description to Go

Revision ID: 008_go_description
Revises: 007_sprints_and_gos
Create Date: 2026-04-26
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = '008_go_description'
down_revision: Union[str, None] = '007_sprints_and_gos'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'gos',
        sa.Column('description', sa.Text(), nullable=False, server_default=''),
    )


def downgrade() -> None:
    op.drop_column('gos', 'description')
