"""Vector retrieval over note embeddings.

This service is scope-AGNOSTIC: callers pass in a precomputed list of
note_ids (the scope expansion lives in the AI router, where it has access
to user ownership rules). RetrievalService just does:

    embed(query) → top-K cosine-similar chunks restricted to note_ids → join
    Note metadata → return hits with source attribution.

Used by:
  - Phase 4: cross-notes Smart test (build prompt with retrieved chunks)
  - Phase 5: Generate tasks (find related context across the user's notes)
"""
import uuid
from typing import TypedDict

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.ai import NoteEmbedding
from app.models.notes import Note
from app.services.ai.ollama_client import OllamaClient


class RetrievalHit(TypedDict):
    chunk_id: str
    note_id: str
    note_title: str
    content: str
    char_start: int
    char_end: int
    distance: float  # cosine distance, lower = more similar (0 = identical)


class RetrievalService:
    def __init__(self, ollama: OllamaClient, db: AsyncSession):
        self.ollama = ollama
        self.db = db

    async def search(
        self,
        query: str,
        note_ids: list[uuid.UUID],
        top_k: int = 8,
    ) -> list[RetrievalHit]:
        """Top-K most similar chunks within the given note_ids.

        Returns an empty list if note_ids is empty (no scope) — callers
        should treat this as a no-op, not an error.
        """
        if not note_ids or not query.strip():
            return []

        # nomic-embed-text expects "search_query: " prefix on queries.
        qvecs = await self.ollama.embed([f"search_query: {query}"])
        qvec = qvecs[0]

        # Use pgvector's cosine_distance — operator is `<=>`. Lower = more similar.
        distance = NoteEmbedding.embedding.cosine_distance(qvec)
        stmt = (
            select(NoteEmbedding, Note, distance.label("dist"))
            .join(Note, NoteEmbedding.note_id == Note.id)
            .where(NoteEmbedding.note_id.in_(note_ids))
            .order_by(distance)
            .limit(top_k)
        )
        result = await self.db.execute(stmt)
        hits: list[RetrievalHit] = []
        for emb, note, dist in result.all():
            hits.append({
                "chunk_id": str(emb.id),
                "note_id": str(note.id),
                "note_title": note.name,
                "content": emb.content,
                "char_start": emb.char_start,
                "char_end": emb.char_end,
                "distance": float(dist),
            })
        return hits
