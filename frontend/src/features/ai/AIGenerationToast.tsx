import { X } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { AIJobKind } from '../../api/types';
import { useAIJob } from './useAIJob';
import './ai.css';

interface Props {
  jobId: string;
  /** Re-trigger timestamp from the store. Triggers a shake when it increments. */
  bumpedAt?: number;
  /** Specific subject of the job (e.g. note name for a per-note quiz, or
   *  "all notes" / "3 notes" for multi-quiz). Appended to the toast title
   *  with a `·` separator so the user can tell which quiz/schedule a toast
   *  belongs to — same format as the AI tasks panel. */
  sourceTitle?: string;
  /** Other jobs of the same category (working/completed) hidden behind this
   *  one. Rendered as a "+N" capsule next to the title. Use 0 (or omit) to
   *  hide the capsule entirely. */
  extraCount?: number;
  /** Called when user clicks the toast (works in any state). */
  onOpen: () => void;
  /** Called when user X's the toast OR success auto-dismiss timer fires. */
  onDismiss: () => void;
}

/**
 * Universal bottom-right toast for any backgrounded AI generation.
 *
 * States based on the polled job:
 *  - queued/running → "Generating <kind> · elapsed Xs", click reopens drawer
 *  - done           → "<kind> ready", click reopens drawer
 *  - failed         → "Generation failed · <error>"
 *
 * The whole toast is one click target — opening the relevant sidebar back up.
 * The dismiss × stays a separate inner click that doesn't trigger open.
 *
 * Auto-dismisses 8s after success if user doesn't click open.
 */
export function AIGenerationToast({
  jobId, bumpedAt, sourceTitle, extraCount = 0, onOpen, onDismiss,
}: Props) {
  const { job } = useAIJob(jobId);
  const [elapsedSec, setElapsedSec] = useState<number>(0);
  const [shake, setShake] = useState(false);

  // Live elapsed counter — only ticks once the worker actually picks the job
  // up. Queued jobs sit at 0 until that happens.
  useEffect(() => {
    if (!job) return;
    if (job.status !== 'running' || !job.started_at) {
      setElapsedSec(0);
      return;
    }
    const anchorMs = new Date(job.started_at).getTime();
    const tick = () => setElapsedSec(Math.floor((Date.now() - anchorMs) / 1000));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [job?.status, job?.started_at]);

  // No auto-dismiss for done jobs: the AI-jobs panel keeps completed
  // generations around (with a moss "done" tint) until the user explicitly
  // opens or dismisses them. The toast simply re-tints to match.

  // Shake on bump — store sets a fresh `bumpedAt` when the user re-triggers
  // the same kind while it's still in flight. CSS-only animation, ~500ms.
  useEffect(() => {
    if (!bumpedAt) return;
    setShake(true);
    const t = setTimeout(() => setShake(false), 500);
    return () => clearTimeout(t);
  }, [bumpedAt]);

  if (!job) return null;

  const isQueued = job.status === 'queued';
  const isRunning = job.status === 'running';
  const isWorking = isQueued || isRunning;
  const isDone = job.status === 'done';
  const isFailed = job.status === 'failed';

  const kindLabel = LABELS[job.kind] ?? 'AI task';
  // Compose "quiz · <noteTitle>" when we know the subject, else fall back to
  // the generic kind label. Matches the AI tasks panel formatting.
  const label = sourceTitle ? `${kindLabel} · ${sourceTitle}` : kindLabel;
  const eta = job.eta_seconds ?? 60;

  // Progress bar — queued sits at 0 (worker hasn't started). Running uses
  // elapsed/eta capped at 95% so it doesn't claim "done" prematurely.
  let progressPct = 0;
  if (isDone) {
    progressPct = 100;
  } else if (isRunning && eta > 0) {
    progressPct = Math.min(95, (elapsedSec / eta) * 100);
  }

  return (
    <div
      className={`ai-toast ${shake ? 'ai-toast--shake' : ''}`}
      data-state={job.status}
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen();
        }
      }}
      title="Open"
    >
      <div className="ai-toast__sparkle" data-pulsing={isWorking || undefined}>
        <div className="ai-spk" />
      </div>
      <div className="ai-toast__body">
        {isWorking && (
          <>
            <p className="ai-toast__title">
              {isQueued ? `Queued ${label}` : `Generating ${label}`}
              {extraCount > 0 && <span className="ai-toast__queue">+{extraCount}</span>}
            </p>
            <p className="ai-toast__sub">
              {isQueued
                ? `Waiting for worker · ~${fmtSec(eta)} estimated`
                : `${fmtSec(elapsedSec)} elapsed · ~${fmtSec(eta)} estimated`}
            </p>
            <div className="ai-toast__bar">
              <div className="ai-toast__bar-fill" style={{ width: `${progressPct}%` }} />
            </div>
          </>
        )}
        {isDone && (
          <>
            <p className="ai-toast__title">
              {capitalize(label)} ready
              {extraCount > 0 && <span className="ai-toast__queue">+{extraCount}</span>}
            </p>
            <p className="ai-toast__sub">Click to open</p>
          </>
        )}
        {isFailed && (
          <>
            <p className="ai-toast__title">Generation failed</p>
            <p className="ai-toast__sub">{job.error || 'unknown error'}</p>
          </>
        )}
      </div>
      <button
        type="button"
        className="ai-toast__close"
        onClick={(e) => { e.stopPropagation(); onDismiss(); }}
        aria-label="Dismiss"
      >
        <X size={14} />
      </button>
    </div>
  );
}

const LABELS: Record<AIJobKind, string> = {
  quiz:     'quiz',
  schedule: 'plan day',
  insights: 'review',
};

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function fmtSec(n: number): string {
  const s = Math.max(0, Math.floor(n));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return r === 0 ? `${m}m` : `${m}m ${r}s`;
}
