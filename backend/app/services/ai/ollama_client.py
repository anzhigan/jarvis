"""Thin async wrapper around the Ollama HTTP API.

Two endpoints we care about:
  POST /api/embed     — batch text → embedding vectors
  POST /api/generate  — prompt → response (with optional JSON-mode)

Lifecycle: construct per request OR share across the app via a singleton.
We use per-request construction for simplicity; httpx.AsyncClient has
keep-alive pools, so connection reuse within a single client is preserved
but cold-start cost is ~5ms per request. Acceptable for our use case where
LLM calls take 30-90 seconds anyway.

Errors: all transport/HTTP errors are wrapped in OllamaError. Callers
should catch this and degrade gracefully (job marked failed, user sees
"AI offline" message).
"""
from typing import Optional

import httpx

from app.core.config import settings


class OllamaError(Exception):
    """Raised when an Ollama call fails for any reason (network, HTTP, parsing)."""


class OllamaClient:
    """Async client for the Ollama HTTP API.

    Usage:
        async with OllamaClient() as ollama:
            vecs = await ollama.embed(["hello world"])
            answer = await ollama.generate("Write a haiku")
    """

    def __init__(self, base_url: Optional[str] = None, timeout: Optional[int] = None):
        self._client = httpx.AsyncClient(
            base_url=base_url or settings.OLLAMA_URL,
            timeout=timeout or settings.LLM_REQUEST_TIMEOUT_S,
        )

    async def __aenter__(self) -> "OllamaClient":
        return self

    async def __aexit__(self, *_exc) -> None:
        await self._client.aclose()

    async def aclose(self) -> None:
        await self._client.aclose()

    async def embed(
        self,
        texts: list[str],
        model: Optional[str] = None,
    ) -> list[list[float]]:
        """Return embedding vectors for `texts`. Order matches input.

        For nomic-embed-text, callers should prefix each text with
        "search_document: " (for indexing) or "search_query: " (for querying)
        — the model was trained on these prefixes. This client does NOT
        apply prefixes; EmbeddingService handles that.
        """
        model = model or settings.EMBED_MODEL
        if not texts:
            return []
        try:
            r = await self._client.post(
                "/api/embed",
                json={"model": model, "input": texts},
            )
            r.raise_for_status()
            data = r.json()
        except httpx.HTTPError as e:
            # str(e) is empty for timeouts — include the class name so the job
            # error string is actually informative.
            raise OllamaError(f"embed call failed: {type(e).__name__}: {e}") from e

        embeddings = data.get("embeddings")
        if not embeddings or len(embeddings) != len(texts):
            raise OllamaError(
                f"embed returned {len(embeddings) if embeddings else 0} vectors "
                f"for {len(texts)} inputs",
            )
        return embeddings

    async def generate(
        self,
        prompt: str,
        *,
        model: Optional[str] = None,
        system: Optional[str] = None,
        json_mode: bool = False,
        temperature: float = 0.4,
        think: Optional[bool] = None,
    ) -> str:
        """Single-turn completion. Returns the raw text response.

        `json_mode=True` instructs Ollama to constrain output to valid JSON.
        Caller is still responsible for parsing — `json_mode` only ensures
        well-formed-ish JSON, not schema compliance.

        `think`: Qwen 3 (and other reasoning models) generate a hidden chain-
        of-thought by default. For structured-output tasks (quiz, tasks
        extraction, schedule) we PASS think=False — the model would otherwise
        burn its token budget on the chain-of-thought and return an empty
        `response` field. For tasks where reasoning quality matters (weekly
        insights), pass think=True (or None to keep model default).
        """
        model = model or settings.LLM_MODEL
        payload: dict = {
            "model": model,
            "prompt": prompt,
            "stream": False,
            "options": {"temperature": temperature},
        }
        if system:
            payload["system"] = system
        if json_mode:
            payload["format"] = "json"
        if think is not None:
            payload["think"] = think
        try:
            r = await self._client.post("/api/generate", json=payload)
            r.raise_for_status()
            data = r.json()
        except httpx.HTTPError as e:
            raise OllamaError(f"generate call failed: {type(e).__name__}: {e}") from e
        return data.get("response", "")

    async def health(self) -> bool:
        """Quick probe — used by /health/ai endpoint and AI router guards."""
        try:
            r = await self._client.get("/api/tags", timeout=3.0)
            return r.status_code == 200
        except httpx.HTTPError:
            return False
