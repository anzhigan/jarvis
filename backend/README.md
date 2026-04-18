# Knowledge Base & Task Manager — Backend

FastAPI + PostgreSQL + MinIO

## Quick start

### 1. Start infrastructure
```bash
make docker-up
# PostgreSQL on :5432, MinIO on :9000 (console :9001)
```

### 2. Install dependencies
```bash
python -m venv .venv && source .venv/bin/activate
make install
```

### 3. Configure environment
```bash
cp .env.example .env
# Edit .env if needed (defaults work with docker-compose)
```

### 4. Run migrations
```bash
make upgrade
```

### 5. Start the API
```bash
make dev
# API at http://localhost:8000
# Docs at http://localhost:8000/docs
```

## Tests
```bash
make test
# Uses SQLite in-memory — no running Postgres needed
```

## API structure

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/auth/register | Register |
| POST | /api/auth/login | Login → tokens |
| POST | /api/auth/refresh | Refresh access token |
| GET | /api/auth/me | Current user |
| GET | /api/ways | List all ways with full tree |
| POST | /api/ways | Create way |
| PATCH | /api/ways/{id} | Rename / reorder |
| DELETE | /api/ways/{id} | Delete way (cascade) |
| POST | /api/ways/reorder | Bulk reorder |
| GET | /api/ways/{id}/topics | List topics |
| POST | /api/ways/{id}/topics | Create topic |
| PATCH | /api/topics/{id} | Update topic |
| DELETE | /api/topics/{id} | Delete topic |
| POST | /api/notes | Create note (any level) |
| GET | /api/notes/{id} | Get note |
| PATCH | /api/notes/{id} | Update content/name |
| DELETE | /api/notes/{id} | Delete note |
| POST | /api/notes/{id}/images | Upload image → URL |
| DELETE | /api/notes/{id}/images/{img_id} | Delete image |
| GET | /api/tasks | List tasks (optional ?status_filter=) |
| POST | /api/tasks | Create task |
| PATCH | /api/tasks/{id} | Update task |
| DELETE | /api/tasks/{id} | Delete task |
| POST | /api/tasks/reorder | Bulk reorder |
| GET | /api/metrics | List metrics with entries |
| POST | /api/metrics | Create metric |
| PATCH | /api/metrics/{id} | Update metric |
| DELETE | /api/metrics/{id} | Delete metric |
| POST | /api/metrics/{id}/entries | Add entry |
| DELETE | /api/metrics/{id}/entries/{eid} | Remove entry |
