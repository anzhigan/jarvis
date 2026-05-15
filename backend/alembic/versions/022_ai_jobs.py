"""Create ai_jobs table — the single queue + history for all AI generations.

Lifecycle: queued → running → done | failed | cancelled.

input_json holds the request as the user/router framed it ({kind: 'quiz',
scope: {kind: 'note', id: ...}, ...}). output_json holds whatever the
handler produced (quiz questions, schedule slots, insights — depends on
kind). We keep them generic JSON so adding new job kinds doesn't require
migrations.

Why one shared table vs per-feature tables:
  - Same polling pattern (job_id → status), one endpoint, one handler.
  - History is mixed in the UI ("recent AI generations") anyway.
  - Per-feature persistence (e.g. final saved quiz) can come later as
    separate tables that reference the job_id.

Revision ID: 022_ai_jobs
Revises: 021_note_embeddings
Create Date: 2026-05-15
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = '022_ai_jobs'
down_revision: Union[str, None] = '021_note_embeddings'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'ai_jobs',
        sa.Column('id', sa.Uuid(as_uuid=True), primary_key=True),
        sa.Column(
            'user_id',
            sa.Uuid(as_uuid=True),
            sa.ForeignKey('users.id', ondelete='CASCADE'),
            nullable=False,
        ),
        # Job kind: 'quiz', 'tasks_extract', 'schedule', 'insights', ...
        # Stored as plain string (not enum) so adding kinds is migration-free.
        sa.Column('kind', sa.String(32), nullable=False),
        # 'queued' | 'running' | 'done' | 'failed' | 'cancelled'
        sa.Column('status', sa.String(16), nullable=False, server_default='queued'),
        sa.Column('input_json', sa.JSON, nullable=False, server_default='{}'),
        sa.Column('output_json', sa.JSON, nullable=True),
        sa.Column('error', sa.Text, nullable=True),
        sa.Column('eta_seconds', sa.Integer, nullable=True),
        sa.Column(
            'created_at', sa.DateTime(timezone=True),
            server_default=sa.text('now()'), nullable=False,
        ),
        sa.Column('started_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('finished_at', sa.DateTime(timezone=True), nullable=True),
    )
    # Common query: user's recent jobs (history list in sidebar).
    op.create_index('ix_ai_jobs_user_created', 'ai_jobs', ['user_id', 'created_at'])
    # Cleanup queries: "find stuck running jobs".
    op.create_index('ix_ai_jobs_status', 'ai_jobs', ['status'])


def downgrade() -> None:
    op.drop_index('ix_ai_jobs_status', table_name='ai_jobs')
    op.drop_index('ix_ai_jobs_user_created', table_name='ai_jobs')
    op.drop_table('ai_jobs')
