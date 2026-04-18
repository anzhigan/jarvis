# Jarvis

Personal knowledge base + task manager + metrics tracker.

**Stack:** React 18 + TypeScript + Vite + Tailwind v4 + Tiptap (frontend) · FastAPI + SQLAlchemy 2.0 async + Alembic (backend) · PostgreSQL · MinIO (S3-compatible).

## Features

- **Notes** — 3-level hierarchy: Ways → Topics → Notes. Full CRUD on every level. Notes can live at any level (way itself, topic itself, or under topic).
- **Rich text editor** — Tiptap with headings, lists, quotes, code blocks, colors, font sizes, image upload with drag-to-resize handle.
- **Auto-save** — every note change is saved to the backend after 600ms of inactivity.
- **Tasks** — Kanban board (To Do / In Progress / Done), priorities, due dates, overdue highlighting.
- **Metrics** — custom trackers with target values, entry logging, line charts via recharts.
- **Auth** — JWT access + refresh tokens, auto-refresh on 401, per-user data isolation.
- **Dark mode** — system-aware + manual toggle.

## Quick start

```bash
docker compose up --build
```

Open http://localhost — register an account and start using.

| What | Where |
|---|---|
| App | http://localhost |
| API docs | http://localhost:8000/docs |
| MinIO console | http://localhost:9001 (`minioadmin` / `minioadmin`) |
| Postgres | `localhost:5432` (`postgres` / `password`) |

## Project structure

```
jarvis/
├── docker-compose.yml
├── backend/                    FastAPI + Alembic
│   ├── Dockerfile
│   ├── pyproject.toml
│   ├── alembic/
│   │   └── versions/           mounted from host — migrations persist
│   └── app/
│       ├── main.py             FastAPI app, CORS, lifespan
│       ├── core/               config, db session, security, deps
│       ├── models/             SQLAlchemy models
│       ├── schemas/            Pydantic I/O schemas
│       ├── routers/            auth, notes, tasks, metrics
│       └── services/
│           └── s3.py           MinIO image upload + validation
│
└── frontend/                   React SPA
    ├── Dockerfile              node build → nginx serve
    ├── nginx.conf              SPA fallback + /api/ proxy
    ├── package.json
    └── src/
        ├── main.tsx
        ├── api/
        │   ├── client.ts       typed fetch client, auto-refresh
        │   └── types.ts
        ├── store/
        │   └── auth.ts         zustand — user session
        ├── app/App.tsx         tabs, theme, auth routing
        ├── components/
        │   ├── AuthPage.tsx
        │   ├── Notes.tsx
        │   ├── Tasks.tsx
        │   ├── Metrics.tsx
        │   └── RichTextEditor.tsx
        └── styles/             theme.css, editor.css, fonts.css
```

## Local development (without Docker for code)

### Backend

```bash
cd backend
docker compose -f ../docker-compose.yml up -d db minio   # just infra

python -m venv .venv && source .venv/bin/activate
pip install -e .

cp .env.example .env
# Adjust DATABASE_URL host to localhost if needed

alembic upgrade head
uvicorn app.main:app --reload --port 8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev   # http://localhost:5173
```

## Creating new migrations

After changing SQLAlchemy models:

```bash
docker compose exec api alembic revision --autogenerate -m "describe change"
docker compose exec api alembic upgrade head
```

Migration files end up in `backend/alembic/versions/` on your host (volume-mounted).

## Tests

```bash
cd backend
pip install -e ".[dev]"
pytest tests/ -v
```

Tests use SQLite in-memory — no need to run Postgres.

## API overview

| Method | Endpoint | Notes |
|---|---|---|
| `POST` | `/api/auth/register` | Create user |
| `POST` | `/api/auth/login` | Returns `access_token` + `refresh_token` |
| `POST` | `/api/auth/refresh` | New access token |
| `GET`  | `/api/auth/me` | Current user |
| `GET`  | `/api/ways` | Full tree (ways → topics → notes) |
| `POST` | `/api/ways` | Create way |
| `PATCH`| `/api/ways/{id}` | Rename / reorder |
| `DELETE`| `/api/ways/{id}` | Cascade delete |
| `POST` | `/api/ways/{id}/topics` | Create topic |
| `PATCH`| `/api/topics/{id}` | Update topic |
| `DELETE`| `/api/topics/{id}` | Delete topic |
| `POST` | `/api/notes` | Body: exactly one of `way_id`, `topic_id`, `topic_inline_id` |
| `PATCH`| `/api/notes/{id}` | Update name / content |
| `DELETE`| `/api/notes/{id}` | Delete note + S3 images |
| `POST` | `/api/notes/{id}/images` | Multipart `file`, returns `{url}` |
| `GET`  | `/api/tasks` | Optional `?status_filter=` |
| `POST` | `/api/tasks` | Create task |
| `PATCH`| `/api/tasks/{id}` | Update |
| `DELETE`| `/api/tasks/{id}` | |
| `GET`  | `/api/metrics` | With entries |
| `POST` | `/api/metrics` | Create |
| `POST` | `/api/metrics/{id}/entries` | Log a data point |

## Troubleshooting

**`Can't locate revision` on `alembic upgrade`** — the volume-mounted migrations got out of sync with the DB. Quickest fix:
```bash
docker compose down -v && docker compose up -d
```
This wipes the DB volume so migrations apply cleanly.

**Image upload fails with 413** — the nginx proxy has `client_max_body_size 20M`. Increase it in `frontend/nginx.conf` if you need bigger images.

**Port 80 already in use** — change the frontend port in `docker-compose.yml` (`"8080:80"` instead of `"80:80"`), then open http://localhost:8080.
