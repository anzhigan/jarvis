"""Add ai_jobs.cache_key for memoizing identical AI generations.

A cache_key is a content-fingerprint of the job's inputs (see
app.services.ai.cache). When a router receives a new enqueue request, it
computes the key and looks up an existing done-job with the same key for
the same user. If found, that job is returned immediately (frontend sees
status=done on first poll). Otherwise a new job is created with the key
attached, and future requests for unchanged inputs hit the cache.

Filtered index: only done-jobs with a cache_key are indexed — that's the
only state we care to look up. Keeps the index small and fast.

Revision ID: 024_ai_jobs_cache_key
Revises: 023_ai_quizzes
Create Date: 2026-05-15
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = '024_ai_jobs_cache_key'
down_revision: Union[str, None] = '023_ai_quizzes'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('ai_jobs', sa.Column('cache_key', sa.String(255), nullable=True))
    # Filtered index: most ai_jobs rows are short-lived (queued/running/failed).
    # Only DONE jobs with a key participate in lookups, so we index only those.
    op.execute("""
        CREATE INDEX ix_ai_jobs_cache_lookup
        ON ai_jobs (user_id, kind, cache_key)
        WHERE cache_key IS NOT NULL AND status = 'done'
    """)


def downgrade() -> None:
    op.drop_index('ix_ai_jobs_cache_lookup', table_name='ai_jobs')
    op.drop_column('ai_jobs', 'cache_key')
