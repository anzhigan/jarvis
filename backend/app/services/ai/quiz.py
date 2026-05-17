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
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.ai import AIJob, AIQuiz
from app.models.notes import Note, Topic, Way
from app.schemas.ai import QuizCreate, QuizQuestionOut
from app.services.ai.cache import QUIZ_ALL_MIN_NOTE_CHARS
from app.services.ai.embeddings import html_to_text
from app.services.ai.jobs import register_handler
from app.services.ai.ollama_client import OllamaClient

logger = logging.getLogger(__name__)


# Truncation budget for the note body. Qwen 3 8B has 32k context; we use
# ~6k chars (~1.5k tokens) for the note + budget for prompt + generation,
# leaving headroom and keeping latency predictable.
MAX_NOTE_CHARS = 6000

# All-notes quiz limits. Pick up to this many of the user's most-recently
# touched substantive notes; cap each excerpt and the total budget so the
# prompt stays within Qwen 3's effective context window.
QUIZ_ALL_MAX_NOTES = 8
QUIZ_ALL_PER_NOTE_CHARS = 1500
QUIZ_ALL_TOTAL_CHARS = 10000


SYSTEM_PROMPT = """\
/no_think

You are a study tutor. You generate multiple-choice recall questions \
from a study note. Hard rules:
1. EVERY output field (question, all four options, explanation, source_quote) \
must be written in the same language as the note. If the note is Russian, \
output 100% Russian. If English, output 100% English. Mixing is forbidden.
2. Each question has exactly 4 options labeled A, B, C, D, with exactly \
one correct answer.
3. Wrong options must be PLAUSIBLE distractors — same topic, similar format. \
Do NOT use random other facts from the note as wrong answers.
4. Output strictly valid JSON matching the schema. No prose, no markdown, \
no <think> blocks — go directly to JSON."""


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


def _build_all_notes_prompt(
    note_sections: list[tuple[str, str]],  # (title, body) per included note
    count: int,
    difficulty: str,
) -> str:
    """Multi-note variant of `_build_prompt`. Asks the model to distribute the
    `count` questions across the listed notes rather than focus on one."""
    combined = "\n".join(t + "\n" + b for t, b in note_sections)
    language = _detect_language(combined)
    difficulty_hint = {
        "easy":   "Easy: surface recall of explicitly stated facts.",
        "medium": "Medium: understanding + paraphrase. Plausible distractors.",
        "hard":   "Hard: synthesis across notes when natural.",
    }[difficulty]

    sections_str = "\n\n".join(
        f"=== Note {i + 1}: {title} ===\n{body}"
        for i, (title, body) in enumerate(note_sections)
    )

    return f"""\
LANGUAGE: write EVERY field (question, options A/B/C/D, explanation, \
source_quote) in {language}. Mixing languages is forbidden.

Generate {count} multiple-choice questions ({difficulty} difficulty) drawn \
from the {len(note_sections)} notes below. Distribute questions roughly \
evenly across notes — don't pull all of them from a single note.

{difficulty_hint}

Each question's `source_quote` MUST be a short verbatim phrase (≤ 150 chars) \
from one of the notes that supports the correct answer. If no exact phrase \
fits, use the empty string.

{sections_str}

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


async def _gather_all_notes(
    user_id: uuid.UUID,
    db: AsyncSession,
) -> list[tuple[str, str, uuid.UUID]]:
    """Pull the user's most-recently-edited substantive notes. Returns
    (title, plaintext-body, note_id) tuples in order of inclusion."""
    way_ids = list((await db.execute(
        select(Way.id).where(Way.user_id == user_id),
    )).scalars().all())
    topic_ids = list((await db.execute(
        select(Topic.id).join(Way, Topic.way_id == Way.id)
        .where(Way.user_id == user_id),
    )).scalars().all())
    if not way_ids and not topic_ids:
        return []

    notes_q = await db.execute(
        select(Note).where(
            or_(
                Note.way_id.in_(way_ids),
                Note.topic_id.in_(topic_ids),
                Note.topic_inline_id.in_(topic_ids),
            ),
            func.length(Note.content) >= QUIZ_ALL_MIN_NOTE_CHARS,
        )
        .order_by(Note.updated_at.desc())
        .limit(QUIZ_ALL_MAX_NOTES * 2),
    )
    out: list[tuple[str, str, uuid.UUID]] = []
    total = 0
    for n in notes_q.scalars().all():
        title = (n.name or "").strip() or "(untitled)"
        body = html_to_text(n.content or "")
        if not body.strip():
            continue
        if len(body) > QUIZ_ALL_PER_NOTE_CHARS:
            body = body[:QUIZ_ALL_PER_NOTE_CHARS] + "\n...[truncated]"
        if total + len(body) > QUIZ_ALL_TOTAL_CHARS:
            break
        out.append((title, body, n.id))
        total += len(body)
        if len(out) >= QUIZ_ALL_MAX_NOTES:
            break
    return out


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

    if params.scope.kind == "note":
        if params.scope.id is None:
            raise ValueError("scope.id is required for scope.kind='note'")
        note = await db.get(Note, params.scope.id)
        if note is None:
            raise ValueError("note not found")
        title = (note.name or "").strip() or "(untitled)"
        body = html_to_text(note.content)
        if not body.strip():
            raise ValueError("note has no text content to quiz on")
        if len(body) > MAX_NOTE_CHARS:
            body = body[:MAX_NOTE_CHARS] + "\n...[truncated]"
        prompt = _build_prompt(title, body, params.count, params.difficulty)
        scope_ref: dict[str, Any] = {"note_id": str(params.scope.id)}
        quiz_title = f"Quiz on «{title}»"
    elif params.scope.kind == "all":
        sections = await _gather_all_notes(job.user_id, db)
        if not sections:
            raise ValueError(
                "no substantive notes to quiz on — add a note with at least "
                f"{QUIZ_ALL_MIN_NOTE_CHARS} characters first",
            )
        prompt = _build_all_notes_prompt(
            [(t, b) for (t, b, _) in sections],
            params.count, params.difficulty,
        )
        scope_ref = {"note_ids": [str(nid) for (_, _, nid) in sections]}
        quiz_title = f"Quiz on {len(sections)} notes"
    else:
        raise ValueError(
            f"quiz handler supports scope.kind in ('note','all') "
            f"(got {params.scope.kind!r})",
        )

    # think=False — quiz generation is structured extraction, not reasoning.
    # Without this, Qwen 3 burns its token budget on a <think> block and
    # returns an empty `response` field, causing "empty response from model".
    raw = await ollama.generate(
        prompt, system=SYSTEM_PROMPT, json_mode=True, temperature=0.5, think=False,
    )
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
            retry_prompt, system=SYSTEM_PROMPT, json_mode=True, temperature=0.3, think=False,
        )
        questions = _parse_questions(raw)  # second failure propagates → job failed

    # Persist the quiz row. We dump back via model_dump() to normalize the
    # JSON shape (e.g. UUIDs become strings).
    quiz = AIQuiz(
        user_id=job.user_id,
        job_id=job.id,
        scope_kind=params.scope.kind,
        scope_ref=scope_ref,
        title=quiz_title,
        questions=[q.model_dump(mode="json") for q in questions],
        difficulty=params.difficulty,
    )
    db.add(quiz)
    await db.flush()

    logger.info("quiz generated: id=%s questions=%d scope=%s",
                quiz.id, len(questions), params.scope.kind)

    return {
        "quiz_id": str(quiz.id),
        "total_questions": len(questions),
        "title": quiz.title,
    }
