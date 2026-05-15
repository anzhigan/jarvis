"""AI services package.

Side-effect imports below register handlers with the JobQueue. Without
this, anyone who imports `app.services.ai.jobs` (CLI scripts, tests,
the backfill tool) ends up with an empty `_HANDLERS` registry.
"""
from app.services.ai import quiz as _quiz  # noqa: F401
from app.services.ai import tasks_extract as _tasks_extract  # noqa: F401
