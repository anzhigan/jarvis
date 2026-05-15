"""Create note_embeddings table for RAG over notes.

Each row is one chunk of a note's text plus its embedding vector. A note
with N chunks produces N rows; on note update we DELETE all rows for that
note_id and re-insert. Chunks store char offsets back into the source text
so we can quote-attribute in cross-notes quiz.

Indexes:
- (note_id, chunk_index) — fast lookup and ordered iteration
- HNSW on embedding with vector_cosine_ops — fast top-K cosine search

The embed_model column lets us migrate models later by reading both old and
new vectors during transition (or invalidating the old set).

Revision ID: 021_note_embeddings
Revises: 020_pgvector_extension
Create Date: 2026-05-15
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from pgvector.sqlalchemy import Vector

revision: str = '021_note_embeddings'
down_revision: Union[str, None] = '020_pgvector_extension'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'note_embeddings',
        sa.Column('id', sa.Uuid(as_uuid=True), primary_key=True),
        sa.Column(
            'note_id',
            sa.Uuid(as_uuid=True),
            sa.ForeignKey('notes.id', ondelete='CASCADE'),
            nullable=False,
        ),
        sa.Column('chunk_index', sa.Integer, nullable=False),
        sa.Column('content', sa.Text, nullable=False),
        sa.Column('char_start', sa.Integer, nullable=False),
        sa.Column('char_end', sa.Integer, nullable=False),
        sa.Column('embedding', Vector(768), nullable=False),
        sa.Column('embed_model', sa.String(64), nullable=False),
        sa.Column(
            'created_at',
            sa.DateTime(timezone=True),
            server_default=sa.text('now()'),
            nullable=False,
        ),
    )
    op.create_index(
        'ix_note_embeddings_note_chunk',
        'note_embeddings',
        ['note_id', 'chunk_index'],
    )
    # HNSW index for cosine similarity search. Parameters tuned for ~1k-100k
    # vectors per user — small datasets where construction speed matters more
    # than absolute recall.
    op.execute("""
        CREATE INDEX ix_note_embeddings_embedding_hnsw
        ON note_embeddings
        USING hnsw (embedding vector_cosine_ops)
        WITH (m = 16, ef_construction = 64)
    """)


def downgrade() -> None:
    op.drop_index('ix_note_embeddings_embedding_hnsw', table_name='note_embeddings')
    op.drop_index('ix_note_embeddings_note_chunk', table_name='note_embeddings')
    op.drop_table('note_embeddings')
