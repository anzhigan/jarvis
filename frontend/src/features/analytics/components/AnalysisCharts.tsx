import { useMemo, useState } from 'react';
import type { Routine, Task } from '../../../api/types';
import type { ActivityPoint, GoalProgressRow, StreakRow } from '../hooks/useAnalytics';
import { ymd } from '../../routines/lib/heatmap';

const ACCENTS = ['var(--moss)', 'var(--indigo)', 'var(--slate)', 'var(--ochre)', 'var(--rust)'] as const;
function accentFor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return ACCENTS[h % ACCENTS.length];
}

/* ─────────────────────────────────────────────────────────────────────────── */
/*  Routine completion · 30 days                                                */
/*  Line + area chart of % of due routines completed each day.                  */
/* ─────────────────────────────────────────────────────────────────────────── */

interface CompletionProps {
  /** Daily counts of routine + goal completions in the period. */
  activity: ActivityPoint[];
  /** Number of active routines — denominator for routine completion %. */
  activeRoutineCount: number;
  /** Tasks (goals) — used to size the "goals completion" series and to
   *  compute the expected pace line / pace verdict from due dates. */
  tasks: Task[];
}

type SeriesMode = 'routines' | 'goals' | 'both';
const SERIES_LABELS: Record<SeriesMode, string> = {
  routines: '% of routines logged each day',
  goals:    '% of goals workload closed each day',
  both:     'routines vs goals + expected pace',
};
const MODE_BUTTONS: { key: SeriesMode; label: string }[] = [
  { key: 'routines', label: 'Routines' },
  { key: 'goals',    label: 'Goals' },
  { key: 'both',     label: 'Both' },
];

const CW = 900;
const CH = 240;
const CPAD_L = 50;
const CPAD_R = 20;
const CPAD_T = 18;
const CPAD_B = 36;

/** Build an SVG path `M…L…L…` from values + scales. */
function linePathFor(values: number[], xScale: (i: number) => number, yScale: (v: number) => number): string {
  return values.map((v, i) => {
    const x = xScale(i).toFixed(1);
    const y = yScale(v).toFixed(1);
    return `${i === 0 ? 'M' : 'L'} ${x},${y}`;
  }).join(' ');
}

/** Close a line path back to the baseline → area polygon. */
function areaPathFor(line: string, firstX: number, lastX: number, baselineY: number): string {
  return `M ${firstX.toFixed(1)},${baselineY.toFixed(1)} L ${line.slice(2)} L ${lastX.toFixed(1)},${baselineY.toFixed(1)} Z`;
}

export function RoutineCompletionChart({ activity, activeRoutineCount, tasks }: CompletionProps) {
  const [mode, setMode] = useState<SeriesMode>('routines');

  // ── Series ──────────────────────────────────────────────────────────
  const routinesSeries = useMemo(() => {
    if (activity.length === 0 || activeRoutineCount === 0) return [];
    return activity.map((a) => Math.min(100, Math.round((a.routines / activeRoutineCount) * 100)));
  }, [activity, activeRoutineCount]);

  // Goal "completion %" — proxy: each goal contributes `(gos_done_today /
  // gos_total)` × 100 normalised across active goals. For the daily series,
  // we don't have per-day historic snapshots; we use entries closed that
  // day from `activity.goals` divided by total open workload.
  const goalsSeries = useMemo(() => {
    const openGosTotal = tasks
      .filter((t) => t.status !== 'done')
      .reduce((s, t) => s + (t.gos?.length ?? 0), 0);
    if (activity.length === 0 || openGosTotal === 0) return [];
    return activity.map((a) => Math.min(100, Math.round((a.goals / openGosTotal) * 100)));
  }, [activity, tasks]);

  // ── Pace expectation ────────────────────────────────────────────────
  // Honest math for "you should be at X% by now". For each active goal
  // with a deadline, expected % is the fraction of its window elapsed.
  // The daily pace target (gos/day) is sum(remaining_gos) ÷ sum(days_left).
  const pace = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    let remainingGos = 0;
    let weightedDaysLeft = 0;
    let expectedSum = 0;
    let actualSum = 0;
    let goalsCounted = 0;

    for (const t of tasks) {
      if (t.status === 'done' || t.status === 'backlog' || !t.due_date) continue;
      const due = new Date(t.due_date);
      const start = t.start_date ? new Date(t.start_date) : null;
      const total = start && due > start ? due.getTime() - start.getTime() : null;
      const elapsed = start ? Math.max(0, today.getTime() - start.getTime()) : 0;
      const daysLeft = Math.max(1, Math.ceil((due.getTime() - today.getTime()) / 86_400_000));

      const open = (t.gos?.length ?? 0);
      const doneCount = t.gos?.filter((g) => g.is_done_today).length ?? 0;
      const remaining = Math.max(0, open - doneCount);
      remainingGos += remaining;
      weightedDaysLeft += daysLeft;

      if (total) {
        const expectedPct = Math.min(100, Math.round((elapsed / total) * 100));
        // Reached this branch only for active/paused (we `continue` on
        // done/backlog above) — progress is the only meaningful actual.
        const actualPct = Math.round(t.progress);
        expectedSum += expectedPct;
        actualSum += actualPct;
        goalsCounted++;
      }
    }

    if (goalsCounted === 0) {
      return { available: false, expectedPct: 0, actualPct: 0, gap: 0, paceNeeded: 0, currentRate: 0 };
    }
    const expectedPct = Math.round(expectedSum / goalsCounted);
    const actualPct = Math.round(actualSum / goalsCounted);
    const gap = expectedPct - actualPct;  // positive → behind
    // Pace needed = remaining gos / max(1, average days left)
    const paceNeeded = Math.round((remainingGos / Math.max(1, weightedDaysLeft / goalsCounted)) * 10) / 10;
    // Current rate = average gos closed per day over the activity window.
    const totalClosed = activity.reduce((s, a) => s + a.goals, 0);
    const currentRate = activity.length === 0 ? 0 : Math.round((totalClosed / activity.length) * 10) / 10;

    return { available: true, expectedPct, actualPct, gap, paceNeeded, currentRate };
  }, [tasks, activity]);

  // ── Render ──────────────────────────────────────────────────────────
  const anyData = routinesSeries.length > 0 || goalsSeries.length > 0;
  if (!anyData) {
    return (
      <div className="ana-card-chart">
        <header className="acc-head">
          <div className="acc-head-text">
            <h3 className="acc-title">Daily <em>completion</em></h3>
            <p className="acc-sub">% logged each day · routines</p>
          </div>
        </header>
        <div className="ana-card-empty">No activity yet.</div>
      </div>
    );
  }

  const innerW = CW - CPAD_L - CPAD_R;
  const innerH = CH - CPAD_T - CPAD_B;
  // Fixed 0..100 axis so toggling between series doesn't re-scale visually.
  const minY = 0, maxY = 100;
  const yScale = (v: number) => CPAD_T + (1 - (v - minY) / (maxY - minY)) * innerH;
  const N = activity.length;
  const xScale = (i: number) => CPAD_L + (i / Math.max(1, N - 1)) * innerW;

  const yTicks = [0, 25, 50, 75, 100].map((v) => ({ v, y: yScale(v) }));
  const xTicks = Array.from({ length: N }, (_, i) => i)
    .filter((i) => i === 0 || i === N - 1 || i % 5 === 0)
    .map((i) => ({ x: xScale(i), label: `d-${N - 1 - i}` }));

  const showRoutines = mode === 'routines' || mode === 'both';
  const showGoals    = mode === 'goals'    || mode === 'both';
  const showPace     = (mode === 'goals' || mode === 'both') && pace.available;

  const routinesLine = showRoutines && routinesSeries.length > 0
    ? linePathFor(routinesSeries, xScale, yScale) : '';
  const goalsLine = showGoals && goalsSeries.length > 0
    ? linePathFor(goalsSeries, xScale, yScale) : '';

  const baseY = yScale(0);
  const routinesArea = routinesLine ? areaPathFor(routinesLine, xScale(0), xScale(routinesSeries.length - 1), baseY) : '';
  const goalsArea    = goalsLine    ? areaPathFor(goalsLine,    xScale(0), xScale(goalsSeries.length - 1),    baseY) : '';

  // Pace line — straight reference at "expected pct" so the user reads
  // it as "where you should be on average right now". Slight band for
  // intuition: ±5% tolerance.
  const expectedY = yScale(pace.expectedPct);
  const expectedYHi = yScale(Math.min(100, pace.expectedPct + 5));
  const expectedYLo = yScale(Math.max(0, pace.expectedPct - 5));

  const routinesAvg = routinesSeries.length === 0 ? 0
    : Math.round(routinesSeries.reduce((a, v) => a + v, 0) / routinesSeries.length);
  const goalsAvg = goalsSeries.length === 0 ? 0
    : Math.round(goalsSeries.reduce((a, v) => a + v, 0) / goalsSeries.length);
  const headerAvg = mode === 'goals' ? goalsAvg : routinesAvg;

  // Pace verdict tone — behind if gap > 3, ahead if gap < -3, else neutral.
  const verdictTone = pace.gap > 3 ? 'bad' : pace.gap < -3 ? 'good' : 'neutral';

  return (
    <div className="ana-card-chart">
      <header className="acc-head">
        <div className="acc-head-text">
          <h3 className="acc-title">Daily <em>completion</em></h3>
          <p className="acc-sub">{SERIES_LABELS[mode]}</p>
        </div>
        <div className="dc-seg" role="tablist">
          {MODE_BUTTONS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              className={mode === key ? 'on' : ''}
              role="tab"
              aria-selected={mode === key}
              onClick={() => setMode(key)}
            >{label}</button>
          ))}
        </div>
        <div className="acc-stat">
          <div className="acc-stat-num">{headerAvg}<em>%</em></div>
          <div className="acc-stat-trend">avg · {N}d</div>
        </div>
      </header>
      <div className="acc-body">
        <svg viewBox={`0 0 ${CW} ${CH}`} className="chart-svg" preserveAspectRatio="xMidYMid meet">
          {/* Grid */}
          {yTicks.map((t) => (
            <g key={t.v}>
              <line x1={CPAD_L} x2={CW - CPAD_R} y1={t.y} y2={t.y}
                stroke="var(--hairline-faint)" strokeWidth={1} />
              <text x={CPAD_L - 8} y={t.y + 4} textAnchor="end"
                fill="var(--ink-5)" fontSize={10} fontFamily="JetBrains Mono">{t.v}%</text>
            </g>
          ))}
          {xTicks.map((t, i) => (
            <text key={i} x={t.x} y={CH - 12} textAnchor="middle"
              fill="var(--ink-5)" fontSize={10} fontFamily="JetBrains Mono">{t.label}</text>
          ))}

          {/* Routines series (indigo) */}
          {showRoutines && routinesLine && (
            <>
              <path d={routinesArea} fill="var(--indigo)" fillOpacity={0.10} />
              <path d={routinesLine} fill="none" stroke="var(--indigo)" strokeWidth={1.8}
                strokeLinecap="round" strokeLinejoin="round" />
            </>
          )}
          {/* Goals series (moss) */}
          {showGoals && goalsLine && (
            <>
              <path d={goalsArea} fill="var(--moss)" fillOpacity={0.10} />
              <path d={goalsLine} fill="none" stroke="var(--moss)" strokeWidth={1.6}
                strokeLinecap="round" strokeLinejoin="round" />
            </>
          )}
          {/* Expected pace — rust dashed line + faint band */}
          {showPace && (
            <>
              <rect x={CPAD_L} y={Math.min(expectedYHi, expectedYLo)} width={innerW}
                height={Math.abs(expectedYHi - expectedYLo)} fill="var(--rust)" fillOpacity={0.05} />
              <line x1={CPAD_L} x2={CW - CPAD_R} y1={expectedY} y2={expectedY}
                stroke="var(--rust)" strokeWidth={1.4} strokeDasharray="4 3" opacity={0.85} />
              <text x={CW - CPAD_R - 4} y={expectedY - 4} textAnchor="end"
                fill="var(--rust)" fontSize={10} fontFamily="JetBrains Mono">expected · {pace.expectedPct}%</text>
            </>
          )}
        </svg>

        {/* Legend */}
        <div className="dc-legend">
          <span className={`dc-legend__item${!showRoutines ? ' dim' : ''}`}>
            <span className="dc-legend__sw" style={{ background: 'var(--indigo)' }} />
            Routines · <span style={{ color: 'var(--ink-4)' }}>{routinesAvg}% avg</span>
          </span>
          <span className={`dc-legend__item${!showGoals ? ' dim' : ''}`}>
            <span className="dc-legend__sw" style={{ background: 'var(--moss)' }} />
            Goals · <span style={{ color: 'var(--ink-4)' }}>{goalsAvg}% avg</span>
          </span>
          {pace.available && (
            <span className={`dc-legend__item${!showPace ? ' dim' : ''}`}>
              <span className="dc-legend__sw dc-legend__sw--line" style={{ background: 'var(--rust)' }} />
              Expected pace
            </span>
          )}
        </div>
      </div>

      {/* Pace verdict — only when we have meaningful deadline data */}
      {pace.available && (
        <div className="pace-strip" data-tone={verdictTone}>
          <span className="pace-strip__icon">
            {pace.gap > 3 ? '↓' : pace.gap < -3 ? '↑' : '='}
          </span>
          <span className="pace-strip__txt">
            {pace.gap > 3 ? (
              <>
                <strong>You&apos;re ~{pace.gap}% behind plan.</strong>{' '}
                Current rate <em>{pace.currentRate} gos/day</em>; to clear
                every deadline you need <em>{pace.paceNeeded}/day</em>.
              </>
            ) : pace.gap < -3 ? (
              <>
                <strong>Ahead of plan by ~{-pace.gap}%.</strong>{' '}
                At <em>{pace.currentRate} gos/day</em>, room to take on more
                or coast into the weekend.
              </>
            ) : (
              <>
                <strong>On plan.</strong> Closing <em>{pace.currentRate} gos/day</em>,
                target is <em>{pace.paceNeeded}/day</em>.
              </>
            )}
          </span>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────── */
/*  Goals progress vs plan (horizontal bars + dashed expected marker)           */
/* ─────────────────────────────────────────────────────────────────────────── */

interface GoalsBarsProps {
  rows: GoalProgressRow[];
}

const GW = 900;
const GH_ROW = 47.2;
const GH_GAP = 8;
const GLEFT = 200;
const GRIGHT = 60;

export function GoalsProgressChart({ rows }: GoalsBarsProps) {
  const top = rows.slice(0, 5);
  const today = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }, []);

  const rowsWithExpected = top.map((r) => {
    const accent = accentFor(r.task.id);
    const start = r.task.start_date ? new Date(r.task.start_date) : null;
    const end = r.task.due_date ? new Date(r.task.due_date) : null;
    let expected = 0;
    if (start && end && end > start) {
      const total = end.getTime() - start.getTime();
      const elapsed = Math.max(0, Math.min(total, today.getTime() - start.getTime()));
      expected = Math.round((elapsed / total) * 100);
    } else {
      expected = r.pct;
    }
    return { ...r, accent, expected };
  });

  const onPlan = rowsWithExpected.filter((r) => r.pct >= r.expected).length;
  const totalH = rowsWithExpected.length === 0
    ? 0
    : rowsWithExpected.length * (GH_ROW + GH_GAP);
  const trackW = GW - GLEFT - GRIGHT;

  if (rowsWithExpected.length === 0) {
    return (
      <div className="ana-card-chart">
        <header className="acc-head">
          <div className="acc-head-text">
            <h3 className="acc-title">Goals progress vs plan</h3>
            <p className="acc-sub">Bar shows actual %. Dashed line is expected for today.</p>
          </div>
        </header>
        <div className="ana-card-empty">No active goals to track yet.</div>
      </div>
    );
  }

  return (
    <div className="ana-card-chart">
      <header className="acc-head">
        <div className="acc-head-text">
          <h3 className="acc-title">Goals progress vs plan</h3>
          <p className="acc-sub">Bar shows actual %. Dashed line is expected progress for today.</p>
        </div>
        <div className="acc-stat">
          <div className="acc-stat-num">{onPlan}<em>/{rowsWithExpected.length}</em></div>
          <div className="acc-stat-trend">on or ahead of plan</div>
        </div>
      </header>
      <div className="acc-body">
        <svg viewBox={`0 0 ${GW} ${Math.max(60, totalH)}`} className="chart-svg" preserveAspectRatio="xMidYMid meet">
          {rowsWithExpected.map((r, i) => {
            const y = i * (GH_ROW + GH_GAP) + 12;
            const expectedX = GLEFT + (r.expected / 100) * trackW;
            const fillW = (r.pct / 100) * trackW;
            return (
              <g key={r.task.id}>
                <rect x={GLEFT} y={y} width={trackW} height={GH_ROW} rx={3} fill="var(--cream)" />
                <line x1={expectedX} y1={y - 3} x2={expectedX} y2={y + GH_ROW + 3}
                  stroke="var(--ink-4)" strokeWidth={1.5} strokeDasharray="3 2" />
                <rect x={GLEFT} y={y} width={fillW} height={GH_ROW} rx={3} fill={r.accent} />
                <text x={GLEFT - 14} y={y + GH_ROW / 2 + 5} textAnchor="end"
                  fill="var(--ink)" fontSize={14} fontFamily="Source Serif 4" fontWeight={500}>
                  {r.task.title.length > 20 ? r.task.title.slice(0, 18) + '…' : r.task.title}
                </text>
                <text x={GW - GRIGHT + 8} y={y + GH_ROW / 2 + 5}
                  fill="var(--ink)" fontSize={14} fontFamily="JetBrains Mono" fontWeight={500}>
                  {r.pct}%
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────── */
/*  Top streaks · trending — list with sparklines                               */
/* ─────────────────────────────────────────────────────────────────────────── */

interface StreaksProps {
  rows: StreakRow[];
  routines: Routine[];
}

const SPARK_W = 80;
const SPARK_H = 22;
const SPARK_DAYS = 13;

function sparkPath(routine: Routine, today: Date): string {
  // Build last SPARK_DAYS values: 1 for done that day (positive entry), 0 otherwise.
  const points: number[] = [];
  for (let i = SPARK_DAYS - 1; i >= 0; i--) {
    const d = new Date(today); d.setDate(today.getDate() - i);
    const k = ymd(d);
    const e = routine.entries.find((x) => x.date === k);
    points.push(e && e.value > 0 ? 1 : 0);
  }
  // Cumulative streak (clamped at current). Visualises "trending up" when consecutive 1s pile.
  let cum = 0;
  const cumPoints = points.map((v) => {
    cum = v === 1 ? cum + 1 : 0;
    return cum;
  });
  const maxCum = Math.max(1, ...cumPoints);
  const xStep = SPARK_W / (SPARK_DAYS - 1);
  const yScale = (v: number) => SPARK_H - 1 - ((v / maxCum) * (SPARK_H - 2));
  return cumPoints.map((v, i) => `${(i * xStep).toFixed(1)},${yScale(v).toFixed(1)}`).join(' ');
}

export function TopStreaksTrending({ rows, routines }: StreaksProps) {
  const today = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }, []);
  const routineById = useMemo(() => {
    const m = new Map<string, Routine>();
    for (const r of routines) m.set(r.id, r);
    return m;
  }, [routines]);

  if (rows.length === 0) {
    return (
      <div className="ana-card-chart">
        <header className="acc-head">
          <div className="acc-head-text">
            <h3 className="acc-title">Top streaks · trending</h3>
            <p className="acc-sub">last 13 days, capped at current</p>
          </div>
        </header>
        <div className="ana-card-empty">No active streaks yet.</div>
      </div>
    );
  }

  return (
    <div className="ana-card-chart">
      <header className="acc-head">
        <div className="acc-head-text">
          <h3 className="acc-title">Top streaks · trending</h3>
          <p className="acc-sub">last 13 days, capped at current</p>
        </div>
      </header>
      <div className="streak-list-2">
        {rows.slice(0, 6).map((row, i) => {
          const r = routineById.get(row.routine.id) ?? row.routine;
          const points = sparkPath(r, today);
          return (
            <div key={r.id} className="streak-row-2">
              <span className="streak-rank-2">{i + 1}</span>
              <div className="streak-text-2">
                <div className="streak-name-2">{r.title}</div>
                <div className="streak-meta-2">{row.rate}% · last 30d</div>
              </div>
              <div className="streak-spark">
                <svg viewBox={`0 0 ${SPARK_W} ${SPARK_H}`} className="spark-svg">
                  <polyline points={points} fill="none" stroke="var(--moss)" strokeWidth={1.4}
                    strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <span className="streak-days-2">{row.streak}<em>d</em></span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────── */
/*  Practice activity · 30 days — area chart + top tags mini-list               */
/*  Replaces gallery's Notes-by-way card. Same shape, available data.           */
/* ─────────────────────────────────────────────────────────────────────────── */

interface PracticeProps {
  activity: ActivityPoint[];
  /** Top tags from useAnalytics — used as the mini-list under the chart. */
  tagRows: { tag: { id: string; name: string; color: string }; count: number }[];
}

const PW = 520;
const PH = 180;
const PPAD = 20;

export function PracticeActivityChart({ activity, tagRows }: PracticeProps) {
  const series = useMemo(() => activity.map((a) => a.goals + a.routines), [activity]);
  const total = series.reduce((acc, v) => acc + v, 0);

  if (series.length === 0) {
    return (
      <div className="ana-card-chart">
        <header className="acc-head">
          <div className="acc-head-text">
            <h3 className="acc-title">Practice activity · 30 days</h3>
            <p className="acc-sub">Daily goal + routine completions</p>
          </div>
        </header>
        <div className="ana-card-empty">Nothing logged in this period yet.</div>
      </div>
    );
  }

  const max = Math.max(1, ...series);
  const innerW = PW - PPAD * 2;
  const innerH = PH - PPAD - 20;
  const xScale = (i: number) => PPAD + (i / Math.max(1, series.length - 1)) * innerW;
  const yScale = (v: number) => PPAD + (1 - v / max) * innerH;

  const linePath = series.map((v, i) => {
    const x = xScale(i).toFixed(1);
    const y = yScale(v).toFixed(1);
    return `${i === 0 ? 'M' : 'L'} ${x},${y}`;
  }).join(' ');
  const baselineY = (PH - 20).toFixed(1);
  const firstX = xScale(0).toFixed(1);
  const lastX = xScale(series.length - 1).toFixed(1);
  const areaPath = `M ${firstX},${baselineY} L ${linePath.slice(2)} L ${lastX},${baselineY} Z`;

  const tagsTopMax = Math.max(1, ...tagRows.map((t) => t.count));
  const tagColors = ['var(--indigo)', 'var(--moss)', 'var(--ochre)', 'var(--slate)', 'var(--rust)'];

  return (
    <div className="ana-card-chart">
      <header className="acc-head">
        <div className="acc-head-text">
          <h3 className="acc-title">Practice activity · 30 days</h3>
          <p className="acc-sub">Daily goal + routine completions</p>
        </div>
        <div className="acc-stat">
          <div className="acc-stat-num">{total}</div>
          <div className="acc-stat-trend">total this period</div>
        </div>
      </header>
      <div className="acc-body">
        <svg viewBox={`0 0 ${PW} ${PH}`} className="chart-svg" preserveAspectRatio="none">
          <path d={areaPath} fill="var(--indigo)" fillOpacity={0.14} />
          <path d={linePath} fill="none" stroke="var(--indigo)" strokeWidth={1.8}
            strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      {tagRows.length > 0 && (
        <div className="ways-mini-list">
          {tagRows.slice(0, 3).map((t, i) => (
            <div key={t.tag.id} className="way-mini-row">
              <span className="way-mini-name">{t.tag.name}</span>
              <div className="way-mini-bar">
                <div
                  className="way-mini-fill"
                  style={{ width: `${(t.count / tagsTopMax) * 100}%`, background: tagColors[i] }}
                />
              </div>
              <span className="way-mini-num">{t.count}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────── */
/*  Year heatmap — 53 cols × 7 rows, in card with month axis above              */
/* ─────────────────────────────────────────────────────────────────────────── */

interface HeatmapProps {
  grid: { date: string; level: 0 | 1 | 2 | 3 | 4; isToday: boolean }[][];
  totalEntries: number;
}

export function YearHeatmapCard({ grid, totalEntries }: HeatmapProps) {
  // 12 month labels evenly spaced. The grid spans 53 weeks ending today.
  const months = useMemo(() => {
    const today = new Date();
    const out: { label: string; left: number }[] = [];
    for (let i = 12; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const left = ((12 - i) / 12) * 100;
      out.push({ label: d.toLocaleDateString(undefined, { month: 'short' }), left });
    }
    return out;
  }, []);

  // Days with at least 1 entry (level > 0).
  const daysWithEntry = useMemo(() => {
    let count = 0;
    let total = 0;
    for (const w of grid) for (const c of w) {
      if (c.level >= 0) total++;
      if (c.level > 0) count++;
    }
    return total === 0 ? 0 : Math.round((count / total) * 100);
  }, [grid]);

  return (
    <div className="ana-card-chart">
      <header className="acc-head">
        <div className="acc-head-text">
          <h3 className="acc-title">A year of practice</h3>
          <p className="acc-sub">
            {totalEntries.toLocaleString()} entries · darker means more completions per day
          </p>
        </div>
        <div className="acc-stat">
          <div className="acc-stat-num">{daysWithEntry}<em>%</em></div>
          <div className="acc-stat-trend">days with at least 1 entry</div>
        </div>
      </header>
      <div className="ym-axis">
        {months.map((m, i) => (
          <span key={i} className="ym-label" style={{ left: `${m.left}%` }}>{m.label}</span>
        ))}
      </div>
      <div className="acc-body">
        <div className="year-heat">
          {grid.map((week, ci) => (
            <div key={ci} className="year-week">
              {week.map((cell) => (
                <span
                  key={cell.date}
                  className="year-cell"
                  data-level={cell.level || undefined}
                  data-today={cell.isToday || undefined}
                  title={`${cell.date} · level ${cell.level}`}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
      <div className="year-heat-foot">
        <div className="year-heat-scale">
          <span>Less</span>
          <span className="scale-cell" style={{ background: 'var(--heat-0)' }} />
          <span className="scale-cell" style={{ background: 'var(--heat-1)' }} />
          <span className="scale-cell" style={{ background: 'var(--heat-2)' }} />
          <span className="scale-cell" style={{ background: 'var(--heat-3)' }} />
          <span className="scale-cell" style={{ background: 'var(--heat-4)' }} />
          <span>More</span>
        </div>
      </div>
    </div>
  );
}
