import { useEffect, useMemo, useRef, useState } from 'react';
import {
  X, Brain, Loader2, Send, CheckCircle2, XCircle, ChevronRight, RotateCw, Sparkles,
  MessageSquare, GraduationCap, AlertCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { aiApi } from '../api/client';
import type { AIQuiz, AIQuizQuestion } from '../api/client';
import type { Note } from '../api/types';
import { useT, useLangStore } from '../store/i18n';

// ─── Note picker (multi-select with search) ─────────────────────────────────

interface FlatNote { id: string; title: string; path: string; }

function pickNotes(allNotes: FlatNote[], selectedIds: Set<string>, onToggle: (id: string) => void, searchValue: string, setSearchValue: (s: string) => void, t: (k: string) => string) {
  const filtered = searchValue.trim()
    ? allNotes.filter((n) =>
        n.title.toLowerCase().includes(searchValue.toLowerCase()) ||
        n.path.toLowerCase().includes(searchValue.toLowerCase()))
    : allNotes;
  return (
    <div className="flex flex-col gap-2 min-h-0">
      <input
        type="text"
        value={searchValue}
        onChange={(e) => setSearchValue(e.target.value)}
        placeholder={t('common.search') + '...'}
        className="h-9 px-3 text-sm bg-input-background border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-ring/30 focus:border-ring"
      />
      <div className="flex-1 overflow-y-auto border border-border rounded-md min-h-[160px] max-h-[280px]">
        {filtered.length === 0 ? (
          <div className="py-6 text-center text-xs text-muted-foreground">No notes</div>
        ) : (
          filtered.map((n) => (
            <label
              key={n.id}
              className={`flex items-center gap-2 px-3 py-2 text-sm border-b border-border last:border-b-0 cursor-pointer transition-colors ${
                selectedIds.has(n.id) ? 'bg-primary/5' : 'hover:bg-secondary'
              }`}
            >
              <input
                type="checkbox"
                checked={selectedIds.has(n.id)}
                onChange={() => onToggle(n.id)}
                className="flex-shrink-0"
              />
              <div className="flex-1 min-w-0">
                <div className="truncate font-medium">{n.title || 'Untitled'}</div>
                <div className="text-[11px] text-muted-foreground truncate">{n.path}</div>
              </div>
            </label>
          ))
        )}
      </div>
      <div className="text-[11px] text-muted-foreground">
        {selectedIds.size} selected
      </div>
    </div>
  );
}

// ─── Quiz mode ──────────────────────────────────────────────────────────────

function QuizMode({ allNotes, t, lang, onClose }: {
  allNotes: FlatNote[];
  t: (k: string, vars?: any) => string;
  lang: 'en' | 'ru';
  onClose: () => void;
}) {
  const [phase, setPhase] = useState<'setup' | 'quiz' | 'result'>('setup');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [searchValue, setSearchValue] = useState('');
  const [numQuestions, setNumQuestions] = useState(5);
  const [difficulty, setDifficulty] = useState<'easy' | 'medium' | 'hard'>('medium');
  const [loading, setLoading] = useState(false);
  const [quiz, setQuiz] = useState<AIQuiz | null>(null);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, { value: string; correct: boolean | null; feedback?: string; score?: number }>>({});
  const [openInput, setOpenInput] = useState('');
  const [grading, setGrading] = useState(false);
  const [showExplanation, setShowExplanation] = useState(false);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size < 10) next.add(id);
      return next;
    });
  };

  const startQuiz = async () => {
    if (selectedIds.size === 0) {
      toast.error(lang === 'ru' ? 'Выберите хотя бы одну заметку' : 'Pick at least one note');
      return;
    }
    setLoading(true);
    try {
      const q = await aiApi.quiz({
        note_ids: [...selectedIds],
        num_questions: numQuestions,
        difficulty,
        language: lang,
      });
      setQuiz(q);
      setCurrentIdx(0);
      setAnswers({});
      setOpenInput('');
      setShowExplanation(false);
      setPhase('quiz');
    } catch (e: any) {
      toast.error(e?.detail ?? (lang === 'ru' ? 'Не удалось создать тест' : 'Failed to generate quiz'));
    } finally {
      setLoading(false);
    }
  };

  const currentQ: AIQuizQuestion | undefined = quiz?.questions[currentIdx];

  const submitMC = (idx: number) => {
    if (!currentQ || answers[currentQ.id]) return;
    const correct = idx === currentQ.correct_index;
    setAnswers((prev) => ({
      ...prev,
      [currentQ.id]: { value: String(idx), correct },
    }));
    setShowExplanation(true);
  };

  const submitOpen = async () => {
    if (!currentQ || !openInput.trim() || answers[currentQ.id]) return;
    setGrading(true);
    try {
      const result = await aiApi.grade({
        question: currentQ.question,
        expected_answer: currentQ.correct_answer ?? '',
        user_answer: openInput.trim(),
        language: lang,
      });
      setAnswers((prev) => ({
        ...prev,
        [currentQ.id]: {
          value: openInput.trim(),
          correct: result.correct,
          feedback: result.feedback,
          score: result.score,
        },
      }));
      setShowExplanation(true);
    } catch (e: any) {
      toast.error(e?.detail ?? 'Grading failed');
    } finally {
      setGrading(false);
    }
  };

  const next = () => {
    if (!quiz) return;
    setShowExplanation(false);
    setOpenInput('');
    if (currentIdx + 1 >= quiz.questions.length) {
      setPhase('result');
    } else {
      setCurrentIdx(currentIdx + 1);
    }
  };

  // ─── Setup phase ─────────────────────────────────────────────────────────
  if (phase === 'setup') {
    return (
      <div className="flex flex-col gap-4 h-full min-h-0">
        <div>
          <label className="text-xs font-medium text-muted-foreground block mb-1.5">
            {lang === 'ru' ? 'По каким заметкам тестировать?' : 'Notes to quiz on'}
          </label>
          {pickNotes(allNotes, selectedIds, toggleSelect, searchValue, setSearchValue, t)}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1.5">
              {lang === 'ru' ? 'Вопросов' : 'Questions'}
            </label>
            <input
              type="number"
              min={3} max={15}
              value={numQuestions}
              onChange={(e) => setNumQuestions(parseInt(e.target.value, 10) || 5)}
              className="w-full h-9 px-3 text-sm bg-input-background border border-border rounded-md"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1.5">
              {lang === 'ru' ? 'Сложность' : 'Difficulty'}
            </label>
            <select
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value as any)}
              className="w-full h-9 px-2 text-sm bg-input-background border border-border rounded-md"
            >
              <option value="easy">{lang === 'ru' ? 'Лёгкая' : 'Easy'}</option>
              <option value="medium">{lang === 'ru' ? 'Средняя' : 'Medium'}</option>
              <option value="hard">{lang === 'ru' ? 'Сложная' : 'Hard'}</option>
            </select>
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2 border-t border-border">
          <button onClick={onClose} className="h-9 px-3 text-sm text-muted-foreground rounded-md hover:bg-secondary">
            {t('common.cancel')}
          </button>
          <button
            onClick={startQuiz}
            disabled={loading || selectedIds.size === 0}
            className="h-9 px-4 bg-primary text-primary-foreground rounded-md text-sm font-medium disabled:opacity-50 flex items-center gap-1.5"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
            {loading
              ? (lang === 'ru' ? 'Генерация...' : 'Generating...')
              : (lang === 'ru' ? 'Создать тест' : 'Generate quiz')}
          </button>
        </div>
      </div>
    );
  }

  // ─── Quiz phase ──────────────────────────────────────────────────────────
  if (phase === 'quiz' && quiz && currentQ) {
    const ans = answers[currentQ.id];
    return (
      <div className="flex flex-col gap-4 h-full min-h-0">
        <div className="flex items-center justify-between">
          <div className="text-xs text-muted-foreground">
            {lang === 'ru' ? 'Вопрос' : 'Question'} {currentIdx + 1} / {quiz.questions.length}
          </div>
          <div className="flex gap-1">
            {quiz.questions.map((_, i) => (
              <div
                key={i}
                className={`w-2 h-2 rounded-full ${
                  i < currentIdx ? (answers[quiz.questions[i].id]?.correct ? 'bg-emerald-500' : 'bg-red-400')
                  : i === currentIdx ? 'bg-primary'
                  : 'bg-muted'
                }`}
              />
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="p-4 bg-secondary/30 rounded-lg mb-3">
            <div className="text-base font-medium mb-1 leading-relaxed whitespace-pre-wrap">{currentQ.question}</div>
          </div>

          {currentQ.type === 'multiple_choice' && currentQ.options && (
            <div className="space-y-2">
              {currentQ.options.map((opt, i) => {
                const isSelected = ans?.value === String(i);
                const isCorrect = i === currentQ.correct_index;
                let cls = 'border-border hover:border-primary/40';
                if (ans) {
                  if (isCorrect) cls = 'border-emerald-500 bg-emerald-500/10';
                  else if (isSelected && !isCorrect) cls = 'border-red-400 bg-red-500/10';
                  else cls = 'border-border opacity-60';
                }
                return (
                  <button
                    key={i}
                    onClick={() => submitMC(i)}
                    disabled={!!ans}
                    className={`w-full text-left p-3 border-2 rounded-lg text-sm transition-all flex items-center gap-2 ${cls}`}
                  >
                    <div className="w-6 h-6 rounded-full border-2 border-current flex items-center justify-center flex-shrink-0 text-xs font-semibold">
                      {String.fromCharCode(65 + i)}
                    </div>
                    <span className="flex-1">{opt}</span>
                    {ans && isCorrect && <CheckCircle2 size={16} className="text-emerald-500" />}
                    {ans && isSelected && !isCorrect && <XCircle size={16} className="text-red-500" />}
                  </button>
                );
              })}
            </div>
          )}

          {currentQ.type === 'open' && (
            <div className="space-y-2">
              <textarea
                value={ans ? ans.value : openInput}
                onChange={(e) => setOpenInput(e.target.value)}
                disabled={!!ans}
                placeholder={lang === 'ru' ? 'Напишите ответ...' : 'Type your answer...'}
                rows={4}
                className="w-full p-3 text-sm bg-input-background border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-ring/30 disabled:opacity-70"
              />
              {!ans && (
                <button
                  onClick={submitOpen}
                  disabled={grading || !openInput.trim()}
                  className="h-9 px-4 bg-primary text-primary-foreground rounded-md text-sm font-medium disabled:opacity-50 flex items-center gap-1.5"
                >
                  {grading ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                  {lang === 'ru' ? 'Отправить' : 'Submit'}
                </button>
              )}
              {ans && (
                <div className={`p-3 rounded-md ${ans.correct ? 'bg-emerald-500/10 border border-emerald-500/30' : 'bg-amber-500/10 border border-amber-500/30'}`}>
                  <div className="text-xs font-semibold mb-1 flex items-center gap-1">
                    {ans.correct
                      ? <><CheckCircle2 size={13} className="text-emerald-500" /> {lang === 'ru' ? 'Правильно' : 'Correct'} ({ans.score}/100)</>
                      : <><AlertCircle size={13} className="text-amber-600" /> {lang === 'ru' ? 'Не совсем' : 'Not quite'} ({ans.score}/100)</>}
                  </div>
                  <div className="text-xs text-muted-foreground">{ans.feedback}</div>
                </div>
              )}
              {ans && currentQ.correct_answer && (
                <details className="text-xs">
                  <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                    {lang === 'ru' ? 'Образцовый ответ' : 'Reference answer'}
                  </summary>
                  <div className="mt-1 p-2 bg-secondary/30 rounded">{currentQ.correct_answer}</div>
                </details>
              )}
            </div>
          )}

          {showExplanation && currentQ.explanation && (
            <div className="mt-3 p-3 bg-blue-500/5 border border-blue-500/20 rounded-md text-xs">
              <div className="font-medium mb-1 flex items-center gap-1">
                <Sparkles size={12} className="text-blue-500" />
                {lang === 'ru' ? 'Объяснение' : 'Explanation'}
              </div>
              <div className="text-muted-foreground leading-relaxed">{currentQ.explanation}</div>
            </div>
          )}
        </div>

        <div className="flex justify-between items-center pt-2 border-t border-border">
          <button onClick={onClose} className="text-xs text-muted-foreground hover:text-foreground">
            {lang === 'ru' ? 'Прервать' : 'Quit'}
          </button>
          {ans && (
            <button
              onClick={next}
              className="h-9 px-4 bg-primary text-primary-foreground rounded-md text-sm font-medium flex items-center gap-1"
            >
              {currentIdx + 1 >= quiz.questions.length
                ? (lang === 'ru' ? 'Результаты' : 'See results')
                : (lang === 'ru' ? 'Дальше' : 'Next')}
              <ChevronRight size={14} />
            </button>
          )}
        </div>
      </div>
    );
  }

  // ─── Result phase ────────────────────────────────────────────────────────
  if (phase === 'result' && quiz) {
    const total = quiz.questions.length;
    const correctCount = Object.values(answers).filter((a) => a.correct).length;
    const pct = Math.round((correctCount / total) * 100);
    const grade = pct >= 80 ? 'A' : pct >= 70 ? 'B' : pct >= 60 ? 'C' : pct >= 50 ? 'D' : 'F';
    const gradeColor = pct >= 70 ? 'text-emerald-500' : pct >= 50 ? 'text-amber-500' : 'text-red-500';

    return (
      <div className="flex flex-col gap-4 h-full min-h-0">
        <div className="flex flex-col items-center text-center py-4">
          <div className={`text-7xl font-semibold ${gradeColor}`}>{grade}</div>
          <div className="text-xl font-semibold mt-2">{correctCount}/{total}</div>
          <div className="text-sm text-muted-foreground">{pct}% {lang === 'ru' ? 'правильно' : 'correct'}</div>
        </div>
        <div className="flex-1 overflow-y-auto space-y-2">
          {quiz.questions.map((q, i) => {
            const a = answers[q.id];
            return (
              <div key={q.id} className="p-3 border border-border rounded-md text-xs">
                <div className="flex items-start gap-2 mb-1">
                  {a?.correct
                    ? <CheckCircle2 size={14} className="text-emerald-500 flex-shrink-0 mt-0.5" />
                    : <XCircle size={14} className="text-red-400 flex-shrink-0 mt-0.5" />}
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-foreground">{i + 1}. {q.question}</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <div className="flex justify-end gap-2 pt-2 border-t border-border">
          <button
            onClick={() => { setPhase('setup'); setQuiz(null); }}
            className="h-9 px-3 text-sm text-muted-foreground rounded-md hover:bg-secondary flex items-center gap-1.5"
          >
            <RotateCw size={14} />
            {lang === 'ru' ? 'Ещё тест' : 'New quiz'}
          </button>
          <button onClick={onClose} className="h-9 px-4 bg-primary text-primary-foreground rounded-md text-sm font-medium">
            {t('common.close')}
          </button>
        </div>
      </div>
    );
  }

  return null;
}

// ─── Chat mode ──────────────────────────────────────────────────────────────

function ChatMode({ allNotes, t, lang, onClose }: {
  allNotes: FlatNote[];
  t: (k: string, vars?: any) => string;
  lang: 'en' | 'ru';
  onClose: () => void;
}) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [searchValue, setSearchValue] = useState('');
  const [showNotePicker, setShowNotePicker] = useState(true);
  const [history, setHistory] = useState<{ role: 'user' | 'assistant'; content: string }[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size < 10) next.add(id);
      return next;
    });
  };

  const send = async () => {
    if (!input.trim() || sending) return;
    const userMsg = input.trim();
    setInput('');
    setHistory((prev) => [...prev, { role: 'user', content: userMsg }]);
    setSending(true);
    try {
      const r = await aiApi.chat({
        note_ids: [...selectedIds],
        history,
        message: userMsg,
        language: lang,
      });
      setHistory((prev) => [...prev, { role: 'assistant', content: r.reply }]);
    } catch (e: any) {
      toast.error(e?.detail ?? 'Chat failed');
      setHistory((prev) => [...prev, { role: 'assistant', content: '(error: ' + (e?.detail ?? 'failed') + ')' }]);
    } finally {
      setSending(false);
    }
  };

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [history]);

  return (
    <div className="flex flex-col gap-3 h-full min-h-0">
      {showNotePicker ? (
        <div className="flex flex-col gap-3 flex-1 min-h-0">
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1.5">
              {lang === 'ru' ? 'По каким заметкам говорить?' : 'Which notes to chat about?'}
            </label>
            {pickNotes(allNotes, selectedIds, toggleSelect, searchValue, setSearchValue, t)}
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t border-border">
            <button onClick={onClose} className="h-9 px-3 text-sm text-muted-foreground">
              {t('common.cancel')}
            </button>
            <button
              onClick={() => setShowNotePicker(false)}
              className="h-9 px-4 bg-primary text-primary-foreground rounded-md text-sm font-medium flex items-center gap-1.5"
            >
              <MessageSquare size={14} />
              {lang === 'ru' ? 'Начать чат' : 'Start chat'}
              {selectedIds.size > 0 && <span className="text-[11px] opacity-80">({selectedIds.size})</span>}
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between gap-2 flex-wrap text-xs">
            <button
              onClick={() => setShowNotePicker(true)}
              className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
            >
              <ChevronRight size={12} className="rotate-180" />
              {selectedIds.size > 0
                ? (lang === 'ru' ? `${selectedIds.size} заметок выбрано` : `${selectedIds.size} note(s) selected`)
                : (lang === 'ru' ? 'Выбрать заметки' : 'Pick notes')}
            </button>
            <button
              onClick={() => setHistory([])}
              className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
            >
              <RotateCw size={11} /> {lang === 'ru' ? 'Очистить' : 'Clear'}
            </button>
          </div>

          <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-2 border border-border rounded-md p-3 min-h-[200px] bg-secondary/20">
            {history.length === 0 && (
              <div className="text-center text-xs text-muted-foreground py-8">
                {lang === 'ru'
                  ? 'Спросите что-нибудь, и я отвечу по выбранным заметкам.'
                  : 'Ask anything, and I will answer based on the selected notes.'}
              </div>
            )}
            {history.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] px-3 py-2 rounded-2xl text-sm whitespace-pre-wrap leading-relaxed ${
                  m.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-card border border-border'
                }`}>
                  {m.content}
                </div>
              </div>
            ))}
            {sending && (
              <div className="flex justify-start">
                <div className="px-3 py-2 rounded-2xl bg-card border border-border">
                  <Loader2 size={14} className="animate-spin text-muted-foreground" />
                </div>
              </div>
            )}
          </div>

          <div className="flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !sending && send()}
              placeholder={lang === 'ru' ? 'Спроси меня что-нибудь...' : 'Ask me anything...'}
              className="flex-1 h-10 px-3 text-sm bg-input-background border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-ring/30 focus:border-ring"
            />
            <button
              onClick={send}
              disabled={sending || !input.trim()}
              className="h-10 px-4 bg-primary text-primary-foreground rounded-md font-medium disabled:opacity-50 flex items-center gap-1.5"
            >
              {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Main Tutor modal ───────────────────────────────────────────────────────

interface Props {
  open: boolean;
  onClose: () => void;
  notes: { id: string; title: string; way?: string; topic?: string }[];
}

export default function AITutor({ open, onClose, notes }: Props) {
  const t = useT();
  const { lang } = useLangStore();
  const [tab, setTab] = useState<'quiz' | 'chat'>('quiz');
  const [status, setStatus] = useState<{ configured: boolean; provider: string; model: string } | null>(null);

  const allNotes: FlatNote[] = useMemo(() =>
    notes.map((n) => ({
      id: n.id,
      title: n.title || 'Untitled',
      path: [n.way, n.topic].filter(Boolean).join(' / ') || '—',
    })), [notes]);

  useEffect(() => {
    if (!open) return;
    aiApi.status().then(setStatus).catch(() => setStatus({ configured: false, provider: '?', model: '?' }));
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="w-full max-w-xl bg-background border border-border rounded-xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
        <div className="flex items-start justify-between p-4 pb-3 border-b border-border">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-violet-500 to-blue-500 flex items-center justify-center flex-shrink-0">
              <Brain size={18} className="text-white" />
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-semibold">{lang === 'ru' ? 'AI-Репетитор' : 'AI Tutor'}</h3>
              {status && (
                <p className="text-[10px] text-muted-foreground truncate">
                  {status.configured ? `${status.provider} · ${status.model}` : (lang === 'ru' ? '⚠ AI не настроен' : '⚠ AI not configured')}
                </p>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-secondary text-muted-foreground hover:text-foreground flex-shrink-0"
          >
            <X size={16} />
          </button>
        </div>

        {status && !status.configured ? (
          <div className="p-8 text-center">
            <AlertCircle size={32} className="mx-auto mb-3 text-amber-500" />
            <p className="text-sm font-medium mb-2">{lang === 'ru' ? 'AI не настроен' : 'AI not configured'}</p>
            <p className="text-xs text-muted-foreground mb-1">
              {lang === 'ru' ? 'В backend .env нужно указать:' : 'Add to backend .env:'}
            </p>
            <pre className="text-[11px] bg-secondary/30 rounded p-3 inline-block text-left mt-2">
              {`LLM_BASE_URL=https://api.groq.com/openai/v1
LLM_API_KEY=gsk_...
LLM_MODEL=llama-3.3-70b-versatile`}
            </pre>
            <p className="text-[10px] text-muted-foreground mt-3">
              {lang === 'ru'
                ? 'Поддерживаются Groq, OpenAI, Together, Ollama и др. совместимые API'
                : 'Supports Groq, OpenAI, Together, Ollama and other compatible APIs'}
            </p>
          </div>
        ) : (
          <>
            <div className="px-4 pt-3 flex gap-1 border-b border-border">
              <button
                onClick={() => setTab('quiz')}
                className={`px-4 h-9 text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
                  tab === 'quiz' ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                <GraduationCap size={14} />
                {lang === 'ru' ? 'Тест' : 'Quiz'}
              </button>
              <button
                onClick={() => setTab('chat')}
                className={`px-4 h-9 text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
                  tab === 'chat' ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                <MessageSquare size={14} />
                {lang === 'ru' ? 'Чат' : 'Chat'}
              </button>
            </div>

            <div className="flex-1 overflow-hidden p-4">
              {tab === 'quiz'
                ? <QuizMode allNotes={allNotes} t={t} lang={lang} onClose={onClose} />
                : <ChatMode allNotes={allNotes} t={t} lang={lang} onClose={onClose} />}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
