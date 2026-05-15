"""Enable pgvector extension.

Foundation for note_embeddings (Phase 1) and any future vector-typed columns
used by AI features. The extension itself is schema-less — subsequent
migrations define the actual tables.

Requires the database image to ship with libvector available (we use
`pgvector/pgvector:pg16` in docker-compose). The vanilla `postgres:16-alpine`
image does not have it; running this against that image will error with
"could not open extension control file ... vector.control".

Revision ID: 020_pgvector_extension
Revises: 019_step_entity
Create Date: 2026-05-15
"""
from typing import Sequence, Union

from alembic import op

revision: str = '020_pgvector_extension'
down_revision: Union[str, None] = '019_step_entity'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")


def downgrade() -> None:
    # Only safe to drop if no vector-typed columns remain. Phase 1+ migrations
    # that add such columns must drop them in their own downgrades first.
    op.execute("DROP EXTENSION IF EXISTS vector")
