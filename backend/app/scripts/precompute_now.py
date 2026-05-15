"""Manual trigger for the AI pre-compute job.

Useful for:
  - Testing the precompute pipeline without waiting for 04:00 UTC
  - Force-refreshing schedules after large data changes
  - Running on-demand from a system cron if the in-process scheduler is
    unsuitable for your deployment

Usage (from inside the api container):
    docker compose exec api python -m app.scripts.precompute_now
"""
import asyncio
import logging

from app.services.ai.precompute import run_daily_precompute

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)


def main() -> None:
    asyncio.run(run_daily_precompute())


if __name__ == "__main__":
    main()
