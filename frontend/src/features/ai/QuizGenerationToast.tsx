import { X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useAIJob } from './useAIJob';
import './ai.css';

interface Props {
  jobId: string;
  onOpen: () => void;
  onDismiss: () => void;
}

/**
 * Bottom-right toast that appears when the QuizDrawer is closed mid-generation.
 *
 * Three states based on the polled job:
 *  - queued/running → "Generating quiz · Xs"
 *  - done           → "Quiz ready · Open →"
 *  - failed         → "Generation failed"
 *
 * Auto-dismisses 8s after success if the user doesn't click Open.
 */
export function QuizGenerationToast({ jobId, onOpen, onDismiss }: Props) {
  const { job } = useAIJob(jobId);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);

  // Countdown of "estimated seconds remaining" — shrinks from eta_seconds at
  // the moment running started. This is a UX hint, not load-bearing.
  useEffect(() => {
    if (!job || job.status !== 'running' || !job.started_at) {
      setSecondsLeft(null);
      return;
    }
    const eta = job.eta_seconds ?? 60;
    const startedAt = new Date(job.started_at).getTime();
    const tick = () => {
      const elapsed = Math.floor((Date.now() - startedAt) / 1000);
      const remaining = Math.max(0, eta - elapsed);
      setSecondsLeft(remaining);
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [job?.status, job?.started_at, job?.eta_seconds]);

  // Auto-dismiss done toasts after 8 seconds so they don't linger forever.
  useEffect(() => {
    if (job?.status !== 'done') return;
    const t = setTimeout(onDismiss, 8000);
    return () => clearTimeout(t);
  }, [job?.status, onDismiss]);

  if (!job) {
    return null;
  }

  const isWorking = job.status === 'queued' || job.status === 'running';
  const isDone = job.status === 'done';
  const isFailed = job.status === 'failed';

  // Progress percentage for the bar: estimated.
  let progressPct = 0;
  if (isDone) {
    progressPct = 100;
  } else if (job.status === 'running' && job.started_at && job.eta_seconds) {
    const elapsed = (Date.now() - new Date(job.started_at).getTime()) / 1000;
    progressPct = Math.min(95, (elapsed / job.eta_seconds) * 100);
  }

  return (
    <div className="ai-toast" data-state={job.status} role="status">
      <div className="ai-toast__sparkle" data-pulsing={isWorking || undefined}>
        <div className="ai-spk" />
      </div>
      <div className="ai-toast__body">
        {isWorking && (
          <>
            <p className="ai-toast__title">Generating quiz</p>
            <p className="ai-toast__sub">
              {secondsLeft != null ? `~${secondsLeft}s remaining` : 'starting up…'}
            </p>
            <div className="ai-toast__bar">
              <div className="ai-toast__bar-fill" style={{ width: `${progressPct}%` }} />
            </div>
          </>
        )}
        {isDone && (
          <>
            <p className="ai-toast__title">Quiz ready</p>
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
