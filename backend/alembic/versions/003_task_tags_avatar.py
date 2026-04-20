"""task tags + user avatar

Revision ID: 003_task_tags_avatar
Revises: 002_tags
Create Date: 2026-04-20

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '003_task_tags_avatar'
down_revision: Union[str, None] = '002_tags'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'task_tags',
        sa.Column('task_id', sa.UUID(), nullable=False),
        sa.Column('tag_id', sa.UUID(), nullable=False),
        sa.ForeignKeyConstraint(['task_id'], ['tasks.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['tag_id'], ['tags.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('task_id', 'tag_id'),
    )

    op.add_column(
        'users',
        sa.Column('avatar_url', sa.String(length=1000), nullable=True),
    )


def downgrade() -> None:
    op.drop_column('users', 'avatar_url')
    op.drop_table('task_tags')
