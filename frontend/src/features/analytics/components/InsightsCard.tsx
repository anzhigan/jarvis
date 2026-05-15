import { RefreshCw, Sparkles } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { aiApi } from '../../../api/client';
import type { AIJob, InsightsOutput } from '../../../api/types';
import type { PeriodKey } from '../hooks/useAnalytics';
import { useAIJob } from '../../ai/useAIJob';

interface Props {
  period: PeriodKey;
}

const PERIOD_TO_DAYS: Record<PeriodKey, number> = {
  '7d':   7,
  '30d':  30,
  '90d':  90,
  '365d': 365,
  'all':  365,  // backend cap; 'all' shown as last 365 days for practical narrative
};

/**
 * Inline AI review card at the top of AnalysisView. Auto-fires a generation
 * job on first render for the current period (cache hit ⇒ instant). When
 * the user switches period, fires a new request — cache layer covers repeats.
 *
 * No drawer here — render directly in the page so it sits alongside the other
 * analytics cards.
 */
export function InsightsCard({ period }: Props) {
  const [jobId, setJobId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { job } = useAIJob(jobId);

  const start = useCallback(async () => {
    setError(null);
    try {
      const j = await aiApi.createInsights({
        range_days: PERIOD_TO_DAYS[period],
      });
      setJobId(j.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'failed to start');
    }
  }, [period]);

  // Auto-trigger when period changes. Cache hits are instant; misses generate.
  useEffect(() => {
    void start();
  }, [start]);

  // Reset when the JOB itself transitions to terminal — keeps polling clean.
  const isLoading = job && (job.status === 'queued' || job.status === 'running');
  const isFailed  = job?.status === 'failed' || error !== null;
  const data: InsightsOutput | null =
    job?.status === 'done' ? (job.output_json as InsightsOutput | null) : null;

  return (
    <section className="ana-row">
      <div className="ana-insights-card">
        <header className="ana-insights-card__head">
          <div className="ana-insights-card__title-row">
            <span className="ana-insights-card__spk" aria-hidden>
              <Sparkles size={14} />
            </span>
            <h3 className="ana-insights-card__title">
              AI <em>review</em>
            </h3>
            {data && (
              <span className="ana-insights-card__period">
                {data.week_start} — {data.week_end}
              </span>
            )}
          </div>
          <button
            type="button"
            className="ana-insights-card__refresh"
            onClick={() => { void start(); }}
            disabled={Boolean(isLoading)}
            title="Refresh review"
            aria-label="Refresh"
          >
            <RefreshCw size={13} className={isLoading ? 'animate-spin' : ''} />
          </button>
        </header>

        {isLoading && <LoadingState job={job!} />}
        {isFailed && !isLoading && (
          <FailedState error={(job?.error || error) ?? 'unknown error'} />
        )}
        {data && !isLoading && (
          <ResultBody data={data} />
        )}
      </div>
    </section>
  );
}


function LoadingState({ job }: { job: AIJob }) {
  const elapsed = job.started_at
    ? Math.floor((Date.now() - new Date(job.started_at).getTime()) / 1000)
    : 0;
  return (
    <div className="ana-insights-card__loading">
      <div className="ai-spk" />
      <p>Building review… <span className="ana-insights-card__elapsed">{elapsed}s elapsed</span></p>
    </div>
  );
}


function FailedState({ error }: { error: string }) {
  const friendly = error.toLowerCase().includes('no activity')
    ? 'No activity in this window — nothing to review yet.'
    : error;
  return <p className="ana-insights-card__empty">{friendly}</p>;
}


function ResultBody({ data }: { data: InsightsOutput }) {
  const { summary, metrics } = data;
  const rows: { tone: 'success' | 'warning' | 'focus'; label: string; text: string }[] = [];
  if (summary.doing_well?.trim())      rows.push({ tone: 'success', label: 'Doing well',     text: summary.doing_well });
  if (summary.needs_attention?.trim()) rows.push({ tone: 'warning', label: 'Needs attention', text: summary.needs_attention });
  if (summary.focus?.trim())           rows.push({ tone: 'focus',   label: 'Focus next',      text: summary.focus });

  return (
    <div className="ana-insights-card__body">
      {rows.length === 0 && (
        <p className="ana-insights-card__empty">No observations for this window.</p>
      )}
      <div className="ana-insights-card__rows">
        {rows.map((r) => (
          <div className="ana-insights-card__row" data-tone={r.tone} key={r.label}>
            <span className="ana-insights-card__row-label">{r.label}</span>
            <p className="ana-insights-card__row-text">{r.text}</p>
          </div>
        ))}
      </div>
      <div className="ana-insights-card__metrics">
        <Metric value={metrics.gos_created}   label="Gos created" />
        <Metric value={metrics.gos_closed}    label="Gos closed" />
        <Metric value={metrics.notes_created} label="Notes" />
        <Metric value={metrics.overdue_count} label="Overdue"
                tone={metrics.overdue_count > 0 ? 'warning' : undefined} />
        <Metric value={metrics.active_goals}  label="Active goals" />
      </div>
    </div>
  );
}

function Metric({ value, label, tone }: { value: number; label: string; tone?: 'warning' }) {
  return (
    <div className="ana-insights-card__metric" data-tone={tone}>
      <span className="ana-insights-card__metric-val">{value}</span>
      <span className="ana-insights-card__metric-lbl">{label}</span>
    </div>
  );
}
