import { useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useGoals } from '../../goals/hooks/useGoals';
import { useGos } from '../../goals/hooks/useGos';
import { useRoutines } from '../../routines/hooks/useRoutines';
import { useNotesLibrary } from '../../notes/hooks/useNotesLibrary';
import { completionRate, currentStreak } from '../../routines/lib/heatmap';
import { MobileTopBar } from '../components/MobileTopBar';
import { MobileShell } from '../components/MobileShell';
import { MobileDayDetailSheet } from '../components/MobileDayDetailSheet';
import { MobilePerRoutinePulse } from '../components/MobilePerRoutinePulse';
import type { Tab } from '../../../app/tabs';

type Period = '7d' | '30d' | '90d' | '1y';
const DAYS: Record<Period, number> = { '7d': 7, '30d': 30, '90d': 90, '1y': 365 };

interface Props {
  tab: Tab;
  onTabChange: (tab: Tab) => void;
  onAvatarClick: () => void;
}

const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const ACCENTS = ['var(--moss)', 'var(--indigo)', 'var(--ochre)', 'var(--rust)', 'var(--slate)'] as const;

export default function MobileAnalysisScreen({ tab, onTabChange, onAvatarClick }: Props) {
  const goals = useGoals();
  const gos   = useGos(goals);
  const routines = useRoutines();
  const notes = useNotesLibrary();

  const [period, setPeriod] = useState<Period>('30d');
  const days = DAYS[period];
  // Click-to-inspect day on the Daily completion chart. `selectedIdx` is the
  // index into the `dates` array; `null` = no day selected. We open the
  // detail sheet whenever it's set and close (= null) on dismiss.
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  // Reset on period change — otherwise a `selectedIdx` from 30d view stays
  // pinned when the user switches to 7d, pointing past the new array end.
  useEffect(() => { setSelectedIdx(null); }, [period]);

  // ── Date helpers ───────────────────────────────────────────────────────────
  const today = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }, []);
  const cutoffDate = useMemo(() => {
    const d = new Date(today); d.setDate(d.getDate() - days + 1); return d;
  }, [today, days]);
  const cutoff = ymd(cutoffDate);

  // ── KPI calculations ───────────────────────────────────────────────────────
  const kpi = useMemo(() => {
    // Routines on track: avg of completionRate(period) across active routines.
    const active = routines.routines.filter((r) => !r.is_paused);
    const onTrackPct = active.length === 0 ? 0
      : Math.round(active.reduce((s, r) => s + completionRate(r, days), 0) / active.length);

    // Goals advancing: active goals with progress > 0.
    const advancing = goals.tasks.filter((t) => t.status === 'active' && (t.progress ?? 0) > 0).length;

    // Longest streak across all routines.
    const longest = routines.routines.reduce((m, r) => Math.max(m, currentStreak(r)), 0);

    // Notes added in period.
    const notesAdded = notes.allNotes.filter((n) => n.note.created_at.slice(0, 10) >= cutoff).length;

    return { onTrackPct, advancing, longest, notesAdded };
  }, [routines.routines, goals.tasks, notes.allNotes, days, cutoff]);

  // ── Daily completion series (Routines vs Go-targets) ──────────────────────
  const series = useMemo(() => {
    const dates: string[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(today); d.setDate(d.getDate() - i);
      dates.push(ymd(d));
    }
    const routinePoints: number[] = [];
    const goPoints: number[] = [];
    for (const date of dates) {
      // Routines: % of scheduled-on-this-date that have value > 0
      let scheduled = 0, done = 0;
      for (const r of routines.routines) {
        if (r.is_paused) continue;
        // Use simple rule: if there's an entry for this date or the schedule is daily
        const scheduledToday = r.schedule_type === 'daily';
        if (scheduledToday) {
          scheduled++;
          const e = r.entries.find((x) => x.date === date);
          if (e && e.value > 0) done++;
        }
      }
      routinePoints.push(scheduled === 0 ? 0 : Math.round((done / scheduled) * 100));

      // Go-targets: % of go entries on this date with value > 0
      let total = 0, hit = 0;
      for (const g of gos.gos) {
        const e = g.entries.find((x) => x.date === date);
        if (e) {
          total++;
          if (e.value > 0) hit++;
        }
      }
      goPoints.push(total === 0 ? 0 : Math.round((hit / total) * 100));
    }
    const avg = (arr: number[]) => arr.length === 0 ? 0 : Math.round(arr.reduce((s, n) => s + n, 0) / arr.length);
    return { dates, routinePoints, goPoints, routinesAvg: avg(routinePoints), goAvg: avg(goPoints) };
  }, [routines.routines, gos.gos, days, today]);

  // ── Goals vs plan (5 bars, color-coded) ───────────────────────────────────
  const goalBars = useMemo(() => {
    return goals.tasks
      .filter((t) => t.status === 'active' || t.status === 'paused')
      .slice(0, 5)
      .map((t, i) => {
        const accent = t.color || ACCENTS[i % ACCENTS.length];
        // Expected today: based on time elapsed in goal range.
        let expectedPct: number | null = null;
        if (t.start_date && t.due_date) {
          const start = new Date(t.start_date).getTime();
          const end = new Date(t.due_date).getTime();
          if (end > start) expectedPct = Math.round(Math.min(100, Math.max(0, (today.getTime() - start) / (end - start) * 100)));
        }
        return { id: t.id, title: t.title, pct: Math.round(t.progress ?? 0), expected: expectedPct, accent };
      });
  }, [goals.tasks, today]);

  // ── Routines by status (donut) ─────────────────────────────────────────────
  const statusBuckets = useMemo(() => {
    let strong = 0, active = 0, slipping = 0, hold = 0;
    for (const r of routines.routines) {
      if (r.is_paused) { hold++; continue; }
      const rate = completionRate(r, 30);
      const streak = currentStreak(r);
      if (streak >= 7 && rate >= 80) strong++;
      else if (rate < 50) slipping++;
      else active++;
    }
    return { strong, active, slipping, hold, total: routines.routines.length };
  }, [routines.routines]);

  // ── Top streaks ────────────────────────────────────────────────────────────
  const topStreaks = useMemo(() => {
    return [...routines.routines]
      .map((r) => ({ routine: r, streak: currentStreak(r) }))
      .filter((x) => x.streak > 0)
      .sort((a, b) => b.streak - a.streak)
      .slice(0, 4);
  }, [routines.routines]);

  // ── Year heatmap (entries across routines + gos, last 365 days) ───────────
  const yearHeat = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of routines.routines) for (const e of r.entries) {
      if (e.value > 0) map.set(e.date, (map.get(e.date) ?? 0) + 1);
    }
    for (const g of gos.gos) for (const e of g.entries) {
      if (e.value > 0) map.set(e.date, (map.get(e.date) ?? 0) + 1);
    }
    // 365 days back, grouped into 53 weeks of 7 days.
    const weeks: { date: string; level: number; isToday: boolean }[][] = [];
    const start = new Date(today); start.setDate(start.getDate() - 364);
    // Align to start of week (Sun)
    const dow = start.getDay();
    start.setDate(start.getDate() - dow);
    for (let w = 0; w < 53; w++) {
      const week: { date: string; level: number; isToday: boolean }[] = [];
      for (let d = 0; d < 7; d++) {
        const cur = new Date(start);
        cur.setDate(start.getDate() + w * 7 + d);
        const key = ymd(cur);
        const val = map.get(key) ?? 0;
        const level = val === 0 ? 0 : val < 2 ? 1 : val < 4 ? 2 : val < 7 ? 3 : 4;
        week.push({ date: key, level, isToday: key === ymd(today) });
      }
      weeks.push(week);
    }
    const totalEntries = Array.from(map.values()).reduce((s, n) => s + n, 0);
    const activeDays = map.size;
    const pctActive = Math.round((activeDays / 365) * 100);
    return { weeks, totalEntries, pctActive };
  }, [routines.routines, gos.gos, today]);

  const subtitle = `${kpi.advancing} goals advancing · ${kpi.onTrackPct}% on track`;
  const topBar = <MobileTopBar title="Analysis" subtitle={subtitle} onAvatarClick={onAvatarClick} />;

  if (goals.loading || routines.loading || notes.loading) {
    return (
      <MobileShell topBar={topBar} tab={tab} onTabChange={onTabChange}>
        <div style={{ display: 'grid', placeItems: 'center', height: '60dvh', color: 'var(--ink-4)' }}>
          <Loader2 size={22} className="animate-spin" />
        </div>
      </MobileShell>
    );
  }

  // ── Editorial headline ─────────────────────────────────────────────────────
  const eyebrow = today.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }) + ', in figures';
  let headline: React.ReactNode = <>A balanced period.</>;
  if (kpi.onTrackPct >= 80) headline = <>A solid month,<br/>everything <em>on track</em>.</>;
  else if (statusBuckets.slipping > 0) headline = <>Mostly steady,<br/>with <em>{statusBuckets.slipping} slipping</em>.</>;
  else if (kpi.onTrackPct < 40) headline = <>A quiet month,<br/>time to <em>rebuild</em>.</>;

  return (
    <MobileShell topBar={topBar} tab={tab} onTabChange={onTabChange}>
      <header className="ana-hero">
        <div className="ana-eyebrow">{eyebrow}</div>
        <h1 className="ana-hero-title">{headline}</h1>
      </header>

      <div className="kpi-grid">
        <div className="kpi-tile">
          <div className="kpi-num">{kpi.onTrackPct}<em>%</em></div>
          <div className="kpi-lab">Routines on track</div>
        </div>
        <div className="kpi-tile">
          <div className="kpi-num">{kpi.advancing}</div>
          <div className="kpi-lab">Goals advancing</div>
        </div>
        <div className="kpi-tile">
          <div className="kpi-num">{kpi.longest}<em>d</em></div>
          <div className="kpi-lab">Longest streak</div>
        </div>
        <div className="kpi-tile">
          <div className="kpi-num">{kpi.notesAdded}</div>
          <div className="kpi-lab">Notes added</div>
        </div>
      </div>

      <div className="time-pills time-pills-ana">
        {(['7d', '30d', '90d', '1y'] as Period[]).map((p) => (
          <button
            key={p}
            className={`tp-pill${period === p ? ' tp-pill-active' : ''}`}
            onClick={() => setPeriod(p)}
          >{p}</button>
        ))}
      </div>

      {/* Daily completion area chart */}
      <article className="chart-card">
        <header className="cc-head">
          <div>
            <h3 className="cc-title">Daily completion</h3>
            <p className="cc-sub">routines vs go-targets · {days} days</p>
          </div>
          <div className="cc-stat">
            <div className="cc-stat-num">{series.routinesAvg}<em>%</em></div>
            <div className="cc-stat-lab">routines avg</div>
          </div>
        </header>
        <div className="cc-legend">
          <span className="cc-legend-row">
            <span className="cc-legend-dot" style={{ background: 'var(--indigo)' }} />Routines · {series.routinesAvg}%
          </span>
          <span className="cc-legend-row">
            <span className="cc-legend-dot" style={{ background: 'var(--moss)' }} />Go-targets · {series.goAvg}%
          </span>
        </div>
        <div className="cc-body">
          <DualAreaChart
            routines={series.routinePoints}
            gos={series.goPoints}
            days={days}
            selectedIdx={selectedIdx}
            onPickIdx={(idx) => setSelectedIdx(idx)}
          />
        </div>
        <div style={{
          fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--ink-5)',
          marginTop: 6, textAlign: 'center',
        }}>Tap a day to inspect</div>
      </article>

      {/* Goals vs plan */}
      {goalBars.length > 0 && (
        <article className="chart-card">
          <header className="cc-head">
            <div>
              <h3 className="cc-title">Goals vs plan</h3>
              <p className="cc-sub">Dashed line = expected today</p>
            </div>
            <div className="cc-stat">
              <div className="cc-stat-num">{goalBars.filter((g) => g.expected !== null && g.pct >= g.expected).length}<em>/{goalBars.length}</em></div>
              <div className="cc-stat-lab">on track</div>
            </div>
          </header>
          <div className="cc-body">
            <GoalsBars bars={goalBars} />
          </div>
        </article>
      )}

      {/* Routines by status donut */}
      <article className="chart-card">
        <header className="cc-head">
          <div>
            <h3 className="cc-title">Routines by status</h3>
            <p className="cc-sub">{statusBuckets.total} total</p>
          </div>
        </header>
        <div className="donut-block-m">
          <div className="donut-svg-wrap-m">
            <Donut
              segments={[
                { value: statusBuckets.strong,   color: 'var(--moss)'   },
                { value: statusBuckets.active,   color: 'var(--indigo)' },
                { value: statusBuckets.slipping, color: 'var(--ochre)'  },
                { value: statusBuckets.hold,     color: 'var(--rust)'   },
              ]}
              center={{ num: statusBuckets.total, label: 'ROUTINES' }}
            />
          </div>
          <div className="dl-list">
            <DonutRow color="var(--moss)"   label="Strong streak" num={statusBuckets.strong} />
            <DonutRow color="var(--indigo)" label="Active"        num={statusBuckets.active} />
            <DonutRow color="var(--ochre)"  label="Slipping"      num={statusBuckets.slipping} />
            <DonutRow color="var(--rust)"   label="On hold"       num={statusBuckets.hold} />
          </div>
        </div>
      </article>

      {/* Top streaks */}
      {topStreaks.length > 0 && (
        <article className="chart-card">
          <header className="cc-head">
            <div>
              <h3 className="cc-title">Top streaks</h3>
              <p className="cc-sub">trending</p>
            </div>
          </header>
          <div className="ana-streak-list">
            {topStreaks.map((row, i) => (
              <div key={row.routine.id} className="ana-streak-row">
                <span className="asr-rank">{i + 1}</span>
                <span className="asr-name">{row.routine.title}</span>
                <div className="asr-spark"><Sparkline values={lastNValues(row.routine.entries.map((e) => ({ date: e.date, value: e.value })), 13, today)} /></div>
                <span className="asr-days">{row.streak}<em>d</em></span>
              </div>
            ))}
          </div>
        </article>
      )}

      {/* Per-routine pulse — small line per routine, matches desktop's
          Analysis "Per-routine pulse" grid stacked for portrait. */}
      {routines.routines.length > 0 && (
        <article className="chart-card">
          <header className="cc-head">
            <div>
              <h3 className="cc-title">Per-routine pulse</h3>
              <p className="cc-sub">{routines.routines.length} routine{routines.routines.length === 1 ? '' : 's'} · 30 days</p>
            </div>
          </header>
          <div className="cc-body">
            <MobilePerRoutinePulse routines={routines.routines} />
          </div>
        </article>
      )}

      {/* Year heatmap */}
      <article className="chart-card">
        <header className="cc-head">
          <div>
            <h3 className="cc-title">A year of practice</h3>
            <p className="cc-sub">{yearHeat.totalEntries.toLocaleString()} entries · {yearHeat.pctActive}% with activity</p>
          </div>
        </header>
        <div className="cc-body">
          <div className="m-heat">
            {yearHeat.weeks.map((w, wi) => (
              <div key={wi} className="m-heat-week">
                {w.map((c, di) => (
                  <span
                    key={di}
                    className="m-heat-cell"
                    data-level={c.level || undefined}
                    data-today={c.isToday || undefined}
                    title={`${c.date}`}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
        <div className="m-heat-foot">
          <span>Less</span>
          <span className="ms-cell" style={{ background: 'var(--heat-0)' }} />
          <span className="ms-cell" style={{ background: 'var(--heat-1)' }} />
          <span className="ms-cell" style={{ background: 'var(--heat-2)' }} />
          <span className="ms-cell" style={{ background: 'var(--heat-3)' }} />
          <span className="ms-cell" style={{ background: 'var(--heat-4)' }} />
          <span>More</span>
        </div>
      </article>

      {/* Day-detail sheet — opens when the user taps a point on Daily
          completion. We thread through the routines + gos lists and a
          7-day trailing baseline for the rhythm verdict. */}
      <MobileDayDetailSheet
        date={selectedIdx !== null ? series.dates[selectedIdx] ?? null : null}
        routines={routines.routines}
        gos={gos.gos}
        todayLoad={
          selectedIdx === null ? 0 :
          ((series.routinePoints[selectedIdx] ?? 0) + (series.goPoints[selectedIdx] ?? 0)) / 2
        }
        rhythmAvg7={(() => {
          if (selectedIdx === null) return null;
          const start = Math.max(0, selectedIdx - 7);
          let sum = 0, n = 0;
          for (let i = start; i < selectedIdx; i++) {
            sum += ((series.routinePoints[i] ?? 0) + (series.goPoints[i] ?? 0)) / 2;
            n++;
          }
          return n === 0 ? null : sum / n;
        })()}
        open={selectedIdx !== null}
        onOpenChange={(o) => { if (!o) setSelectedIdx(null); }}
      />
    </MobileShell>
  );
}

// ── Inline SVG charts (no recharts dependency for this screen) ───────────────

function DualAreaChart({
  routines, gos, days: _days, selectedIdx, onPickIdx,
}: {
  routines: number[];
  gos: number[];
  days: number;
  /** Day index with the sticky vertical guide drawn through it. */
  selectedIdx: number | null;
  /** Tap → resolves the nearest day index and pings the parent. */
  onPickIdx: (idx: number) => void;
}) {
  const W = 358, H = 140, padL = 32, padR = 10, padT = 8, padB = 22;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const max = 100, min = 0;
  const x = (i: number, len: number) => padL + (innerW * i) / Math.max(1, len - 1);
  const y = (v: number) => padT + innerH - ((v - min) / (max - min)) * innerH;

  const buildPath = (vals: number[]) => {
    if (vals.length === 0) return '';
    return vals.map((v, i) => `${i === 0 ? 'M' : 'L'} ${x(i, vals.length).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  };
  const closeArea = (d: string, len: number) =>
    len === 0 ? '' : `${d} L ${x(len - 1, len).toFixed(1)},${(padT + innerH).toFixed(1)} L ${x(0, len).toFixed(1)},${(padT + innerH).toFixed(1)} Z`;

  const rPath = buildPath(routines);
  const gPath = buildPath(gos);
  const yLabels = [100, 75, 50, 25];
  // Series length is identical for both (built from the same `dates`
  // array). Use whichever is non-empty to anchor x() for the marker.
  const len = Math.max(routines.length, gos.length);
  const selectedX = selectedIdx !== null && len > 0 ? x(selectedIdx, len) : null;

  /** Pointer → day index. Reads the click's local x within the SVG bounds
   *  (accounting for browser scaling via getScreenCTM) so it works no
   *  matter how the SVG is responsively sized. */
  const pickIdxFromEvent = (clientX: number, svg: SVGSVGElement) => {
    if (len === 0) return;
    const pt = svg.createSVGPoint();
    pt.x = clientX; pt.y = 0;
    const local = pt.matrixTransform(svg.getScreenCTM()?.inverse());
    const t = Math.max(0, Math.min(1, (local.x - padL) / innerW));
    onPickIdx(Math.round(t * Math.max(1, len - 1)));
  };

  return (
    <div className="m-cc-chart-wrap">
      <svg viewBox={`0 0 ${W} ${H}`} className="chart-svg" style={{ width: '100%', height: 'auto' }}>
        {yLabels.map((v) => (
          <g key={v}>
            <line x1={padL} x2={W - padR} y1={y(v)} y2={y(v)} stroke="var(--hairline-faint)" />
            <text x={padL - 6} y={y(v) + 3} textAnchor="end" fill="var(--ink-5)" fontSize="9" fontFamily="JetBrains Mono">{v}</text>
          </g>
        ))}
        <path d={closeArea(rPath, routines.length)} fill="var(--indigo)" fillOpacity="0.10" />
        <path d={rPath} fill="none" stroke="var(--indigo)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        <path d={closeArea(gPath, gos.length)}      fill="var(--moss)"   fillOpacity="0.10" />
        <path d={gPath} fill="none" stroke="var(--moss)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        {selectedX !== null && (
          <g pointerEvents="none">
            <line
              x1={selectedX} x2={selectedX}
              y1={padT} y2={padT + innerH}
              stroke="var(--indigo)" strokeWidth={1.2} opacity={0.55}
              strokeDasharray="3 3"
            />
            {/* Series dots on the selected x — colored by series. */}
            {routines[selectedIdx ?? 0] !== undefined && (
              <circle
                cx={selectedX}
                cy={y(routines[selectedIdx ?? 0])}
                r={3.5} fill="var(--indigo)" stroke="var(--paper)" strokeWidth={1.5}
              />
            )}
            {gos[selectedIdx ?? 0] !== undefined && (
              <circle
                cx={selectedX}
                cy={y(gos[selectedIdx ?? 0])}
                r={3.5} fill="var(--moss)" stroke="var(--paper)" strokeWidth={1.5}
              />
            )}
          </g>
        )}
        {/* Invisible tap layer on top of all paths. preserveAspectRatio
            (default) means viewBox stretches; getScreenCTM resolves the
            click back to viewBox-space so we don't need a manual scale. */}
        <rect
          x={padL} y={padT}
          width={innerW} height={innerH}
          fill="transparent"
          style={{ cursor: 'pointer' }}
          onClick={(e) => {
            const svg = e.currentTarget.ownerSVGElement;
            if (svg) pickIdxFromEvent(e.clientX, svg);
          }}
        />
      </svg>
    </div>
  );
}

function GoalsBars({ bars }: { bars: { id: string; title: string; pct: number; expected: number | null; accent: string }[] }) {
  const ROW_H = 30, GAP = 6;
  const W = 358;
  const H = bars.length * ROW_H + (bars.length - 1) * GAP;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="chart-svg" style={{ width: '100%', height: 'auto' }}>
      {bars.map((b, i) => {
        const yTop = i * (ROW_H + GAP);
        const fillW = Math.max(2, Math.min(W, (W * b.pct) / 100));
        const expX = b.expected !== null ? Math.max(2, Math.min(W, (W * b.expected) / 100)) : null;
        return (
          <g key={b.id}>
            <rect x={0} y={yTop} width={W} height={ROW_H - 2} rx={3} fill="var(--cream)" />
            <rect x={0} y={yTop} width={fillW} height={ROW_H - 2} rx={3} fill={b.accent} />
            {expX !== null && (
              <line x1={expX} x2={expX} y1={yTop - 1} y2={yTop + ROW_H - 1} stroke="var(--ink-4)" strokeWidth={1.2} strokeDasharray="3 2" />
            )}
            <text x={10} y={yTop + ROW_H / 2 + 1} fill="var(--paper)" fontSize="11" fontFamily="Inter" fontWeight="500" dominantBaseline="middle">{b.title}</text>
            <text x={W - 6} y={yTop + ROW_H / 2 + 1} textAnchor="end" fill="var(--ink)" fontSize="11" fontFamily="JetBrains Mono" fontWeight="500" dominantBaseline="middle">{b.pct}%</text>
          </g>
        );
      })}
    </svg>
  );
}

function Donut({
  segments, center,
}: {
  segments: { value: number; color: string }[];
  center: { num: number; label: string };
}) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  if (total === 0) {
    return (
      <svg viewBox="0 0 140 140" className="donut-svg">
        <circle cx="70" cy="70" r="64" fill="var(--cream)" />
        <circle cx="70" cy="70" r="42" fill="var(--paper)" />
        <text x="70" y="68" textAnchor="middle" fill="var(--ink)" fontSize="22" fontFamily="Fraunces" fontWeight="500">0</text>
        <text x="70" y="82" textAnchor="middle" fill="var(--ink-4)" fontSize="8" fontFamily="Inter" fontWeight="500" letterSpacing="0.10em">{center.label}</text>
      </svg>
    );
  }
  const cx = 70, cy = 70, rOut = 64, rIn = 42;
  let cum = 0;
  const paths = segments.filter((s) => s.value > 0).map((s, i) => {
    const a0 = (cum / total) * Math.PI * 2 - Math.PI / 2;
    cum += s.value;
    const a1 = (cum / total) * Math.PI * 2 - Math.PI / 2;
    const large = a1 - a0 > Math.PI ? 1 : 0;
    const x0 = cx + rOut * Math.cos(a0);
    const y0 = cy + rOut * Math.sin(a0);
    const x1 = cx + rOut * Math.cos(a1);
    const y1 = cy + rOut * Math.sin(a1);
    const x2 = cx + rIn * Math.cos(a1);
    const y2 = cy + rIn * Math.sin(a1);
    const x3 = cx + rIn * Math.cos(a0);
    const y3 = cy + rIn * Math.sin(a0);
    return (
      <path
        key={i}
        d={`M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${rOut} ${rOut} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)} L ${x2.toFixed(2)} ${y2.toFixed(2)} A ${rIn} ${rIn} 0 ${large} 0 ${x3.toFixed(2)} ${y3.toFixed(2)} Z`}
        fill={s.color}
      />
    );
  });
  return (
    <svg viewBox="0 0 140 140" className="donut-svg">
      {paths}
      <text x="70" y="68" textAnchor="middle" fill="var(--ink)" fontSize="22" fontFamily="Fraunces" fontWeight="500">{center.num}</text>
      <text x="70" y="82" textAnchor="middle" fill="var(--ink-4)" fontSize="8" fontFamily="Inter" fontWeight="500" letterSpacing="0.10em">{center.label}</text>
    </svg>
  );
}

function DonutRow({ color, label, num }: { color: string; label: string; num: number }) {
  return (
    <div className="dl-row">
      <span className="dl-swatch" style={{ background: color }} />
      <span className="dl-label">{label}</span>
      <span className="dl-num">{num}</span>
    </div>
  );
}

function lastNValues(entries: { date: string; value: number }[], n: number, today: Date): number[] {
  const map = new Map(entries.map((e) => [e.date, e.value]));
  const out: number[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(today); d.setDate(d.getDate() - i);
    out.push(map.get(ymd(d)) ?? 0);
  }
  return out;
}

function Sparkline({ values }: { values: number[] }) {
  const W = 64, H = 18;
  if (values.length === 0) return null;
  const max = Math.max(1, ...values);
  const x = (i: number) => (W * i) / Math.max(1, values.length - 1);
  const y = (v: number) => H - 1 - ((v / max) * (H - 2));
  const points = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="spark-svg">
      <polyline points={points} fill="none" stroke="var(--moss)" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
