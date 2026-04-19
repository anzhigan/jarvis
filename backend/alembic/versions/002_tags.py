"""add tags

Revision ID: 002_tags
Revises: 001_initial
Create Date: 2026-04-19

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '002_tags'
down_revision: Union[str, None] = '001_initial'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'tags',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('user_id', sa.UUID(), nullable=False),
        sa.Column('name', sa.String(length=50), nullable=False),
        sa.Column('color', sa.String(length=20), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_tags_user_id', 'tags', ['user_id'])
    # Unique per user on name (case-sensitive — leave broad match to app if needed)
    op.create_unique_constraint('uq_tags_user_name', 'tags', ['user_id', 'name'])

    op.create_table(
        'note_tags',
        sa.Column('note_id', sa.UUID(), nullable=False),
        sa.Column('tag_id', sa.UUID(), nullable=False),
        sa.ForeignKeyConstraint(['note_id'], ['notes.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['tag_id'], ['tags.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('note_id', 'tag_id'),
    )


def downgrade() -> None:
    op.drop_table('note_tags')
    op.drop_constraint('uq_tags_user_name', 'tags', type_='unique')
    op.drop_index('ix_tags_user_id', table_name='tags')
    op.drop_table('tags')
