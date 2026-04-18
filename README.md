# Knowledge Base & Task Manager

Full-stack monorepo: React + FastAPI + PostgreSQL + MinIO

```
project/
├── frontend/          React + Vite + Tiptap
├── backend/           FastAPI + SQLAlchemy + Alembic
└── docker-compose.yml оркестрация всего
```

---

## Запуск через Docker (production-like)

```bash
docker compose up --build
```

- Фронтенд:     http://localhost
- API docs:     http://localhost:8000/docs
- MinIO console: http://localhost:9001  (minioadmin / minioadmin)

---

## Локальная разработка

### Backend

```bash
cd backend

# Поднять Postgres + MinIO
docker compose up -d db minio

# Создать виртуальное окружение
python -m venv .venv && source .venv/bin/activate

# Установить зависимости
pip install -e ".[dev]"

# Накатить миграции
alembic upgrade head

# Запустить с hot-reload
uvicorn app.main:app --reload --port 8000
```

### Frontend

```bash
cd frontend
npm install          # или pnpm install
npm run dev          # http://localhost:5173
```

### Тесты backend

```bash
cd backend
pytest tests/ -v
# Используют SQLite — Postgres не нужен
```

---

## Первый пользователь

Зайди на http://localhost (или http://localhost:5173 в dev),
нажми "Register" — создай аккаунт и начинай пользоваться.

---

## Переменные окружения

### backend/.env
| Переменная | Default | Описание |
|---|---|---|
| DATABASE_URL | postgresql+asyncpg://... | Postgres |
| SECRET_KEY | change-me | JWT секрет (поменяй в проде!) |
| S3_ENDPOINT_URL | http://localhost:9000 | MinIO |
| S3_ACCESS_KEY | minioadmin | |
| S3_SECRET_KEY | minioadmin | |

### frontend/.env
| Переменная | Default | Описание |
|---|---|---|
| VITE_API_URL | http://localhost:8000/api | URL бэкенда |

В Docker фронтенд использует `.env.production` с `VITE_API_URL=/api`
(nginx проксирует `/api/` → `api:8000/api/`).
