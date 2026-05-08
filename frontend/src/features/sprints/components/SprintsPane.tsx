import {
  Activity, Archive, Clock, LayoutGrid, PanelLeftClose, Search, Square, Zap,
} from 'lucide-react';
import type { SprintsLibrary } from '../hooks/useSprints';
import type { SprintsFilters, ViewFilter } from '../hooks/useSprintsFilters';

interface Props {
  library: SprintsLibrary;
  filters: SprintsFilters;
  setFilter: <K extends keyof SprintsFilters>(key: K, value: SprintsFilters[K]) => void;
  collapsed: boolean;
  onCollapseToggle: () => void;
}

const FILTERS: { value: ViewFilter; label: string; icon: React.ElementType }[] = [
  { value: 'all',      label: 'All',       icon: Zap        },
  { value: 'active',   label: 'Active',    icon: Activity   },
  { value: 'upcoming', label: 'Upcoming',  icon: Clock      },
  { value: 'past',     label: 'Completed', icon: Archive    },
];

const TEMPLATES = [
  { label: 'Two-week sprint', days: 14 },
  { label: 'Monthly focus',   days: 30 },
  { label: 'Quarterly push',  days: 90 },
];

export function SprintsPane({ library, filters, setFilter, collapsed, onCollapseToggle }: Props) {
  const { sprints, counts } = library;

  return (
    <aside className="pane" data-collapsed={collapsed || undefined}>
      <header className="pane-head">
        <div className="pane-eyebrow">Time-bound focus</div>
        <div className="pane-title">Sprints</div>
        <div className="pane-sub">
          {counts.active} active · {counts.upcoming} upcoming · {counts.past} completed
        </div>
      </header>

      <div className="pane-tools">
        <label className="field">
          <Search />
          <input
            placeholder="Search sprints…"
            value={filters.search}
            onChange={(e) => setFilter('search', e.target.value)}
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
          <div className="pane-section-label">Filter</div>
          {FILTERS.map(({ value, label, icon: Icon }) => {
            const active = filters.view === value;
            const count = value === 'all' ? sprints.length : counts[value as keyof typeof counts] ?? 0;
            return (
              <button
                key={value}
                className="lib-row"
                data-active={active || undefined}
                onClick={() => setFilter('view', value)}
              >
                <span className="ico"><Icon /></span>
                <span className="name">{label}</span>
                <span className="count">{count}</span>
              </button>
            );
          })}
        </div>

        <div className="pane-section">
          <div className="pane-section-label">Templates</div>
          {TEMPLATES.map((t) => (
            <button
              key={t.label}
              className="lib-row"
              onClick={() => {
                // Pre-fill new-sprint with this length on next create.
                window.dispatchEvent(
                  new CustomEvent('jarvnote:newSprintFromTemplate', { detail: t.days }),
                );
              }}
            >
              <span className="ico"><LayoutGrid /></span>
              <span className="name">{t.label}</span>
            </button>
          ))}
        </div>

        {sprints.length === 0 && (
          <div className="pane-section">
            <div style={{ padding: '8px 14px', fontSize: 'var(--text-xs)', color: 'var(--ink-4)' }}>
              No sprints yet. <Square style={{ display: 'inline', verticalAlign: -2 }} size={11} /> Click templates above or "New sprint".
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
