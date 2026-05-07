import {
  Plus, Search, Filter, ArrowDownAZ, LayoutGrid, Activity, Clock, Archive,
  Calendar, CalendarRange, CalendarDays, PanelLeftClose,
} from 'lucide-react';
import type { SprintsLibrary } from '../hooks/useSprints';
import type { SprintsFilters, ViewFilter, TimeframeFilter } from '../hooks/useSprintsFilters';

interface Props {
  library: SprintsLibrary;
  filters: SprintsFilters;
  setFilter: <K extends keyof SprintsFilters>(key: K, value: SprintsFilters[K]) => void;
  collapsed: boolean;
  onCollapseToggle: () => void;
  onNewSprint: () => void;
}

const VIEWS: { key: ViewFilter; label: string; icon: React.ElementType }[] = [
  { key: 'all',      label: 'All sprints', icon: LayoutGrid },
  { key: 'active',   label: 'Active',      icon: Activity   },
  { key: 'upcoming', label: 'Upcoming',    icon: Clock      },
  { key: 'past',     label: 'Past',        icon: Archive    },
];

const TIMEFRAMES: { key: TimeframeFilter; label: string; icon: React.ElementType }[] = [
  { key: 'month',   label: 'This month',   icon: Calendar     },
  { key: 'quarter', label: 'This quarter', icon: CalendarRange },
  { key: 'year',    label: 'This year',    icon: CalendarDays },
];

export function SprintsPane({ library, filters, setFilter, collapsed, onCollapseToggle, onNewSprint }: Props) {
  const { sprints, counts } = library;

  return (
    <aside className="pane" data-collapsed={collapsed || undefined}>
      <header className="pane-head">
        <div className="pane-title-block">
          <div className="pane-title">Sprints</div>
          <div className="pane-sub">{counts.active} active · {counts.upcoming} upcoming</div>
        </div>
        <button className="icon-btn" title="New sprint" onClick={onNewSprint} aria-label="New sprint">
          <Plus />
        </button>
      </header>

      <div className="pane-search">
        <label className="field">
          <Search />
          <input
            placeholder="Search sprints…"
            value={filters.search}
            onChange={(e) => setFilter('search', e.target.value)}
          />
        </label>
        <button className="collapse-btn" title="Collapse library" onClick={onCollapseToggle} aria-label="Collapse library">
          <PanelLeftClose />
        </button>
      </div>

      <div className="pane-body">
        <div className="lib-section">
          <div className="lib-section-label"><span>Views</span></div>
          {VIEWS.map(({ key, label, icon: Icon }) => {
            const active = filters.view === key;
            const count = key === 'all' ? sprints.length : counts[key];
            return (
              <button
                key={key}
                className="lib-row"
                data-active={active || undefined}
                onClick={() => setFilter('view', key)}
              >
                <span className="ico"><Icon /></span>
                <span className="name">{label}</span>
                <span className="count">{count}</span>
              </button>
            );
          })}
        </div>

        <div className="lib-section">
          <div className="lib-section-label"><span>Timeframe</span></div>
          {TIMEFRAMES.map(({ key, label, icon: Icon }) => {
            const active = filters.timeframe === key;
            return (
              <button
                key={key}
                className="lib-row"
                data-active={active || undefined}
                onClick={() => setFilter('timeframe', active ? 'all' : key)}
              >
                <span className="ico"><Icon /></span>
                <span className="name">{label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="pane-foot">
        <span style={{ flex: 1 }} />
        <button className="icon-btn" title="Filter" aria-label="Filter"><Filter /></button>
        <button className="icon-btn" title="Sort" aria-label="Sort"><ArrowDownAZ /></button>
      </div>
    </aside>
  );
}
