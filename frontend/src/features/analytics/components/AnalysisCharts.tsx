import { useMemo } from 'react';
import type { Routine } from '../../../api/types';
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
  /** activity[].routines = routines logged that day. We use this as a proxy. */
  activity: ActivityPoint[];
  /** Number of active routines — denominator for "completed of due". */
  activeRoutineCount: number;
}

const CW = 900;
const CH = 240;
const CPAD_L = 50;
const CPAD_R = 20;
const CPAD_T = 18;
const CPAD_B = 36;

export function RoutineCompletionChart({ activity, activeRoutineCount }: CompletionProps) {
  const series = useMemo(() => {
    if (activity.length === 0 || activeRoutineCount === 0) return [];
    return activity.map((a) => Math.min(100, Math.round((a.routines / activeRoutineCount) * 100)));
  }, [activity, activeRoutineCount]);

  const avg = series.length === 0 ? 0
    : Math.round(series.reduce((acc, v) => acc + v, 0) / series.length);

  if (series.length === 0) {
    return (
      <div className="ana-card-chart">
        <header className="acc-head">
          <div className="acc-head-text">
            <h3 className="acc-title">Routine completion · 30 days</h3>
            <p className="acc-sub">% of due routines completed each day</p>
          </div>
        </header>
        <div className="ana-card-empty">No routines logged yet.</div>
      </div>
    );
  }

  // Normalize to chart axis. Y: 0 → bottom, 100 → top.
  const innerW = CW - CPAD_L - CPAD_R;
  const innerH = CH - CPAD_T - CPAD_B;
  const minY = Math.max(0, Math.min(...series) - 10);
  const maxY = Math.min(100, Math.max(...series) + 10);
  const yScale = (v: number) => CPAD_T + (1 - (v - minY) / (maxY - minY)) * innerH;
  const xScale = (i: number) => CPAD_L + (i / Math.max(1, series.length - 1)) * innerW;

  // 5 horizontal grid lines + Y labels.
  const yTicks = [0, 1, 2, 3, 4].map((i) => {
    const v = Math.round(minY + (i / 4) * (maxY - minY));
    return { y: yScale(v), v };
  });
  // X ticks: every 5 days.
  const xTicks = series.map((_, i) => i)
    .filter((i) => i === 0 || i === series.length - 1 || i % 5 === 0)
    .map((i) => ({ x: xScale(i), label: `d-${series.length - 1 - i}` }));

  // Path for the line.
  const linePath = series.map((v, i) => {
    const x = xScale(i).toFixed(1);
    const y = yScale(v).toFixed(1);
    return `${i === 0 ? 'M' : 'L'} ${x},${y}`;
  }).join(' ');
  // Area path closes back to baseline.
  const baselineY = yScale(minY).toFixed(1);
  const firstX = xScale(0).toFixed(1);
  const lastX = xScale(series.length - 1).toFixed(1);
  const areaPath = `M ${firstX},${baselineY} L ${linePath.slice(2)} L ${lastX},${baselineY} Z`;

  return (
    <div className="ana-card-chart">
      <header className="acc-head">
        <div className="acc-head-text">
          <h3 className="acc-title">Routine completion · 30 days</h3>
          <p className="acc-sub">% of due routines completed each day</p>
        </div>
        <div className="acc-stat">
          <div className="acc-stat-num">{avg}<em>%</em></div>
          <div className="acc-stat-trend">avg · last 30 days</div>
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
          {/* X axis labels */}
          {xTicks.map((t, i) => (
            <text key={i} x={t.x} y={CH - 12} textAnchor="middle"
              fill="var(--ink-5)" fontSize={10} fontFamily="JetBrains Mono">{t.label}</text>
          ))}
          {/* Area + line + dots */}
          <path d={areaPath} fill="var(--indigo)" fillOpacity={0.10} />
          <path d={linePath} fill="none" stroke="var(--indigo)" strokeWidth={1.8}
            strokeLinecap="round" strokeLinejoin="round" />
          {series.map((v, i) => (
            <circle key={i} cx={xScale(i)} cy={yScale(v)} r={2.5} fill="var(--indigo)" />
          ))}
          {/* Highlight last point */}
          {series.length > 0 && (
            <>
              <circle cx={xScale(series.length - 1)} cy={yScale(series[series.length - 1])}
                r={5} fill="var(--indigo)" opacity={0.25} />
              <circle cx={xScale(series.length - 1)} cy={yScale(series[series.length - 1])}
                r={3.5} fill="var(--indigo)" />
            </>
          )}
        </svg>
      </div>
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
