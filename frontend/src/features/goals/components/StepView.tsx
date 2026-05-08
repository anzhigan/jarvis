import { useMemo } from 'react';
import { Check } from 'lucide-react';
import type { Task } from '../../../api/types';
import type { StepWithGoal } from '../hooks/useSteps';

interface Props {
  steps: StepWithGoal[];
  goals: Task[];
  onSelect: (id: string) => void;
}

type StepStatus = 'on-track' | 'upcoming' | 'done' | 'at-risk';

const STATUS_LABEL: Record<StepStatus, string> = {
  'on-track': 'On track',
  'upcoming': 'Upcoming',
  'done':     'Completed',
  'at-risk':  'At risk',
};

const ACCENTS = ['var(--moss)', 'var(--indigo)', 'var(--slate)', 'var(--ochre)', 'var(--rust)'] as const;

function accentFor(goalId: string): string {
  let h = 0;
  for (let i = 0; i < goalId.length; i++) h = (h * 31 + goalId.charCodeAt(i)) >>> 0;
  return ACCENTS[h % ACCENTS.length];
}

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function daysBetween(a: string, b: string): number {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400_000);
}

function fmtPeriod(start: string, end: string): string {
  const s = new Date(start);
  const e = new Date(end);
  const sameYear = s.getFullYear() === e.getFullYear();
  const fmt = (d: Date) => d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  if (sameYear && s.getFullYear() === new Date().getFullYear()) {
    return `${fmt(s)} — ${fmt(e)}`;
  }
  return `${fmt(s)} ${s.getFullYear()} — ${fmt(e)} ${e.getFullYear()}`;
}

function statusOf(step: StepWithGoal, today: string): StepStatus {
  if (step.is_completed) return 'done';
  if (step.start_date > today) return 'upcoming';
  if (step.end_date < today)   return 'at-risk';
  const total = Math.max(1, daysBetween(step.start_date, step.end_date));
  const elapsed = Math.max(0, daysBetween(step.start_date, today));
  const expectedPct = (elapsed / total) * 100;
  if (step.progress < expectedPct - 25) return 'at-risk';
  return 'on-track';
}

function footLabel(step: StepWithGoal, status: StepStatus, today: string): React.ReactNode {
  if (status === 'done') {
    return (
      <span className="step-done-badge">
        <Check size={11} />
        <span>Closed</span>
      </span>
    );
  }
  if (status === 'upcoming') {
    const days = daysBetween(today, step.start_date);
    return <span className="step-days">starts in {days} {days === 1 ? 'day' : 'days'}</span>;
  }
  // on-track or at-risk — both show "X days left" but at-risk colours warn
  const left = daysBetween(today, step.end_date);
  if (left < 0) {
    return <span className="step-days step-days-warn">{Math.abs(left)} days overdue</span>;
  }
  const className = status === 'at-risk' || left <= 7 ? 'step-days step-days-warn' : 'step-days';
  return <span className={className}>{left} {left === 1 ? 'day' : 'days'} left</span>;
}

export function StepView({ steps, goals, onSelect }: Props) {
  const goalById = useMemo(() => {
    const m = new Map<string, Task>();
    for (const g of goals) m.set(g.id, g);
    return m;
  }, [goals]);

  const today = ymd(new Date());
  const decorated = useMemo(() => steps.map((s) => ({
    step: s,
    status: statusOf(s, today),
    accent: accentFor(s.task_id),
    pct: Math.round(s.progress ?? 0),
  })), [steps, today]);

  // Order: at-risk first, then on-track, upcoming, done
  const ORDER: StepStatus[] = ['at-risk', 'on-track', 'upcoming', 'done'];
  const sorted = useMemo(() => [...decorated].sort((a, b) => {
    const oa = ORDER.indexOf(a.status);
    const ob = ORDER.indexOf(b.status);
    if (oa !== ob) return oa - ob;
    return a.step.end_date.localeCompare(b.step.end_date);
  }), [decorated]);

  if (steps.length === 0) {
    return (
      <div className="content-empty">
        <div className="content-empty-eyebrow">Step · milestones</div>
        <div className="content-empty-title">
          No <em>milestones</em> yet.
        </div>
        <div className="content-empty-desc">
          Steps break a goal into period-bound chapters. Add one from a goal's detail panel.
        </div>
      </div>
    );
  }

  const inProgress = decorated.filter((d) => d.status === 'on-track' || d.status === 'at-risk').length;

  return (
    <>
      <header className="go-hero">
        <div className="go-kicker">Time-bound milestones</div>
        <h1 className="go-hero-title">
          {steps.length} step{steps.length === 1 ? '' : 's'},<br />
          moving in <em>{inProgress > 0 ? 'parallel' : 'queue'}</em>.
        </h1>
        <p className="go-lede">
          Each step is a chapter in a larger goal. They have a start, an end,
          and a measurable percentage between.
        </p>
      </header>

      <div className="step-list">
        {sorted.map(({ step, status, accent, pct }) => {
          const goalTitle = goalById.get(step.task_id)?.title ?? step.task_title ?? 'Standalone';
          return (
            <article
              key={step.id}
              className="step-row"
              data-status={status}
              style={{ ['--accent' as any]: accent }}
              onClick={() => onSelect(step.id)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter') onSelect(step.id); }}
            >
              <div className="step-bar">
                <div className="step-bar-fill" style={{ width: `${pct}%` }} />
              </div>
              <div className="step-text">
                <div className="step-meta">
                  <span className="step-goal">{goalTitle}</span>
                  <span className={`step-status step-status-${status}`}>
                    {STATUS_LABEL[status]}
                  </span>
                </div>
                <h3 className="step-title">{step.title}</h3>
                <div className="step-foot">
                  <span className="step-period">{fmtPeriod(step.start_date, step.end_date)}</span>
                  <span className="step-foot-sep">·</span>
                  {footLabel(step, status, today)}
                </div>
              </div>
              <div className="step-pct">
                <span className="step-pct-num">
                  {pct}<span style={{ color: 'var(--ink-4)', fontWeight: 400 }}>%</span>
                </span>
              </div>
            </article>
          );
        })}
      </div>
    </>
  );
}
