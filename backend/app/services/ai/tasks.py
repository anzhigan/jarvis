"""Background tasks for AI features.

These run AFTER the HTTP response is sent (via FastAPI BackgroundTasks).
They open their own DB session because the request session has been closed
by the time we run.

Failures here MUST NOT raise into a user-visible error path — we log and
move on. Worst case: a note's embeddings get stale; next save will re-fix.
"""
import logging
import uuid

from app.core.database import AsyncSessionLocal
from app.models.notes import Note
from app.services.ai.embeddings import EmbeddingService
from app.services.ai.ollama_client import OllamaClient, OllamaError

logger = logging.getLogger(__name__)


async def reembed_note_task(note_id: uuid.UUID) -> None:
    """Re-compute embeddings for a single note. Called via BackgroundTasks
    after Note create/update. Safe to fail — we just log.
    """
    try:
        async with AsyncSessionLocal() as db:
            note = await db.get(Note, note_id)
            if note is None:
                return  # deleted between request and task run
            async with OllamaClient() as ollama:
                svc = EmbeddingService(ollama)
                count = await svc.upsert_for_note(note, db)
            await db.commit()
            logger.info("reembed_note: note=%s chunks=%d", note_id, count)
    except OllamaError as e:
        logger.warning("reembed_note: ollama failed for note=%s: %s", note_id, e)
    except Exception:
        logger.exception("reembed_note: unexpected failure for note=%s", note_id)
