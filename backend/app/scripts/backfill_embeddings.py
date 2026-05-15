"""One-shot backfill: build embeddings for every Note that doesn't have any.

Usage (from inside the api container):
    docker compose exec api python -m app.scripts.backfill_embeddings

Behavior:
  - Walks all notes in batches of 20 (small enough that one batch's embed
    call won't OOM Ollama on a heavy note, large enough to amortize cold
    start).
  - Skips notes that already have rows in note_embeddings (idempotent — safe
    to re-run after an interruption).
  - Pass --force to re-embed everything (use when changing embed model).

Designed to be safe on a live system: each note re-embed is its own
transaction, so partial progress is preserved if the script is killed.
"""
import argparse
import asyncio
import logging
import sys

from sqlalchemy import func, select

from app.core.database import AsyncSessionLocal
from app.models.ai import NoteEmbedding
from app.models.notes import Note
from app.services.ai.embeddings import EmbeddingService
from app.services.ai.ollama_client import OllamaClient, OllamaError

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
logger = logging.getLogger("backfill")


async def _has_embeddings(session, note_id) -> bool:
    r = await session.execute(
        select(func.count()).select_from(NoteEmbedding).where(NoteEmbedding.note_id == note_id),
    )
    return (r.scalar_one() or 0) > 0


async def run(force: bool) -> None:
    async with OllamaClient() as ollama:
        if not await ollama.health():
            logger.error("Ollama unreachable at %s", ollama._client.base_url)
            sys.exit(1)

        svc = EmbeddingService(ollama)

        async with AsyncSessionLocal() as session:
            total = (await session.execute(select(func.count()).select_from(Note))).scalar_one()
            logger.info("Backfill starting — %d notes total", total)

            processed = 0
            indexed = 0
            skipped = 0
            failed = 0

            # Stream IDs only to keep memory steady on large datasets.
            ids_result = await session.execute(select(Note.id))
            note_ids = [row[0] for row in ids_result.all()]

        for note_id in note_ids:
            async with AsyncSessionLocal() as session:
                note = await session.get(Note, note_id)
                if note is None:
                    continue
                if not force and await _has_embeddings(session, note.id):
                    skipped += 1
                else:
                    try:
                        count = await svc.upsert_for_note(note, session)
                        await session.commit()
                        indexed += 1
                        logger.info(
                            "[%d/%d] %s → %d chunks",
                            processed + 1, total, str(note.id)[:8], count,
                        )
                    except OllamaError as e:
                        await session.rollback()
                        failed += 1
                        logger.warning("[%d/%d] %s FAILED: %s", processed + 1, total, str(note.id)[:8], e)
                processed += 1

        logger.info(
            "Backfill done: %d indexed, %d skipped, %d failed (of %d total)",
            indexed, skipped, failed, total,
        )


def main() -> None:
    parser = argparse.ArgumentParser(description="Backfill note embeddings.")
    parser.add_argument(
        "--force", action="store_true",
        help="Re-embed even notes that already have embeddings.",
    )
    args = parser.parse_args()
    asyncio.run(run(force=args.force))


if __name__ == "__main__":
    main()
