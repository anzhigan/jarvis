import { useMemo } from 'react';
import { Drawer } from '../../components/ui';
import type {
  AIJob, ScheduleOutput, ScheduleSlot, ScheduleSlotKind, ScheduleSummary,
} from '../../api/types';
import { useAIJob } from './useAIJob';
import './ai.css';

interface Props {
  jobId: string | null;
  /** Human-readable date for header. */
  dateLabel: string;
  onClose: () => void;
  onRegenerate?: () => void;
}

type ViewState =
  | { kind: 'loading'; job: AIJob | null }
  | { kind: 'failed'; error: string }
  | { kind: 'result'; data: ScheduleOutput };

const LOADING_STEPS = [
  'Loading today\'s goals + routines',
  'Building context',
  'Planning time blocks',
  'Polishing output',
];

export function ScheduleDrawer({ jobId, dateLabel, onClose, onRegenerate }: Props) {
  const open = jobId !== null;
  const { job, error: pollError } = useAIJob(jobId);

  const view: ViewState = useMemo(() => {
    if (pollError) return { kind: 'failed', error: pollError };
    if (job?.status === 'failed') {
      return { kind: 'failed', error: job.error || 'planning failed' };
    }
    if (job?.status === 'done') {
      const out = job.output_json as ScheduleOutput | null;
      if (out && Array.isArray(out.slots)) return { kind: 'result', data: out };
    }
    return { kind: 'loading', job };
  }, [pollError, job]);

  return (
    <Drawer
      open={open}
      onOpenChange={(o) => { if (!o) onClose(); }}
      accent="goals"
      title={view.kind === 'result' ? `Your day · ${dateLabel}` : 'Planning your day'}
      description={view.kind === 'result' && view.data.total_active_minutes
        ? `${Math.floor(view.data.total_active_minutes / 60)}h ${view.data.total_active_minutes % 60}m active`
        : `«${dateLabel}»`}
      footer={view.kind === 'result' ? (
        <>
          <button type="button" className="ai-btn ai-btn--ghost ai-btn--sm" onClick={onRegenerate}>
            Regenerate
          </button>
          <span style={{ flex: 1 }} />
          <button type="button" className="ai-btn ai-btn--primary ai-btn--sm" onClick={onClose}>
            Done
          </button>
        </>
      ) : view.kind === 'failed' ? (
        <>
          <span style={{ flex: 1 }} />
          <button type="button" className="ai-btn ai-btn--primary ai-btn--sm" onClick={onRegenerate}>
            Try again
          </button>
        </>
      ) : null}
    >
      {view.kind === 'loading' && <LoadingView job={view.job} />}
      {view.kind === 'failed'  && <FailedView error={view.error} />}
      {view.kind === 'result'  && (
        <>
          <SummaryCard summary={view.data.summary} />
          <ResultView slots={view.data.slots} />
        </>
      )}
    </Drawer>
  );
}


// ── Narrative summary card (above the timeline) ──────────────────────────────

function SummaryCard({ summary }: { summary: ScheduleSummary | undefined }) {
  if (!summary) return null;
  const rows: { tone: 'focus' | 'success' | 'warning'; label: string; text: string }[] = [];
  if (summary.focus?.trim())            rows.push({ tone: 'focus',   label: 'Focus',     text: summary.focus });
  if (summary.doing_well?.trim())       rows.push({ tone: 'success', label: 'On track',  text: summary.doing_well });
  if (summary.needs_attention?.trim())  rows.push({ tone: 'warning', label: 'Needs attention', text: summary.needs_attention });
  if (rows.length === 0) return null;

  return (
    <div className="ai-sched-summary">
      {rows.map((r) => (
        <div className="ai-sched-summary__row" data-tone={r.tone} key={r.label}>
          <div className="ai-sched-summary__label">{r.label}</div>
          <p className="ai-sched-summary__text">{r.text}</p>
        </div>
      ))}
    </div>
  );
}


function LoadingView({ job }: { job: AIJob | null }) {
  let stepIdx = 0;
  if (job?.status === 'running') stepIdx = 2;
  if (job?.status === 'done') stepIdx = LOADING_STEPS.length;
  const eta = job?.eta_seconds ?? 60;

  return (
    <div className="ai-loading">
      <div className="ai-loading__sparkle"><div className="ai-spk" /></div>
      <h3 className="ai-loading__title">Building your schedule…</h3>
      <p className="ai-loading__sub">
        Reading goals and routines for the day, then time-blocking them realistically.
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


function FailedView({ error }: { error: string }) {
  const friendly = error.toLowerCase().includes('no open go-tasks')
    ? 'No open Go-tasks found. Create at least one Go in Kanban or Go view, then try again.'
    : error;
  return (
    <div className="ai-empty">
      <div className="ai-empty__icon" data-tone="rust">!</div>
      <h3 className="ai-empty__title">Nothing to plan</h3>
      <p className="ai-empty__body">{friendly}</p>
    </div>
  );
}


// ── Result: vertical timeline ────────────────────────────────────────────────

const KIND_LABELS: Record<ScheduleSlotKind, string> = {
  goal: 'Goal',
  deep_work: 'Deep work',
  routine: 'Routine',
  admin: 'Admin',
  break: 'Break',
  lunch: 'Lunch',
  other: 'Other',
};

function ResultView({ slots }: { slots: ScheduleSlot[] }) {
  if (slots.length === 0) {
    return (
      <div className="ai-empty">
        <div className="ai-empty__icon" data-tone="slate">∅</div>
        <h3 className="ai-empty__title">Empty schedule</h3>
        <p className="ai-empty__body">
          Model returned no slots. Try Regenerate or check your work hours.
        </p>
      </div>
    );
  }
  return (
    <div className="ai-tl">
      {slots.map((s, i) => (
        <div className="ai-tl__slot" key={i} data-kind={s.kind}>
          <div className="ai-tl__time">
            {s.start_time}
            <br />
            {s.end_time}
          </div>
          <span className="ai-tl__dot" />
          <div className="ai-tl__body">
            <div className="ai-tl__title-row">
              <h4 className="ai-tl__title">{s.title}</h4>
              <span className="ai-tl__kind">{KIND_LABELS[s.kind] || s.kind}</span>
            </div>
            {s.note && <p className="ai-tl__note">{s.note}</p>}
          </div>
        </div>
      ))}
    </div>
  );
}
