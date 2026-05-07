# ADR-0004: Async-first backend (FastAPI + SQLAlchemy 2.0)

**Date:** 2026-05-07
**Status:** Accepted

## Context

The backend handles a typical I/O mix: PostgreSQL queries, S3 calls (boto3), occasional outbound HTTP (LLM endpoint, Sentry). Per-request latency is dominated by the slowest dependency, not CPU.

## Decision

Every request handler, dependency, and query is `async`:

- **FastAPI** with `async def` endpoints throughout.
- **SQLAlchemy 2.0** with `AsyncSession` + `asyncpg` driver.
- **`asyncio.to_thread`** when calling sync libraries (boto3 — see `services/s3.py`) so we don't block the event loop.
- **Migrations** run sync via Alembic — that's a one-shot startup tool, blocking is fine.

A single uvicorn worker can hold many concurrent requests, each spending most of its time waiting on db / S3.

## Consequences

**Positive:**
- One small worker handles meaningful concurrent load. We run with `uvicorn --workers 1` in dev; prod could go higher but doesn't need to.
- Healthcheck (db ping + S3 head_bucket) runs both probes concurrently with `asyncio.timeout`, total under 2s even in degraded conditions.
- Logging middleware (`app/core/middleware.py`) and request_id ContextVar plug in cleanly — async middleware is first-class.

**Negative:**
- "I'll just write a sync helper" is a footgun. Any sync I/O blocks the whole worker. We catch this in code review; convention is `asyncio.to_thread(...)` if you need a sync library.
- SQLAlchemy 2.0 async API is younger than the sync one — fewer Stack Overflow answers, more reading source code. Acceptable cost.
- Test fixtures (`pytest-asyncio` mode = auto) are slightly more ceremony than sync ones.

## Alternatives considered

- **Sync FastAPI + thread pool:** would work but caps concurrency at the pool size and loses the natural composability of `gather` for parallel I/O (e.g. health probes).
- **gevent / monkey-patching:** rejected — fragile, hard to debug, no longer idiomatic.
