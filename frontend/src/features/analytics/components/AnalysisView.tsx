import { useMemo } from 'react';
import { Loader2, MoreHorizontal } from 'lucide-react';
import { useAnalytics, type PeriodKey } from '../hooks/useAnalytics';
import { KpiGrid } from './KpiGrid';
import { StatusDonut } from './StatusDonut';
import {
  RoutineCompletionChart, GoalsProgressChart, TopStreaksTrending,
  PracticeActivityChart, YearHeatmapCard,
} from './AnalysisCharts';
import { InsightsCard } from './InsightsCard';
import './analytics.css';

const PERIOD_TABS: { key: PeriodKey; label: string }[] = [
  { key: '7d',   label: '7d' },
  { key: '30d',  label: '30d' },
  { key: '90d',  label: '90d' },
  { key: '365d', label: '1y' },
];

const PERIOD_BREADCRUMB: Record<PeriodKey, string> = {
  '7d':   'Last 7 days',
  '30d':  'Last 30 days',
  '90d':  'Last 90 days',
  '365d': 'Last 12 months',
  'all':  'All time',
};

function fmtMonth(): string {
  return new Date().toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

export default function AnalysisView() {
  const a = useAnalytics();

  // ── Hero copy: italic em on the most-affected metric ─────────────────────
  const heroTitle = useMemo(() => {
    const slipping = [...a.topStreaks].sort((x, y) => x.rate - y.rate)[0];
    if (slipping && slipping.rate < 50) {
      return <>A solid month, with one <em className="warn">fading</em> habit.</>;
    }
    if (a.topStreaks.length > 0 && a.topStreaks[0].streak >= 7) {
      return <>A clean month, with steady <em>streaks</em>.</>;
    }
    return <>A <em>quiet</em> month so far.</>;
  }, [a.topStreaks]);

  const heroLede = useMemo(() => {
    const goalsAdvancing = a.goalProgress.filter((g) => g.task.status === 'active' && g.pct > 0).length;
    const longest = a.topStreaks[0]?.streak ?? 0;
    const slipping = [...a.topStreaks].filter((x) => x.rate < 50).length;
    const parts: string[] = [];
    if (longest > 0) parts.push(`Best streak ${longest} ${longest === 1 ? 'day' : 'days'}.`);
    if (goalsAdvancing > 0) {
      parts.push(`${goalsAdvancing} ${goalsAdvancing === 1 ? 'goal' : 'goals'} projected to finish on time.`);
    }
    if (slipping > 0) {
      parts.push(`${slipping} routine${slipping === 1 ? '' : 's'} slipping — handle before it becomes a pattern.`);
    }
    return parts.length > 0
      ? parts.join(' ')
      : 'Log routines and complete goals to surface insights here.';
  }, [a.goalProgress, a.topStreaks]);

  // ── KPI trends — naive month-over-month fallback (current vs hook foot) ──
  const kpiTrends = useMemo(() => ({
    today_rate: { label: 'avg this period', dir: 'neutral' as const },
    streaks:    { label: a.topStreaks.length > 0 && a.topStreaks[0].streak >= 7 ? 'Personal best' : 'in flight', dir: 'up' as const },
    goals_done: { label: 'in this period', dir: 'neutral' as const },
    routines_logged: { label: 'check-ins logged', dir: 'neutral' as const },
  }), [a.topStreaks]);

  // ── Heatmap totals (entries-with-value) ──────────────────────────────────
  const heatmapEntries = useMemo(() => {
    let total = 0;
    for (const r of a.routines) for (const e of r.entries) if (e.value > 0) total++;
    for (const t of a.tasks) if (t.status === 'done') total++;
    return total;
  }, [a.routines, a.tasks]);

  const activeRoutineCount = useMemo(
    () => a.routines.filter((r) => !r.is_paused).length,
    [a.routines],
  );

  if (a.loading) {
    return (
      <main className="content">
        <div className="content-empty">
          <Loader2 size={20} className="animate-spin" />
        </div>
      </main>
    );
  }

  const hasAnyData = a.routines.length > 0 || a.tasks.length > 0 || heatmapEntries > 0;

  return (
    <>
      <main className="content">
        <div className="content-bar">
          <div className="breadcrumb">
            <b>Analysis</b>
            <span className="breadcrumb-sep">›</span>
            <span>{PERIOD_BREADCRUMB[a.period]}</span>
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
            title="More"
            aria-label="More"
            onClick={() => { void a.refresh(); }}
          >
            <MoreHorizontal />
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
              {/* Row 1 — Hero + KPI 2×2 */}
              <section className="ana-row ana-row-hero">
                <div className="ana-hero-block">
                  <div className="go-eyebrow">{fmtMonth()}, in figures</div>
                  <h1 className="ana-hero-title">{heroTitle}</h1>
                  <p className="ana-hero-lede">{heroLede}</p>
                </div>
                <KpiGrid kpis={a.kpis} trends={kpiTrends} />
              </section>

              {/* Row 1.5 — AI narrative review for the current period */}
              <InsightsCard period={a.period} />

              {/* Row 2 — Routine completion line + Goals progress bars */}
              <section className="ana-row ana-row-charts-1">
                <RoutineCompletionChart
                  activity={a.activity}
                  activeRoutineCount={activeRoutineCount}
                />
                <GoalsProgressChart rows={a.goalProgress} />
              </section>

              {/* Row 3 — Donut · Top streaks · Practice activity */}
              <section className="ana-row ana-row-charts-2">
                <StatusDonut routines={a.routines} />
                <TopStreaksTrending rows={a.topStreaks} routines={a.routines} />
                <PracticeActivityChart activity={a.activity} tagRows={a.tagRows} />
              </section>

              {/* Row 4 — Year heatmap full width */}
              <section className="ana-row">
                <YearHeatmapCard grid={a.yearGrid} totalEntries={heatmapEntries} />
              </section>

              <div style={{ height: 40 }} />
            </>
          )}
        </div>
      </main>
    </>
  );
}
