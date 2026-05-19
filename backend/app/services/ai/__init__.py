"""AI services package.

Side-effect imports below register handlers with the JobQueue. Without
this, anyone who imports `app.services.ai.jobs` (CLI scripts, tests,
the backfill tool) ends up with an empty `_HANDLERS` registry.
"""
from app.services.ai import coach as _coach  # noqa: F401
from app.services.ai import insights as _insights  # noqa: F401
from app.services.ai import quiz as _quiz  # noqa: F401
from app.services.ai import schedule as _schedule  # noqa: F401
from app.services.ai import sprint_plan as _sprint_plan  # noqa: F401
