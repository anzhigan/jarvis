"""Add routines, focus_sprints, focus_sprint_items + migrate recurring Gos to Routines.

Revision ID: 009_routines_and_focus_sprints
Revises: 008_go_description
Create Date: 2026-04-26
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID


revision: str = '009_routines_and_focus_sprints'
down_revision: Union[str, None] = '008_go_description'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Add item_kind to gos
    op.add_column(
        'gos',
        sa.Column('item_kind', sa.String(30), nullable=False, server_default='one_off'),
    )

    # 2. Routines table
    op.create_table(
        'routines',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column('user_id', UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('goal_id', UUID(as_uuid=True), sa.ForeignKey('tasks.id', ondelete='SET NULL'), nullable=True, index=True),
        sa.Column('step_id', UUID(as_uuid=True), sa.ForeignKey('sprints.id', ondelete='SET NULL'), nullable=True, index=True),
        sa.Column('title', sa.String(300), nullable=False),
        sa.Column('description', sa.Text(), nullable=False, server_default=''),
        sa.Column('color', sa.String(20), nullable=False, server_default='#10b981'),
        sa.Column('schedule_type', sa.String(30), nullable=False, server_default='daily'),
        sa.Column('schedule_days', sa.String(20), nullable=False, server_default=''),
        sa.Column('schedule_n_days', sa.Integer, nullable=False, server_default='1'),
        sa.Column('schedule_count_per_period', sa.Integer, nullable=False, server_default='1'),
        sa.Column('schedule_period', sa.String(20), nullable=False, server_default='week'),
        sa.Column('start_date', sa.Date(), nullable=True),
        sa.Column('end_date', sa.Date(), nullable=True),
        sa.Column('is_paused', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('kind', sa.String(20), nullable=False, server_default='boolean'),
        sa.Column('unit', sa.String(50), nullable=False, server_default=''),
        sa.Column('target_value', sa.Float(), nullable=True),
        sa.Column('legacy_go_id', UUID(as_uuid=True), sa.ForeignKey('gos.id', ondelete='SET NULL'), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )

    # 3. RoutineEntries
    op.create_table(
        'routine_entries',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column('routine_id', UUID(as_uuid=True), sa.ForeignKey('routines.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('date', sa.Date(), nullable=False),
        sa.Column('value', sa.Float(), nullable=False, server_default='0'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint('routine_id', 'date', name='uq_routine_entries_routine_date'),
    )

    # 4. FocusSprints
    op.create_table(
        'focus_sprints',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column('user_id', UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('title', sa.String(500), nullable=False),
        sa.Column('description', sa.Text(), nullable=False, server_default=''),
        sa.Column('start_date', sa.Date(), nullable=False),
        sa.Column('end_date', sa.Date(), nullable=False),
        sa.Column('color', sa.String(20), nullable=False, server_default='#4f46e5'),
        sa.Column('is_archived', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )

    # 5. FocusSprintItems
    op.create_table(
        'focus_sprint_items',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column('focus_sprint_id', UUID(as_uuid=True), sa.ForeignKey('focus_sprints.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('item_type', sa.String(20), nullable=False),
        sa.Column('goal_id', UUID(as_uuid=True), sa.ForeignKey('tasks.id', ondelete='CASCADE'), nullable=True),
        sa.Column('step_id', UUID(as_uuid=True), sa.ForeignKey('sprints.id', ondelete='CASCADE'), nullable=True),
        sa.Column('go_id', UUID(as_uuid=True), sa.ForeignKey('gos.id', ondelete='CASCADE'), nullable=True),
        sa.Column('routine_id', UUID(as_uuid=True), sa.ForeignKey('routines.id', ondelete='CASCADE'), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )

    # 6. Data migration: copy daily/weekly Gos into routines (preserve old Go for backward compat).
    # We do this in Python to avoid relying on PG extensions (gen_random_uuid)
    import uuid as _uuid

    conn = op.get_bind()
    # Find recurring Gos
    res = conn.execute(sa.text("""
        SELECT id, user_id, task_id, sprint_id, title, description, color, kind, unit,
               target_value, recurrence, due_date, created_at
        FROM gos
        WHERE recurrence IN ('daily', 'weekly')
    """))
    rows = list(res)
    routine_id_by_go_id: dict = {}

    for row in rows:
        new_id = _uuid.uuid4()
        routine_id_by_go_id[row.id] = new_id
        schedule_type = 'times_per_week' if row.recurrence == 'weekly' else 'daily'
        conn.execute(
            sa.text("""
                INSERT INTO routines (
                    id, user_id, goal_id, step_id,
                    title, description, color,
                    schedule_type, schedule_days, schedule_n_days, schedule_count_per_period, schedule_period,
                    start_date, end_date, is_paused,
                    kind, unit, target_value, legacy_go_id,
                    created_at, updated_at
                ) VALUES (
                    :id, :user_id, :goal_id, :step_id,
                    :title, :description, :color,
                    :schedule_type, '', 1, 1, 'week',
                    NULL, :end_date, FALSE,
                    :kind, :unit, :target_value, :legacy_go_id,
                    :created_at, :created_at
                )
            """),
            {
                "id": new_id,
                "user_id": row.user_id,
                "goal_id": row.task_id,
                "step_id": row.sprint_id,
                "title": row.title,
                "description": row.description or '',
                "color": row.color,
                "schedule_type": schedule_type,
                "end_date": row.due_date,
                "kind": row.kind,
                "unit": row.unit or '',
                "target_value": row.target_value,
                "legacy_go_id": row.id,
                "created_at": row.created_at,
            }
        )

    # 7. Copy go_entries → routine_entries for migrated Gos
    if routine_id_by_go_id:
        entries_res = conn.execute(sa.text("""
            SELECT id, go_id, date, value, created_at FROM go_entries
            WHERE go_id = ANY(:ids)
        """), {"ids": list(routine_id_by_go_id.keys())})
        for er in entries_res:
            conn.execute(
                sa.text("""
                    INSERT INTO routine_entries (id, routine_id, date, value, created_at)
                    VALUES (:id, :routine_id, :date, :value, :created_at)
                """),
                {
                    "id": _uuid.uuid4(),
                    "routine_id": routine_id_by_go_id[er.go_id],
                    "date": er.date,
                    "value": er.value,
                    "created_at": er.created_at,
                }
            )

    # 8. Mark migrated Gos as 'routine_legacy' so we can hide/separate them later.
    conn.execute(sa.text("""
        UPDATE gos
        SET item_kind = 'routine_legacy'
        WHERE recurrence IN ('daily', 'weekly')
    """))


def downgrade() -> None:
    op.drop_table('focus_sprint_items')
    op.drop_table('focus_sprints')
    op.drop_table('routine_entries')
    op.drop_table('routines')
    op.drop_column('gos', 'item_kind')
