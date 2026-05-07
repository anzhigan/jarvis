# Contributing

## Local setup

Easiest path is Docker: spins up Postgres, MinIO, API, frontend in one command.

```bash
docker compose up --build
# App:          http://localhost
# API docs:     http://localhost:8000/docs
# MinIO console: http://localhost:9001  (minioadmin / minioadmin)
```

Local dev without Docker (faster iteration on one side):

```bash
# Backend
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
alembic upgrade head
uvicorn app.main:app --reload

# Frontend (in another shell)
cd frontend
npm install
npm run dev
# open http://localhost:5173 (mobile UI < 768px, desktop ≥ 1280px)
```

You'll need Postgres + MinIO running for the API to do anything. Use `docker compose up db minio -d` if you want only the data services.

## Project layout

```
backend/
  app/
    main.py              FastAPI app, middleware, /health, Sentry init
    core/                config, database, security, logging, middleware
    models/              SQLAlchemy 2.0 ORM
    schemas/             Pydantic v2 request/response models
    routers/             HTTP layer — thin: validate → service → response
    services/            Business logic. Pure helpers + DB loaders. Unit-testable
  alembic/               migrations
  tests/                 pytest

frontend/
  src/
    main.tsx             entry; applies theme + Sentry init before render
    app/                 App / MobileApp / DesktopApp / Tab type
    api/                 client + types (single source of HTTP shape)
    store/               Zustand (auth, i18n, theme via lib/theme)
    lib/                 cross-cutting utilities (theme, colors, cn)
    hooks/               cross-cutting hooks (useIsMobile, useShortcuts)
    components/          mobile UI tree + ui-kit primitives + shell + editor
    features/<domain>/   desktop UI tree + shared business-logic hooks
                         {hooks,components,lib,api}
    styles/              tokens.css, desktop.css, editor.css, index.css
```

When adding a domain feature:
1. Schema in `backend/app/schemas/<domain>.py`.
2. Router endpoint in `backend/app/routers/<domain>.py` — keep thin.
3. Pure logic + loaders in `backend/app/services/<domain>.py` (see `services/tasks.py` as template).
4. Frontend shared logic in `frontend/src/features/<domain>/hooks/`.
5. Mobile UI in `frontend/src/components/` (or update existing).
6. Desktop UI in `frontend/src/features/<domain>/components/`.
7. Migration: `cd backend && alembic revision --autogenerate -m "<message>"`.

## Pre-commit hooks

```bash
pip install pre-commit
pre-commit install                              # one-off, sets up the git hook
pre-commit run --all-files                      # run on the whole repo
```

Hooks live in `.pre-commit-config.yaml`. They check trailing whitespace,
merge conflict markers, and run `ruff` (backend) + `prettier` (frontend) on
staged files. CI runs the full lint suite — pre-commit is the fast local pass.

## Code style

**Python (backend):**
- `ruff check app/` and `ruff format app/`. Line length 100.
- `bandit -r app/ -ll` reports Medium+ severity issues.
- Type hints everywhere. We don't enforce mypy yet but writing untyped code is a no.
- Async-first. Sync I/O inside `async def` is a bug — wrap with `asyncio.to_thread`.

**TypeScript (frontend):**
- `npm run lint` (ESLint v9 flat config). Pre-existing warnings are tracked separately; new warnings in your PR are not OK.
- `npx tsc --noEmit` must be clean. Strict mode is on.
- `prettier` — run via `npm run format` or set up the editor extension.
- Convention: state lives in hooks (`features/<domain>/hooks/`), components are mostly presentational. The `useNotesLibrary`, `useGoals` etc. pattern is canonical.

## Tests

```bash
# Backend
cd backend
pytest tests/ -v                                      # full suite
pytest tests/test_services_tasks.py -v                # one file
pytest tests/test_auth.py::test_register -v           # one test

# Frontend
cd frontend
npm test                                              # run once
npm run test:watch                                    # tdd loop
npm run test:coverage                                 # gate is enforced in CI
```

CI thresholds (in `.github/workflows/ci.yml` and `vitest.config.ts`):
- Backend: `pytest --cov-fail-under=60`.
- Frontend: lines ≥30%, statements ≥30%, functions ≥8%, branches ≥70%.

These are non-regressive. Raise them as you add tests; don't lower them.

## Commits and PRs

- One concern per commit when possible; merge-PR-as-one-commit is fine when it tells a clean story.
- Imperative mood: "add health endpoint", not "added" or "adds".
- If a PR touches both backend and frontend, mention both in the body. CI runs them in parallel jobs.

PR checklist (mental, not enforced):
- [ ] Tests cover the new behaviour (services, hooks).
- [ ] No new ESLint / ruff / bandit warnings.
- [ ] Migration if schema changed (`alembic revision --autogenerate`).
- [ ] iOS build still works if you touched `frontend/` (`npm run build:ios`).
- [ ] Updated CHANGELOG / runbook if behaviour visibly changes.

## Architecture decisions

Material decisions live in [`docs/adr/`](docs/adr/). When you change a foundational thing — the storage model, a major library, the auth flow — write an ADR. Five lines is fine; the goal is "future-you understands why".

## When stuck

- Service won't start: check `docker compose logs <service>`.
- Migration broken: see [`docs/runbook.md`](docs/runbook.md#migration-is-broken).
- Tests pass locally but fail in CI: usually SQLite vs Postgres difference (test_db UUID, tz-naive datetime). Run against Postgres locally: `TEST_DATABASE_URL=postgresql+asyncpg://... pytest`.
