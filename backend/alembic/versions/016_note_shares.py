"""Add note_shares table for public read-only share links.

Revision ID: 016_note_shares
Revises: 015_default_task_color_indigo
Create Date: 2026-05-12
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = '016_note_shares'
down_revision: Union[str, None] = '015_default_task_color_indigo'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'note_shares',
        sa.Column('id', sa.Uuid(as_uuid=True), primary_key=True),
        sa.Column('note_id', sa.Uuid(as_uuid=True), sa.ForeignKey('notes.id', ondelete='CASCADE'), nullable=False),
        sa.Column('token', sa.String(length=64), nullable=False, unique=True),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column('revoked_at', sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index('ix_note_shares_note_id', 'note_shares', ['note_id'])
    op.create_index('ix_note_shares_token', 'note_shares', ['token'], unique=True)


def downgrade() -> None:
    op.drop_index('ix_note_shares_token', table_name='note_shares')
    op.drop_index('ix_note_shares_note_id', table_name='note_shares')
    op.drop_table('note_shares')
