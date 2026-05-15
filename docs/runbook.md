# Runbook — Jarvnote operations

Practical steps for common situations. When something is on fire, search this file first; don't improvise on prod.

## Deploy a release

```bash
ssh user@vps
cd /projects/jarvis
./scripts/backup.sh                                          # always before
git pull --ff-only
docker compose --env-file .env up -d --build
docker compose ps                                            # all containers Up
docker compose exec api curl -sf http://localhost:8000/health/ready
```

The `migrator` service runs `alembic upgrade head` automatically before `api` starts; you don't migrate by hand.

## Rollback a bad release

If the new build is broken, get back to the previous image **without** restoring the DB (data state is fine):

```bash
git log --oneline -5
git checkout <prev-sha>
docker compose --env-file .env up -d --build
```

If the bad release ran a migration that broke the schema, you also need to either:
- re-deploy the previous code with `alembic downgrade -1`, **or**
- restore from backup (next section).

## Restore from backup

`./scripts/backup.sh` writes daily dumps to `/var/backups/jarvis/<date>/`. Keeps last 7 days locally.

```bash
ls /var/backups/jarvis                                       # pick the right date
./scripts/restore.sh /var/backups/jarvis/2026-05-06
```

This **drops** the `jarvis` database and overwrites every MinIO object. Run only when you mean it.

### Offsite backups

If `OFFSITE_REMOTE` is set in the cron environment, `backup.sh` also syncs each
day's tree to that rclone remote. Retention there is `OFFSITE_KEEP_DAYS` (30 by default).

Setup once:
```bash
apt install rclone
rclone config                                                # interactive
# choose B2 / S3 / Yandex Object Storage / etc., name the remote, e.g. "b2"

# add to /etc/cron.d/jarvis-backup or your crontab env:
OFFSITE_REMOTE=b2:jarvis-backups
OFFSITE_KEEP_DAYS=30
```

Restore from offsite:
```bash
rclone copy "$OFFSITE_REMOTE/2026-05-06" /tmp/restore-2026-05-06
./scripts/restore.sh /tmp/restore-2026-05-06
```

**Verify offsite restore quarterly.** A backup you've never restored from is a wish, not a backup.

## "Site is down"

1. Is the VPS reachable at all? `ping`/`ssh`.
2. Are containers up? `docker compose ps`.
3. Healthcheck:
   ```bash
   curl -sf http://localhost:8000/health/ready
   ```
   Returns `503` with the failed component named — db / s3.
4. Recent logs:
   ```bash
   docker compose logs --tail=200 api
   docker compose logs --tail=100 db
   docker compose logs --tail=100 frontend
   ```
   Logs are JSON: filter by `request_id` to follow one request across services.

## "API responds 500"

1. `docker compose logs api | grep ERROR` — find the exception.
2. Each request has a `request_id` in the response header `X-Request-ID`. Grep that id in logs to get the full trail.
3. If Sentry is wired (`SENTRY_DSN` set), the error is also there with full stack + request context.

## "Migration is broken"

```bash
docker compose logs migrator                                 # what failed
docker compose exec api alembic history                      # current state
docker compose exec api alembic downgrade -1                 # back one step
```

If a migration is permanently bad: edit the file in `backend/alembic/versions/`, commit, redeploy. Never delete a merged migration; write a new one that undoes it.

## Disk filling up

MinIO and Postgres both grow. Check:

```bash
du -sh /var/lib/docker/volumes/jarvis_postgres_data
du -sh /var/lib/docker/volumes/jarvis_minio_data
du -sh /var/backups/jarvis
```

Backup retention is 7 days (`KEEP_DAYS` env var in `backup.sh`). Trim if needed: `find /var/backups/jarvis -mindepth 1 -maxdepth 1 -mtime +7 -exec rm -rf {} +`.

## Rotate secrets

```bash
# generate
openssl rand -hex 32       # SECRET_KEY
openssl rand -hex 24       # MinIO root password

# update .env on the VPS (nano or sed -i)
# rotate MinIO admin via mc:
docker compose exec minio mc admin user password local minioadmin <new-password>

# redeploy
docker compose --env-file .env up -d --build
```

Rotating `SECRET_KEY` invalidates every JWT — all users log out. Schedule for low-traffic time.

## API versioning cutover

Right now `/api/v1/*` is canonical and `/api/*` is a deprecation alias with `Sunset: 2026-08-01`. Before that date:

1. Audit access logs for hits to `/api/*` (without `/v1/`):
   ```bash
   docker compose logs api | grep '"path": "/api/' | grep -v '/api/v1/' | wc -l
   ```
2. If non-zero — those are old iOS clients. Push an iOS update to TestFlight; force re-login when count hits zero.
3. After cutover: remove the deprecated alias loop in `app/main.py`.

## Common test failures (locally)

- `test_me / test_refresh_token` fail with SQLite UUID error — known: tests run on SQLite, prod schema uses Postgres UUID. CI uses Postgres so these pass there.
- `5 per hour` rate-limit exceeded — fixed via `limiter.enabled = False` in `tests/conftest.py`. If you don't see this, you're on an old branch.
