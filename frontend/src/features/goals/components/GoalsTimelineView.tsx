/**
 * GoalsTimelineView — master timeline of all goals, organised as swim
 * lanes by status (Overdue → Active → Upcoming → Done). Mirrors the
 * `goals-timeline-variant-c.html` mockup but plugs into real data:
 * positions come from `task.start_date` / `task.due_date`, lane
 * assignment from `status` + due-date arithmetic.
 *
 * Why swim lanes (vs single Gantt or calendar grid): for a manager-of-self
 * who already knows the goals exist, the most actionable cut is "what's
 * burning right now" (top of page) vs "what's done" (bottom of page).
 * The shared time axis lets you spot collisions across statuses without
 * scrolling between charts.
 */
import { useMemo, useState } from 'react';
import type { Task, TaskPriority } from '../../../api/types';
import './goals-timeline.css';

type GroupMode = 'status' | 'priority';
type ScaleMode = 'month' | 'quarter' | 'year';

interface Props {
  tasks: Task[];
  /** Click handler — same as kanban: opens the right-side GoalDetailPanel. */
  onSelectGoal: (id: string) => void;
}

interface LaneDef {
  key: string;
  title: string;
  emphasis: string;
  tone: 'rust' | 'ochre' | 'slate' | 'moss' | 'walnut';
  caption: (n: number) => string;
}

const STATUS_LANES: LaneDef[] = [
  { key: 'overdue',  title: 'Overdue',   emphasis: 'handle now',   tone: 'rust',
    caption: (n) => `${n} goal${n === 1 ? '' : 's'} slipping` },
  { key: 'active',   title: 'Active',    emphasis: 'in flight',    tone: 'ochre',
    caption: (n) => `${n} goal${n === 1 ? '' : 's'} · mix of priorities` },
  { key: 'upcoming', title: 'Upcoming',  emphasis: 'not started',  tone: 'slate',
    caption: (n) => `${n} goal${n === 1 ? '' : 's'} queued` },
  { key: 'done',     title: 'Done',      emphasis: 'shipped',      tone: 'moss',
    caption: (n) => `${n} goal${n === 1 ? '' : 's'} closed` },
];

const PRIORITY_LANES: LaneDef[] = [
  { key: 'high',    title: 'High',    emphasis: 'must-haves',  tone: 'rust',
    caption: (n) => `${n} goal${n === 1 ? '' : 's'}` },
  { key: 'medium',  title: 'Medium',  emphasis: 'normal',      tone: 'ochre',
    caption: (n) => `${n} goal${n === 1 ? '' : 's'}` },
  { key: 'low',     title: 'Low',     emphasis: 'background',  tone: 'slate',
    caption: (n) => `${n} goal${n === 1 ? '' : 's'}` },
];

type BarState = 'upcoming' | 'active' | 'done' | 'overdue';

function startOfDay(d: Date): Date {
  const o = new Date(d); o.setHours(0, 0, 0, 0); return o;
}
function parseYmd(s: string | null): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : startOfDay(d);
}

function deriveBarState(t: Task, today: Date): BarState {
  if (t.status === 'done') return 'done';
  const due = parseYmd(t.due_date);
  if (due && due < today && t.status !== 'paused') return 'overdue';
  const start = parseYmd(t.start_date);
  if (t.status === 'backlog') return 'upcoming';
  if (start && start > today) return 'upcoming';
  if (t.status === 'paused') return 'upcoming';
  return 'active';
}

function laneKeyFor(t: Task, mode: GroupMode, today: Date): string {
  if (mode === 'priority') return t.priority;
  return deriveBarState(t, today);
}

export function GoalsTimelineView({ tasks, onSelectGoal }: Props) {
  const [groupMode, setGroupMode] = useState<GroupMode>('status');
  const [scale,     setScale]     = useState<ScaleMode>('quarter');
  const [statusFilter, setStatusFilter] = useState<'all' | BarState>('all');

  const today = useMemo(() => startOfDay(new Date()), []);

  // ── Date range ────────────────────────────────────────────────────────
  // Window auto-fits goal dates so empty bars don't dominate. Falls back to
  // ±90d around today when there's nothing dated.
  const range = useMemo(() => {
    let lo = Infinity, hi = -Infinity;
    for (const t of tasks) {
      const s = parseYmd(t.start_date)?.getTime();
      const d = parseYmd(t.due_date)?.getTime();
      if (s !== undefined) { lo = Math.min(lo, s); hi = Math.max(hi, s); }
      if (d !== undefined) { lo = Math.min(lo, d); hi = Math.max(hi, d); }
    }
    if (!isFinite(lo) || !isFinite(hi)) {
      const t0 = today.getTime() - 90 * 86_400_000;
      const t1 = today.getTime() + 90 * 86_400_000;
      return { start: t0, end: t1, ms: t1 - t0 };
    }
    // Always include `today` so the now-line stays inside the chart.
    lo = Math.min(lo, today.getTime() - 7 * 86_400_000);
    hi = Math.max(hi, today.getTime() + 7 * 86_400_000);
    const span = hi - lo;
    const pad  = Math.max(span * 0.04, 5 * 86_400_000);
    return { start: lo - pad, end: hi + pad, ms: span + 2 * pad };
  }, [tasks, today]);

  // Tick labels — first day of each month inside the range.
  const ticks = useMemo(() => {
    const out: { pct: number; label: string; isCurrent: boolean }[] = [];
    const d = new Date(range.start);
    d.setDate(1);
    // Step granularity per scale: month → every month; quarter → every month
    // (labels read as month names anyway); year → every other month.
    const stepMonths = scale === 'year' ? 2 : 1;
    while (d.getTime() <= range.end + 86_400_000) {
      const pct = ((d.getTime() - range.start) / range.ms) * 100;
      if (pct >= 0 && pct <= 100) {
        out.push({
          pct,
          label: d.toLocaleDateString(undefined, { month: 'short' }),
          isCurrent: d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear(),
        });
      }
      d.setMonth(d.getMonth() + stepMonths);
    }
    return out;
  }, [range, today, scale]);

  const todayPct = ((today.getTime() - range.start) / range.ms) * 100;

  // ── Goals filtered + lane grouping ───────────────────────────────────
  const visibleTasks = useMemo(() => {
    if (statusFilter === 'all') return tasks;
    return tasks.filter((t) => deriveBarState(t, today) === statusFilter);
  }, [tasks, statusFilter, today]);

  const lanes = groupMode === 'status' ? STATUS_LANES : PRIORITY_LANES;

  const byLane = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const lane of lanes) map.set(lane.key, []);
    for (const t of visibleTasks) {
      const key = laneKeyFor(t, groupMode, today);
      map.get(key)?.push(t);
    }
    // Sort each lane by start_date (then due_date) for stable visual order.
    for (const arr of map.values()) {
      arr.sort((a, b) => {
        const aS = parseYmd(a.start_date)?.getTime() ?? Infinity;
        const bS = parseYmd(b.start_date)?.getTime() ?? Infinity;
        if (aS !== bS) return aS - bS;
        const aD = parseYmd(a.due_date)?.getTime() ?? Infinity;
        const bD = parseYmd(b.due_date)?.getTime() ?? Infinity;
        return aD - bD;
      });
    }
    return map;
  }, [visibleTasks, lanes, groupMode, today]);

  // ── Bar positioning ──────────────────────────────────────────────────
  // Each task contributes one bar. Missing dates get clamped to today/+30d
  // so we never render a zero-width sliver the user can't click.
  const barFor = (t: Task): { left: number; width: number; state: BarState } => {
    const state = deriveBarState(t, today);
    const sRaw = parseYmd(t.start_date)?.getTime();
    const eRaw = parseYmd(t.due_date)?.getTime();
    // Fill the missing side(s) with sensible defaults so we always have a
    // concrete [s, e] range — TS flow doesn't narrow across cross-refs so
    // the explicit ternary is clearer than three sequential `if`s here.
    const s = sRaw ?? (eRaw !== undefined ? eRaw - 30 * 86_400_000 : today.getTime());
    const e = eRaw ?? (sRaw !== undefined ? sRaw + 30 * 86_400_000 : s + 14 * 86_400_000);
    // Clamp into range — long-ago / far-future bars stay inside.
    const lo = Math.max(s, range.start);
    const hi = Math.min(e, range.end);
    const left  = Math.max(0, ((lo - range.start) / range.ms) * 100);
    const width = Math.max(2.5, ((hi - lo) / range.ms) * 100);
    return { left, width, state };
  };

  // ── Empty-state ─────────────────────────────────────────────────────
  if (tasks.length === 0) {
    return (
      <div className="gt-empty">
        <div className="gt-empty__title">No goals to plot yet.</div>
        <div className="gt-empty__body">Add a goal with a start or due date to see it on the timeline.</div>
      </div>
    );
  }

  const totalDated = tasks.filter((t) => t.start_date || t.due_date).length;
  const undatedCount = tasks.length - totalDated;

  return (
    <div className="gt-page">

      {/* Page header */}
      <div className="gt-h-row">
        <h1 className="gt-h-row__label">
          All goals · <em>{groupMode === 'status' ? 'swim lanes' : 'by priority'}</em>
        </h1>
        <span className="gt-h-row__rule" />
        <span className="gt-h-row__meta">
          <b>{tasks.length}</b> total · grouped by {groupMode}
          {undatedCount > 0 && (
            <> · <span style={{ color: 'var(--ink-5)' }}>{undatedCount} no dates (not shown)</span></>
          )}
        </span>
      </div>

      {/* Filter chips */}
      <div className="gt-filters">
        <span className="gt-filters__label">Group by</span>
        <div className="gt-filters__group">
          {(['status', 'priority'] as GroupMode[]).map((m) => (
            <button
              key={m}
              type="button"
              className={groupMode === m ? 'on' : ''}
              onClick={() => setGroupMode(m)}
            >{m === 'status' ? 'Status' : 'Priority'}</button>
          ))}
        </div>

        <span className="gt-filters__label" style={{ marginLeft: 10 }}>Scale</span>
        <div className="gt-filters__group">
          {(['month', 'quarter', 'year'] as ScaleMode[]).map((m) => (
            <button
              key={m}
              type="button"
              className={scale === m ? 'on' : ''}
              onClick={() => setScale(m)}
            >{m === 'month' ? 'Month' : m === 'quarter' ? 'Quarter' : 'Year'}</button>
          ))}
        </div>

        <span className="gt-filters__label" style={{ marginLeft: 10 }}>Show</span>
        <div className="gt-filters__group">
          {(['all', 'overdue', 'active', 'upcoming', 'done'] as ('all' | BarState)[]).map((s) => (
            <button
              key={s}
              type="button"
              className={statusFilter === s ? 'on' : ''}
              onClick={() => setStatusFilter(s)}
            >{s === 'all' ? 'All' : s[0].toUpperCase() + s.slice(1)}</button>
          ))}
        </div>
      </div>

      {/* Master axis */}
      <div className="gt-timeline-shell">
        <div className="gt-master-axis-spacer">Lane · {lanes.length}</div>
        <div className="gt-master-axis">
          {ticks.map((t, i) => (
            <span
              key={i}
              className={`gt-master-axis__tick${t.isCurrent ? ' now' : ''}`}
              style={{ left: `${t.pct}%` }}
            >{t.label}</span>
          ))}
          {todayPct >= 0 && todayPct <= 100 && (
            <span className="gt-master-axis__now" style={{ left: `${todayPct}%` }} />
          )}
        </div>
      </div>

      {/* Lanes */}
      {lanes.map((lane) => {
        const items = byLane.get(lane.key) ?? [];
        if (items.length === 0 && statusFilter !== 'all') return null;
        return (
          <div className="gt-lane" key={lane.key}>
            <div className="gt-lane__head" data-tone={lane.tone}>
              <div className="gt-lane__title">
                {lane.title} · <em>{lane.emphasis}</em>
              </div>
              <div className="gt-lane__count">{lane.caption(items.length)}</div>
            </div>
            <div className="gt-lane__bars">
              {items.length === 0 ? (
                <div className="gt-lane__empty">No goals here right now.</div>
              ) : (
                items.map((t) => {
                  const bar = barFor(t);
                  const pct = Math.round(t.progress ?? 0);
                  return (
                    <div className="gt-lane-row" key={t.id}>
                      <button
                        type="button"
                        className="gt-bar"
                        data-state={bar.state}
                        style={{ left: `${bar.left}%`, width: `${bar.width}%` }}
                        onClick={() => onSelectGoal(t.id)}
                        title={`${t.title} · ${pct}%`}
                      >
                        <span className="gt-bar__fill" style={{ width: `${pct}%` }} />
                        <span className="gt-bar__pri" data-p={t.priority as TaskPriority} />
                        <span className="gt-bar__label">{t.title}</span>
                        <span className="gt-bar__pct">{pct}%</span>
                      </button>
                    </div>
                  );
                })
              )}
              {/* Today guide threaded through this lane — same horizontal pos
                  as master axis. */}
              {todayPct >= 0 && todayPct <= 100 && (
                <span className="gt-lane__now" style={{ left: `${todayPct}%` }} />
              )}
            </div>
          </div>
        );
      })}

      <p className="gt-footnote">
        Dashed vertical line · today, threaded through all lanes. Click a bar
        to open the goal drawer. Goals without dates are listed but not
        plotted — add a start or due date to surface them here.
      </p>
    </div>
  );
}
