# ADR-0003: MinIO (S3-compatible) for image storage

**Date:** 2026-05-07
**Status:** Accepted

## Context

Notes can contain images (Tiptap rich text). Images can be a few MB each, hundreds across a knowledge base. Two questions: where to store the bytes, and how to authenticate access.

## Decision

**Storage:** MinIO container in dev / production, S3 API. The bucket is **private** — no public read.

**Access:** images are served through an authenticated backend endpoint, **not directly from MinIO**:
- URL format: `/api/v1/images/{s3_key}` (legacy `/api/images/{s3_key}` aliased).
- Backend reads from MinIO inside `routers/notes.py:images_get` and streams to the client.
- The `<img>` tag can't send `Authorization` headers, so the URL accepts an `?token=<access_jwt>` query param. `injectImageToken()` and `stripImageToken()` in `api/client.ts` add/remove it before render / before persist.

**Image upload pipeline:**
1. Frontend resizes via canvas (1600px max side, JPEG q=0.85) to cap upload size.
2. Backend re-decodes with PIL `verify()` (anti-decompression-bomb), re-encodes (strips EXIF + invalid bytes), uploads.
3. Returns `{id, url, filename, size_bytes}`. The URL is what gets persisted into Tiptap content.

## Consequences

**Positive:**
- Database doesn't bloat with image bytes.
- Bucket can move to real S3 / R2 / Backblaze without code changes (same boto3 client).
- Authenticated read — leaked URL alone doesn't expose images (token is required and short-lived).

**Negative:**
- Backend bandwidth — every image hit goes through FastAPI. Acceptable for <100 active users; at scale we'd switch to S3 presigned URLs (already partially supported in `services/s3.py`).
- `?token=` in URL means tokens appear in nginx access logs. Accepted because access logs are not shipped externally; for CDN scenarios we'd need a different scheme (signed cookies, presigned URLs).

## Alternatives considered

- **Filesystem + nginx:** rejected — non-trivial to authenticate, tied to one-host deploy, painful to back up.
- **Postgres BYTEA:** rejected — bloats DB dumps, slow streaming.
- **Public S3 + obscure URLs:** rejected — security through obscurity; token query param + private bucket is the right model.
