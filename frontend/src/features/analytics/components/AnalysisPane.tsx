import {
  BarChart3, FileText, LayoutGrid, PanelLeftClose, Repeat, Search, Target,
} from 'lucide-react';
import type { PeriodKey } from '../hooks/useAnalytics';

interface Props {
  period: PeriodKey;
  setPeriod: (p: PeriodKey) => void;
  search: string;
  setSearch: (s: string) => void;
  collapsed: boolean;
  onCollapseToggle: () => void;
  totals: { entries: number; goals: number; routines: number; notes: number };
}

const DASHBOARDS = [
  { key: 'overview' as const, label: 'Overview',  icon: LayoutGrid, active: true  },
  { key: 'goals'    as const, label: 'Goals',     icon: Target,     active: false },
  { key: 'routines' as const, label: 'Routines',  icon: Repeat,     active: false },
  { key: 'notes'    as const, label: 'Notes',     icon: FileText,   active: false },
];

const PERIODS: { key: PeriodKey; label: string }[] = [
  { key: '7d',   label: 'Last 7 days'   },
  { key: '30d',  label: 'Last 30 days'  },
  { key: '90d',  label: 'Last 90 days'  },
  { key: '365d', label: 'Last 365 days' },
];

/**
 * Analytics library pane — eyebrow, search, dashboard picker (Overview is the
 * canonical dashboard for now; the others surface as visible-but-inactive
 * lib rows so the user can see the planned shape) and period selector.
 */
export function AnalysisPane({
  period, setPeriod, search, setSearch, collapsed, onCollapseToggle, totals,
}: Props) {
  return (
    <aside className="pane" data-collapsed={collapsed || undefined}>
      <header className="pane-head">
        <div className="pane-eyebrow">Patterns observed</div>
        <div className="pane-title">Analysis</div>
        <div className="pane-sub">
          {totals.entries.toLocaleString()} entries · {totals.goals} goals · {totals.routines} routines
        </div>
      </header>

      <div className="pane-tools">
        <label className="field">
          <Search />
          <input
            placeholder="Search insights…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <button
          className="collapse-btn"
          title="Hide library"
          onClick={onCollapseToggle}
          aria-label="Hide library"
        >
          <PanelLeftClose />
        </button>
      </div>

      <div className="pane-body">
        <div className="pane-section">
          <div className="pane-section-label">Dashboards</div>
          {DASHBOARDS.map(({ key, label, icon: Icon, active }) => (
            <button
              key={key}
              className="lib-row"
              data-active={active || undefined}
              disabled={!active}
              title={active ? undefined : 'Per-section dashboards coming soon'}
            >
              <span className="ico"><Icon /></span>
              <span className="name">{label}</span>
            </button>
          ))}
        </div>

        <div className="pane-section">
          <div className="pane-section-label">Period</div>
          {PERIODS.map(({ key, label }) => (
            <button
              key={key}
              className="lib-row"
              data-active={period === key || undefined}
              onClick={() => setPeriod(key)}
            >
              <span className="ico"><BarChart3 /></span>
              <span className="name">{label}</span>
            </button>
          ))}
        </div>
      </div>
    </aside>
  );
}
