"""Add note_attachments table for inline file attachments (xlsx, docx, pdf, csv...).

Revision ID: 018_note_attachments
Revises: 017_drop_sprints
Create Date: 2026-05-13
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = '018_note_attachments'
down_revision: Union[str, None] = '017_drop_sprints'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'note_attachments',
        sa.Column('id', sa.Uuid(as_uuid=True), primary_key=True),
        sa.Column(
            'note_id',
            sa.Uuid(as_uuid=True),
            sa.ForeignKey('notes.id', ondelete='CASCADE'),
            nullable=False,
        ),
        sa.Column('s3_key', sa.String(length=500), nullable=False),
        sa.Column('url', sa.String(length=1000), nullable=False),
        sa.Column('filename', sa.String(length=255), nullable=False, server_default=''),
        sa.Column(
            'mime_type',
            sa.String(length=120),
            nullable=False,
            server_default='application/octet-stream',
        ),
        sa.Column('size_bytes', sa.Integer(), nullable=False, server_default='0'),
        sa.Column(
            'created_at',
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    op.create_index('ix_note_attachments_note_id', 'note_attachments', ['note_id'])


def downgrade() -> None:
    op.drop_index('ix_note_attachments_note_id', table_name='note_attachments')
    op.drop_table('note_attachments')
