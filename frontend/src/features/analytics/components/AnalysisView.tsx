import { useEffect, useState } from 'react';
import {
  Loader2, Search, Calendar, BarChart3, Activity, Sparkles, MoreHorizontal,
  PanelLeftClose, PanelLeftOpen, Filter, Download, RefreshCw, ArrowDownAZ,
} from 'lucide-react';
import { Tooltip } from '../../../components/ui';
import { useAnalytics, type PeriodKey } from '../hooks/useAnalytics';
import { KPIStrip } from './KPIStrip';
import { YearHeatmap } from './YearHeatmap';
import { ActivityChart } from './ActivityChart';
import { StatusDonut } from './StatusDonut';
import { GoalProgressBoard } from './GoalProgressBoard';
import { TopStreaksCard, PriorityCard, TagsCard } from './AnalyticsCards';
import './analytics.css';

const PANE_COLLAPSED_KEY = 'jarvnote:analytics:libCollapsed';

const PERIODS: { key: PeriodKey; label: string }[] = [
  { key: '7d',   label: 'Last 7 days'   },
  { key: '30d',  label: 'Last 30 days'  },
  { key: '90d',  label: 'Last 90 days'  },
  { key: '365d', label: 'Last 365 days' },
  { key: 'all',  label: 'All time'      },
];

export default function AnalysisView() {
  const a = useAnalytics();

  const [paneCollapsed, setPaneCollapsed] = useState(
    () => localStorage.getItem(PANE_COLLAPSED_KEY) === '1',
  );
  useEffect(() => {
    localStorage.setItem(PANE_COLLAPSED_KEY, paneCollapsed ? '1' : '0');
  }, [paneCollapsed]);

  if (a.loading) {
    return (
      <main className="content">
        <div className="content-empty">
          <Loader2 size={20} className="animate-spin" />
        </div>
      </main>
    );
  }

  const periodLabel = PERIODS.find((p) => p.key === a.period)?.label ?? 'Last 30 days';

  return (
    <>
      <aside className="pane" data-collapsed={paneCollapsed || undefined}>
        <header className="pane-head">
          <div className="pane-title-block">
            <div className="pane-title">Analysis</div>
            <div className="pane-sub">{periodLabel}</div>
          </div>
          <button className="icon-btn" title="Export" aria-label="Export"><Download /></button>
        </header>

        <div className="pane-search">
          <label className="field">
            <Search />
            <input placeholder="Search insights…" />
          </label>
          <button className="collapse-btn" title="Collapse library" onClick={() => setPaneCollapsed(true)} aria-label="Collapse library">
            <PanelLeftClose />
          </button>
        </div>

        <div className="pane-body">
          <div className="lib-section">
            <div className="lib-section-label"><span>Dashboards</span></div>
            <button className="lib-row" data-active>
              <span className="ico"><BarChart3 /></span>
              <span className="name">Overview</span>
            </button>
            <button className="lib-row">
              <span className="ico"><Activity /></span>
              <span className="name">Productivity</span>
            </button>
            <button className="lib-row">
              <span className="ico"><Sparkles /></span>
              <span className="name">Habits</span>
            </button>
          </div>

          <div className="lib-section">
            <div className="lib-section-label"><span>Period</span></div>
            {PERIODS.map((p) => (
              <button
                key={p.key}
                className="lib-row"
                data-active={a.period === p.key || undefined}
                onClick={() => a.setPeriod(p.key)}
              >
                <span className="ico"><Calendar /></span>
                <span className="name">{p.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="pane-foot">
          <span style={{ flex: 1 }} />
          <button className="icon-btn" title="Filter" aria-label="Filter"><Filter /></button>
          <button className="icon-btn" title="Refresh" aria-label="Refresh" onClick={() => void a.refresh()}>
            <RefreshCw />
          </button>
          <button className="icon-btn" title="Sort" aria-label="Sort"><ArrowDownAZ /></button>
        </div>
      </aside>

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
          <div className="content-title">
            <span>Overview</span>
            <span className="content-title-meta">· {periodLabel.toLowerCase()}</span>
          </div>
          <div className="seg" role="tablist">
            {(['7d', '30d', '90d', '365d'] as PeriodKey[]).map((p) => (
              <button
                key={p}
                className={a.period === p ? 'on' : ''}
                onClick={() => a.setPeriod(p)}
                role="tab" aria-selected={a.period === p}
              >{p}</button>
            ))}
          </div>
          <button className="icon-btn" title="More" aria-label="More"><MoreHorizontal /></button>
        </div>

        <div className="content-scroll">
          <div className="an-canvas">
            <KPIStrip kpis={a.kpis} />
            <YearHeatmap grid={a.yearGrid} />
            <div className="row-2">
              <ActivityChart data={a.activity} />
              <StatusDonut slices={a.statusDonut} />
            </div>
            <GoalProgressBoard rows={a.goalProgress} />
            <div className="row-3">
              <TopStreaksCard rows={a.topStreaks} />
              <PriorityCard rows={a.priorityCounts} />
              <TagsCard rows={a.tagRows} />
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
