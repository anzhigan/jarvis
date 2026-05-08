import { useEffect, useMemo, useState } from 'react';
import { Check, Edit3, Minus, Plus, Repeat, X } from 'lucide-react';
import type { Go, Task } from '../../../api/types';
import { goCurrentStreak, groupGosByGoal } from '../hooks/useGos';

interface Props {
  gos: Go[];
  goals: Task[];
  /** Boolean toggle ↔ numeric set: parent decides next value before calling. */
  onLog: (go: Go, nextValue: number) => void;
  /** Skip = log 0; kept as a separate prop so the parent can attach analytics if needed. */
  onSkip: (go: Go) => void;
  /** Open the goal detail panel (3-dot edit). */
  onSelectGoal: (id: string) => void;
}

const ACCENTS = ['var(--moss)', 'var(--indigo)', 'var(--slate)', 'var(--ochre)', 'var(--rust)'] as const;

/** Deterministic accent for a given goal id (so colours stay stable across renders). */
function accentFor(goalId: string): string {
  let h = 0;
  for (let i = 0; i < goalId.length; i++) h = (h * 31 + goalId.charCodeAt(i)) >>> 0;
  return ACCENTS[h % ACCENTS.length];
}

const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function todayValue(go: Go): number {
  const k = ymd(new Date());
  return go.entries.find((e) => e.date === k)?.value ?? 0;
}

function fmtToday(): string {
  const d = new Date();
  return d.toLocaleDateString(undefined, {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
}

function fmtDue(due: string | null): { label: string; days: number | null } {
  if (!due) return { label: 'no deadline', days: null };
  const t0 = new Date(); t0.setHours(0, 0, 0, 0);
  const d = new Date(due);
  const days = Math.round((d.getTime() - t0.getTime()) / 86_400_000);
  const dateLbl = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  return { label: dateLbl, days };
}

function goalPct(t: Task): number {
  if (t.status === 'done') return 100;
  const stepsTotal = t.sprints.length;
  const stepsDone = t.sprints.filter((s) => s.is_completed).length;
  if (stepsTotal > 0) return Math.round((stepsDone / stepsTotal) * 100);
  return Math.round(t.progress);
}

export function GoView({ gos, goals, onLog, onSkip, onSelectGoal }: Props) {
  const grouped = useMemo(() => groupGosByGoal(gos), [gos]);
  const goalById = useMemo(() => {
    const m = new Map<string, Task>();
    for (const t of goals) m.set(t.id, t);
    return m;
  }, [goals]);

  // Active goals that have at least one Go (today's targets).
  const activeGoals = useMemo(
    () => goals
      .filter((t) => t.status === 'active' && (grouped.get(t.id)?.length ?? 0) > 0)
      .sort((a, b) => a.order - b.order),
    [goals, grouped],
  );

  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Default to first active goal; reset if the current selection vanishes.
  useEffect(() => {
    if (activeGoals.length === 0) { setSelectedId(null); return; }
    if (!selectedId || !activeGoals.find((g) => g.id === selectedId)) {
      setSelectedId(activeGoals[0].id);
    }
  }, [activeGoals, selectedId]);

  const totals = useMemo(() => {
    const done = gos.filter((g) => g.is_done_today).length;
    const total = gos.length;
    const pending = total - done;
    const goalsWithDoneToday = new Set(
      gos.filter((g) => g.is_done_today && g.task_id).map((g) => g.task_id!),
    ).size;
    return { done, total, pending, advancingGoals: goalsWithDoneToday, totalGoals: activeGoals.length };
  }, [gos, activeGoals.length]);

  if (gos.length === 0) {
    return (
      <div className="content-empty">
        <div className="content-empty-eyebrow">Go · today</div>
        <div className="content-empty-title">
          Nothing <em>scheduled</em> today.
        </div>
        <div className="content-empty-desc">
          Set daily targets on your active goals to see them here.
        </div>
      </div>
    );
  }

  const heroTitle = totals.total === 0
    ? <>Nothing scheduled<br />for today.</>
    : totals.done === 0
      ? <>Nothing done yet,<br /><em>{totals.total}</em> waiting.</>
      : totals.done === totals.total
        ? <>All <em>{totals.total}</em>,<br />knocked out.</>
        : <><em>{totals.done} of {totals.total}</em>,<br />on the board.</>;

  return (
    <div className="go-shell">
      <aside className="go-leftpane">
        <header className="go-leftpane-head">
          <div className="go-eyebrow">{fmtToday()}</div>
          <h2 className="go-leftpane-title">{heroTitle}</h2>
          <p className="go-leftpane-sub">
            {totals.advancingGoals} of {activeGoals.length} active {activeGoals.length === 1 ? 'goal' : 'goals'} already advanced today.
          </p>
        </header>

        <div className="go-leftpane-stats">
          <div className="lps-cell">
            <span className="lps-num">{totals.done}</span>
            <span className="lps-lab">Done</span>
          </div>
          <div className="lps-cell">
            <span className="lps-num">{totals.pending}</span>
            <span className="lps-lab">Pending</span>
          </div>
          <div className="lps-cell">
            <span className="lps-num">{totals.advancingGoals}/{activeGoals.length}</span>
            <span className="lps-lab">Goals</span>
          </div>
        </div>

        <div className="go-leftpane-list-head">
          <span>Active goals</span>
          <span className="go-list-rule" />
          <span className="go-list-meta">{activeGoals.length}</span>
        </div>

        <div className="gl-list">
          {activeGoals.map((goal) => {
            const items = grouped.get(goal.id) ?? [];
            const todayDone = items.filter((g) => g.is_done_today).length;
            const todayTotal = items.length;
            const accent = accentFor(goal.id);
            const pct = goalPct(goal);
            const due = fmtDue(goal.due_date);
            const maxStreak = items.reduce((m, g) => Math.max(m, goCurrentStreak(g)), 0);

            const todayCls = todayTotal === 0
              ? 'gl-card-today-none'
              : todayDone === 0
                ? 'gl-card-today-pending'
                : todayDone < todayTotal
                  ? 'gl-card-today-mid'
                  : 'gl-card-today-done';
            const todayTxt = todayTotal === 0
              ? 'no targets today'
              : todayDone === 0
                ? `${todayTotal} pending today`
                : todayDone < todayTotal
                  ? `${todayDone}/${todayTotal} today`
                  : 'all done today';

            return (
              <button
                key={goal.id}
                className="gl-card"
                data-selected={goal.id === selectedId || undefined}
                style={{ ['--gc' as any]: accent }}
                onClick={() => setSelectedId(goal.id)}
              >
                <div className="gl-card-bar">
                  <div className="gl-card-bar-fill" style={{ width: `${pct}%` }} />
                </div>
                <div className="gl-card-text">
                  <div className="gl-card-row1">
                    <h3 className="gl-card-title">{goal.title}</h3>
                    <span className="gl-card-pct">{pct}%</span>
                  </div>
                  {goal.description && (
                    <p className="gl-card-desc">{goal.description}</p>
                  )}
                  <div className="gl-card-meta">
                    <span className={`gl-card-today ${todayCls}`}>{todayTxt}</span>
                    {maxStreak > 0 && (
                      <span className="gl-card-streak">↻ {maxStreak}d</span>
                    )}
                    <span className={`gl-card-due${due.days === null ? ' gl-card-due-none' : ''}`}>
                      {due.days === null
                        ? 'no deadline'
                        : due.days < 0
                          ? `${due.label} · overdue`
                          : `due ${due.label} · ${due.days}d`}
                    </span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </aside>

      <section className="go-rightpane">
        <div className="content-scroll">
          {selectedId && goalById.has(selectedId) && (
            <FocusedGoal
              goal={goalById.get(selectedId)!}
              gos={grouped.get(selectedId) ?? []}
              onLog={onLog}
              onSkip={onSkip}
              onEditGoal={() => onSelectGoal(selectedId)}
            />
          )}
          {!selectedId && (
            <div className="content-empty" style={{ minHeight: 320 }}>
              <div className="content-empty-eyebrow">No goal selected</div>
              <div className="content-empty-title">
                Pick a goal <em>on the left</em>.
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

/* ── Right pane: selected goal + today's targets + recent days ────────────── */

interface FocusedProps {
  goal: Task;
  gos: Go[];
  onLog: (go: Go, value: number) => void;
  onSkip: (go: Go) => void;
  onEditGoal: () => void;
}

function FocusedGoal({ goal, gos, onLog, onSkip, onEditGoal }: FocusedProps) {
  const accent = accentFor(goal.id);
  const pct = goalPct(goal);
  const due = fmtDue(goal.due_date);
  const todayDone = gos.filter((g) => g.is_done_today).length;
  const maxStreak = gos.reduce((m, g) => Math.max(m, goCurrentStreak(g)), 0);

  // Recent days: aggregate completion fraction per day across gos.
  const recentDays = useMemo(() => {
    const out: { date: Date; done: number; total: number }[] = [];
    for (let i = 1; i <= 6; i++) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const k = ymd(d);
      let done = 0;
      for (const g of gos) {
        const e = g.entries.find((x) => x.date === k);
        const targetMet = g.kind === 'numeric'
          ? (g.target_value && (e?.value ?? 0) >= g.target_value) || (e?.value ?? 0) > 0
          : (e?.value ?? 0) > 0;
        if (targetMet) done++;
      }
      out.push({ date: d, done, total: gos.length });
    }
    return out;
  }, [gos]);

  return (
    <>
      <header className="goal-ctx" style={{ ['--gc' as any]: accent }}>
        <div className="goal-ctx-tag-row">
          <div className="goal-ctx-tag">In focus</div>
          <button className="goal-ctx-edit" title="Edit goal" onClick={onEditGoal}>
            <Edit3 size={12} />
          </button>
        </div>
        <div className="goal-ctx-head">
          <div className="goal-ctx-text">
            <h1 className="goal-ctx-title">{goal.title}</h1>
            {goal.description && (
              <p className="goal-ctx-desc">{goal.description}</p>
            )}
          </div>
          <div className="goal-ctx-pct">
            <div className="goal-ctx-pct-num">{pct}<em>%</em></div>
            <div className="goal-ctx-pct-lab">Complete</div>
          </div>
        </div>

        <div className="goal-ctx-bar">
          <div className="goal-ctx-bar-fill" style={{ width: `${pct}%` }} />
        </div>

        <div className="goal-ctx-meta">
          <div className="gcm-cell">
            <span className="gcm-num">{todayDone}<em>/{gos.length}</em></span>
            <span className="gcm-lab">Today's targets</span>
          </div>
          <div className="gcm-cell">
            <span className="gcm-num">{maxStreak}<em> {maxStreak === 1 ? 'day' : 'days'}</em></span>
            <span className="gcm-lab">Current streak</span>
          </div>
          <div className="gcm-cell">
            <span className="gcm-num">
              {due.days === null
                ? '—'
                : <>{Math.abs(due.days)}<em> {due.days < 0 ? 'over' : 'days'}</em></>}
            </span>
            <span className="gcm-lab">{due.days !== null && due.days < 0 ? 'Overdue' : 'Until deadline'}</span>
          </div>
          <div className="gcm-cell">
            <span className="gcm-num">{due.days === null ? '—' : due.label}</span>
            <span className="gcm-lab">Due date</span>
          </div>
        </div>
      </header>

      <div className="goal-section-head">
        <h2 className="goal-section-title">Today's targets</h2>
        <span className="goal-section-rule" />
        <span className="goal-section-meta">
          {gos.length} {gos.length === 1 ? 'item' : 'items'} · log values inline
        </span>
      </div>

      <div className="tg-cards">
        {gos.map((go) => (
          <TgCard key={go.id} go={go} parentTitle={goal.title} onLog={onLog} onSkip={onSkip} />
        ))}
      </div>

      <div className="goal-section-head" style={{ marginTop: 36 }}>
        <h2 className="goal-section-title">Recent days</h2>
        <span className="goal-section-rule" />
        <span className="goal-section-meta">last 6 days · daily completion summary</span>
      </div>

      <div className="rl-list">
        {recentDays.map(({ date, done, total }) => {
          const dateLbl = date.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
          const cls = total === 0 || done === 0 ? '' : done === total ? 'rl-rate-full' : 'rl-rate-partial';
          return (
            <div className="rl-row" key={dateLbl}>
              <span className="rl-date">{dateLbl}</span>
              <span className={`rl-rate ${cls}`}>{done}/{total}</span>
              <span className="rl-note">
                {total === 0 ? '—' : done === total ? 'all targets hit' : done === 0 ? 'no progress logged' : `${done} of ${total} hit`}
              </span>
            </div>
          );
        })}
      </div>

      <div style={{ height: 60 }} />
    </>
  );
}

/* ── Single target card (inline value capture for numeric, big toggle for boolean) ── */

interface TgProps {
  go: Go;
  parentTitle: string;
  onLog: (go: Go, value: number) => void;
  onSkip: (go: Go) => void;
}

function TgCard({ go, parentTitle, onLog, onSkip }: TgProps) {
  const value = todayValue(go);
  const target = go.target_value ?? 1;
  const targetMet = go.kind === 'numeric'
    ? (go.target_value !== null && value >= go.target_value)
    : value > 0;
  const partial = !targetMet && value > 0;
  const pct = go.kind === 'numeric' && go.target_value
    ? Math.min(100, Math.round((value / go.target_value) * 100))
    : (value > 0 ? 100 : 0);

  // Step size: 1 for integer targets, 0.1 for fractional.
  const step = go.target_value !== null && Number.isInteger(go.target_value) ? 1 : 0.1;
  const round = (n: number) => Math.round(n * 10) / 10;

  if (go.kind === 'boolean') {
    return (
      <article className="tg-card" data-kind="boolean" data-done={targetMet || undefined}>
        <header className="tg-card-head">
          <div className="tg-card-text">
            <div className="tg-kind-row">
              <span className="tg-kind-pill">boolean</span>
              <span className="tg-parent">in <em>{parentTitle}</em></span>
            </div>
            <h3 className="tg-card-title">{go.title}</h3>
          </div>
        </header>

        <div className="tg-bool-block">
          <button
            className={`tg-bool-btn${targetMet ? ' tg-bool-btn-done' : ''}`}
            onClick={() => onLog(go, targetMet ? 0 : 1)}
          >
            <Check size={16} /> <span>{targetMet ? 'Done' : 'Mark as done'}</span>
          </button>
          <button
            className="tg-skip-btn"
            title="Skip"
            onClick={() => onSkip(go)}
            aria-label="Skip"
          >
            <X size={14} />
          </button>
        </div>
      </article>
    );
  }

  return (
    <article
      className="tg-card"
      data-kind="numeric"
      data-done={targetMet || undefined}
      data-partial={partial || undefined}
    >
      <header className="tg-card-head">
        <div className="tg-card-text">
          <div className="tg-kind-row">
            <span className="tg-kind-pill">numeric</span>
            <span className="tg-parent">in <em>{parentTitle}</em></span>
          </div>
          <h3 className="tg-card-title">{go.title}</h3>
        </div>
      </header>

      <div className="tg-numeric-block">
        <div className="tg-num-display">
          <span className="tg-num-logged">{round(value)}</span>
          <span className="tg-num-divider">/</span>
          <span className="tg-num-target">{round(target)}</span>
          {go.unit && <span className="tg-num-unit">{go.unit}</span>}
        </div>
        <div className="tg-stepper">
          <button
            className="tg-step-btn"
            title="Decrease"
            onClick={() => onLog(go, Math.max(0, round(value - step)))}
            aria-label="Decrease"
          >
            <Minus size={13} />
          </button>
          <button
            className="tg-step-btn"
            title="Increase"
            onClick={() => onLog(go, round(value + step))}
            aria-label="Increase"
          >
            <Plus size={13} />
          </button>
        </div>
      </div>

      <div className="tg-progress-row">
        <div className="tg-progress-bar">
          <div className="tg-progress-fill" style={{ width: `${pct}%` }} />
        </div>
        <span className="tg-progress-pct">{pct}%</span>
      </div>

      <footer className="tg-card-foot">
        <span className={`tg-status tg-status-${targetMet ? 'done' : partial ? 'partial' : 'pending'}`}>
          {targetMet
            ? <><Check size={12} /> Logged</>
            : partial
              ? <><Repeat size={12} /> In progress · {pct}%</>
              : 'Pending'}
        </span>
      </footer>
    </article>
  );
}
