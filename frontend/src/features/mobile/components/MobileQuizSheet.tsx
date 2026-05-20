import { useEffect, useMemo, useState } from 'react';
import { Check, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { aiApi } from '../../../api/client';
import type {
  AIJob,
  AIQuiz,
  QuizAttempt,
  QuizLetter,
} from '../../../api/types';
import { useAIJob } from '../../ai/useAIJob';
import {
  dispatchAIJobDrawerClosed,
  dispatchAIJobDrawerOpened,
} from '../../../store/aiJobs';
import { MobileBottomSheet } from './MobileBottomSheet';
import { MobileButton } from './MobileButton';

interface Props {
  /** AI job id while we're polling. `null` ⇒ sheet closed. */
  jobId: string | null;
  /** Note title for the description line. */
  noteTitle: string;
  onClose: () => void;
}

type ViewState =
  | { kind: 'loading'; job: AIJob | null }
  | { kind: 'failed'; error: string }
  | { kind: 'active'; quiz: AIQuiz }
  | { kind: 'submitting'; quiz: AIQuiz }
  | { kind: 'result'; quiz: AIQuiz; attempt: QuizAttempt };

const LETTERS: QuizLetter[] = ['A', 'B', 'C', 'D'];
const LOADING_STEPS = [
  'Loading note',
  'Building context',
  'Writing questions',
  'Polishing output',
];

/**
 * Mobile bottom-sheet version of the desktop QuizDrawer.
 *
 * Three lifecycle states:
 *   - **loading**  → 4-step checklist driven by `job.status`
 *   - **active**   → one question at a time, A/B/C/D picker, Submit reveals
 *                    explanation + correct answer, then Next/Finish
 *   - **result**   → score, grade tone, insight blurb
 *
 * Same backend protocol as the desktop drawer — poll the job, when `done`
 * read `output_json.quiz_id` and fetch the quiz separately.
 */
export function MobileQuizSheet({ jobId, noteTitle, onClose }: Props) {
  const open = jobId !== null;
  const { job, error: pollError } = useAIJob(jobId);

  const [quiz, setQuiz] = useState<AIQuiz | null>(null);
  const [quizError, setQuizError] = useState<string | null>(null);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<number, QuizLetter>>({});
  const [revealed, setRevealed] = useState(false);
  const [attempt, setAttempt] = useState<QuizAttempt | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Reset on jobId change (new generation OR sheet reopen).
  useEffect(() => {
    if (!jobId) return;
    setQuiz(null);
    setQuizError(null);
    setCurrentIdx(0);
    setAnswers({});
    setRevealed(false);
    setAttempt(null);
  }, [jobId]);

  // Suppress bottom toast while sheet is on screen.
  useEffect(() => {
    if (!jobId) return;
    dispatchAIJobDrawerOpened(jobId);
    return () => { dispatchAIJobDrawerClosed(jobId); };
  }, [jobId]);

  // Fetch the quiz once the job lands done.
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

  const view = useMemo<ViewState>(() => {
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

  const submitFinal = async () => {
    if (!quiz) return;
    setSubmitting(true);
    try {
      const payload = Object.entries(answers).map(([idx, selected]) => ({
        question_idx: Number(idx),
        selected,
      }));
      const result = await aiApi.submitAttempt(quiz.id, payload);
      setAttempt(result);
    } catch (e: any) {
      toast.error(e?.detail ?? e?.message ?? 'Submit failed');
      setQuizError(e instanceof Error ? e.message : 'submit failed');
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  return (
    <MobileBottomSheet
      open={open}
      onOpenChange={(o) => { if (!o) onClose(); }}
      title={
        view.kind === 'result' ? 'Test result'
          : view.kind === 'loading' ? 'Building your test'
          : 'Quiz'
      }
      description={`«${noteTitle}»`}
    >
      {view.kind === 'loading' && <LoadingView job={view.job} />}
      {view.kind === 'failed' && (
        <div style={{ padding: '24px 12px', textAlign: 'center' }}>
          <div style={{
            fontFamily: 'var(--font-display)', fontSize: 17, color: 'var(--rust)',
            marginBottom: 6,
          }}>Generation failed</div>
          <div style={{
            fontFamily: 'var(--font-serif)', fontSize: 13, color: 'var(--ink-4)',
          }}>{view.error}</div>
        </div>
      )}
      {view.kind === 'submitting' && (
        <div className="m-quiz-loading">
          <Loader2 size={28} className="animate-spin" style={{ color: 'var(--indigo)' }} />
          <div style={{
            fontFamily: 'var(--font-display)', fontSize: 17, color: 'var(--ink-2)',
            letterSpacing: '-0.01em',
          }}>Saving your attempt…</div>
        </div>
      )}
      {view.kind === 'active' && (
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
          onFinish={submitFinal}
        />
      )}
      {view.kind === 'result' && <ResultView quiz={view.quiz} attempt={view.attempt} />}
    </MobileBottomSheet>
  );
}

// ── Loading view ───────────────────────────────────────────────────────────
function LoadingView({ job }: { job: AIJob | null }) {
  // 4-step checklist mapped to job lifecycle. Crude but readable.
  const activeStep = !job ? 0
    : job.status === 'queued' ? 0
    : job.status === 'running' ? 2
    : 3;
  return (
    <div className="m-quiz-loading">
      <Loader2 size={28} className="animate-spin" style={{ color: 'var(--indigo)' }} />
      <div className="m-quiz-loading__steps">
        {LOADING_STEPS.map((step, i) => {
          const state = i < activeStep ? 'done'
            : i === activeStep ? 'active'
            : 'idle';
          return (
            <div key={i} className="m-quiz-loading__step" data-state={state}>
              <span className="m-quiz-loading__step-dot">
                {state === 'done' && <Check size={9} strokeWidth={3} />}
              </span>
              <span>{step}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Active view ────────────────────────────────────────────────────────────
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

const HIDE_OPTS_KEY = 'jarvnote:quiz:hide-options';

function ActiveView({
  quiz, currentIdx, answers, revealed, onPick, onSubmit, onNext, onFinish,
}: ActiveProps) {
  const total = quiz.questions.length;
  const q = quiz.questions[currentIdx];
  const [hideOptions, setHideOptions] = useState<boolean>(() =>
    localStorage.getItem(HIDE_OPTS_KEY) === '1',
  );
  const [forceShow, setForceShow] = useState(false);
  useEffect(() => { setForceShow(false); }, [currentIdx]);

  const toggleHide = () => {
    setHideOptions((v) => {
      const next = !v;
      localStorage.setItem(HIDE_OPTS_KEY, next ? '1' : '0');
      return next;
    });
  };
  const optionsVisible = !hideOptions || forceShow || revealed;
  if (!q) return null;

  const selected = answers[currentIdx];
  const isLast = currentIdx === total - 1;
  const progressPct = (currentIdx / total) * 100;

  return (
    <div>
      <div className="m-quiz-progress">
        <span>Question <b>{currentIdx + 1} of {total}</b></span>
        <label style={{
          display: 'inline-flex', alignItems: 'center', gap: 5,
          fontFamily: 'var(--font-ui)', fontSize: 11, color: 'var(--ink-4)',
          cursor: 'pointer',
        }} title="Hide options on first read">
          <input
            type="checkbox"
            checked={hideOptions}
            onChange={toggleHide}
            style={{ accentColor: 'var(--indigo)', width: 14, height: 14 }}
          />
          Think first
        </label>
      </div>
      <div className="m-quiz-bar">
        <div className="m-quiz-bar__fill" style={{ width: `${progressPct}%` }} />
      </div>

      <p className="m-quiz-q">{q.question}</p>

      {!optionsVisible && (
        <button
          type="button"
          className="m-quiz-reveal"
          onClick={() => setForceShow(true)}
        >Show options</button>
      )}

      {optionsVisible && (
        <div className="m-quiz-opts">
          {LETTERS.map((letter) => {
            const text = q.options[letter];
            const isPicked = selected === letter;
            const isCorrect = revealed && letter === q.correct;
            const isWrong = revealed && isPicked && letter !== q.correct;
            return (
              <button
                key={letter}
                type="button"
                className="m-quiz-opt"
                data-selected={isPicked && !revealed || undefined}
                data-correct={isCorrect || undefined}
                data-wrong={isWrong || undefined}
                disabled={revealed}
                onClick={() => onPick(letter)}
              >
                <span className="m-quiz-opt__letter">{letter}</span>
                <span className="m-quiz-opt__text">{text}</span>
              </button>
            );
          })}
        </div>
      )}

      {revealed && (
        <div
          className={
            selected === q.correct
              ? 'm-quiz-feedback m-quiz-feedback--ok'
              : 'm-quiz-feedback m-quiz-feedback--no'
          }
        >
          <div className="m-quiz-feedback__head">
            {selected === q.correct ? '✓ Correct' : '× Not quite'}
          </div>
          <p className="m-quiz-feedback__body">{q.explanation}</p>
          {q.source_quote && (
            <p className="m-quiz-feedback__quote">«{q.source_quote}»</p>
          )}
        </div>
      )}

      <div style={{
        display: 'flex', gap: 10,
        marginTop: 18,
      }}>
        {!revealed && (
          <MobileButton
            variant="filled"
            block
            disabled={!selected}
            onClick={onSubmit}
          >Submit answer</MobileButton>
        )}
        {revealed && !isLast && (
          <MobileButton variant="filled" block onClick={onNext}>
            Next →
          </MobileButton>
        )}
        {revealed && isLast && (
          <MobileButton variant="filled" block onClick={onFinish}>
            Finish
          </MobileButton>
        )}
      </div>
    </div>
  );
}

// ── Result view ────────────────────────────────────────────────────────────
function ResultView({ quiz: _quiz, attempt }: { quiz: AIQuiz; attempt: QuizAttempt }) {
  const pct = Math.round((attempt.score / attempt.total) * 100);
  const grade = pct >= 80 ? 'great' : pct >= 50 ? 'ok' : 'rough';
  const wrong = attempt.items.filter((it) => !it.correct);
  const insight = wrong.length === 0
    ? "Perfect run. We'll show you this one again in a few days."
    : `You missed ${wrong.length} of ${attempt.total}. Worth re-reading the note before the next attempt.`;
  const gradeLabel = grade === 'great' ? 'Solid grasp'
    : grade === 'ok' ? 'Decent — room to grow'
    : 'Needs another pass';

  return (
    <div className="m-quiz-result">
      <div className="m-quiz-result__score">
        {attempt.score}<em>/{attempt.total}</em>
      </div>
      <div className="m-quiz-result__grade" data-grade={grade}>{gradeLabel} · {pct}%</div>
      <p className="m-quiz-result__insight">{insight}</p>
    </div>
  );
}
