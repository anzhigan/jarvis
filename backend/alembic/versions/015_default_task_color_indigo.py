"""Change default task color to indigo (#2C4A60) and migrate existing rows.

Revision ID: 015_default_task_color_indigo
Revises: 014_task_color
Create Date: 2026-05-09
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = '015_default_task_color_indigo'
down_revision: Union[str, None] = '014_task_color'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


OLD_DEFAULT = '#5B5BD6'
NEW_DEFAULT = '#2C4A60'


def upgrade() -> None:
    op.execute(
        sa.text("UPDATE tasks SET color = :new WHERE color = :old")
        .bindparams(new=NEW_DEFAULT, old=OLD_DEFAULT)
    )
    op.alter_column(
        'tasks',
        'color',
        server_default=NEW_DEFAULT,
        existing_type=sa.String(length=20),
        existing_nullable=False,
    )


def downgrade() -> None:
    op.alter_column(
        'tasks',
        'color',
        server_default=OLD_DEFAULT,
        existing_type=sa.String(length=20),
        existing_nullable=False,
    )
    op.execute(
        sa.text("UPDATE tasks SET color = :old WHERE color = :new")
        .bindparams(new=NEW_DEFAULT, old=OLD_DEFAULT)
    )
