import { useMemo } from 'react';
import { Drawer } from '../../components/ui';
import type { AIJob, InsightsOutput } from '../../api/types';
import { useAIJob } from './useAIJob';
import './ai.css';

interface Props {
  jobId: string | null;
  onClose: () => void;
  onRegenerate?: () => void;
}

type ViewState =
  | { kind: 'loading'; job: AIJob | null }
  | { kind: 'failed'; error: string }
  | { kind: 'result'; data: InsightsOutput };

const LOADING_STEPS = [
  'Loading week metrics',
  'Reviewing goals + Gos',
  'Composing narrative',
  'Polishing output',
];

export function InsightsDrawer({ jobId, onClose, onRegenerate }: Props) {
  const open = jobId !== null;
  const { job, error: pollError } = useAIJob(jobId);

  const view: ViewState = useMemo(() => {
    if (pollError) return { kind: 'failed', error: pollError };
    if (job?.status === 'failed') {
      return { kind: 'failed', error: job.error || 'review failed' };
    }
    if (job?.status === 'done') {
      const out = job.output_json as InsightsOutput | null;
      if (out && out.summary) return { kind: 'result', data: out };
    }
    return { kind: 'loading', job };
  }, [pollError, job]);

  const headerLabel = view.kind === 'result'
    ? `${view.data.week_start} — ${view.data.week_end}`
    : 'This week';

  return (
    <Drawer
      open={open}
      onOpenChange={(o) => { if (!o) onClose(); }}
      accent="analysis"
      title="Weekly review"
      description={headerLabel}
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
      {view.kind === 'result'  && <ResultView data={view.data} />}
    </Drawer>
  );
}


function LoadingView({ job }: { job: AIJob | null }) {
  let stepIdx = 0;
  if (job?.status === 'running') stepIdx = 2;
  if (job?.status === 'done') stepIdx = LOADING_STEPS.length;
  const eta = job?.eta_seconds ?? 120;

  return (
    <div className="ai-loading">
      <div className="ai-loading__sparkle"><div className="ai-spk" /></div>
      <h3 className="ai-loading__title">Building your review…</h3>
      <p className="ai-loading__sub">
        Reading your week's activity — created/closed Gos, active goals, overdue items.
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
  const friendly = error.toLowerCase().includes('no activity')
    ? 'No goals or Gos this week. Build up some activity first, then come back for a review.'
    : error;
  return (
    <div className="ai-empty">
      <div className="ai-empty__icon" data-tone="rust">!</div>
      <h3 className="ai-empty__title">Nothing to review</h3>
      <p className="ai-empty__body">{friendly}</p>
    </div>
  );
}


function ResultView({ data }: { data: InsightsOutput }) {
  const { summary, metrics } = data;
  const rows: { tone: 'success' | 'warning' | 'focus'; label: string; text: string }[] = [];
  if (summary.doing_well?.trim())      rows.push({ tone: 'success', label: 'Doing well',      text: summary.doing_well });
  if (summary.needs_attention?.trim()) rows.push({ tone: 'warning', label: 'Needs attention', text: summary.needs_attention });
  if (summary.focus?.trim())           rows.push({ tone: 'focus',   label: 'Focus next week', text: summary.focus });

  return (
    <div>
      {rows.length === 0 && (
        <p className="ai-loading__sub" style={{ textAlign: 'center', padding: '16px 0' }}>
          Model returned no observations for this week.
        </p>
      )}
      <div className="ai-insights-rows">
        {rows.map((r) => (
          <div className="ai-insight-row" data-tone={r.tone} key={r.label}>
            <div className="ai-insight-row__head">
              <span className="ai-insight-row__icon" data-tone={r.tone} aria-hidden>
                {r.tone === 'success' ? '★' : r.tone === 'warning' ? '⚠' : '✦'}
              </span>
              <span className="ai-insight-row__label">{r.label}</span>
            </div>
            <p className="ai-insight-row__text">{r.text}</p>
          </div>
        ))}
      </div>

      <div className="ai-metrics-strip">
        <Metric value={metrics.gos_created}     label="Gos created" />
        <Metric value={metrics.gos_closed}      label="Gos closed" />
        <Metric value={metrics.notes_created}   label="Notes" />
        <Metric value={metrics.overdue_count}   label="Overdue" tone={metrics.overdue_count > 0 ? 'warning' : undefined} />
        <Metric value={metrics.active_goals}    label="Active goals" />
      </div>
    </div>
  );
}

function Metric({ value, label, tone }: { value: number; label: string; tone?: 'warning' }) {
  return (
    <div className="ai-metric" data-tone={tone}>
      <div className="ai-metric__value">{value}</div>
      <div className="ai-metric__label">{label}</div>
    </div>
  );
}
