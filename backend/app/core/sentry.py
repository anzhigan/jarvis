"""Sentry initialization. No-op when SENTRY_DSN is empty.

Wired here so app.main.py just calls init_sentry(settings) once at import time,
before the FastAPI app is constructed (so FastAPI integration patches in cleanly).
"""
import logging

from app.core.config import settings

logger = logging.getLogger(__name__)


def init_sentry() -> None:
    if not settings.SENTRY_DSN:
        return
    try:
        import sentry_sdk
        from sentry_sdk.integrations.fastapi import FastApiIntegration
        from sentry_sdk.integrations.sqlalchemy import SqlalchemyIntegration
        from sentry_sdk.integrations.starlette import StarletteIntegration
    except ImportError:
        logger.warning("SENTRY_DSN set but sentry-sdk not installed — skipping init.")
        return

    is_prod = settings.APP_ENV == "production"
    sentry_sdk.init(
        dsn=settings.SENTRY_DSN,
        environment=settings.APP_ENV,
        release=settings.APP_VERSION,
        # Lower sample rate in prod to keep cost predictable; full sampling in dev.
        traces_sample_rate=settings.SENTRY_TRACES_SAMPLE_RATE if is_prod else 1.0,
        profiles_sample_rate=0,
        integrations=[
            StarletteIntegration(transaction_style="endpoint"),
            FastApiIntegration(transaction_style="endpoint"),
            SqlalchemyIntegration(),
        ],
        # Don't ship request bodies / cookies / headers automatically — too easy
        # to leak tokens. We manually scrub via before_send when we add it.
        send_default_pii=False,
    )
    logger.info("Sentry initialized for environment=%s release=%s",
                settings.APP_ENV, settings.APP_VERSION)
