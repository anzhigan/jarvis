import { X } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { AIJobKind } from '../../api/types';
import { useAIJob } from './useAIJob';
import './ai.css';

interface Props {
  jobId: string;
  /** Called when user clicks "Open →" on a done toast. */
  onOpen: () => void;
  /** Called when user X's the toast OR success auto-dismiss timer fires. */
  onDismiss: () => void;
}

/**
 * Universal bottom-right toast for any backgrounded AI generation.
 *
 * Three states based on the polled job:
 *  - queued/running → "Generating <kind> · elapsed Xs"
 *  - done           → "<kind> ready · Open →"
 *  - failed         → "Generation failed · <error>"
 *
 * Labels adapt to job.kind. Auto-dismisses 8s after success if user
 * doesn't click Open.
 */
export function AIGenerationToast({ jobId, onOpen, onDismiss }: Props) {
  const { job } = useAIJob(jobId);
  const [elapsedSec, setElapsedSec] = useState<number>(0);

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
    <div className="ai-toast" data-state={job.status} role="status">
      <div className="ai-toast__sparkle" data-pulsing={isWorking || undefined}>
        <div className="ai-spk" />
      </div>
      <div className="ai-toast__body">
        {isWorking && (
          <>
            <p className="ai-toast__title">Generating {label}</p>
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
            <p className="ai-toast__title">{capitalize(label)} ready</p>
            <button
              type="button"
              className="ai-toast__cta"
              onClick={onOpen}
            >
              Open →
            </button>
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
        onClick={onDismiss}
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
