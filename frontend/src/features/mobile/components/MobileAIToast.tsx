import { useEffect, useState } from 'react';
import { Sparkles, X } from 'lucide-react';
import type { AIJobKind } from '../../../api/types';
import { useAIJob } from '../../ai/useAIJob';

interface Props {
  jobId: string;
  /** When the same kind re-triggers we bump this ms-timestamp — the toast
   *  watches it and shakes briefly to acknowledge. */
  bumpedAt?: number;
  /** Pretty label injected by the producer — e.g. note name for a quiz or
   *  `Fill missing dates for "<goal>"` for goal_plan. Composed verbatim
   *  in the toast title when present. */
  sourceTitle?: string;
  /** Other queued / completed jobs hidden behind this one. Rendered as a
   *  small "+N" capsule next to the title. */
  extraCount?: number;
  /** Tap on the toast body — opens the AI jobs panel for further triage. */
  onOpen: () => void;
  /** Tap on the X — soft dismissal. Job stays in the panel + store. */
  onDismiss: () => void;
}

const LABELS: Record<AIJobKind, string> = {
  quiz:        'quiz',
  schedule:    'plan day',
  sprint_plan: 'sprint plan',
  insights:    'review',
  coach:       'coach',
  goal_plan:   'goal plan',
};

function fmtSec(n: number): string {
  const s = Math.max(0, Math.floor(n));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return r === 0 ? `${m}m` : `${m}m ${r}s`;
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Mobile equivalent of the desktop AIGenerationToast. Lives in
 * MobileAIToastStack's bottom-pinned slot above the tab bar.
 *
 *   - queued / running → "Generating <kind>" + elapsed/ETA + progress bar
 *   - done             → "<kind> ready"
 *   - failed           → "Generation failed · <error>"
 *
 * Whole row is one tap target → opens the AI jobs panel. The X stops
 * propagation and soft-dismisses just this toast (panel still keeps the
 * row so the user can return to it).
 */
export function MobileAIToast({
  jobId, bumpedAt, sourceTitle, extraCount = 0, onOpen, onDismiss,
}: Props) {
  const { job } = useAIJob(jobId);
  const [elapsed, setElapsed] = useState(0);
  const [shake, setShake] = useState(false);

  // Tick the elapsed counter once the backend actually starts the job —
  // queued jobs sit at 0 until then.
  useEffect(() => {
    if (!job || job.status !== 'running' || !job.started_at) {
      setElapsed(0);
      return;
    }
    const anchor = new Date(job.started_at).getTime();
    const tick = () => setElapsed(Math.floor((Date.now() - anchor) / 1000));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [job?.status, job?.started_at]);

  // Same-kind re-trigger → bumpedAt updates → shake the toast.
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

  const kindLbl = LABELS[job.kind] ?? 'AI task';
  // goal_plan composes a full sentence in sourceTitle ("Fill missing dates
  // for \"Goal\""). Don't prefix it with "goal plan ·" again — keeps the
  // headline scannable.
  const label = job.kind === 'goal_plan' && sourceTitle
    ? sourceTitle
    : sourceTitle ? `${kindLbl} · ${sourceTitle}` : kindLbl;
  const eta = job.eta_seconds ?? 60;

  let pct = 0;
  if (isDone) pct = 100;
  else if (isFailed) pct = 100;
  else if (isRunning && eta > 0) pct = Math.min(95, (elapsed / eta) * 100);

  return (
    <button
      type="button"
      className={`m-ai-toast${shake ? ' m-ai-toast--shake' : ''}`}
      data-state={job.status}
      onClick={onOpen}
      aria-label="Open AI jobs"
    >
      <span className="m-ai-toast__spark" data-pulsing={isWorking || undefined}>
        <Sparkles size={16} />
      </span>
      <div className="m-ai-toast__body">
        {isWorking && (
          <>
            <div className="m-ai-toast__title">
              {isQueued ? `Queued ${label}` : `Generating ${label}`}
              {extraCount > 0 && <span className="m-ai-toast__queue">+{extraCount}</span>}
            </div>
            <div className="m-ai-toast__sub">
              {isQueued
                ? `Waiting for worker · ~${fmtSec(eta)}`
                : `${fmtSec(elapsed)} elapsed · ~${fmtSec(eta)} estimated`}
            </div>
            <div className="m-ai-toast__bar"><div className="m-ai-toast__bar-fill" style={{ width: `${pct}%` }} /></div>
          </>
        )}
        {isDone && (
          <>
            <div className="m-ai-toast__title">
              {cap(label)} ready
              {extraCount > 0 && <span className="m-ai-toast__queue">+{extraCount}</span>}
            </div>
            <div className="m-ai-toast__sub">Tap to open</div>
          </>
        )}
        {isFailed && (
          <>
            <div className="m-ai-toast__title">Generation failed</div>
            <div className="m-ai-toast__sub">{job.error || 'unknown error'}</div>
          </>
        )}
      </div>
      <span
        className="m-ai-toast__close"
        role="button"
        aria-label="Dismiss"
        onClick={(e) => { e.stopPropagation(); onDismiss(); }}
      >
        <X size={14} />
      </span>
    </button>
  );
}
