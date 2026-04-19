# Jarvis

Personal knowledge base + task manager + habit tracker.

**Stack:** React 18 + TypeScript + Vite + Tailwind v4 + Tiptap · FastAPI + SQLAlchemy async + Alembic · PostgreSQL · MinIO.

## Features

- **Notes** — 3-level hierarchy: Ways → Topics → Notes. Full CRUD, Tiptap rich editor, image upload with drag-to-resize, color picker, auto-save.
- **Tasks** — Kanban board (To Do / In Progress / On Hold / Done), priorities, due dates, overdue highlighting. Each task can have multiple **practices** embedded.
- **Practices** — recurring actions attached to a task (e.g. "Don't smoke" for task "Quit smoking"). Two kinds:
  - **Boolean** — daily check-in with a heatmap and streak tracking
  - **Numeric** — log a value per day (e.g. km ran) with optional target
  - Optional duration (e.g. 30 days) with progress bar
  - Pause / resume / delete
- **Dashboard** — analytics overview: total stats, 30-day activity chart, task status distribution (pie), priority breakdown, top streaks, per-practice progress.
- **Auth** — JWT access + refresh tokens, race-safe auto-refresh on 401.
- **Dark mode** — system-aware + manual toggle.

## Quick start

```bash
docker compose up --build
```

Open http://localhost — register and start using.

| | |
|---|---|
| App | http://localhost |
| API docs | http://localhost:8000/docs |
| MinIO console | http://localhost:9001 (`minioadmin` / `minioadmin`) |
| Postgres | `localhost:5432` (`postgres` / `password`) |

## Project structure

```
jarvis/
├── docker-compose.yml
├── backend/
│   ├── Dockerfile
│   ├── pyproject.toml
│   ├── alembic/versions/001_initial.py
│   └── app/
│       ├── main.py
│       ├── core/{config,database,security,deps}.py
│       ├── models/{user,notes,tasks}.py       # tasks.py has Task, Practice, PracticeEntry
│       ├── schemas/{auth,notes,tasks}.py
│       ├── routers/{auth,notes,tasks}.py
│       └── services/s3.py
└── frontend/
    ├── Dockerfile
    ├── nginx.conf
    ├── package.json
    └── src/
        ├── api/{client,types}.ts
        ├── store/auth.ts
        ├── app/App.tsx
        ├── components/
        │   ├── AuthPage.tsx
        │   ├── Notes.tsx, Tasks.tsx, Metrics.tsx (Dashboard), RichTextEditor.tsx
        └── styles/{theme,editor,fonts,tailwind,index}.css
```

## API overview

| Method | Endpoint | Notes |
|---|---|---|
| `POST` | `/api/auth/register` / `login` / `refresh` | |
| `GET` | `/api/auth/me` | |
| `GET/POST/PATCH/DELETE` | `/api/ways`, `/api/ways/{id}` | |
| `POST/PATCH/DELETE` | `/api/ways/{id}/topics`, `/api/topics/{id}` | |
| `POST/PATCH/DELETE` | `/api/notes`, `/api/notes/{id}` | one of `way_id` / `topic_id` / `topic_inline_id` |
| `POST/DELETE` | `/api/notes/{id}/images` | multipart upload |
| `GET/POST/PATCH/DELETE` | `/api/tasks`, `/api/tasks/{id}` | |
| `POST` | `/api/tasks/{id}/practices` | create practice on a task |
| `PATCH/DELETE` | `/api/practices/{id}` | update status/title/etc. |
| `POST/DELETE` | `/api/practices/{id}/entries` | upsert by date — log a check-in |

## Troubleshooting

**`Can't locate revision` on `alembic upgrade`** — the volume-mounted migrations are out of sync with the DB. Reset:
```bash
docker compose down -v && docker compose up --build
```

**Port 80 busy** — change frontend mapping in `docker-compose.yml` to `"8080:80"`.

**Image upload 413** — `client_max_body_size` in `frontend/nginx.conf` is 20M by default.

## Tests

```bash
cd backend
pip install -e ".[dev]"
pytest tests/ -v
```
