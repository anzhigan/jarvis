"""Add is_admin + last_seen_at columns to users.

Enables the /admin dashboard:
- is_admin: gates the new /api/v1/admin/* router. Defaults to false so existing
  users stay non-admin without any data fixup.
- last_seen_at: bumped on every authenticated request (via update_last_seen
  dependency) so the dashboard can compute "active in last N days" cohorts.

Revision ID: 025_admin_dashboard
Revises: 024_ai_jobs_cache_key
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = '025_admin_dashboard'
down_revision: Union[str, None] = '024_ai_jobs_cache_key'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Non-null bool with explicit server_default so existing rows fill in
    # without a manual UPDATE step. Server default is dropped after backfill
    # since the application-level default ("False") is the source of truth.
    op.add_column(
        'users',
        sa.Column('is_admin', sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.alter_column('users', 'is_admin', server_default=None)

    op.add_column(
        'users',
        sa.Column('last_seen_at', sa.DateTime(timezone=True), nullable=True),
    )
    # Partial-ish index — most admin queries filter `last_seen_at >= now() - 7d`,
    # which a btree can serve directly.
    op.create_index('ix_users_last_seen_at', 'users', ['last_seen_at'])


def downgrade() -> None:
    op.drop_index('ix_users_last_seen_at', table_name='users')
    op.drop_column('users', 'last_seen_at')
    op.drop_column('users', 'is_admin')
