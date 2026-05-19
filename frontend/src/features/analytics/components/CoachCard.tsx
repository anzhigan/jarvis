/**
 * CoachCard — action-oriented AI block on Analysis. Replaces the old
 * InsightsCard "Doing well / Needs attention / Focus next" with five
 * behaviour-science-grounded sections:
 *
 *   1. ONE PLAY (decision-fatigue antidote — single highest-leverage action)
 *   2. AT RISK (loss aversion — what you'll lose if no action)
 *   3. IF-THEN PLAN (Gollwitzer implementation intention) + Promise CTA
 *   4. CAPACITY (server-computed math + LLM narration)
 *   5. HIDDEN LEVER (Eisenhower Q2 — important, not urgent)
 *
 * Auto-fires a generation job on first render for the current period.
 * Cache layer on the backend handles instant repeats. Period changes
 * refire because the cache key includes window length.
 *
 * Promise button is currently UI-only: pressing it remembers (in
 * localStorage) that the user committed to the surfaced plan, and shows
 * a "Promised at HH:MM" confirmation. Persisting commits to the server
 * is a follow-up.
 */
import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, RefreshCw, Sparkles } from 'lucide-react';
import { aiApi } from '../../../api/client';
import type { AIJob, CoachOutput } from '../../../api/types';
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
  'all':  365,
};

// localStorage key for the user's most recent promise on a plan.
const PROMISE_KEY = 'jarvnote:coach:promise';
interface StoredPromise {
  trigger: string;
  action: string;
  promised_at: string;  // ISO
}

function loadPromise(): StoredPromise | null {
  try {
    const raw = localStorage.getItem(PROMISE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && parsed.trigger && parsed.action) {
      return parsed as StoredPromise;
    }
    return null;
  } catch { return null; }
}

function savePromise(p: StoredPromise | null): void {
  try {
    if (p) localStorage.setItem(PROMISE_KEY, JSON.stringify(p));
    else   localStorage.removeItem(PROMISE_KEY);
  } catch { /* storage full / disabled — best-effort */ }
}

export function CoachCard({ period }: Props) {
  const [jobId, setJobId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { job } = useAIJob(jobId);

  const start = useCallback(async () => {
    setError(null);
    try {
      const j = await aiApi.createCoach({ range_days: PERIOD_TO_DAYS[period] });
      setJobId(j.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'failed to start');
    }
  }, [period]);

  useEffect(() => { void start(); }, [start]);

  const isLoading = job && (job.status === 'queued' || job.status === 'running');
  const isFailed  = job?.status === 'failed' || error !== null;
  const data: CoachOutput | null =
    job?.status === 'done' ? (job.output_json as unknown as CoachOutput | null) : null;

  return (
    <section className="ana-row">
      <div className="coach-card">
        <header className="coach-card__head">
          <div className="coach-card__title-row">
            <span className="coach-card__spk" aria-hidden>
              <Sparkles size={14} />
            </span>
            <h3 className="coach-card__title">
              Plays for <em>today</em>
            </h3>
            {data && (
              <span className="coach-card__period">
                {data.period_start} — {data.period_end}
              </span>
            )}
          </div>
          <button
            type="button"
            className="coach-card__refresh"
            onClick={() => { void start(); }}
            disabled={Boolean(isLoading)}
            title="Refresh"
            aria-label="Refresh"
          >
            <RefreshCw size={13} className={isLoading ? 'animate-spin' : ''} />
          </button>
        </header>

        {isLoading && <LoadingState job={job!} />}
        {isFailed && !isLoading && (
          <FailedState error={(job?.error || error) ?? 'unknown error'} />
        )}
        {data && !isLoading && <CoachBody data={data} />}
      </div>
    </section>
  );
}


function LoadingState({ job }: { job: AIJob }) {
  const elapsed = job.started_at
    ? Math.floor((Date.now() - new Date(job.started_at).getTime()) / 1000)
    : 0;
  return (
    <div className="coach-card__loading">
      <div className="ai-spk" />
      <p>Building your plays… <span className="coach-card__elapsed">{elapsed}s elapsed</span></p>
    </div>
  );
}


function FailedState({ error }: { error: string }) {
  const friendly = error.toLowerCase().includes('no active')
    ? 'Start a goal or routine first — the coach needs something to work with.'
    : error;
  return <p className="coach-card__empty">{friendly}</p>;
}


function CoachBody({ data }: { data: CoachOutput }) {
  const { one_play, at_risk, if_then, capacity, hidden_lever } = data;

  return (
    <div className="coach-card__body">
      {/* THE ONE PLAY — fights decision fatigue with a single concrete action. */}
      <OnePlayBlock play={one_play} />

      {/* AT RISK — concrete losses (loss aversion). */}
      {at_risk.length > 0 && <AtRiskBlock risks={at_risk} />}

      {/* IF-THEN — implementation intention with Promise CTA. */}
      {if_then && <IfThenBlock plan={if_then} />}

      {/* CAPACITY — server-computed math + LLM narration. */}
      <CapacityBlock cap={capacity} />

      {/* HIDDEN LEVER — Eisenhower Q2. */}
      {hidden_lever && <HiddenLeverBlock lever={hidden_lever} />}
    </div>
  );
}


function OnePlayBlock({ play }: { play: CoachOutput['one_play'] }) {
  return (
    <div className="coach-lead">
      <div className="coach-lead__eyebrow">Your one play</div>
      <p className="coach-lead__text">{play.what}</p>
      {play.why && <p className="coach-lead__why">{play.why}</p>}
      <div className="coach-lead__cta">
        <button type="button" className="coach-btn coach-btn--primary">
          Start {play.est_minutes} min
        </button>
        <button type="button" className="coach-btn coach-btn--ghost">
          Different goal
        </button>
      </div>
    </div>
  );
}


function AtRiskBlock({ risks }: { risks: CoachOutput['at_risk'] }) {
  return (
    <section className="coach-block">
      <div className="coach-block__label coach-block__label--rust">
        At risk · if no action
      </div>
      <div className="coach-risk">
        {risks.map((r, i) => (
          <div key={i} className="coach-risk__row" data-tone={r.severity}>
            <span className="coach-risk__dot" />
            <span className="coach-risk__text">{r.what}</span>
            <span className="coach-risk__when">{r.when_label}</span>
          </div>
        ))}
      </div>
    </section>
  );
}


function IfThenBlock({ plan }: { plan: NonNullable<CoachOutput['if_then']> }) {
  const [stored, setStored] = useState<StoredPromise | null>(() => loadPromise());

  // If the user already promised this exact plan, keep the badge visible.
  const isThisPromised = stored
    && stored.trigger === plan.trigger
    && stored.action === plan.action;

  const promise = () => {
    const next: StoredPromise = {
      trigger: plan.trigger,
      action: plan.action,
      promised_at: new Date().toISOString(),
    };
    savePromise(next);
    setStored(next);
  };

  const unpromise = () => {
    savePromise(null);
    setStored(null);
  };

  return (
    <section className="coach-block">
      <div className="coach-block__label coach-block__label--moss">
        Plan · pre-commit
      </div>
      <div className="coach-plan">
        <p className="coach-plan__line">
          <span className="coach-plan__kw">IF</span> {plan.trigger},{' '}
          <span className="coach-plan__kw">THEN</span> {plan.action}
        </p>
        <div className="coach-plan__actions">
          {isThisPromised ? (
            <>
              <span className="coach-plan__promised">
                <CheckCircle2 size={13} />
                Promised · {new Date(stored!.promised_at).toLocaleTimeString(undefined, {
                  hour: '2-digit', minute: '2-digit',
                })}
              </span>
              <button type="button" className="coach-btn coach-btn--ghost" onClick={unpromise}>
                Undo
              </button>
            </>
          ) : (
            <>
              <button type="button" className="coach-btn coach-btn--moss" onClick={promise}>
                ✓ Promise
              </button>
              <button type="button" className="coach-btn coach-btn--ghost">Edit</button>
            </>
          )}
        </div>
      </div>
    </section>
  );
}


function CapacityBlock({ cap }: { cap: CoachOutput['capacity'] }) {
  const overload = cap.gap > 0;
  const note = cap.note || (
    overload
      ? `${cap.due_count} due in 7 days; you usually close ${cap.throughput_per_week}. Pull ${cap.gap} forward or defer.`
      : `${cap.due_count} due in 7 days; you usually close ${cap.throughput_per_week}. Room to take on more.`
  );

  // Bar width — load relative to (cap × 1.4) so a balanced load lands ~70%.
  const denom = Math.max(1, cap.throughput_per_week * 1.4);
  const loadPct = Math.min(100, (cap.due_count / denom) * 100);
  const capPct = Math.min(100, (cap.throughput_per_week / denom) * 100);

  return (
    <section className="coach-block">
      <div className="coach-block__label coach-block__label--ochre">
        Capacity · next 7 days
      </div>
      <div className="coach-cap">
        <span className="coach-cap__text">{note}</span>
        <span className="coach-cap__num" data-tone={overload ? 'bad' : 'good'}>
          {overload ? `+${cap.gap} over` : cap.gap === 0 ? 'on target' : `${-cap.gap} headroom`}
        </span>
        <div className="coach-cap__bar">
          <div
            className="coach-cap__bar-load"
            style={{ width: `${loadPct.toFixed(1)}%` }}
            data-tone={overload ? 'bad' : 'good'}
          />
          <div className="coach-cap__bar-cap" style={{ left: `${capPct.toFixed(1)}%` }} />
        </div>
      </div>
    </section>
  );
}


function HiddenLeverBlock({ lever }: { lever: NonNullable<CoachOutput['hidden_lever']> }) {
  return (
    <section className="coach-block">
      <div className="coach-block__label coach-block__label--neutral">
        Hidden lever · important, not urgent
      </div>
      <div className="coach-lever">
        <p className="coach-lever__text">
          <strong>{lever.what}</strong>
          {lever.why && <> {lever.why}</>}
        </p>
      </div>
    </section>
  );
}
