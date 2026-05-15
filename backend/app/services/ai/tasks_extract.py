"""Tasks-extract handler — pull action items out of a note.

Output is a list of {title, quote} pairs. The user reviews them in the UI
and picks which ones to actually commit as Go items (POST /ai/tasks/commit).

We do NOT auto-create anything — only suggest. This is the core trust
mechanic: AI fills the picker, user owns what enters the system.
"""
import json
import logging
from typing import Any

from pydantic import ValidationError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.ai import AIJob
from app.models.notes import Note
from app.schemas.ai import TaskItem, TasksExtractCreate
from app.services.ai.embeddings import html_to_text
from app.services.ai.jobs import register_handler
from app.services.ai.ollama_client import OllamaClient

logger = logging.getLogger(__name__)

MAX_NOTE_CHARS = 6000
MAX_ITEMS = 10

SYSTEM_PROMPT = """\
/no_think

You are a productivity assistant. Given a study/work note, find concrete \
ACTION ITEMS — things the author needs or wants to do. Hard rules:
1. EVERY field (title, quote) must be written in the same language as the \
note. If the note is Russian, output Russian. If English, output English. \
Mixing is forbidden.
2. Titles must be short (≤ 80 chars), imperative form: \"Set up CI pipeline\", \
\"Прочитать главу 3\". NOT \"I should...\" or \"The author wants to...\".
3. `quote` is a verbatim phrase from the note that triggered the item (≤ 150 \
chars). If no clear phrase, use empty string.
4. Output STRICTLY valid JSON. No prose, no markdown, no <think> blocks.
5. If the note has no action items (it's just facts/notes), return an empty \
items array."""


def _build_prompt(title: str, body: str) -> str:
    return f"""\
Find up to {MAX_ITEMS} action items in the note below.

An action item is something concrete the author should DO — a task, a TODO, \
a follow-up, a decision to make. NOT a fact, NOT a quote, NOT a description.

Note title: {title}

Note content:
\"\"\"
{body}
\"\"\"

Respond with JSON of this exact shape:
{{
  "items": [
    {{
      "title": "Short imperative action",
      "quote": "exact phrase from the note that mentioned this"
    }}
  ]
}}"""


def _parse_items(raw: str) -> list[TaskItem]:
    if not raw or not raw.strip():
        raise ValueError("empty response from model")
    text = raw.strip()
    if text.startswith("```"):
        text = text.strip("`")
        if text.startswith("json"):
            text = text[4:]
        text = text.strip()
    try:
        data = json.loads(text)
    except json.JSONDecodeError as e:
        raise ValueError(f"model returned invalid JSON: {e}") from e

    items_raw = data.get("items") if isinstance(data, dict) else None
    if items_raw is None:
        raise ValueError("missing 'items' array in model response")
    if not isinstance(items_raw, list):
        raise ValueError("'items' must be an array")

    items: list[TaskItem] = []
    for i, it in enumerate(items_raw):
        try:
            items.append(TaskItem.model_validate(it))
        except ValidationError as e:
            raise ValueError(f"item {i} fails schema: {e.errors()[:2]}") from e
    return items


@register_handler("tasks_extract")
async def run_tasks_extract_job(
    job: AIJob,
    db: AsyncSession,
    ollama: OllamaClient,
) -> dict[str, Any]:
    try:
        params = TasksExtractCreate.model_validate(job.input_json)
    except ValidationError as e:
        raise ValueError(f"invalid tasks_extract input: {e.errors()[:2]}") from e

    note = await db.get(Note, params.scope.id)
    if note is None:
        raise ValueError("note not found")

    title = (note.name or "").strip() or "(untitled)"
    body = html_to_text(note.content)
    if not body.strip():
        raise ValueError("note has no text content to extract from")
    if len(body) > MAX_NOTE_CHARS:
        body = body[:MAX_NOTE_CHARS] + "\n...[truncated]"

    prompt = _build_prompt(title, body)
    raw = await ollama.generate(
        prompt, system=SYSTEM_PROMPT, json_mode=True, temperature=0.3, think=False,
    )
    try:
        items = _parse_items(raw)
    except ValueError as e:
        logger.warning("tasks_extract parse failed (first try): %s — retrying", e)
        retry_prompt = prompt + "\n\nREMINDER: respond with ONLY a JSON object."
        raw = await ollama.generate(
            retry_prompt, system=SYSTEM_PROMPT, json_mode=True, temperature=0.2, think=False,
        )
        items = _parse_items(raw)

    logger.info("tasks_extract: note=%s found=%d", params.scope.id, len(items))

    return {
        "items": [it.model_dump(mode="json") for it in items],
        "source_note_id": str(params.scope.id),
        "source_note_title": title,
    }
