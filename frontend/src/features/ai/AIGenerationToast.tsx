import { X } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { AIJobKind } from '../../api/types';
import { useAIJob } from './useAIJob';
import './ai.css';

interface Props {
  jobId: string;
  /** Re-trigger timestamp from the store. Triggers a shake when it increments. */
  bumpedAt?: number;
  /** Number of OTHER jobs queued behind this one — surfaced as a "+N" badge. */
  queueCount?: number;
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
export function AIGenerationToast({ jobId, bumpedAt, queueCount = 0, onOpen, onDismiss }: Props) {
  const { job } = useAIJob(jobId);
  const [elapsedSec, setElapsedSec] = useState<number>(0);
  const [shake, setShake] = useState(false);

  // Live elapsed counter — ticks every second while job is in non-terminal state.
  useEffect(() => {
    if (!job) return;
    if (job.status !== 'queued' && job.status !== 'running') {
      setElapsedSec(0);
      return;
    }
    const anchor = job.started_at ?? job.created_at;
    if (!anchor) return;
    const anchorMs = new Date(anchor).getTime();
    const tick = () => setElapsedSec(Math.floor((Date.now() - anchorMs) / 1000));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [job?.status, job?.started_at, job?.created_at]);

  // Auto-dismiss done toasts after 8s so they don't linger.
  useEffect(() => {
    if (job?.status !== 'done') return;
    const t = setTimeout(onDismiss, 8000);
    return () => clearTimeout(t);
  }, [job?.status, onDismiss]);

  // Shake on bump — store sets a fresh `bumpedAt` when the user re-triggers
  // the same kind while it's still in flight. CSS-only animation, ~500ms.
  useEffect(() => {
    if (!bumpedAt) return;
    setShake(true);
    const t = setTimeout(() => setShake(false), 500);
    return () => clearTimeout(t);
  }, [bumpedAt]);

  if (!job) return null;

  const isWorking = job.status === 'queued' || job.status === 'running';
  const isDone = job.status === 'done';
  const isFailed = job.status === 'failed';

  const label = LABELS[job.kind] ?? 'AI task';
  const eta = job.eta_seconds ?? 60;

  // Progress bar — based on elapsed vs ETA. Capped at 95% so it doesn't
  // claim "done" before the job actually finishes.
  let progressPct = 0;
  if (isDone) {
    progressPct = 100;
  } else if (isWorking && eta > 0) {
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
              Generating {label}
              {queueCount > 0 && <span className="ai-toast__queue">+{queueCount}</span>}
            </p>
            <p className="ai-toast__sub">
              {elapsedSec}s elapsed · ~{eta}s estimated
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
              {queueCount > 0 && <span className="ai-toast__queue">+{queueCount}</span>}
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
  schedule: 'schedule',
  insights: 'review',
};

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
