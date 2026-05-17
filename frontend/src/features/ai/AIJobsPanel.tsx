import { Sparkles, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Drawer } from '../../components/ui';
import type { AIJobKind } from '../../api/types';
import { type BgAIJob } from '../../store/aiJobs';
import { useAIJob } from './useAIJob';
import './ai.css';

function jobLabel(job: BgAIJob): string {
  if (job.kind === 'quiz' && job.source.noteTitle) {
    return `Quiz · ${job.source.noteTitle}`;
  }
  return KIND_LABELS[job.kind] ?? 'AI task';
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  jobs: BgAIJob[];
  onPickJob: (job: BgAIJob) => void;
  onDismissJob: (jobId: string) => void;
}

const KIND_LABELS: Record<AIJobKind, string> = {
  quiz:     'Quiz',
  schedule: 'Plan day',
  insights: 'Weekly review',
};

/** "75" → "1m 15s"; "5" → "5s". Compact but readable for elapsed/ETA. */
function fmtSec(n: number): string {
  const s = Math.max(0, Math.floor(n));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return r === 0 ? `${m}m` : `${m}m ${r}s`;
}

const STATUS_LABEL: Record<string, string> = {
  queued:    'queued',
  running:   'running',
  done:      'ready',
  failed:    'failed',
  cancelled: 'cancelled',
};

/**
 * All-jobs view opened from the universal toast. Each row pulls its own live
 * status via useAIJob so positions/timers stay accurate while the panel sits
 * open. Click → opens the relevant source drawer (delegates back up).
 */
export function AIJobsPanel({ open, onOpenChange, jobs, onPickJob, onDismissJob }: Props) {
  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      accent="goals"
      title={`AI tasks · ${jobs.length}`}
      description="Click a task to open its result."
    >
      {jobs.length === 0 ? (
        <div className="ai-empty">
          <div className="ai-empty__icon" data-tone="slate">∅</div>
          <h3 className="ai-empty__title">Nothing in flight</h3>
          <p className="ai-empty__body">All background generations finished or dismissed.</p>
        </div>
      ) : (
        <ul className="ai-jobs-list">
          {jobs.map((job) => (
            <JobRow
              key={job.jobId}
              job={job}
              onClick={() => onPickJob(job)}
              onDismiss={() => onDismissJob(job.jobId)}
            />
          ))}
        </ul>
      )}
    </Drawer>
  );
}

function JobRow({
  job, onClick, onDismiss,
}: {
  job: BgAIJob;
  onClick: () => void;
  onDismiss: () => void;
}) {
  const { job: live } = useAIJob(job.jobId);
  const [elapsed, setElapsed] = useState(0);

  // Live tick: only when the worker actually picked the job up (running).
  // Queued jobs haven't started yet — elapsed stays at 0.
  useEffect(() => {
    if (!live || live.status !== 'running' || !live.started_at) {
      setElapsed(0);
      return;
    }
    const anchorMs = new Date(live.started_at).getTime();
    const tick = () => setElapsed(Math.floor((Date.now() - anchorMs) / 1000));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [live?.status, live?.started_at]);

  const status = live?.status ?? 'queued';
  const isRunning = status === 'running';
  const isQueued = status === 'queued';
  const isDone = status === 'done';
  const isFailed = status === 'failed';
  const eta = live?.eta_seconds ?? 60;
  const title = jobLabel(job);
  const statusLabel = STATUS_LABEL[status] ?? status;
  // Queued → 0 (worker hasn't started). Running → elapsed/eta cap 95%.
  // Done → 100%.
  let progressPct = 0;
  if (isDone) progressPct = 100;
  else if (isRunning && eta > 0) progressPct = Math.min(95, (elapsed / eta) * 100);

  // Only done (and failed, for error inspection) jobs are openable — there's
  // no per-drawer loading screen anymore; progress lives in THIS row.
  const openable = isDone || isFailed;

  return (
    <li className="ai-jobs-row" data-state={status}>
      <button
        type="button"
        className="ai-jobs-row__main"
        onClick={openable ? onClick : undefined}
        disabled={!openable}
        title={openable ? 'Open' : 'Still generating — watch progress here'}
      >
        <span className="ai-jobs-row__icon" data-pulsing={isRunning || undefined}>
          <Sparkles size={13} />
        </span>
        <span className="ai-jobs-row__body">
          <span className="ai-jobs-row__title">{title}</span>
          <span className="ai-jobs-row__sub">
            <span className="ai-jobs-row__status" data-tone={isDone ? 'done' : isFailed ? 'failed' : 'pending'}>
              {statusLabel}
            </span>
            {isRunning && (
              <>
                <span className="ai-jobs-row__sep">·</span>
                <span className="ai-jobs-row__elapsed">{fmtSec(elapsed)} / ~{fmtSec(eta)}</span>
              </>
            )}
            {isQueued && (
              <>
                <span className="ai-jobs-row__sep">·</span>
                <span className="ai-jobs-row__elapsed">~{fmtSec(eta)}</span>
              </>
            )}
            {isFailed && live?.error && (
              <>
                <span className="ai-jobs-row__sep">·</span>
                <span className="ai-jobs-row__err">{live.error}</span>
              </>
            )}
          </span>
          {(isRunning || isQueued || isDone) && (
            <span className="ai-jobs-row__bar">
              <span className="ai-jobs-row__bar-fill" style={{ width: `${progressPct}%` }} />
            </span>
          )}
        </span>
      </button>
      <button
        type="button"
        className="ai-jobs-row__dismiss"
        onClick={onDismiss}
        title="Dismiss"
        aria-label="Dismiss"
      >
        <X size={12} />
      </button>
    </li>
  );
}
