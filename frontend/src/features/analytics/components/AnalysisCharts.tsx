import { useMemo, useState } from 'react';
import type { Routine, Task } from '../../../api/types';
import type { ActivityPoint, StreakRow } from '../hooks/useAnalytics';
import { isScheduledOn, ymd } from '../../routines/lib/heatmap';

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
  /** Routines — used by the click-to-inspect day detail panel to render
   *  the routine roll-up for the picked day. */
  routines: Routine[];
}

type SeriesMode = 'routines' | 'goals' | 'both';
const SERIES_LABELS: Record<SeriesMode, string> = {
  routines: '% of routines logged each day',
  goals:    '% of goal-work (gos) closed each day',
  both:     'routines vs goal-work + expected pace',
};
const MODE_BUTTONS: { key: SeriesMode; label: string }[] = [
  { key: 'routines', label: 'Routines' },
  { key: 'goals',    label: 'Goal work' },
  { key: 'both',     label: 'Both' },
];

const CW = 900;
const CH = 320;
const CPAD_L = 52;
const CPAD_R = 24;
const CPAD_T = 22;
const CPAD_B = 38;

/** Trailing 7-day moving average. Smooths the spiky daily series so a long
 *  multi-month goal doesn't look dead on quiet days — the smoothed line
 *  shows the user's actual cadence over the surrounding week. */
function movingAverage7(values: number[]): number[] {
  if (values.length === 0) return [];
  const out: number[] = new Array(values.length);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= 7) sum -= values[i - 7];
    const denom = Math.min(i + 1, 7);
    out[i] = sum / denom;
  }
  return out;
}

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

export function RoutineCompletionChart({
  activity, activeRoutineCount, tasks, routines,
}: CompletionProps) {
  const [mode, setMode] = useState<SeriesMode>('routines');
  // Hovered index — drives the vertical guide + tooltip. null = no hover.
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  // Selected (sticky) day — clicking a point opens a full day-detail panel
  // below the chart with goals/gos done, gos due, rhythm vs week-avg,
  // routines roll-up. Click the same point or X to close.
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);

  // ── Series ──────────────────────────────────────────────────────────
  const routinesSeries = useMemo(() => {
    if (activity.length === 0 || activeRoutineCount === 0) return [];
    return activity.map((a) => Math.min(100, Math.round((a.routines / activeRoutineCount) * 100)));
  }, [activity, activeRoutineCount]);

  // Goal-work series. Uses `activity.gos` (distinct gos worked on that
  // day) — not `activity.goals` (whole-goal closures, which are rare events
  // and made long multi-month goals look dead). Denominator is the total
  // count of open gos across non-done goals; a normalised % is fairer than
  // raw counts when comparing across periods of different workload size.
  const openGosTotal = useMemo(
    () => tasks
      .filter((t) => t.status !== 'done')
      .reduce((s, t) => s + (t.gos?.length ?? 0), 0),
    [tasks],
  );
  const goalsSeries = useMemo(() => {
    if (activity.length === 0 || openGosTotal === 0) return [];
    return activity.map((a) => Math.min(100, Math.round((a.gos / openGosTotal) * 100)));
  }, [activity, openGosTotal]);

  // 7-day moving averages of each percent-series — drawn as faint lines
  // behind the main series so the user can read the underlying cadence
  // through the day-to-day noise.
  const routinesMA = useMemo(() => movingAverage7(routinesSeries), [routinesSeries]);
  const goalsMA    = useMemo(() => movingAverage7(goalsSeries),    [goalsSeries]);

  // Period totals — shown in the KPI strip above the chart. These are
  // the answers to "what did I actually do this period?" and are what
  // the user said was missing from the chart's previous storytelling.
  const totals = useMemo(() => {
    let gos = 0, routines = 0, goalsClosed = 0, activeDays = 0;
    for (const a of activity) {
      gos += a.gos;
      routines += a.routines;
      goalsClosed += a.goals;
      if (a.gos > 0 || a.routines > 0 || a.goals > 0) activeDays++;
    }
    return { gos, routines, goalsClosed, activeDays };
  }, [activity]);

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
    // Current rate = average gos *worked on* per day over the activity window.
    // Was previously `activity.goals` (whole-goal closures) which underrepresented
    // long goals — anyone making daily progress would see "0.0 gos/day".
    const totalWorked = activity.reduce((s, a) => s + a.gos, 0);
    const currentRate = activity.length === 0 ? 0 : Math.round((totalWorked / activity.length) * 10) / 10;

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

  const yTicks = useMemo(
    () => [0, 25, 50, 75, 100].map((v) => ({ v, y: yScale(v) })),
    // yScale is pure on minY/maxY/innerH which are constants in this render
    // — recomputing is cheap but caching avoids 5 object allocations / hover.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  // X ticks every ~5 days, label = real calendar date ("May 14"), so a glance
  // at the bottom tells the user when they actually were active.
  const xTicks = useMemo(() => {
    const fmtTick = (iso: string) => {
      const d = new Date(iso);
      if (isNaN(d.getTime())) return iso;
      return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
    };
    const tickEvery = N > 60 ? 14 : N > 30 ? 7 : 5;
    return Array.from({ length: N }, (_, i) => i)
      .filter((i) => i === 0 || i === N - 1 || i % tickEvery === 0)
      .map((i) => ({ x: xScale(i), label: fmtTick(activity[i].date) }));
    // xScale closes over N + innerW, both stable per render of this branch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activity, N]);

  const showRoutines = mode === 'routines' || mode === 'both';
  const showGoals    = mode === 'goals'    || mode === 'both';
  const showPace     = (mode === 'goals' || mode === 'both') && pace.available;

  // Index of "today" in the activity array — used to draw a subtle vertical
  // marker so the user can tell at a glance where the period ends. -1 when
  // today is outside the visible window (e.g. historical period).
  const todayIdx = useMemo(() => {
    if (activity.length === 0) return -1;
    const today = ymd(new Date());
    return activity.findIndex((a) => a.date === today);
  }, [activity]);

  // Path strings are pure derivations from the series + scales — memoise so
  // hovering the chart (which bumps `hoverIdx` on every mousemove) doesn't
  // rebuild N-point Bezier strings on every tick.
  const baseY = yScale(0);
  const routinesLine = useMemo(
    () => (showRoutines && routinesSeries.length > 0
      ? linePathFor(routinesSeries, xScale, yScale) : ''),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [showRoutines, routinesSeries, N],
  );
  const goalsLine = useMemo(
    () => (showGoals && goalsSeries.length > 0
      ? linePathFor(goalsSeries, xScale, yScale) : ''),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [showGoals, goalsSeries, N],
  );
  const routinesArea = useMemo(
    () => (routinesLine
      ? areaPathFor(routinesLine, xScale(0), xScale(routinesSeries.length - 1), baseY)
      : ''),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [routinesLine, routinesSeries.length, N],
  );
  const goalsArea = useMemo(
    () => (goalsLine
      ? areaPathFor(goalsLine, xScale(0), xScale(goalsSeries.length - 1), baseY)
      : ''),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [goalsLine, goalsSeries.length, N],
  );
  const routinesMALine = useMemo(
    () => (showRoutines && routinesMA.length > 0
      ? linePathFor(routinesMA, xScale, yScale) : ''),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [showRoutines, routinesMA, N],
  );
  const goalsMALine = useMemo(
    () => (showGoals && goalsMA.length > 0
      ? linePathFor(goalsMA, xScale, yScale) : ''),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [showGoals, goalsMA, N],
  );

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
      <div className="dc-kpi">
        <div className="dc-kpi__item">
          <div className="dc-kpi__num">{totals.gos}</div>
          <div className="dc-kpi__lbl">gos worked on</div>
        </div>
        <div className="dc-kpi__sep" />
        <div className="dc-kpi__item">
          <div className="dc-kpi__num">{totals.routines}</div>
          <div className="dc-kpi__lbl">routines logged</div>
        </div>
        <div className="dc-kpi__sep" />
        <div className="dc-kpi__item">
          <div className="dc-kpi__num">{totals.goalsClosed}</div>
          <div className="dc-kpi__lbl">goals shipped</div>
        </div>
        <div className="dc-kpi__sep" />
        <div className="dc-kpi__item">
          <div className="dc-kpi__num">{totals.activeDays}<em>/{N}</em></div>
          <div className="dc-kpi__lbl">active days</div>
        </div>
      </div>
      <div className="acc-body">
       <div className="dc-plot">
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

          {/* Today marker — vertical line at today's index when visible. */}
          {todayIdx >= 0 && (
            <g pointerEvents="none">
              <line
                x1={xScale(todayIdx)} x2={xScale(todayIdx)}
                y1={CPAD_T} y2={CH - CPAD_B}
                stroke="var(--ochre)" strokeWidth={1} strokeDasharray="2 3" opacity={0.7}
              />
              <text x={xScale(todayIdx) + 4} y={CPAD_T + 10}
                fill="var(--ochre)" fontSize={10} fontFamily="JetBrains Mono">today</text>
            </g>
          )}

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
          {/* 7-day moving averages — faint thick line behind, so the eye reads
              the daily series in the foreground and the trend in the background. */}
          {showRoutines && routinesMALine && (
            <path d={routinesMALine} fill="none" stroke="var(--indigo)" strokeWidth={2.6}
              strokeLinecap="round" strokeLinejoin="round" opacity={0.22} />
          )}
          {showGoals && goalsMALine && (
            <path d={goalsMALine} fill="none" stroke="var(--moss)" strokeWidth={2.6}
              strokeLinecap="round" strokeLinejoin="round" opacity={0.22} />
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

          {/* Hover guide — vertical line at the hovered day + colored dots on
              each visible series. Computed once from hoverIdx so all the
              point markers stay aligned. */}
          {hoverIdx !== null && (
            <g pointerEvents="none">
              <line
                x1={xScale(hoverIdx)} x2={xScale(hoverIdx)}
                y1={CPAD_T} y2={CH - CPAD_B}
                stroke="var(--ink-3)" strokeWidth={1} strokeDasharray="3 3" opacity={0.55}
              />
              {showRoutines && routinesSeries[hoverIdx] !== undefined && (
                <circle cx={xScale(hoverIdx)} cy={yScale(routinesSeries[hoverIdx])}
                  r={4} fill="var(--indigo)" stroke="var(--paper)" strokeWidth={1.5} />
              )}
              {showGoals && goalsSeries[hoverIdx] !== undefined && (
                <circle cx={xScale(hoverIdx)} cy={yScale(goalsSeries[hoverIdx])}
                  r={4} fill="var(--moss)" stroke="var(--paper)" strokeWidth={1.5} />
              )}
            </g>
          )}

          {/* Sticky selected-day marker — drawn behind the hover dot so a
              freshly-clicked point still highlights when the cursor leaves. */}
          {selectedIdx !== null && (
            <g pointerEvents="none">
              <line
                x1={xScale(selectedIdx)} x2={xScale(selectedIdx)}
                y1={CPAD_T} y2={CH - CPAD_B}
                stroke="var(--indigo)" strokeWidth={1.2} opacity={0.65}
              />
              <circle
                cx={xScale(selectedIdx)} cy={CPAD_T - 4}
                r={3} fill="var(--indigo)"
              />
            </g>
          )}

          {/* Invisible overlay that captures mouse moves anywhere over the
              plot area and resolves the nearest index. Must be the LAST
              element so it sits on top of paths/areas (and doesn't get
              hidden by them under pointer-events). Click pins the picked
              day; clicking the same day a second time unpins. */}
          <rect
            x={CPAD_L} y={CPAD_T}
            width={innerW} height={innerH}
            fill="transparent"
            style={{ cursor: 'pointer' }}
            onMouseMove={(e) => {
              const svg = e.currentTarget.ownerSVGElement;
              if (!svg) return;
              const pt = svg.createSVGPoint();
              pt.x = e.clientX; pt.y = e.clientY;
              const local = pt.matrixTransform(svg.getScreenCTM()?.inverse());
              const t = Math.max(0, Math.min(1, (local.x - CPAD_L) / innerW));
              const idx = Math.round(t * Math.max(1, N - 1));
              if (idx !== hoverIdx) setHoverIdx(idx);
            }}
            onMouseLeave={() => setHoverIdx(null)}
            onClick={(e) => {
              const svg = e.currentTarget.ownerSVGElement;
              if (!svg) return;
              const pt = svg.createSVGPoint();
              pt.x = e.clientX; pt.y = e.clientY;
              const local = pt.matrixTransform(svg.getScreenCTM()?.inverse());
              const t = Math.max(0, Math.min(1, (local.x - CPAD_L) / innerW));
              const idx = Math.round(t * Math.max(1, N - 1));
              setSelectedIdx((cur) => (cur === idx ? null : idx));
            }}
          />
        </svg>

        {/* Tooltip — rendered as a positioned div outside the SVG so we get
            crisp text + design-system fonts. Anchored via % calculation so
            it stays inside the chart bounds. */}
        {hoverIdx !== null && (() => {
          const a = activity[hoverIdx];
          const rPct = routinesSeries[hoverIdx];
          const gPct = goalsSeries[hoverIdx];
          const xPct = ((xScale(hoverIdx) / CW) * 100);
          // Flip the tooltip to the left when near the right edge.
          const flipLeft = xPct > 70;
          const d = new Date(a.date);
          const niceDate = isNaN(d.getTime())
            ? a.label
            : d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
          return (
            <div
              className="dc-tooltip"
              data-flip={flipLeft || undefined}
              style={{ left: `${xPct}%` }}
            >
              <div className="dc-tooltip__date">{niceDate}</div>
              <div className="dc-tooltip__rows">
                {showRoutines && rPct !== undefined && (
                  <div className="dc-tooltip__row">
                    <span className="dc-tooltip__sw" style={{ background: 'var(--indigo)' }} />
                    <span className="dc-tooltip__lbl">Routines</span>
                    <span className="dc-tooltip__val">{rPct}%</span>
                    <span className="dc-tooltip__sub">{a.routines} logged</span>
                  </div>
                )}
                {showGoals && gPct !== undefined && (
                  <div className="dc-tooltip__row">
                    <span className="dc-tooltip__sw" style={{ background: 'var(--moss)' }} />
                    <span className="dc-tooltip__lbl">Goal work</span>
                    <span className="dc-tooltip__val">{gPct}%</span>
                    <span className="dc-tooltip__sub">
                      {a.gos} {a.gos === 1 ? 'go' : 'gos'} worked on
                    </span>
                  </div>
                )}
                {a.goals > 0 && (
                  <div className="dc-tooltip__row">
                    <span className="dc-tooltip__sw" style={{ background: 'var(--ochre)' }} />
                    <span className="dc-tooltip__lbl">Shipped</span>
                    <span className="dc-tooltip__val">{a.goals}</span>
                    <span className="dc-tooltip__sub">
                      goal{a.goals === 1 ? '' : 's'} closed
                    </span>
                  </div>
                )}
                {showPace && (
                  <div className="dc-tooltip__row">
                    <span className="dc-tooltip__sw dc-tooltip__sw--line"
                      style={{ background: 'var(--rust)' }} />
                    <span className="dc-tooltip__lbl">Expected</span>
                    <span className="dc-tooltip__val">{pace.expectedPct}%</span>
                  </div>
                )}
              </div>
            </div>
          );
        })()}
       </div>

        {/* Legend */}
        <div className="dc-legend">
          <span className={`dc-legend__item${!showRoutines ? ' dim' : ''}`}>
            <span className="dc-legend__sw" style={{ background: 'var(--indigo)' }} />
            Routines · <span style={{ color: 'var(--ink-4)' }}>{routinesAvg}% avg</span>
          </span>
          <span className={`dc-legend__item${!showGoals ? ' dim' : ''}`}>
            <span className="dc-legend__sw" style={{ background: 'var(--moss)' }} />
            Goal work · <span style={{ color: 'var(--ink-4)' }}>{goalsAvg}% avg</span>
          </span>
          {(showRoutines || showGoals) && (
            <span className="dc-legend__item">
              <span className="dc-legend__sw dc-legend__sw--ma" />
              7-day average
            </span>
          )}
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
                Working <em>{pace.currentRate} gos/day</em>; to clear every
                deadline you need <em>{pace.paceNeeded}/day</em>.
              </>
            ) : pace.gap < -3 ? (
              <>
                <strong>Ahead of plan by ~{-pace.gap}%.</strong>{' '}
                At <em>{pace.currentRate} gos/day</em>, room to take on more
                or coast into the weekend.
              </>
            ) : (
              <>
                <strong>On plan.</strong> Working <em>{pace.currentRate} gos/day</em>,
                target is <em>{pace.paceNeeded}/day</em>.
              </>
            )}
          </span>
        </div>
      )}

      {/* Click-to-inspect day panel. Lives under the pace strip so the
          chart stays the eye anchor; the panel surfaces the underlying
          rows for the picked day without taking you out of context. */}
      {selectedIdx !== null && activity[selectedIdx] && (
        <DayDetailPanel
          point={activity[selectedIdx]}
          activity={activity}
          idx={selectedIdx}
          tasks={tasks}
          routines={routines}
          onClose={() => setSelectedIdx(null)}
        />
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────── */
/*  Day detail panel — opens under the chart on day-point click                 */
/* ─────────────────────────────────────────────────────────────────────────── */

interface DayDetailProps {
  point: ActivityPoint;
  /** Full activity series — used to compute the 7-day rhythm baseline. */
  activity: ActivityPoint[];
  /** Index of `point` inside `activity`. */
  idx: number;
  tasks: Task[];
  routines: Routine[];
  onClose: () => void;
}

/** Day-detail panel that opens below Daily completion when the user clicks
 *  a point on the chart. Four mini-sections:
 *
 *    1. Work completed (gos done + goals shipped)
 *    2. Tasks needed today (gos due that day, done vs pending)
 *    3. Rhythm (vs. 7-day moving average + scheduled-routine completion)
 *    4. Routines (logged that day with values)
 *
 *  Every list is empty-state aware so quiet days don't show empty headings.
 */
function DayDetailPanel({ point, activity, idx, tasks, routines, onClose }: DayDetailProps) {
  const dateObj = new Date(point.date);
  const niceDate = isNaN(dateObj.getTime())
    ? point.label
    : dateObj.toLocaleDateString(undefined, {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    });

  // ── Section 1 + 2 data: walk all gos once, bucket by status for the day.
  const work = useMemo(() => {
    interface DoneGo  { goal: string; goTitle: string; value: number; unit?: string; }
    interface DueGo   { goal: string; goTitle: string; isDone: boolean; }
    const doneGos: DoneGo[] = [];
    const dueGos: DueGo[] = [];
    const goalsShipped: string[] = [];

    for (const t of tasks) {
      const goalTitle = t.title;
      if (t.status === 'done' && t.updated_at) {
        const upd = new Date(t.updated_at);
        if (!isNaN(upd.getTime())) {
          const y = upd.getFullYear();
          const m = String(upd.getMonth() + 1).padStart(2, '0');
          const d = String(upd.getDate()).padStart(2, '0');
          if (`${y}-${m}-${d}` === point.date) goalsShipped.push(goalTitle);
        }
      }
      for (const g of t.gos) {
        // Done-on-the-day. Pick the first positive entry for that date —
        // multiple numeric entries get summed for the display value.
        let dayValue = 0;
        for (const e of g.entries) if (e.date === point.date && e.value > 0) dayValue += e.value;
        if (dayValue > 0) {
          doneGos.push({ goal: goalTitle, goTitle: g.title, value: dayValue, unit: g.unit || undefined });
        }
        // Due on the day — separate concept. The same go can be both due
        // and done; we still surface it under "Needed today" with its
        // done flag so the proportion is honest.
        if (g.due_date === point.date) {
          dueGos.push({ goal: goalTitle, goTitle: g.title, isDone: dayValue > 0 });
        }
      }
    }
    // Group both lists by goal for tighter rendering.
    const groupBy = <T extends { goal: string }>(arr: T[]): Map<string, T[]> => {
      const m = new Map<string, T[]>();
      for (const r of arr) {
        const list = m.get(r.goal) ?? [];
        list.push(r);
        m.set(r.goal, list);
      }
      return m;
    };
    return {
      doneGos, dueGos, goalsShipped,
      doneByGoal: groupBy(doneGos),
      dueByGoal:  groupBy(dueGos),
      dueDoneCount: dueGos.filter((d) => d.isDone).length,
    };
  }, [tasks, point.date]);

  // ── Section 3: rhythm — `today` vs trailing 7-day avg of (gos + routines).
  const rhythm = useMemo(() => {
    const todayLoad = point.gos + point.routines;
    let sum = 0; let n = 0;
    const start = Math.max(0, idx - 7);
    for (let i = start; i < idx; i++) {
      const a = activity[i];
      if (!a) continue;
      sum += a.gos + a.routines;
      n++;
    }
    const avg = n > 0 ? sum / n : 0;
    let pct = 0;
    let tone: 'above' | 'below' | 'on' = 'on';
    if (avg > 0) {
      pct = Math.round(((todayLoad - avg) / avg) * 100);
      if (pct > 10) tone = 'above';
      else if (pct < -10) tone = 'below';
    } else if (todayLoad > 0) {
      tone = 'above';
    }
    return { todayLoad, avg: Math.round(avg * 10) / 10, pct, tone };
  }, [activity, idx, point.gos, point.routines]);

  // ── Section 4 data: routines table for the day.
  const routineRows = useMemo(() => {
    interface Row { id: string; title: string; status: 'done' | 'skipped' | 'pending' | 'off'; valueLabel: string; }
    const out: Row[] = [];
    for (const r of routines) {
      const entry = r.entries.find((e) => e.date === point.date);
      const scheduled = isScheduledOn(r, dateObj);
      let status: Row['status'] = 'off';
      let valueLabel = '—';
      if (entry) {
        if (entry.value <= 0) {
          status = 'skipped';
          valueLabel = 'skipped';
        } else if (r.kind === 'numeric') {
          status = (r.target_value && entry.value < r.target_value) ? 'pending' : 'done';
          valueLabel = `${entry.value}${r.unit ? ' ' + r.unit : ''}`;
        } else {
          status = 'done';
          valueLabel = 'done';
        }
      } else if (scheduled) {
        // No entry but scheduled — counts as missed/pending for today,
        // but for past days treat as skipped so the column isn't permanently
        // "pending" on historical days.
        const todayKey = ymd(new Date());
        status = (point.date >= todayKey) ? 'pending' : 'skipped';
        valueLabel = status === 'pending' ? '—' : 'missed';
      } else {
        // Not scheduled, no entry — show off-day row only when the user
        // would otherwise wonder where this routine went. We hide them
        // by default to keep the list short; surface via the count below.
        continue;
      }
      out.push({ id: r.id, title: r.title, status, valueLabel });
    }
    // Stable sort: done first, then pending, then skipped/missed.
    const rank = { done: 0, pending: 1, skipped: 2, off: 3 };
    out.sort((a, b) => rank[a.status] - rank[b.status]);
    return out;
  }, [routines, dateObj, point.date]);

  return (
    <div className="day-detail">
      <header className="day-detail__head">
        <div>
          <h4 className="day-detail__title">{niceDate}</h4>
          <p className="day-detail__sub">
            {point.gos} {point.gos === 1 ? 'go' : 'gos'} worked on
            {' · '}{point.routines} {point.routines === 1 ? 'routine' : 'routines'} logged
            {point.goals > 0 && <> · {point.goals} goal{point.goals === 1 ? '' : 's'} shipped</>}
          </p>
        </div>
        <button type="button" className="day-detail__close" onClick={onClose} aria-label="Close">×</button>
      </header>

      <div className="day-detail__grid">
        {/* 1. Work completed */}
        <section className="day-detail__sec">
          <h5 className="day-detail__sec-title">Work completed</h5>
          {work.doneGos.length === 0 && work.goalsShipped.length === 0 ? (
            <p className="day-detail__empty">Nothing logged.</p>
          ) : (
            <>
              {work.goalsShipped.length > 0 && (
                <div className="day-detail__shipped">
                  {work.goalsShipped.map((title) => (
                    <span key={title} className="day-detail__shipped-row">
                      <span className="day-detail__shipped-dot" />
                      <strong>{title}</strong> shipped
                    </span>
                  ))}
                </div>
              )}
              <ul className="day-detail__goal-list">
                {Array.from(work.doneByGoal.entries()).map(([goal, gos]) => (
                  <li key={goal} className="day-detail__goal">
                    <div className="day-detail__goal-name">{goal}</div>
                    <ul className="day-detail__go-list">
                      {gos.map((g, i) => (
                        <li key={i} className="day-detail__go-row" data-tone="done">
                          <span className="day-detail__go-dot" />
                          <span className="day-detail__go-title">{g.goTitle}</span>
                          <span className="day-detail__go-val">
                            {g.unit
                              ? `${g.value} ${g.unit}`
                              : g.value > 1 ? `×${g.value}` : 'done'}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>

        {/* 2. Needed today */}
        <section className="day-detail__sec">
          <h5 className="day-detail__sec-title">Needed today</h5>
          {work.dueGos.length === 0 ? (
            <p className="day-detail__empty">No gos were due.</p>
          ) : (
            <>
              <div className="day-detail__due-bar">
                <div
                  className="day-detail__due-bar-fill"
                  style={{ width: `${(work.dueDoneCount / work.dueGos.length) * 100}%` }}
                />
              </div>
              <div className="day-detail__due-stat">
                <strong>{work.dueDoneCount}</strong> of {work.dueGos.length} done
                <span className="day-detail__due-pct">
                  · {Math.round((work.dueDoneCount / work.dueGos.length) * 100)}%
                </span>
              </div>
              <ul className="day-detail__goal-list">
                {Array.from(work.dueByGoal.entries()).map(([goal, gos]) => (
                  <li key={goal} className="day-detail__goal">
                    <div className="day-detail__goal-name">{goal}</div>
                    <ul className="day-detail__go-list">
                      {gos.map((g, i) => (
                        <li
                          key={i}
                          className="day-detail__go-row"
                          data-tone={g.isDone ? 'done' : 'pending'}
                        >
                          <span className="day-detail__go-dot" />
                          <span className="day-detail__go-title">{g.goTitle}</span>
                          <span className="day-detail__go-val">{g.isDone ? 'done' : 'not done'}</span>
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>

        {/* 3. Rhythm */}
        <section className="day-detail__sec">
          <h5 className="day-detail__sec-title">Rhythm</h5>
          <div className="day-detail__rhythm" data-tone={rhythm.tone}>
            <div className="day-detail__rhythm-arrow">
              {rhythm.tone === 'above' ? '▲' : rhythm.tone === 'below' ? '▼' : '='}
            </div>
            <div className="day-detail__rhythm-text">
              <div className="day-detail__rhythm-line">
                <strong>{rhythm.todayLoad}</strong> items today
              </div>
              <div className="day-detail__rhythm-sub">
                7-day avg <em>{rhythm.avg}</em>
                {rhythm.tone !== 'on' && (
                  <> · {rhythm.pct > 0 ? '+' : ''}{rhythm.pct}%</>
                )}
              </div>
            </div>
          </div>
          {/* Routine cadence proxy: of routines scheduled today, how many
              were logged. Gives a second axis to "rhythm" beyond just load. */}
          {(() => {
            let sched = 0, hit = 0;
            for (const r of routines) {
              if (!isScheduledOn(r, dateObj)) continue;
              sched++;
              const e = r.entries.find((x) => x.date === point.date);
              if (e && e.value > 0) hit++;
            }
            if (sched === 0) return null;
            return (
              <div className="day-detail__rhythm-sched">
                Routines on schedule: <strong>{hit}/{sched}</strong>
              </div>
            );
          })()}
        </section>

        {/* 4. Routines */}
        <section className="day-detail__sec">
          <h5 className="day-detail__sec-title">Routines</h5>
          {routineRows.length === 0 ? (
            <p className="day-detail__empty">No routines tracked.</p>
          ) : (
            <ul className="day-detail__routine-list">
              {routineRows.map((r) => (
                <li key={r.id} className="day-detail__routine-row" data-tone={r.status}>
                  <span className="day-detail__routine-dot" />
                  <span className="day-detail__routine-title">{r.title}</span>
                  <span className="day-detail__routine-val">{r.valueLabel}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
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
