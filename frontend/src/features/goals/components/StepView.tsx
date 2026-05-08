import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Check, MoreHorizontal } from 'lucide-react';
import type { Task } from '../../../api/types';
import type { StepWithGoal } from '../hooks/useSteps';

interface Props {
  steps: StepWithGoal[];
  goals: Task[];
  /** Open the goal detail panel for the selected step's parent. */
  onSelect: (id: string) => void;
  /** Toggle step completion. */
  onToggleDone?: (stepId: string, current: boolean) => void;
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
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86_400_000);
}

function statusOf(step: StepWithGoal, today: string): StepStatus {
  if (step.is_completed) return 'done';
  if (step.start_date > today) return 'upcoming';
  if (step.end_date < today)   return 'at-risk';
  const total = Math.max(1, daysBetween(step.start_date, step.end_date));
  const elapsed = Math.max(0, daysBetween(step.start_date, today));
  const expectedPct = (elapsed / total) * 100;
  if ((step.progress ?? 0) < expectedPct - 25) return 'at-risk';
  return 'on-track';
}

interface Window { start: Date; end: Date; totalMs: number; }

function computeWindow(steps: StepWithGoal[]): Window {
  if (steps.length === 0) {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth() - 2, 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 4, 0, 23, 59, 59);
    return { start, end, totalMs: end.getTime() - start.getTime() };
  }
  let minDate = new Date(steps[0].start_date);
  let maxDate = new Date(steps[0].end_date);
  for (const s of steps) {
    const sd = new Date(s.start_date);
    const ed = new Date(s.end_date);
    if (sd < minDate) minDate = sd;
    if (ed > maxDate) maxDate = ed;
  }
  // Snap to month boundaries with a half-month padding on both sides so bars
  // never touch the lane edges.
  const start = new Date(minDate.getFullYear(), minDate.getMonth(), 1);
  const end = new Date(maxDate.getFullYear(), maxDate.getMonth() + 1, 0, 23, 59, 59);
  return { start, end, totalMs: end.getTime() - start.getTime() };
}

function pctOf(date: Date, w: Window): number {
  return Math.max(0, Math.min(100, ((date.getTime() - w.start.getTime()) / w.totalMs) * 100));
}

function months(w: Window): { label: string; left: number; width: number }[] {
  const out: { label: string; left: number; width: number }[] = [];
  let cur = new Date(w.start.getFullYear(), w.start.getMonth(), 1);
  while (cur <= w.end) {
    const monthStart = new Date(cur);
    const monthEnd = new Date(cur.getFullYear(), cur.getMonth() + 1, 0, 23, 59, 59);
    const left = pctOf(monthStart, w);
    const right = pctOf(monthEnd, w);
    out.push({
      label: monthStart.toLocaleDateString(undefined, { month: 'short' }),
      left,
      width: right - left,
    });
    cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
  }
  return out;
}

function fmtPeriodLabel(w: Window): string {
  const startLbl = w.start.toLocaleDateString(undefined, { month: 'short' });
  const endLbl = w.end.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
  const monthCount = (w.end.getFullYear() - w.start.getFullYear()) * 12
    + (w.end.getMonth() - w.start.getMonth()) + 1;
  return `${startLbl} — ${endLbl} · ${monthCount} months`;
}

function fmtDay(d: Date | string): string {
  const dd = typeof d === 'string' ? new Date(d) : d;
  return dd.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function StepView({ steps, goals, onSelect, onToggleDone }: Props) {
  const today = ymd(new Date());
  const todayDate = useMemo(() => {
    const d = new Date(); d.setHours(0, 0, 0, 0); return d;
  }, []);

  const goalById = useMemo(() => {
    const m = new Map<string, Task>();
    for (const g of goals) m.set(g.id, g);
    return m;
  }, [goals]);

  const decorated = useMemo(() => steps.map((s) => ({
    step: s,
    status: statusOf(s, today),
    accent: accentFor(s.task_id),
    pct: Math.round(s.progress ?? 0),
  })), [steps, today]);

  const summary = useMemo(() => {
    const out = { done: 0, active: 0, atRisk: 0, upcoming: 0 };
    for (const d of decorated) {
      if (d.status === 'done') out.done++;
      else if (d.status === 'on-track') out.active++;
      else if (d.status === 'at-risk') out.atRisk++;
      else out.upcoming++;
    }
    return out;
  }, [decorated]);

  const window = useMemo(() => computeWindow(steps), [steps]);
  const monthSegments = useMemo(() => months(window), [window]);
  const todayLeft = todayDate >= window.start && todayDate <= window.end
    ? pctOf(todayDate, window)
    : null;

  // Group bars by goal for lanes — sorted by earliest step start.
  const lanes = useMemo(() => {
    const byGoal = new Map<string, typeof decorated>();
    for (const d of decorated) {
      const arr = byGoal.get(d.step.task_id);
      if (arr) arr.push(d); else byGoal.set(d.step.task_id, [d]);
    }
    const out: { goalId: string; goal: Task | null; accent: string; bars: typeof decorated }[] = [];
    for (const [goalId, bars] of byGoal) {
      out.push({
        goalId,
        goal: goalById.get(goalId) ?? null,
        accent: accentFor(goalId),
        bars: [...bars].sort((a, b) => a.step.start_date.localeCompare(b.step.start_date)),
      });
    }
    out.sort((a, b) => {
      const aStart = a.bars[0]?.step.start_date ?? '9999';
      const bStart = b.bars[0]?.step.start_date ?? '9999';
      return aStart.localeCompare(bStart);
    });
    return out;
  }, [decorated, goalById]);

  // Default selection: prefer at-risk → on-track → upcoming → done.
  const ORDER: StepStatus[] = ['at-risk', 'on-track', 'upcoming', 'done'];
  const [selectedId, setSelectedId] = useState<string | null>(null);
  useEffect(() => {
    if (decorated.length === 0) { setSelectedId(null); return; }
    if (selectedId && decorated.find((d) => d.step.id === selectedId)) return;
    const best = [...decorated].sort((a, b) => {
      const oa = ORDER.indexOf(a.status);
      const ob = ORDER.indexOf(b.status);
      if (oa !== ob) return oa - ob;
      return a.step.end_date.localeCompare(b.step.end_date);
    })[0];
    setSelectedId(best?.step.id ?? null);
    // ORDER is module-level constant, deps are decorated/selectedId
  }, [decorated, selectedId]);

  if (steps.length === 0) {
    return (
      <div className="content-empty">
        <div className="content-empty-eyebrow">Step · timeline</div>
        <div className="content-empty-title">
          No <em>milestones</em> yet.
        </div>
        <div className="content-empty-desc">
          Steps break a goal into period-bound chapters. Add one from a goal's detail panel.
        </div>
      </div>
    );
  }

  const stepCount = steps.length;
  const heroTitle = stepCount === 1
    ? <>One step,<br /><em>charted</em>.</>
    : <>{stepCount} steps,<br /><em>charted</em>.</>;

  const selected = decorated.find((d) => d.step.id === selectedId) ?? null;

  return (
    <div className="step-shell">
      {/* LEFT — gantt timeline */}
      <section className="step-main">
        <header className="step-head">
          <div>
            <div className="go-eyebrow">{fmtPeriodLabel(window)}</div>
            <h1 className="step-head-title">{heroTitle}</h1>
          </div>
          <div className="step-head-summary">
            <div className="cal-sum-cell">
              <span className="cal-sum-num">{summary.done}</span>
              <span className="cal-sum-lab">Done</span>
            </div>
            <div className="cal-sum-cell">
              <span className="cal-sum-num">{summary.active}</span>
              <span className="cal-sum-lab">Active</span>
            </div>
            <div className="cal-sum-cell">
              <span className="cal-sum-num">{summary.atRisk}</span>
              <span className="cal-sum-lab">At risk</span>
            </div>
            <div className="cal-sum-cell">
              <span className="cal-sum-num">{summary.upcoming}</span>
              <span className="cal-sum-lab">Upcoming</span>
            </div>
          </div>
        </header>

        <div className="gantt">
          <div className="gantt-header">
            <div className="gt-axis">
              {monthSegments.map((m, i) => (
                <div key={i} className="gt-month" style={{ left: `${m.left}%`, width: `${m.width}%` }}>
                  <span className="gt-month-label">{m.label}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="gantt-body">
            <div className="gt-grid">
              {monthSegments.slice(1).map((m, i) => (
                <div key={i} className="gt-grid-line" style={{ left: `${m.left}%` }} />
              ))}
              {todayLeft !== null && (
                <>
                  <div className="gt-today-line" style={{ left: `${todayLeft}%` }} />
                  <div className="gt-today-flag" style={{ left: `${todayLeft}%` }}>
                    <span>Today · {fmtDay(todayDate)}</span>
                  </div>
                </>
              )}
            </div>

            <div className="gt-lanes">
              {lanes.map((lane) => {
                const goalTitle = lane.goal?.title ?? lane.bars[0]?.step.task_title ?? 'Standalone';
                return (
                  <div className="gt-lane" key={lane.goalId}>
                    <div className="gt-lane-label" style={{ ['--gc' as any]: lane.accent }}>
                      <span className="gt-lane-dot" />
                      <span className="gt-lane-name">{goalTitle}</span>
                      <span className="gt-lane-count">{lane.bars.length}</span>
                    </div>
                    <div className="gt-lane-track">
                      {lane.bars.map(({ step, status, pct }) => {
                        const left = pctOf(new Date(step.start_date), window);
                        const right = pctOf(new Date(step.end_date), window);
                        const width = Math.max(1, right - left);
                        const isTiny = width < 4;
                        const showFill = status === 'on-track' || status === 'at-risk';
                        const showPct = (status === 'on-track' || status === 'at-risk') && width >= 8;
                        return (
                          <button
                            key={step.id}
                            className="gt-bar"
                            data-status={status}
                            data-selected={step.id === selectedId || undefined}
                            style={{
                              left: `${left}%`,
                              width: `${width}%`,
                              ['--gc' as any]: lane.accent,
                            }}
                            onClick={() => setSelectedId(step.id)}
                            title={`${step.title} · ${STATUS_LABEL[status]} · ${pct}%`}
                          >
                            {showFill && <div className="gt-bar-fill" style={{ width: `${pct}%` }} />}
                            <span className="gt-bar-content">
                              <span className={`gt-bar-title${isTiny ? ' gt-bar-title-tiny' : ''}`}>
                                {step.title}
                              </span>
                              {showPct && <span className="gt-bar-pct">{pct}%</span>}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="step-legend">
          <span className="step-legend-item"><span className="sl-swatch sl-swatch-done" />Done</span>
          <span className="step-legend-item"><span className="sl-swatch sl-swatch-on" />On track</span>
          <span className="step-legend-item"><span className="sl-swatch sl-swatch-risk" />At risk</span>
          <span className="step-legend-item"><span className="sl-swatch sl-swatch-up" />Upcoming</span>
        </div>
      </section>

      {/* RIGHT — detail pane */}
      <aside className="step-detail">
        {selected ? (
          <StepDetail
            decorated={selected}
            goal={goalById.get(selected.step.task_id) ?? null}
            today={todayDate}
            onViewGoal={() => onSelect(selected.step.task_id)}
            onToggleDone={onToggleDone
              ? () => onToggleDone(selected.step.id, selected.step.is_completed)
              : undefined}
          />
        ) : (
          <div className="dp-scroll" />
        )}
      </aside>
    </div>
  );
}

/* ── Right detail pane ───────────────────────────────────────────────────── */

interface StepDetailProps {
  decorated: { step: StepWithGoal; status: StepStatus; accent: string; pct: number };
  goal: Task | null;
  today: Date;
  onViewGoal: () => void;
  onToggleDone?: () => void;
}

function StepDetail({ decorated, goal, today, onViewGoal, onToggleDone }: StepDetailProps) {
  const { step, status, accent, pct } = decorated;
  const todayKey = ymd(today);
  const total = Math.max(1, daysBetween(step.start_date, step.end_date));
  const elapsed = Math.max(0, Math.min(total, daysBetween(step.start_date, todayKey)));
  const remaining = Math.max(0, total - elapsed);
  const expectedPct = Math.round((elapsed / total) * 100);
  const diff = pct - expectedPct;

  const goalTitle = goal?.title ?? step.task_title ?? 'Standalone';

  // Gos within this step — derived from the eager-loaded step.gos array.
  const stepGos = step.gos ?? [];
  const gosDone = stepGos.filter((g) => g.is_done_today).length;

  return (
    <>
      <header className="dp-head">
        <div className="dp-head-tag" style={{ background: accent }}>
          <span className="dp-head-tag-dot" />
          {goalTitle}
        </div>
        <button className="icon-btn" title="More" aria-label="More"><MoreHorizontal /></button>
      </header>

      <div className="dp-scroll">
        <div className="dp-step-status">
          <span className="dp-step-status-pill">{STATUS_LABEL[status]}</span>
        </div>

        <h2 className="dp-title">{step.title}</h2>

        {step.description && (
          <p className="dp-step-desc">{step.description}</p>
        )}

        <div className="dp-period-strip">
          <div className="dp-period-cell">
            <span className="dp-period-label">Started</span>
            <span className="dp-period-date">{fmtDay(step.start_date)}</span>
          </div>
          <div className="dp-period-arrow">→</div>
          <div className="dp-period-cell">
            <span className="dp-period-label">Ends</span>
            <span className="dp-period-date">{fmtDay(step.end_date)}</span>
          </div>
        </div>

        <div className="dp-prog-card">
          <div className="dp-prog-row">
            <div className="dp-prog-label">Progress</div>
            <div className="dp-prog-num">{pct}<em>%</em></div>
          </div>
          <div className="dp-prog-bar">
            <div className="dp-prog-bar-fill" style={{ width: `${pct}%` }} />
            {status !== 'done' && status !== 'upcoming' && (
              <div
                className="dp-prog-expected"
                style={{ left: `${expectedPct}%` }}
                title={`expected by today: ${expectedPct}%`}
              />
            )}
          </div>
          {status !== 'done' && status !== 'upcoming' && (
            <div className="dp-prog-meta">
              <span>Expected by today: <b>{expectedPct}%</b></span>
              <span className={`dp-prog-diff ${diff >= 0 ? 'dp-prog-diff-ahead' : 'dp-prog-diff-behind'}`}>
                {diff >= 0 ? `+${diff}% ahead` : `${diff}% behind`}
              </span>
            </div>
          )}
        </div>

        <div className="dp-meta-strip">
          <div className="dp-meta-cell">
            <span className="dp-meta-num">{elapsed}<em>d</em></span>
            <span className="dp-meta-lab">Elapsed</span>
          </div>
          <div className="dp-meta-cell">
            <span className="dp-meta-num">{remaining}<em>d</em></span>
            <span className="dp-meta-lab">Remaining</span>
          </div>
          <div className="dp-meta-cell">
            <span className="dp-meta-num">{total}<em>d</em></span>
            <span className="dp-meta-lab">Total</span>
          </div>
        </div>

        {stepGos.length > 0 && (
          <div className="dp-section">
            <div className="dp-section-head">
              <span>Gos in this step</span>
              <span className="dp-section-meta">{gosDone} of {stepGos.length} done</span>
            </div>
            <div className="dp-go-list">
              {stepGos.map((g) => {
                const done = g.is_done_today;
                const cls = done ? 'dp-go-done' : '';
                return (
                  <div className={`dp-go-row ${cls}`} key={g.id}>
                    <span className={`dp-go-icon${done ? ' dp-go-icon-done' : ''}`}>
                      {done && <Check />}
                    </span>
                    <div className="dp-go-text">
                      <div className="dp-go-kind">{g.kind} · {done ? 'done' : 'pending'}</div>
                      <div className="dp-go-title">{g.title}</div>
                    </div>
                    {g.due_date && (
                      <span className="dp-go-meta">
                        {done ? fmtDay(g.due_date) : `due ${fmtDay(g.due_date)}`}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="dp-actions">
          {onToggleDone && (
            <button className="dp-action-btn" onClick={onToggleDone}>
              {step.is_completed ? 'Reopen step' : 'Mark done'}
            </button>
          )}
          <button className="dp-action-btn dp-action-secondary" onClick={onViewGoal}>
            View goal <ArrowRight />
          </button>
        </div>

        <div style={{ height: 24 }} />
      </div>
    </>
  );
}
