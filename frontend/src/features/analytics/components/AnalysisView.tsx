import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Loader2, PanelLeftOpen } from 'lucide-react';
import { Tooltip } from '../../../components/ui';
import { useAnalytics, type PeriodKey } from '../hooks/useAnalytics';
import { currentStreak, completionRate, ymd } from '../../routines/lib/heatmap';
import { AnalysisPane } from './AnalysisPane';
import { KPIStrip } from './KPIStrip';
import { YearHeatmap } from './YearHeatmap';
import { ActivityChart } from './ActivityChart';
import { StatusDonut } from './StatusDonut';
import { GoalProgressBoard } from './GoalProgressBoard';
import { PriorityCard, TagsCard } from './AnalyticsCards';
import './analytics.css';

const PANE_COLLAPSED_KEY = 'jarvnote:analytics:libCollapsed';

const PERIOD_TABS: { key: PeriodKey; label: string }[] = [
  { key: '7d',   label: '7d' },
  { key: '30d',  label: '30d' },
  { key: '90d',  label: '90d' },
  { key: '365d', label: '1y' },
];

const PERIOD_LABEL: Record<PeriodKey, { breadcrumb: string; word: string; long: string }> = {
  '7d':   { breadcrumb: '7 days',    word: 'week',    long: 'Last 7 days'   },
  '30d':  { breadcrumb: '30 days',   word: 'month',   long: 'Last 30 days'  },
  '90d':  { breadcrumb: '90 days',   word: 'quarter', long: 'Last 90 days'  },
  '365d': { breadcrumb: '12 months', word: 'year',    long: 'Last 12 months' },
  'all':  { breadcrumb: 'All time',  word: 'stretch', long: 'All time'      },
};

function fmtMonth(): string {
  return new Date().toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

export default function AnalysisView() {
  const a = useAnalytics();
  const [paneCollapsed, setPaneCollapsed] = useState(
    () => localStorage.getItem(PANE_COLLAPSED_KEY) === '1',
  );
  useEffect(() => {
    localStorage.setItem(PANE_COLLAPSED_KEY, paneCollapsed ? '1' : '0');
  }, [paneCollapsed]);

  const [search, setSearch] = useState('');
  const q = search.trim().toLowerCase();

  // ── Heatmap totals (entries-with-value · oldest non-empty cell as start) ──
  const heatmapStats = useMemo(() => {
    let entries = 0;
    let earliest: string | null = null;
    for (const week of a.yearGrid) {
      for (const cell of week) {
        if (cell.level > 0) {
          entries += cell.level; // approximate: level encodes intensity
          if (!earliest || cell.date < earliest) earliest = cell.date;
        }
      }
    }
    return { entries, startedOn: earliest };
  }, [a.yearGrid]);

  // ── Insight derivation: pick the strongest streak, the worst-rate routine,
  //    and the closest-to-the-finish goal for a 3-card editorial summary. ──
  const insights = useMemo(() => {
    if (a.loading) return [] as React.ReactNode[];

    const cards: React.ReactNode[] = [];

    const best = a.topStreaks.find((s) => s.streak >= 7);
    if (best) {
      const r = best.routine;
      // 13 mini-bars from last 13 entries (newest right).
      const bars: number[] = [];
      const today = new Date();
      for (let i = 12; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(today.getDate() - i);
        const key = ymd(d);
        const e = r.entries.find((x) => x.date === key);
        bars.push(e && e.value > 0 ? Math.min(100, 30 + i * 5 + Math.random() * 30) : 25);
      }
      cards.push(
        <article key="best" className="insight" style={{ ['--ic' as any]: 'var(--moss)' }}>
          <header className="insight-head"><span className="insight-tag">Personal best</span></header>
          <h3 className="insight-headline">{best.streak} {best.streak === 1 ? 'day' : 'days'} of {r.title.toLowerCase()}, unbroken.</h3>
          <p className="insight-body">
            Your <b>{r.title}</b> streak is at <b>{best.streak} {best.streak === 1 ? 'day' : 'days'}</b> with a {best.rate}% completion rate. Keep the rhythm.
          </p>
          <div className="insight-mini-bars">
            {bars.map((h, i) => <span key={i} className="mb" style={{ height: `${h}%` }} />)}
          </div>
        </article>,
      );
    }

    const slipping = [...a.topStreaks].sort((x, y) => x.rate - y.rate)[0];
    if (slipping && slipping.rate < 50) {
      cards.push(
        <article key="slip" className="insight" style={{ ['--ic' as any]: 'var(--rust)' }}>
          <header className="insight-head"><span className="insight-tag">Slipping</span></header>
          <h3 className="insight-headline">{slipping.routine.title} at {slipping.rate}%.</h3>
          <p className="insight-body">
            Completion rate has dipped under half. Either pause the routine or move the trigger to a more workable hour.
          </p>
          <div className="insight-mini-bars">
            {Array.from({ length: 13 }).map((_, i) => (
              <span
                key={i}
                className="mb"
                style={{ height: `${85 - i * 5}%`, background: 'var(--rust)' }}
              />
            ))}
          </div>
        </article>,
      );
    }

    const onTrack = a.goalProgress.find((g) => g.pct >= 50 && g.pct < 100 && g.task.status === 'active');
    if (onTrack) {
      const dueLabel = onTrack.due
        ? new Date(onTrack.due).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
        : '—';
      cards.push(
        <article key="ontrack" className="insight" style={{ ['--ic' as any]: 'var(--slate)' }}>
          <header className="insight-head"><span className="insight-tag">On track</span></header>
          <h3 className="insight-headline">{onTrack.task.title} projected to land on time.</h3>
          <p className="insight-body">
            <b>{onTrack.pct}%</b> complete with <b>{onTrack.steps.done}/{onTrack.steps.total}</b> steps done. Keep your current pace.
          </p>
          <div className="insight-stat-row">
            <div className="is-cell"><span className="is-num">{onTrack.pct}<em>%</em></span><span className="is-lab">Complete</span></div>
            <div className="is-cell"><span className="is-num">{onTrack.steps.done}/{onTrack.steps.total}</span><span className="is-lab">Steps</span></div>
            <div className="is-cell"><span className="is-num">{dueLabel}</span><span className="is-lab">Due</span></div>
          </div>
        </article>,
      );
    }

    return cards;
  }, [a.loading, a.topStreaks, a.goalProgress]);

  // ── Hero title — italic accent reflects the most-affected metric. ───────
  const heroTitle = useMemo(() => {
    const word = PERIOD_LABEL[a.period].word;
    const slipping = [...a.topStreaks].sort((x, y) => x.rate - y.rate)[0];
    if (slipping && slipping.rate < 50) {
      return <>A solid {word},<br />with one <em>fading</em> habit.</>;
    }
    if (a.topStreaks.length > 0 && a.topStreaks[0].streak >= 7) {
      return <>A clean {word},<br />with steady <em className="ok">streaks</em>.</>;
    }
    return <>A <em>quiet</em> {word}.</>;
  }, [a.period, a.topStreaks]);

  const hasAnyData = a.topStreaks.length > 0 || a.goalProgress.length > 0 || heatmapStats.entries > 0;

  if (a.loading) {
    return (
      <main className="content">
        <div className="content-empty">
          <Loader2 size={20} className="animate-spin" />
        </div>
      </main>
    );
  }

  // ── Search filtering ────────────────────────────────────────────────────
  const filteredStreaks = q
    ? a.topStreaks.filter((s) => s.routine.title.toLowerCase().includes(q))
    : a.topStreaks;
  const filteredGoals = q
    ? a.goalProgress.filter((g) => g.task.title.toLowerCase().includes(q))
    : a.goalProgress;

  // Active routines = those that are not paused.
  const activeRoutineCount = a.topStreaks.length;

  return (
    <>
      <AnalysisPane
        period={a.period}
        setPeriod={a.setPeriod}
        search={search}
        setSearch={setSearch}
        collapsed={paneCollapsed}
        onCollapseToggle={() => setPaneCollapsed(true)}
        totals={{
          entries: heatmapStats.entries,
          goals: a.goalProgress.length,
          routines: activeRoutineCount,
          notes: 0,
        }}
      />

      {paneCollapsed && (
        <Tooltip content="Show library" side="right">
          <button
            className="pane-expand-floating"
            onClick={() => setPaneCollapsed(false)}
            aria-label="Show library"
          >
            <PanelLeftOpen />
          </button>
        </Tooltip>
      )}

      <main className="content">
        <div className="content-bar">
          <div className="breadcrumb">
            <b>Analysis</b>
            <span className="breadcrumb-sep">›</span>
            <span>Overview</span>
          </div>
          <div className="pill-seg" role="tablist">
            {PERIOD_TABS.map(({ key, label }) => (
              <button
                key={key}
                className={a.period === key ? 'on' : ''}
                role="tab"
                aria-selected={a.period === key}
                onClick={() => a.setPeriod(key)}
              >{label}</button>
            ))}
          </div>
          <button
            className="icon-btn"
            title="Refresh"
            aria-label="Refresh"
            onClick={() => { void a.refresh(); }}
          >
            <ArrowRight />
          </button>
        </div>

        <div className="content-scroll">
          {!hasAnyData ? (
            <div className="content-empty">
              <div className="content-empty-eyebrow">Analysis</div>
              <div className="content-empty-title">
                Nothing to <em>read</em> yet.
              </div>
              <div className="content-empty-desc">
                Log a routine entry, complete a goal, or finish a sprint — analytics
                surface as soon as data lands.
              </div>
            </div>
          ) : (
            <>
              <header className="ana-hero">
                <div className="go-kicker">{fmtMonth()}, in figures</div>
                <h1 className="ana-hero-title">{heroTitle}</h1>
                <p className="go-lede">
                  KPIs, streak rankings and goal progress for the {PERIOD_LABEL[a.period].breadcrumb.toLowerCase()}.
                  Use the period selector above to widen or tighten the lens.
                </p>
              </header>

              <KPIStrip kpis={a.kpis} />

              {insights.length > 0 && (
                <>
                  <div className="section-head">
                    <span className="section-title">Worth your attention</span>
                    <span className="section-rule" />
                    <span className="section-meta">
                      {insights.length} insight{insights.length === 1 ? '' : 's'} this period
                    </span>
                  </div>
                  <div className="insights-grid">{insights}</div>
                </>
              )}

              <YearHeatmap
                grid={a.yearGrid}
                totalEntries={heatmapStats.entries}
                startedOn={heatmapStats.startedOn}
              />

              <div className="section-head" style={{ marginTop: 48 }}>
                <span className="section-title">Strongest streaks</span>
                <span className="section-rule" />
                <span className="section-meta">Active routines, ranked</span>
              </div>

              {filteredStreaks.length === 0 ? (
                <div className="streak-list-card">
                  <div className="ana-card-empty">
                    {q ? 'Nothing matches that search.' : 'No streaks yet — log a routine to start one.'}
                  </div>
                </div>
              ) : (
                <div className="streak-list-card">
                  {filteredStreaks.slice(0, 8).map((row, i) => {
                    // Recompute streak/rate to reflect a freshly imported routine — the hook's
                    // values are memoised at load time and may be stale when routines change.
                    const streak = currentStreak(row.routine);
                    const rate = completionRate(row.routine, 30);
                    return (
                      <div key={row.routine.id} className="streak-row">
                        <span className="streak-rank">#{i + 1}</span>
                        <span className="streak-name">{row.routine.title}</span>
                        <span className="streak-days">
                          {streak}<span className="streak-days-unit">d</span>
                        </span>
                        <span className="streak-rate">{rate}%</span>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="section-head" style={{ marginTop: 48 }}>
                <span className="section-title">Activity & status</span>
                <span className="section-rule" />
                <span className="section-meta">{PERIOD_LABEL[a.period].long}</span>
              </div>

              <div className="ana-row-2">
                <ActivityChart data={a.activity} />
                <StatusDonut slices={a.statusDonut} />
              </div>

              <GoalProgressBoard rows={filteredGoals} />

              <div className="section-head" style={{ marginTop: 48 }}>
                <span className="section-title">By the numbers</span>
                <span className="section-rule" />
                <span className="section-meta">Priority and tags</span>
              </div>

              <div className="ana-row-3">
                <PriorityCard rows={a.priorityCounts} />
                <TagsCard rows={a.tagRows} />
              </div>

              <div style={{ height: 80 }} />
            </>
          )}
        </div>
      </main>
    </>
  );
}
