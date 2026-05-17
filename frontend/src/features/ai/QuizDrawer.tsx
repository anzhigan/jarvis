import { useEffect, useMemo, useState } from 'react';
import { aiApi } from '../../api/client';
import { Drawer } from '../../components/ui';
import type {
  AIJob,
  AIQuiz,
  QuizAttempt,
  QuizLetter,
} from '../../api/types';
import { useAIJob } from './useAIJob';
import './ai.css';

interface Props {
  /** Job id while we're still polling. Null = drawer closed. */
  jobId: string | null;
  /** Note title for the loading/intro screen. */
  noteTitle: string;
  onClose: () => void;
}

type ViewState =
  | { kind: 'loading'; job: AIJob | null }
  | { kind: 'failed'; error: string }
  | { kind: 'active'; quiz: AIQuiz }
  | { kind: 'submitting'; quiz: AIQuiz }
  | { kind: 'result'; quiz: AIQuiz; attempt: QuizAttempt };

const LOADING_STEPS = [
  'Loading note',
  'Building context',
  'Writing questions',
  'Polishing output',
];

export function QuizDrawer({ jobId, noteTitle, onClose }: Props) {
  const open = jobId !== null;
  const { job, error: pollError } = useAIJob(jobId);

  // Local quiz state — set when job completes successfully.
  const [quiz, setQuiz] = useState<AIQuiz | null>(null);
  const [quizError, setQuizError] = useState<string | null>(null);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<number, QuizLetter>>({});
  const [revealed, setRevealed] = useState(false);
  const [attempt, setAttempt] = useState<QuizAttempt | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Reset everything when the drawer reopens with a new job.
  useEffect(() => {
    if (!jobId) return;
    setQuiz(null);
    setQuizError(null);
    setCurrentIdx(0);
    setAnswers({});
    setRevealed(false);
    setAttempt(null);
  }, [jobId]);

  // When the job finishes, fetch the quiz.
  useEffect(() => {
    if (job?.status !== 'done') return;
    const output = job.output_json as { quiz_id?: string } | null;
    const quizId = output?.quiz_id;
    if (!quizId) {
      setQuizError('Job done but no quiz_id in output');
      return;
    }
    aiApi.getQuiz(quizId)
      .then(setQuiz)
      .catch((e: Error) => setQuizError(e.message || 'failed to load quiz'));
  }, [job]);

  const view: ViewState = useMemo(() => {
    if (attempt && quiz) return { kind: 'result', quiz, attempt };
    if (submitting && quiz) return { kind: 'submitting', quiz };
    if (quiz) return { kind: 'active', quiz };
    if (pollError) return { kind: 'failed', error: pollError };
    if (quizError) return { kind: 'failed', error: quizError };
    if (job?.status === 'failed') {
      return { kind: 'failed', error: job.error || 'generation failed' };
    }
    return { kind: 'loading', job };
  }, [attempt, quiz, submitting, pollError, quizError, job]);

  const handleSubmitFinal = async () => {
    if (!quiz) return;
    setSubmitting(true);
    try {
      const payload = Object.entries(answers).map(([idx, selected]) => ({
        question_idx: Number(idx),
        selected,
      }));
      const result = await aiApi.submitAttempt(quiz.id, payload);
      setAttempt(result);
    } catch (e) {
      setQuizError(e instanceof Error ? e.message : 'submit failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Drawer
      open={open}
      onOpenChange={(o) => { if (!o) onClose(); }}
      accent="notes"
      title={
        view.kind === 'result'
          ? 'Test result'
          : view.kind === 'loading'
            ? 'Building your test'
            : 'Quiz'
      }
      description={`«${noteTitle}»`}
    >
      {view.kind === 'loading' && <LoadingView job={view.job} />}
      {view.kind === 'failed'  && <FailedView error={view.error} />}
      {view.kind === 'active'  && (
        <ActiveView
          quiz={view.quiz}
          currentIdx={currentIdx}
          answers={answers}
          revealed={revealed}
          onPick={(letter) => setAnswers((a) => ({ ...a, [currentIdx]: letter }))}
          onSubmit={() => setRevealed(true)}
          onNext={() => {
            setRevealed(false);
            setCurrentIdx((i) => i + 1);
          }}
          onFinish={handleSubmitFinal}
        />
      )}
      {view.kind === 'submitting' && (
        <div className="ai-empty">
          <div className="ai-loading__sparkle"><div className="ai-spk" /></div>
          <p className="ai-loading__title">Saving your attempt…</p>
        </div>
      )}
      {view.kind === 'result' && <ResultView quiz={view.quiz} attempt={view.attempt} />}
    </Drawer>
  );
}


// ── Loading state ────────────────────────────────────────────────────────────

function LoadingView({ job }: { job: AIJob | null }) {
  // Map job lifecycle → which "step" appears active. Crude but readable.
  let stepIdx = 0;
  if (job?.status === 'running') stepIdx = 2;
  if (job?.status === 'done') stepIdx = LOADING_STEPS.length;

  const eta = job?.eta_seconds ?? 60;

  return (
    <div className="ai-loading">
      <div className="ai-loading__sparkle"><div className="ai-spk" /></div>
      <h3 className="ai-loading__title">Reading the note…</h3>
      <p className="ai-loading__sub">
        Writing {job?.input_json && typeof job.input_json === 'object'
          ? (job.input_json as { count?: number }).count ?? '?'
          : '?'} questions. You can close this — I'll keep working in the background.
      </p>
      <ol className="ai-loading__steps">
        {LOADING_STEPS.map((label, i) => {
          const done = i < stepIdx;
          const current = i === stepIdx;
          return (
            <li
              key={label}
              className="ai-loading__step"
              data-done={done || undefined}
              data-current={current || undefined}
            >
              <span className="ai-loading__step-dot" />
              {label}
            </li>
          );
        })}
      </ol>
      <div className="ai-loading__eta">~{eta}s estimated</div>
    </div>
  );
}


// ── Failed state ─────────────────────────────────────────────────────────────

function FailedView({ error }: { error: string }) {
  return (
    <div className="ai-empty">
      <div className="ai-empty__icon" data-tone="rust">!</div>
      <h3 className="ai-empty__title">Generation failed</h3>
      <p className="ai-empty__body">{error}</p>
      <p className="ai-empty__hint">
        Try again — local AI runtime can stall on first run after a restart.
      </p>
    </div>
  );
}


// ── Active state — answering one question ───────────────────────────────────

interface ActiveProps {
  quiz: AIQuiz;
  currentIdx: number;
  answers: Record<number, QuizLetter>;
  revealed: boolean;
  onPick: (letter: QuizLetter) => void;
  onSubmit: () => void;
  onNext: () => void;
  onFinish: () => void;
}

const LETTERS: QuizLetter[] = ['A', 'B', 'C', 'D'];

const QUIZ_HIDE_OPTS_KEY = 'jarvnote:quiz:hideOptions';

function ActiveView({
  quiz, currentIdx, answers, revealed, onPick, onSubmit, onNext, onFinish,
}: ActiveProps) {
  const total = quiz.questions.length;
  const q = quiz.questions[currentIdx];

  // Persisted preference: show options up-front, or "think first" mode where
  // user has to click reveal before seeing A/B/C/D.
  const [hideOptions, setHideOptions] = useState<boolean>(() =>
    localStorage.getItem(QUIZ_HIDE_OPTS_KEY) === '1',
  );
  // Per-question "I want to see options now" override — resets each question.
  const [forceShow, setForceShow] = useState(false);
  useEffect(() => { setForceShow(false); }, [currentIdx]);

  const toggleHide = () => {
    setHideOptions((v) => {
      const next = !v;
      localStorage.setItem(QUIZ_HIDE_OPTS_KEY, next ? '1' : '0');
      return next;
    });
  };

  // Options are visible if: feature off, user requested for this Q, or already revealed.
  const optionsVisible = !hideOptions || forceShow || revealed;

  if (!q) return null;

  const selected = answers[currentIdx];
  const isLast = currentIdx === total - 1;
  const progressPct = ((currentIdx) / total) * 100;

  return (
    <div className="qz">
      <div className="qz-progress">
        <span>Question <b>{currentIdx + 1} of {total}</b></span>
        <label className="qz-toggle" title="Hide options on first read">
          <input
            type="checkbox"
            checked={hideOptions}
            onChange={toggleHide}
          />
          <span>Think first</span>
        </label>
      </div>
      <div className="qz-bar"><div className="qz-bar__fill" style={{ width: `${progressPct}%` }} /></div>

      <p className="qz-q">{q.question}</p>

      {!optionsVisible && (
        <button
          type="button"
          className="qz-reveal"
          onClick={() => setForceShow(true)}
        >
          Show options
        </button>
      )}

      {optionsVisible && (
        <div className="qz-opts">
          {LETTERS.map((letter) => {
            const text = q.options[letter];
            const isPicked = selected === letter;
            const isCorrect = revealed && letter === q.correct;
            const isWrong = revealed && isPicked && letter !== q.correct;
            return (
              <button
                key={letter}
                type="button"
                className="qz-opt"
                data-selected={isPicked && !revealed || undefined}
                data-correct={isCorrect || undefined}
                data-wrong={isWrong || undefined}
                disabled={revealed}
                onClick={() => onPick(letter)}
              >
                <span className="qz-opt__letter">{letter}</span>
                <span className="qz-opt__text">{text}</span>
              </button>
            );
          })}
        </div>
      )}

      {revealed && (
        <div
          className={`qz-feedback ${selected === q.correct ? 'qz-feedback--ok' : 'qz-feedback--no'}`}
        >
          <div className="qz-feedback__head">
            {selected === q.correct ? '✓ Correct' : '× Not quite'}
          </div>
          <p className="qz-feedback__body">{q.explanation}</p>
          {q.source_quote && (
            <p className="qz-feedback__quote">«{q.source_quote}»</p>
          )}
        </div>
      )}

      <div className="qz-foot">
        <div className="qz-dots">
          {quiz.questions.map((_, i) => {
            const cls = i === currentIdx
              ? 'qz-dot qz-dot--current'
              : i < currentIdx
                ? (answers[i] === quiz.questions[i].correct ? 'qz-dot qz-dot--done' : 'qz-dot qz-dot--wrong')
                : 'qz-dot';
            return <span key={i} className={cls} />;
          })}
        </div>
        <div className="qz-foot__actions">
          {!revealed && (
            <button
              type="button"
              className="ai-btn ai-btn--primary ai-btn--sm"
              disabled={!selected}
              onClick={onSubmit}
            >
              Submit
            </button>
          )}
          {revealed && !isLast && (
            <button
              type="button"
              className="ai-btn ai-btn--primary ai-btn--sm"
              onClick={onNext}
            >
              Next →
            </button>
          )}
          {revealed && isLast && (
            <button
              type="button"
              className="ai-btn ai-btn--primary ai-btn--sm"
              onClick={onFinish}
            >
              Finish
            </button>
          )}
        </div>
      </div>
    </div>
  );
}


// ── Result state ─────────────────────────────────────────────────────────────

function ResultView({ quiz, attempt }: { quiz: AIQuiz; attempt: QuizAttempt }) {
  const pct = Math.round((attempt.score / attempt.total) * 100);
  const grade = pct >= 80 ? 'great' : pct >= 50 ? 'ok' : 'rough';
  const reviewIn = attempt.next_review_at
    ? daysFromNow(attempt.next_review_at)
    : null;

  // Find weakest area: questions answered wrong.
  const wrong = attempt.items.filter((it) => !it.correct);
  const insight = wrong.length === 0
    ? "Perfect run. I'll show you this one again in a few days."
    : `You missed ${wrong.length} of ${attempt.total}. Worth re-reading the note before the next attempt.`;

  return (
    <div className="qz-result">
      <div className="qz-result__score" data-grade={grade}>
        {attempt.score}<em>/{attempt.total}</em>
      </div>
      <div className="qz-result__lab">Correct</div>
      <h3 className="qz-result__title">«{quiz.title.replace(/^Quiz on /, '')}»</h3>
      <p className="qz-result__insight">{insight}</p>
      {reviewIn !== null && (
        <p className="qz-result__sr">
          Next review in <b>{reviewIn} {reviewIn === 1 ? 'day' : 'days'}</b>
        </p>
      )}
    </div>
  );
}


function daysFromNow(iso: string): number {
  const target = new Date(iso).getTime();
  const now = Date.now();
  return Math.max(0, Math.round((target - now) / 86_400_000));
}
