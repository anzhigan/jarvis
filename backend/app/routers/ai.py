"""AI endpoints: quiz generation and chat with notes-as-context.

POST /ai/quiz       — generate a 5-10 question quiz from a set of notes
POST /ai/chat       — chat with the LLM grounded in note content (non-streaming JSON)
GET  /ai/status     — check LLM is configured
"""
import json
import logging
import uuid
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.core.config import settings
from app.models.notes import Note
from app.models.user import User
from app.services.llm import LLMError, chat_completion, html_to_plain

router = APIRouter(prefix="/ai", tags=["ai"])
logger = logging.getLogger(__name__)


# ─── schemas ────────────────────────────────────────────────────────────────

class QuizRequest(BaseModel):
    note_ids: list[uuid.UUID] = Field(min_length=1, max_length=10)
    num_questions: int = Field(default=5, ge=3, le=15)
    difficulty: Literal["easy", "medium", "hard"] = "medium"
    language: Literal["en", "ru"] = "en"


class QuizQuestion(BaseModel):
    id: str
    type: Literal["multiple_choice", "open"]
    question: str
    options: list[str] | None = None      # only for multiple_choice
    correct_index: int | None = None       # only for multiple_choice
    correct_answer: str | None = None      # for open questions: model answer
    explanation: str = ""


class QuizResponse(BaseModel):
    quiz_id: str
    questions: list[QuizQuestion]
    note_titles: list[str]


class ChatMessage(BaseModel):
    role: Literal["user", "assistant", "system"]
    content: str


class ChatRequest(BaseModel):
    note_ids: list[uuid.UUID] = Field(default_factory=list, max_length=10)
    history: list[ChatMessage] = Field(default_factory=list, max_length=30)
    message: str = Field(min_length=1, max_length=4000)
    language: Literal["en", "ru"] = "en"


class ChatResponse(BaseModel):
    reply: str


class StatusResponse(BaseModel):
    configured: bool
    model: str
    provider: str


class GradeRequest(BaseModel):
    question: str
    expected_answer: str
    user_answer: str
    language: Literal["en", "ru"] = "en"


class GradeResponse(BaseModel):
    correct: bool
    score: int                             # 0-100
    feedback: str


# ─── helpers ────────────────────────────────────────────────────────────────

async def _fetch_notes(note_ids: list[uuid.UUID], user: User, db: AsyncSession) -> list[Note]:
    if not note_ids:
        return []
    r = await db.execute(
        select(Note).where(Note.id.in_(note_ids), Note.user_id == user.id)
    )
    notes = list(r.scalars().all())
    if len(notes) != len(set(note_ids)):
        raise HTTPException(404, "One or more notes not found")
    return notes


def _build_notes_context(notes: list[Note], char_budget: int = 12000) -> tuple[str, list[str]]:
    """Concatenate notes into a single context string. Truncates if too long."""
    titles: list[str] = []
    parts: list[str] = []
    used = 0
    for n in notes:
        title = n.title or "Untitled"
        body = html_to_plain(n.content or "")
        titles.append(title)
        chunk = f"## {title}\n{body}\n"
        if used + len(chunk) > char_budget:
            remaining = char_budget - used
            if remaining > 200:
                parts.append(chunk[:remaining] + "…")
            break
        parts.append(chunk)
        used += len(chunk)
    return "\n".join(parts), titles


# ─── endpoints ──────────────────────────────────────────────────────────────

@router.get("/status", response_model=StatusResponse)
async def ai_status(_: User = Depends(get_current_user)):
    base = settings.LLM_BASE_URL
    if "groq" in base:
        provider = "Groq"
    elif "openai" in base:
        provider = "OpenAI"
    elif "together" in base:
        provider = "Together"
    elif "anthropic" in base:
        provider = "Anthropic"
    elif "11434" in base or "ollama" in base.lower():
        provider = "Ollama (local)"
    else:
        provider = "Custom"
    return StatusResponse(
        configured=bool(settings.LLM_API_KEY),
        model=settings.LLM_MODEL,
        provider=provider,
    )


@router.post("/quiz", response_model=QuizResponse)
async def generate_quiz(
    body: QuizRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    notes = await _fetch_notes(body.note_ids, user, db)
    context, titles = _build_notes_context(notes)
    if not context.strip():
        raise HTTPException(400, "Selected notes are empty")

    lang_instr = (
        "Write all questions, options and explanations in Russian." if body.language == "ru"
        else "Write all questions, options and explanations in English."
    )
    difficulty_instr = {
        "easy": "Use easy, recall-style questions. Avoid trick wording.",
        "medium": "Use a mix of recall and conceptual questions.",
        "hard": "Use challenging conceptual and applied questions that require synthesis.",
    }[body.difficulty]

    system = (
        "You are a tutor that creates quizzes from study notes. "
        "Output STRICT JSON only, matching this schema:\n"
        "{\n"
        '  "questions": [\n'
        '    {"type":"multiple_choice","question":"...","options":["A","B","C","D"],"correct_index":0,"explanation":"..."},\n'
        '    {"type":"open","question":"...","correct_answer":"...","explanation":"..."}\n'
        "  ]\n"
        "}\n"
        "Mix multiple_choice and open questions roughly 70/30. "
        "Each multiple_choice has exactly 4 options. "
        f"{lang_instr} {difficulty_instr}"
    )
    user_msg = (
        f"Generate {body.num_questions} questions to test understanding of the following notes. "
        "Base questions only on the content provided. Do not invent facts.\n\n"
        f"=== NOTES ===\n{context}"
    )

    try:
        raw = await chat_completion(
            [{"role": "system", "content": system}, {"role": "user", "content": user_msg}],
            temperature=0.5,
            response_format_json=True,
        )
    except LLMError as e:
        logger.exception("Quiz generation failed")
        raise HTTPException(502, str(e)) from e

    try:
        # Some providers wrap in markdown — strip
        cleaned = raw.strip()
        if cleaned.startswith("```"):
            cleaned = cleaned.split("```", 2)[1]
            if cleaned.startswith("json"):
                cleaned = cleaned[4:]
            cleaned = cleaned.rsplit("```", 1)[0].strip()
        parsed = json.loads(cleaned)
    except json.JSONDecodeError as e:
        raise HTTPException(502, f"LLM returned invalid JSON: {e}") from e

    qs_raw = parsed.get("questions", [])
    if not isinstance(qs_raw, list) or not qs_raw:
        raise HTTPException(502, "LLM returned no questions")

    questions: list[QuizQuestion] = []
    for i, q in enumerate(qs_raw):
        if not isinstance(q, dict):
            continue
        qtype = q.get("type", "open")
        if qtype not in {"multiple_choice", "open"}:
            qtype = "open"
        try:
            if qtype == "multiple_choice":
                opts = q.get("options") or []
                if not isinstance(opts, list) or len(opts) < 2:
                    continue
                ci = q.get("correct_index")
                if not isinstance(ci, int) or ci < 0 or ci >= len(opts):
                    continue
                questions.append(QuizQuestion(
                    id=f"q{i}",
                    type="multiple_choice",
                    question=str(q.get("question", "")),
                    options=[str(o) for o in opts],
                    correct_index=ci,
                    explanation=str(q.get("explanation", "")),
                ))
            else:
                questions.append(QuizQuestion(
                    id=f"q{i}",
                    type="open",
                    question=str(q.get("question", "")),
                    correct_answer=str(q.get("correct_answer", "")),
                    explanation=str(q.get("explanation", "")),
                ))
        except Exception:
            continue

    if not questions:
        raise HTTPException(502, "Failed to parse any valid questions from LLM")

    return QuizResponse(
        quiz_id=str(uuid.uuid4()),
        questions=questions,
        note_titles=titles,
    )


@router.post("/chat", response_model=ChatResponse)
async def chat_with_notes(
    body: ChatRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    notes = await _fetch_notes(body.note_ids, user, db) if body.note_ids else []
    context, titles = _build_notes_context(notes) if notes else ("", [])

    lang_instr = "Reply in Russian." if body.language == "ru" else "Reply in English."
    if context:
        system = (
            "You are a study companion. Answer the user's questions based on the following notes. "
            "If a question goes beyond the notes, say so but still try to be helpful. "
            "Be concise — 1-3 short paragraphs unless asked for more detail. "
            f"{lang_instr}\n\n"
            f"=== NOTES ===\n{context}"
        )
    else:
        system = (
            "You are a helpful study companion. The user has not selected any specific notes. "
            "Answer concisely. " + lang_instr
        )

    messages: list[dict] = [{"role": "system", "content": system}]
    for m in body.history[-12:]:  # cap history
        messages.append({"role": m.role, "content": m.content})
    messages.append({"role": "user", "content": body.message})

    try:
        reply = await chat_completion(messages, temperature=0.4)
    except LLMError as e:
        logger.exception("Chat failed")
        raise HTTPException(502, str(e)) from e

    return ChatResponse(reply=reply.strip())


@router.post("/grade", response_model=GradeResponse)
async def grade_open_answer(
    body: GradeRequest,
    _: User = Depends(get_current_user),
):
    """Grade an open-ended answer against an expected answer."""
    lang_instr = "Reply in Russian." if body.language == "ru" else "Reply in English."
    system = (
        "You are a strict but fair grader. Judge whether the student's answer demonstrates "
        "the same understanding as the expected answer. Output STRICT JSON: "
        '{"score": <0-100>, "feedback": "<1-2 sentences>"}. '
        "score >= 70 means correct. " + lang_instr
    )
    user_msg = (
        f"Question: {body.question}\n\n"
        f"Expected answer: {body.expected_answer}\n\n"
        f"Student's answer: {body.user_answer}"
    )
    try:
        raw = await chat_completion(
            [{"role": "system", "content": system}, {"role": "user", "content": user_msg}],
            temperature=0.0,
            response_format_json=True,
        )
    except LLMError as e:
        raise HTTPException(502, str(e)) from e

    try:
        cleaned = raw.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
        parsed = json.loads(cleaned)
        score = int(parsed.get("score", 0))
        feedback = str(parsed.get("feedback", ""))
    except (json.JSONDecodeError, ValueError, TypeError):
        # Fallback: best-effort
        score = 50
        feedback = raw[:200]

    return GradeResponse(correct=score >= 70, score=score, feedback=feedback)
