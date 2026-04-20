"""notes pinned

Revision ID: 004_note_pinned
Revises: 003_task_tags_avatar
Create Date: 2026-04-20

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '004_note_pinned'
down_revision: Union[str, None] = '003_task_tags_avatar'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'notes',
        sa.Column('pinned', sa.Boolean(), server_default=sa.false(), nullable=False),
    )


def downgrade() -> None:
    op.drop_column('notes', 'pinned')
