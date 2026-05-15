"""Quiz handler — generates multiple-choice questions from a note.

Phase 3 supports scope.kind == 'note' only. Phase 4 will add cross-notes
(topic/way/tag/multi/recent) using RAG.

Flow:
  1. Load the note. 404 → fail.
  2. Strip HTML to plain text. Empty → fail with "note is empty".
  3. Build prompt with title + content + difficulty + count.
  4. Call ollama.generate with format=json.
  5. Parse + validate JSON. Bad shape → retry once with stricter prompt.
     Second failure → mark job failed.
  6. Persist as AIQuiz row. Return {quiz_id} as job output.

The output JSON shape is enforced via Pydantic (QuizQuestionOut) after
parsing — we never trust the model to follow the schema literally.
"""
import json
import logging
import uuid
from typing import Any

from pydantic import ValidationError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.ai import AIJob, AIQuiz
from app.models.notes import Note
from app.schemas.ai import QuizCreate, QuizQuestionOut
from app.services.ai.embeddings import html_to_text
from app.services.ai.jobs import register_handler
from app.services.ai.ollama_client import OllamaClient

logger = logging.getLogger(__name__)


# Truncation budget for the note body. Qwen 3 8B has 32k context; we use
# ~6k chars (~1.5k tokens) for the note + budget for prompt + generation,
# leaving headroom and keeping latency predictable.
MAX_NOTE_CHARS = 6000


SYSTEM_PROMPT = """\
You are a study tutor. You generate multiple-choice recall questions \
from a study note. Hard rules:
1. EVERY output field (question, all four options, explanation, source_quote) \
must be written in the same language as the note. If the note is Russian, \
output 100% Russian. If English, output 100% English. Mixing is forbidden.
2. Each question has exactly 4 options labeled A, B, C, D, with exactly \
one correct answer.
3. Wrong options must be PLAUSIBLE distractors — same topic, similar format. \
Do NOT use random other facts from the note as wrong answers.
4. Output strictly valid JSON matching the schema. No prose, no markdown."""


def _detect_language(text: str) -> str:
    """Crude language hint based on Cyrillic char ratio.

    We pass this to the model as an explicit directive — Qwen otherwise tends
    to slip into English for question stems even when the body is Russian.
    """
    sample = text[:2000]
    if not sample:
        return "the language of the note"
    cyrillic = sum(1 for c in sample if "Ѐ" <= c <= "ӿ")
    letters = sum(1 for c in sample if c.isalpha())
    if letters and cyrillic / letters > 0.30:
        return "Russian (русский)"
    return "English"


def _build_prompt(title: str, body: str, count: int, difficulty: str) -> str:
    language = _detect_language(title + "\n" + body)
    difficulty_hint = {
        "easy": (
            "Easy: test surface recall of facts and terms explicitly stated in the note. "
            "Wrong options should be obviously different from the correct one."
        ),
        "medium": (
            "Medium: test understanding and application — paraphrase ideas, ask why "
            "things are designed a certain way. Wrong options should be plausible at a glance."
        ),
        "hard": (
            "Hard: test synthesis and edge cases. Force the reader to connect multiple "
            "ideas from the note. Wrong options should sound correct to someone who only "
            "skimmed the note."
        ),
    }[difficulty]

    return f"""\
LANGUAGE: write EVERY field (question, options A/B/C/D, explanation, source_quote) \
in {language}. Mixing languages is forbidden.

Generate {count} multiple-choice questions ({difficulty} difficulty) from the note below.

{difficulty_hint}

Each question's `source_quote` MUST be a short verbatim phrase (≤ 150 chars) from the \
note that supports the correct answer. If no exact phrase fits, use the empty string.

Note title: {title}

Note content:
\"\"\"
{body}
\"\"\"

Respond with JSON of this exact shape:
{{
  "questions": [
    {{
      "question": "...",
      "options": {{"A": "...", "B": "...", "C": "...", "D": "..."}},
      "correct": "A",
      "explanation": "...",
      "source_quote": "..."
    }}
  ]
}}"""


def _parse_questions(raw: str) -> list[QuizQuestionOut]:
    """Parse model output → validated list. Raises ValueError on malformed."""
    if not raw or not raw.strip():
        raise ValueError("empty response from model")

    # Best-effort: model might wrap JSON in ```json fences despite format=json.
    text = raw.strip()
    if text.startswith("```"):
        text = text.strip("`")
        # Strip optional "json" lang tag at the start
        if text.startswith("json"):
            text = text[4:]
        text = text.strip()

    try:
        data = json.loads(text)
    except json.JSONDecodeError as e:
        raise ValueError(f"model returned invalid JSON: {e}") from e

    questions_raw = data.get("questions") if isinstance(data, dict) else None
    if not isinstance(questions_raw, list) or not questions_raw:
        raise ValueError("missing or empty 'questions' array in model response")

    questions: list[QuizQuestionOut] = []
    for i, q in enumerate(questions_raw):
        try:
            questions.append(QuizQuestionOut.model_validate(q))
        except ValidationError as e:
            raise ValueError(f"question {i} fails schema: {e.errors()[:2]}") from e
    return questions


@register_handler("quiz")
async def run_quiz_job(
    job: AIJob,
    db: AsyncSession,
    ollama: OllamaClient,
) -> dict[str, Any]:
    # Validate input via the Pydantic schema (raises → handler catches in jobs.run_job).
    try:
        params = QuizCreate.model_validate(job.input_json)
    except ValidationError as e:
        raise ValueError(f"invalid quiz input: {e.errors()[:2]}") from e

    if params.scope.kind != "note":
        raise ValueError(
            f"quiz handler supports scope.kind='note' only in Phase 3 "
            f"(got {params.scope.kind!r}). Cross-notes coming in Phase 4.",
        )
    if params.scope.id is None:
        raise ValueError("scope.id is required for scope.kind='note'")

    note = await db.get(Note, params.scope.id)
    if note is None:
        raise ValueError("note not found")
    # Ownership check via the User model — note is owned via way/topic chain.
    # We trust the caller (router) to have validated this; but a belt-and-braces
    # check would be: walk the way to its user_id. Skipping for Phase 3 since the
    # job carries user_id and a malicious user can't enqueue someone else's note
    # without first knowing its UUID.

    title = (note.name or "").strip() or "(untitled)"
    body = html_to_text(note.content)
    if not body.strip():
        raise ValueError("note has no text content to quiz on")

    if len(body) > MAX_NOTE_CHARS:
        body = body[:MAX_NOTE_CHARS] + "\n...[truncated]"

    prompt = _build_prompt(title, body, params.count, params.difficulty)

    raw = await ollama.generate(prompt, system=SYSTEM_PROMPT, json_mode=True, temperature=0.5)
    try:
        questions = _parse_questions(raw)
    except ValueError as e:
        # One retry with an even more explicit prompt — sometimes the model
        # forgets format=json on edge inputs.
        logger.warning("quiz parse failed (first try): %s — retrying", e)
        retry_prompt = (
            prompt
            + "\n\nREMINDER: respond with ONLY a JSON object. No prose, no markdown."
        )
        raw = await ollama.generate(
            retry_prompt, system=SYSTEM_PROMPT, json_mode=True, temperature=0.3,
        )
        questions = _parse_questions(raw)  # second failure propagates → job failed

    # Persist the quiz row. We dump back via model_dump() to normalize the
    # JSON shape (e.g. UUIDs become strings).
    quiz = AIQuiz(
        user_id=job.user_id,
        job_id=job.id,
        scope_kind="note",
        scope_ref={"note_id": str(params.scope.id)},
        title=f"Quiz on «{title}»",
        questions=[q.model_dump(mode="json") for q in questions],
        difficulty=params.difficulty,
    )
    db.add(quiz)
    await db.flush()

    logger.info("quiz generated: id=%s questions=%d note=%s",
                quiz.id, len(questions), params.scope.id)

    return {
        "quiz_id": str(quiz.id),
        "total_questions": len(questions),
        "title": quiz.title,
    }
