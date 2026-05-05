# ─── Builder ──────────────────────────────────────────────────────────────────
# Build stage installs deps with gcc/libpq-dev present, then we copy only the
# resulting site-packages into a clean runtime image — no compiler in prod.
FROM python:3.12-slim AS builder

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc libpq-dev \
    && rm -rf /var/lib/apt/lists/*

COPY pyproject.toml .
# `pip install -e .` needs the project source — copy it before install.
COPY . .
RUN pip install --no-cache-dir --prefix=/install -e .


# ─── Runtime ──────────────────────────────────────────────────────────────────
FROM python:3.12-slim AS runtime

WORKDIR /app

# Only the runtime libs we actually need — libpq (asyncpg uses asyncpg, not
# libpq, but psycopg/alembic still pull libpq for sync ops), curl for healthcheck.
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq5 curl \
    && rm -rf /var/lib/apt/lists/*

# Bring built deps + project in.
COPY --from=builder /install /usr/local
COPY --from=builder /app /app

# Run as non-root.
RUN useradd -m appuser && chown -R appuser:appuser /app
USER appuser

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -fsS http://localhost:8000/health || exit 1

# Migrations are now run by the dedicated `migrator` service in compose, not here.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
