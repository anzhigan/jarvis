"""Add Subsubtopic level: Way → Topic → Subtopic → Subsubtopic → Note.

Mirrors the Subtopic migration (028): a `subsubtopics` table plus two optional
FK columns on `notes` (`subsubtopic_id` for a leaf note, `subsubtopic_inline_id`
for the subsubtopic's own body). Optional and backward compatible.

Revision ID: 029_note_subsubtopics
Revises: 028_note_subtopics
Create Date: 2026-07-24
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision: str = '029_note_subsubtopics'
down_revision: Union[str, None] = '028_note_subtopics'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'subsubtopics',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column(
            'subtopic_id', UUID(as_uuid=True),
            sa.ForeignKey('subtopics.id', ondelete='CASCADE'), nullable=False,
        ),
        sa.Column('name', sa.String(length=200), nullable=False),
        sa.Column('order', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index('ix_subsubtopics_subtopic_id', 'subsubtopics', ['subtopic_id'])

    op.add_column(
        'notes',
        sa.Column(
            'subsubtopic_id', UUID(as_uuid=True),
            sa.ForeignKey('subsubtopics.id', ondelete='CASCADE'), nullable=True,
        ),
    )
    op.add_column(
        'notes',
        sa.Column(
            'subsubtopic_inline_id', UUID(as_uuid=True),
            sa.ForeignKey('subsubtopics.id', ondelete='CASCADE'), nullable=True,
        ),
    )
    op.create_index('ix_notes_subsubtopic_id', 'notes', ['subsubtopic_id'])
    op.create_index('ix_notes_subsubtopic_inline_id', 'notes', ['subsubtopic_inline_id'])


def downgrade() -> None:
    op.drop_index('ix_notes_subsubtopic_inline_id', table_name='notes')
    op.drop_index('ix_notes_subsubtopic_id', table_name='notes')
    op.drop_column('notes', 'subsubtopic_inline_id')
    op.drop_column('notes', 'subsubtopic_id')
    op.drop_index('ix_subsubtopics_subtopic_id', table_name='subsubtopics')
    op.drop_table('subsubtopics')
