/**
 * BreakdownDonut — one donut, four breakdowns the user toggles between:
 * by Tag, by Priority, by Status, by Goal. Visual stays identical across
 * modes; only the dataset and legend swap.
 *
 * Palette cycles through the editorial accents in a fixed order (indigo →
 * moss → ochre → rust → slate → walnut → indigo-2 → walnut-2), so item #N
 * in a given breakdown always gets colour #N. We never re-shuffle colours
 * mid-mode so legend mapping is stable.
 */
import { useMemo, useState } from 'react';
import type { Routine, Task, TaskPriority, TaskStatus } from '../../../api/types';

type Mode = 'tag' | 'priority' | 'status' | 'goal';

interface Props {
  tasks: Task[];
  routines: Routine[];
}

interface Item { name: string; value: number; }
interface Dataset { label: string; total: string; items: Item[]; }

const PALETTE = [
  '#2C4A60',  // indigo
  '#6B7A4F',  // moss
  '#A18030',  // ochre
  '#A04A39',  // rust
  '#5A6B78',  // slate
  '#4A3A2D',  // walnut
  '#1B3447',  // indigo-2
  '#6B4F3D',  // walnut-2
];

const STATUS_LABELS: Record<TaskStatus, string> = {
  active: 'Active', backlog: 'Backlog', paused: 'On hold', done: 'Done',
};
const PRIORITY_LABELS: Record<TaskPriority, string> = {
  high: 'High', medium: 'Medium', low: 'Low',
};

const CX = 50, CY = 50, R = 42, R_IN = 24;
const TAU = Math.PI * 2;

function slicePath(a0: number, a1: number): string {
  const large = (a1 - a0) > Math.PI ? 1 : 0;
  const toXY = (r: number, a: number): [number, number] =>
    [CX + r * Math.sin(a), CY - r * Math.cos(a)];
  const [x1, y1] = toXY(R, a0);
  const [x2, y2] = toXY(R, a1);
  const [x3, y3] = toXY(R_IN, a1);
  const [x4, y4] = toXY(R_IN, a0);
  return `M${x1.toFixed(2)},${y1.toFixed(2)}
          A${R},${R} 0 ${large} 1 ${x2.toFixed(2)},${y2.toFixed(2)}
          L${x3.toFixed(2)},${y3.toFixed(2)}
          A${R_IN},${R_IN} 0 ${large} 0 ${x4.toFixed(2)},${y4.toFixed(2)} Z`;
}

export function BreakdownDonut({ tasks, routines }: Props) {
  const [mode, setMode] = useState<Mode>('tag');

  // Build all four datasets once; toggling is just a pick.
  const datasets = useMemo<Record<Mode, Dataset>>(() => {
    // by Tag — collect unique tags directly from tasks (no need for a
    // separate `tags` parameter; users only see tags they actually use).
    const tagCounts = new Map<string, { name: string; count: number }>();
    for (const t of tasks) for (const tg of t.tags) {
      const cur = tagCounts.get(tg.id);
      if (cur) cur.count++;
      else tagCounts.set(tg.id, { name: tg.name, count: 1 });
    }
    const tagItems: Item[] = [...tagCounts.values()]
      .map(({ name, count }) => ({ name, value: count }))
      .filter((it) => it.value > 0)
      .sort((a, b) => b.value - a.value);

    // by Priority — open Gos (non-done tasks aggregated by priority).
    const prioCounts: Record<TaskPriority, number> = { high: 0, medium: 0, low: 0 };
    for (const t of tasks) if (t.status !== 'done') prioCounts[t.priority]++;
    const prioItems: Item[] = (['high', 'medium', 'low'] as TaskPriority[])
      .map((p) => ({ name: PRIORITY_LABELS[p], value: prioCounts[p] }))
      .filter((it) => it.value > 0);

    // by Status — goals by status.
    const statusCounts: Record<TaskStatus, number> = {
      active: 0, backlog: 0, paused: 0, done: 0,
    };
    for (const t of tasks) statusCounts[t.status]++;
    const statusItems: Item[] = (['active', 'backlog', 'paused', 'done'] as TaskStatus[])
      .map((s) => ({ name: STATUS_LABELS[s], value: statusCounts[s] }))
      .filter((it) => it.value > 0);

    // by Goal — recent check-in volume per goal (gos that are done today
    // count + routines linked to the goal that fired today). Cap to 8
    // largest goals + "Other" for legibility.
    const goalCounts = new Map<string, number>();
    for (const t of tasks) {
      let count = 0;
      for (const g of t.gos) if (g.is_done_today) count++;
      // Routines that are linked to this goal — best proxy without a
      // dedicated entries-by-day join; use entries count as routine activity.
      for (const link of t.routines ?? []) {
        const routine = routines.find((r) => r.id === link.routine_id);
        if (!routine) continue;
        count += routine.entries.filter((e) => (e.value ?? 0) > 0).length;
      }
      if (count > 0) goalCounts.set(t.title, count);
    }
    const goalSorted = [...goalCounts.entries()]
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
    const goalItems: Item[] = goalSorted.length <= 8
      ? goalSorted
      : [
          ...goalSorted.slice(0, 7),
          {
            name: `Other (${goalSorted.length - 7})`,
            value: goalSorted.slice(7).reduce((s, it) => s + it.value, 0),
          },
        ];

    return {
      tag: {
        label: 'goals by tag',
        total: 'tagged',
        items: tagItems,
      },
      priority: {
        label: 'open goals by priority',
        total: 'open',
        items: prioItems,
      },
      status: {
        label: 'goals by status',
        total: 'goals',
        items: statusItems,
      },
      goal: {
        label: 'check-ins by goal',
        total: 'check-ins',
        items: goalItems,
      },
    };
  }, [tasks, routines]);

  const ds = datasets[mode];
  const total = ds.items.reduce((s, it) => s + it.value, 0);

  // Slice paths — accumulate angles in dataset order.
  const slices = useMemo(() => {
    if (total === 0) return [];
    let acc = 0;
    return ds.items.map((it, i) => {
      const a0 = (acc / total) * TAU;
      const a1 = ((acc + it.value) / total) * TAU;
      acc += it.value;
      return { path: slicePath(a0, a1), color: PALETTE[i % PALETTE.length], item: it };
    });
  }, [ds.items, total]);

  return (
    <div className="ana-card-chart">
      <header className="acc-head">
        <div className="acc-head-text">
          <h3 className="acc-title">Break <em>down</em></h3>
          <p className="acc-sub">{ds.label}</p>
        </div>
        <div className="bd-seg" role="tablist">
          {(['tag', 'priority', 'status', 'goal'] as Mode[]).map((m) => (
            <button
              key={m}
              type="button"
              className={mode === m ? 'on' : ''}
              role="tab"
              aria-selected={mode === m}
              onClick={() => setMode(m)}
            >{m === 'tag' ? 'Tag' : m === 'priority' ? 'Priority' : m === 'status' ? 'Status' : 'Goal'}</button>
          ))}
        </div>
      </header>
      <div className="bd-body">
        {total === 0 ? (
          <div className="ana-card-empty">No data in this breakdown yet.</div>
        ) : (
          <>
            <svg viewBox="0 0 100 100" className="bd-svg" preserveAspectRatio="xMidYMid meet" aria-hidden>
              {slices.map((s, i) => (
                <path key={i} d={s.path} fill={s.color} className="bd-slice" />
              ))}
              <text x={CX} y={CY - 1} textAnchor="middle" dominantBaseline="middle"
                className="bd-center">{total}</text>
              <text x={CX} y={CY + 8} textAnchor="middle"
                className="bd-center-lbl">{ds.total.toUpperCase()}</text>
            </svg>
            <div className="bd-legend">
              {slices.map((s, i) => (
                <div key={i} className="bd-row">
                  <span className="bd-sw" style={{ background: s.color }} />
                  <span className="bd-lbl" title={s.item.name}>{s.item.name}</span>
                  <span className="bd-num">{s.item.value}</span>
                  <span className="bd-pct">{Math.round((s.item.value / total) * 100)}%</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
