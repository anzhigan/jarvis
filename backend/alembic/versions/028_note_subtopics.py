"""Add Subtopic level to the notes hierarchy: Way → Topic → Subtopic → Note.

Subtopic is an optional level between Topic and Note. It mirrors Topic (own
child notes + an optional inline note), so a Note may now also point at a
subtopic via `subtopic_id` (a leaf note under the subtopic) or
`subtopic_inline_id` (the subtopic's own body). Existing notes are untouched —
the level is optional and backward compatible.

Revision ID: 028_note_subtopics
Revises: 027_routine_entry_value_nullable
Create Date: 2026-07-22
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision: str = '028_note_subtopics'
down_revision: Union[str, None] = '027_routine_entry_value_nullable'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'subtopics',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column(
            'topic_id', UUID(as_uuid=True),
            sa.ForeignKey('topics.id', ondelete='CASCADE'), nullable=False,
        ),
        sa.Column('name', sa.String(length=200), nullable=False),
        sa.Column('order', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index('ix_subtopics_topic_id', 'subtopics', ['topic_id'])

    op.add_column(
        'notes',
        sa.Column(
            'subtopic_id', UUID(as_uuid=True),
            sa.ForeignKey('subtopics.id', ondelete='CASCADE'), nullable=True,
        ),
    )
    op.add_column(
        'notes',
        sa.Column(
            'subtopic_inline_id', UUID(as_uuid=True),
            sa.ForeignKey('subtopics.id', ondelete='CASCADE'), nullable=True,
        ),
    )
    op.create_index('ix_notes_subtopic_id', 'notes', ['subtopic_id'])
    op.create_index('ix_notes_subtopic_inline_id', 'notes', ['subtopic_inline_id'])


def downgrade() -> None:
    op.drop_index('ix_notes_subtopic_inline_id', table_name='notes')
    op.drop_index('ix_notes_subtopic_id', table_name='notes')
    op.drop_column('notes', 'subtopic_inline_id')
    op.drop_column('notes', 'subtopic_id')
    op.drop_index('ix_subtopics_topic_id', table_name='subtopics')
    op.drop_table('subtopics')
