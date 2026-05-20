import { Check, Loader2, Sparkles, Trash2, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { aiApi } from '../../../api/client';
import type { AIJob, AIJobKind, AIJobStatus } from '../../../api/types';
import { type BgAIJob } from '../../../store/aiJobs';
import { MobileBottomSheet } from './MobileBottomSheet';
import { MobileButton } from './MobileButton';

const KIND_LABELS: Record<AIJobKind, string> = {
  quiz:        'Quiz',
  schedule:    'Plan day',
  insights:    'Weekly review',
  sprint_plan: 'Sprint plan',
  coach:       'Coach',
  goal_plan:   'Goal plan',
};

const STATUS_LABEL: Record<AIJobStatus, string> = {
  queued:    'queued',
  running:   'running',
  done:      'ready',
  failed:    'failed',
  cancelled: 'cancelled',
};

const COMPLETED: ReadonlySet<AIJobStatus> = new Set<AIJobStatus>(['done', 'failed', 'cancelled']);

function jobLabel(job: BgAIJob): string {
  if (job.kind === 'quiz' && job.source.noteTitle) {
    return `Quiz · ${job.source.noteTitle}`;
  }
  // goal_plan composes a full sentence in noteTitle — use verbatim.
  if (job.kind === 'goal_plan' && job.source.noteTitle) {
    return job.source.noteTitle;
  }
  return KIND_LABELS[job.kind] ?? 'AI task';
}

function fmtSec(n: number): string {
  const s = Math.max(0, Math.floor(n));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return r === 0 ? `${m}m` : `${m}m ${r}s`;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  jobs: BgAIJob[];
  statusMap: ReadonlyMap<string, AIJobStatus>;
  /** Tap on the row — opens the source view with this job's result. Parent
   *  handles navigation + result-drawer dispatch. */
  onPickJob: (job: BgAIJob) => void;
  /** Tap on the per-row X — cancel-or-dismiss depending on status. Async
   *  so the parent can await the cancel POST and surface errors. */
  onJobX: (job: BgAIJob) => Promise<void> | void;
  /** Footer "Clear completed" — soft-dismiss every done / failed /
   *  cancelled row. */
  onClearCompleted: () => void;
}

/**
 * Mobile equivalent of the desktop AIJobsPanel. Bottom sheet that lists
 * every backgrounded AI job — running first, then queued, then completed.
 * Each row is a tappable button that opens its result; per-row X cancels
 * (when active) or soft-dismisses (when completed).
 */
export function MobileAIJobsPanel({
  open, onOpenChange, jobs, statusMap, onPickJob, onJobX, onClearCompleted,
}: Props) {
  const completedCount = jobs.filter(
    (j) => COMPLETED.has(statusMap.get(j.jobId) ?? 'queued'),
  ).length;
  return (
    <MobileBottomSheet
      open={open}
      onOpenChange={onOpenChange}
      title="AI tasks"
      description={
        jobs.length === 0
          ? 'No tasks running'
          : `${jobs.length} task${jobs.length === 1 ? '' : 's'}`
      }
      footer={
        completedCount > 0 ? (
          <MobileButton
            variant="plain"
            block
            icon={<Trash2 size={14} />}
            onClick={onClearCompleted}
          >Clear completed · {completedCount}</MobileButton>
        ) : undefined
      }
    >
      {jobs.length === 0 ? (
        <div className="m-ai-empty">
          AI generations show up here.
        </div>
      ) : (
        jobs.map((job) => (
          <JobRow
            key={job.jobId}
            job={job}
            status={statusMap.get(job.jobId) ?? 'queued'}
            onPick={() => onPickJob(job)}
            onX={() => void onJobX(job)}
          />
        ))
      )}
    </MobileBottomSheet>
  );
}

interface RowProps {
  job: BgAIJob;
  status: AIJobStatus;
  onPick: () => void;
  onX: () => void;
}

function JobRow({ job, status, onPick, onX }: RowProps) {
  // Pull the live job to surface elapsed-time on running rows so the panel
  // doesn't go stale while open. 3s polling matches the desktop cadence.
  const [live, setLive] = useState<AIJob | null>(null);
  useEffect(() => {
    if (status !== 'running' && status !== 'queued') return;
    let cancelled = false;
    const tick = async () => {
      try {
        const j = await aiApi.getJob(job.jobId);
        if (!cancelled) setLive(j);
      } catch { /* ignore */ }
    };
    tick();
    const id = setInterval(tick, 3000);
    return () => { cancelled = true; clearInterval(id); };
  }, [job.jobId, status]);

  const isActive = status === 'running' || status === 'queued';
  let elapsedStr = '';
  if (live?.started_at && status === 'running') {
    const s = Math.floor((Date.now() - new Date(live.started_at).getTime()) / 1000);
    elapsedStr = `${fmtSec(s)} elapsed`;
  } else if (status === 'queued') {
    elapsedStr = 'queued';
  }

  const icon = status === 'done' ? <Check size={16} />
    : status === 'failed' ? <X size={16} />
    : status === 'cancelled' ? <X size={16} />
    : status === 'running' ? <Loader2 size={16} className="animate-spin" />
    : <Sparkles size={16} />;

  const subLine = elapsedStr || STATUS_LABEL[status] || '';

  return (
    <div className="m-ai-job">
      <button type="button" className="m-ai-job__row" onClick={onPick}>
        <span className="m-ai-job__ico" data-state={status}>{icon}</span>
        <div className="m-ai-job__main">
          <span className="m-ai-job__title">{jobLabel(job)}</span>
          {subLine && (
            <span className="m-ai-job__sub" data-state={status}>{subLine}</span>
          )}
        </div>
      </button>
      <button
        type="button"
        className="m-ai-job__x"
        onClick={(e) => { e.stopPropagation(); onX(); }}
        aria-label={isActive ? 'Cancel' : 'Dismiss'}
      ><X size={13} /></button>
    </div>
  );
}
