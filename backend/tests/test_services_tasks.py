"""Unit tests for app.services.tasks pure helpers.

These exercise the progress / completion math without a database — exactly the
reason the helpers were extracted from the router. Adding scenarios here is
cheap; the router can stay focused on HTTP shape.
"""
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta, timezone

from app.services.tasks import (
    go_completion_ratio,
    go_total_value,
    is_go_done_today,
    normalize_status,
    task_progress_pct,
)


# ─── Tiny stand-ins for ORM rows (pure helpers don't care about real ORM) ────


@dataclass
class _Entry:
    date: date
    value: float = 0


@dataclass
class _Go:
    kind: str = "boolean"
    recurrence: str = "none"
    target_value: float | None = None
    due_date: date | None = None
    item_kind: str | None = None
    created_at: datetime | None = None
    entries: list[_Entry] = field(default_factory=list)


@dataclass
class _Task:
    start_date: date | None = None
    due_date: date | None = None
    gos: list[_Go] = field(default_factory=list)


TODAY = date.today()


# ─── normalize_status ────────────────────────────────────────────────────────


def test_normalize_status_keeps_canonical_names():
    for s in ("backlog", "active", "paused", "done"):
        assert normalize_status(s) == s


def test_normalize_status_maps_legacy_names():
    assert normalize_status("todo") == "backlog"
    assert normalize_status("in_progress") == "active"
    assert normalize_status("background") == "active"


# ─── is_go_done_today ────────────────────────────────────────────────────────


def test_boolean_go_done_today_when_positive_entry_exists():
    g = _Go(entries=[_Entry(TODAY, 1)])
    assert is_go_done_today(g) is True


def test_boolean_go_not_done_today_when_only_old_entries():
    g = _Go(entries=[_Entry(TODAY - timedelta(days=1), 1)])
    assert is_go_done_today(g) is False


def test_numeric_oneoff_done_when_total_meets_target():
    g = _Go(kind="numeric", target_value=10, entries=[_Entry(TODAY - timedelta(days=2), 6),
                                                       _Entry(TODAY, 4)])
    assert is_go_done_today(g) is True


def test_numeric_oneoff_not_done_below_target():
    g = _Go(kind="numeric", target_value=10, entries=[_Entry(TODAY, 5)])
    assert is_go_done_today(g) is False


def test_numeric_recurring_done_when_today_value_meets_target():
    g = _Go(kind="numeric", recurrence="daily", target_value=2,
            entries=[_Entry(TODAY - timedelta(days=1), 5),  # ignored — yesterday
                     _Entry(TODAY, 2)])
    assert is_go_done_today(g) is True


# ─── go_total_value ─────────────────────────────────────────────────────────


def test_go_total_value_sums_all_entries():
    g = _Go(entries=[_Entry(TODAY, 1), _Entry(TODAY - timedelta(days=1), 4)])
    assert go_total_value(g) == 5


def test_go_total_value_zero_for_no_entries():
    assert go_total_value(_Go()) == 0


# ─── go_completion_ratio ────────────────────────────────────────────────────


def test_oneoff_boolean_full_when_any_positive_entry():
    g = _Go(entries=[_Entry(TODAY, 1)])
    assert go_completion_ratio(g) == 1.0


def test_oneoff_boolean_zero_when_no_positive_entries():
    g = _Go(entries=[_Entry(TODAY, 0)])
    assert go_completion_ratio(g) == 0.0


def test_numeric_ratio_capped_at_one():
    g = _Go(kind="numeric", target_value=10, entries=[_Entry(TODAY, 25)])
    assert go_completion_ratio(g) == 1.0


def test_numeric_ratio_proportional_below_target():
    g = _Go(kind="numeric", target_value=10, entries=[_Entry(TODAY, 4)])
    assert go_completion_ratio(g) == 0.4


def test_numeric_no_target_full_when_any_entry():
    g = _Go(kind="numeric", target_value=0, entries=[_Entry(TODAY, 3)])
    assert go_completion_ratio(g) == 1.0


def test_recurring_daily_ratio_counts_done_days_in_window():
    # Created 4 days ago, 3 done days. Window = 5 days (incl today).
    created = datetime.combine(TODAY - timedelta(days=4), datetime.min.time(),
                                tzinfo=timezone.utc)
    g = _Go(kind="boolean", recurrence="daily", created_at=created, entries=[
        _Entry(TODAY - timedelta(days=4), 1),
        _Entry(TODAY - timedelta(days=2), 1),
        _Entry(TODAY, 1),
    ])
    # 3 done out of 5 possible days → 0.6
    assert abs(go_completion_ratio(g) - 0.6) < 1e-9


# ─── task_progress_pct ──────────────────────────────────────────────────────


def test_empty_task_has_zero_progress():
    assert task_progress_pct(_Task()) == 0


def test_task_progress_averages_direct_gos():
    g1 = _Go(entries=[_Entry(TODAY, 1)])               # 100%
    g2 = _Go(entries=[_Entry(TODAY, 0)])               # 0%
    t = _Task(gos=[g1, g2])
    assert task_progress_pct(t) == 50


def test_task_progress_ignores_routine_legacy_gos():
    g1 = _Go(entries=[_Entry(TODAY, 1)])
    g2 = _Go(item_kind="routine_legacy", entries=[_Entry(TODAY, 0)])
    t = _Task(gos=[g1, g2])
    assert task_progress_pct(t) == 100
