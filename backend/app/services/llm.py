"""Thin wrapper around an OpenAI-compatible chat completions endpoint.

Works with OpenAI, Groq, Together, Anthropic (via compat layer), Ollama, etc.
"""
import json
import logging
from typing import AsyncIterator

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)


class LLMError(Exception):
    pass


async def chat_completion(
    messages: list[dict],
    *,
    temperature: float = 0.4,
    max_tokens: int | None = None,
    response_format_json: bool = False,
) -> str:
    """Non-streaming chat completion. Returns full assistant message."""
    if not settings.LLM_API_KEY:
        raise LLMError("LLM_API_KEY is not configured. Please set it in backend .env")

    url = settings.LLM_BASE_URL.rstrip("/") + "/chat/completions"
    payload: dict = {
        "model": settings.LLM_MODEL,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens or settings.LLM_MAX_TOKENS,
    }
    if response_format_json:
        # OpenAI-compatible servers use response_format={"type": "json_object"}
        payload["response_format"] = {"type": "json_object"}

    headers = {
        "Authorization": f"Bearer {settings.LLM_API_KEY}",
        "Content-Type": "application/json",
    }

    async with httpx.AsyncClient(timeout=settings.LLM_TIMEOUT) as client:
        try:
            r = await client.post(url, json=payload, headers=headers)
            r.raise_for_status()
        except httpx.HTTPStatusError as e:
            body = e.response.text[:500] if e.response else ""
            raise LLMError(f"LLM HTTP {e.response.status_code}: {body}") from e
        except httpx.HTTPError as e:
            raise LLMError(f"LLM request failed: {e}") from e

    data = r.json()
    try:
        return data["choices"][0]["message"]["content"]
    except (KeyError, IndexError) as e:
        raise LLMError(f"Unexpected LLM response shape: {data}") from e


async def stream_chat(
    messages: list[dict],
    *,
    temperature: float = 0.4,
    max_tokens: int | None = None,
) -> AsyncIterator[str]:
    """Streaming chat. Yields text deltas."""
    if not settings.LLM_API_KEY:
        raise LLMError("LLM_API_KEY is not configured.")

    url = settings.LLM_BASE_URL.rstrip("/") + "/chat/completions"
    payload = {
        "model": settings.LLM_MODEL,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens or settings.LLM_MAX_TOKENS,
        "stream": True,
    }
    headers = {
        "Authorization": f"Bearer {settings.LLM_API_KEY}",
        "Content-Type": "application/json",
    }

    async with httpx.AsyncClient(timeout=settings.LLM_TIMEOUT) as client:
        async with client.stream("POST", url, json=payload, headers=headers) as r:
            if r.status_code >= 400:
                body = await r.aread()
                raise LLMError(f"LLM HTTP {r.status_code}: {body[:500].decode(errors='replace')}")
            async for line in r.aiter_lines():
                if not line or not line.startswith("data:"):
                    continue
                chunk = line.removeprefix("data:").strip()
                if chunk == "[DONE]":
                    break
                try:
                    obj = json.loads(chunk)
                    delta = obj.get("choices", [{}])[0].get("delta", {}).get("content")
                    if delta:
                        yield delta
                except json.JSONDecodeError:
                    continue


def html_to_plain(html: str) -> str:
    """Quick-and-dirty HTML -> plain text for feeding notes to LLM."""
    import re
    # Strip tags
    text = re.sub(r"<[^>]+>", " ", html or "")
    # Decode common entities
    text = (
        text.replace("&nbsp;", " ")
            .replace("&amp;", "&")
            .replace("&lt;", "<")
            .replace("&gt;", ">")
            .replace("&quot;", '"')
            .replace("&#39;", "'")
    )
    # Collapse whitespace
    text = re.sub(r"\s+", " ", text).strip()
    return text
