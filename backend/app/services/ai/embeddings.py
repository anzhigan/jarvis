"""Note embeddings — chunking, embed, persist.

Pipeline per note:
  1. Strip HTML (TipTap output) → plain text.
  2. Prepend the note name as a heading (boosts retrieval recall on title matches).
  3. Chunk by paragraph/sentence boundaries, ~1500 chars per chunk with 200 char overlap.
  4. Prefix each chunk with "search_document: " (required by nomic-embed-text).
  5. Embed in a single batch call.
  6. Delete existing rows for this note + bulk-insert new rows in one transaction.

This service is INTENTIONALLY synchronous-from-DB perspective — it accepts an
existing AsyncSession and does not commit. The caller (BackgroundTask) controls
the transaction.
"""
import re
from html.parser import HTMLParser

from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.ai import NoteEmbedding
from app.models.notes import Note
from app.services.ai.ollama_client import OllamaClient

# Sized for nomic-embed-text (8192 token max input). ~1500 chars ≈ 300-400
# tokens in mixed Russian/English — well within budget while keeping chunks
# semantically coherent (a small section, not the whole doc).
CHUNK_SIZE = 1500
CHUNK_OVERLAP = 200
MIN_CHUNK_LEN = 50

# Tags that imply a paragraph/block break — used by the HTML stripper to
# insert newlines so chunk boundaries line up with logical breaks.
_BLOCK_TAGS = {
    "p", "div", "br", "li", "ul", "ol",
    "h1", "h2", "h3", "h4", "h5", "h6",
    "blockquote", "pre", "hr", "tr", "td", "th",
}


class _HtmlToText(HTMLParser):
    """Minimal HTML stripper. Inserts \\n at block boundaries, preserves text."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self._parts: list[str] = []
        self._skip_data: int = 0  # nesting depth of <script>/<style>

    def handle_starttag(self, tag: str, _attrs) -> None:
        if tag in {"script", "style"}:
            self._skip_data += 1
            return
        if tag in _BLOCK_TAGS:
            self._parts.append("\n")

    def handle_endtag(self, tag: str) -> None:
        if tag in {"script", "style"}:
            self._skip_data = max(0, self._skip_data - 1)
            return
        if tag in _BLOCK_TAGS:
            self._parts.append("\n")

    def handle_data(self, data: str) -> None:
        if self._skip_data == 0:
            self._parts.append(data)

    @property
    def text(self) -> str:
        text = "".join(self._parts)
        text = re.sub(r"[ \t]+", " ", text)
        text = re.sub(r"\n{3,}", "\n\n", text)
        return text.strip()


def html_to_text(html: str | None) -> str:
    """Convert TipTap HTML to plain text suitable for embedding."""
    if not html:
        return ""
    parser = _HtmlToText()
    parser.feed(html)
    return parser.text


def chunk_text(
    text: str,
    chunk_size: int = CHUNK_SIZE,
    overlap: int = CHUNK_OVERLAP,
) -> list[tuple[int, int, str]]:
    """Split text into overlapping chunks aligned to natural boundaries.

    Returns list of (char_start, char_end, content) tuples. The (start, end)
    offsets reference the input `text` exactly, so callers can later quote
    the original passage in UI ("from your note at line X").
    """
    if not text:
        return []
    if len(text) <= chunk_size:
        return [(0, len(text), text)]

    chunks: list[tuple[int, int, str]] = []
    start = 0
    n = len(text)
    while start < n:
        end = min(start + chunk_size, n)

        # If we're not at the very end, look back for a clean break.
        # Window: last 300 chars before nominal end.
        if end < n:
            window_start = max(start + chunk_size - 300, start + chunk_size // 2)
            for marker in ("\n\n", "\n", ". ", "! ", "? ", "; "):
                idx = text.rfind(marker, window_start, end)
                if idx > 0:
                    end = idx + len(marker)
                    break

        content = text[start:end].strip()
        if len(content) >= MIN_CHUNK_LEN:
            chunks.append((start, end, content))

        if end >= n:
            break
        # Step forward, retaining `overlap` chars from this chunk's tail.
        start = max(end - overlap, start + 1)

    return chunks


class EmbeddingService:
    """Builds and persists chunk embeddings for notes."""

    def __init__(self, ollama: OllamaClient):
        self.ollama = ollama

    async def upsert_for_note(self, note: Note, db: AsyncSession) -> int:
        """Re-embed `note`. Deletes existing rows then bulk-inserts new ones.

        Returns the number of chunks written. 0 means the note had no
        embeddable content (empty body and empty name).
        """
        text = _build_embed_text(note)
        # Always wipe stale rows first — handles "user cleared note body".
        await db.execute(delete(NoteEmbedding).where(NoteEmbedding.note_id == note.id))

        chunks = chunk_text(text)
        if not chunks:
            return 0

        # nomic-embed-text expects "search_document: " prefix on indexed text.
        prefixed = [f"search_document: {c[2]}" for c in chunks]
        vectors = await self.ollama.embed(prefixed)

        for idx, ((char_start, char_end, content), vec) in enumerate(zip(chunks, vectors, strict=True)):
            db.add(NoteEmbedding(
                note_id=note.id,
                chunk_index=idx,
                content=content,
                char_start=char_start,
                char_end=char_end,
                embedding=vec,
                embed_model=settings.EMBED_MODEL,
            ))

        return len(chunks)


def _build_embed_text(note: Note) -> str:
    """Compose the text we embed for a note. Title weighs heavily for retrieval."""
    name = (note.name or "").strip()
    body = html_to_text(note.content)
    if name and body:
        return f"{name}\n\n{body}"
    return name or body
