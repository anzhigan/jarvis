import {
  Plus, Search, Filter, ArrowDownAZ, LayoutGrid, Activity, CheckCircle2, Clock, AlertTriangle,
  Flag, PanelLeftClose,
} from 'lucide-react';
import type { GoalsLibrary } from '../hooks/useGoals';
import type { GoalsFilters, StatusFilter } from '../hooks/useGoalsFilters';

interface Props {
  goals: GoalsLibrary;
  filters: GoalsFilters;
  setFilter: <K extends keyof GoalsFilters>(key: K, value: GoalsFilters[K]) => void;
  collapsed: boolean;
  onCollapseToggle: () => void;
  onNewGoal: () => void;
}

const VIEWS: { key: StatusFilter; label: string; icon: React.ElementType }[] = [
  { key: 'all',    label: 'All goals',  icon: LayoutGrid    },
  { key: 'active', label: 'Active',     icon: Activity      },
  { key: 'done',   label: 'Done',       icon: CheckCircle2  },
  { key: 'paused', label: 'Paused',     icon: Clock         },
  { key: 'backlog',label: 'Backlog',    icon: AlertTriangle },
];

export function GoalsPane({ goals, filters, setFilter, collapsed, onCollapseToggle, onNewGoal }: Props) {
  const { tasks, tags, counts, tagCounts, priorityCounts } = goals;

  return (
    <aside className="pane" data-collapsed={collapsed || undefined}>
      <header className="pane-head">
        <div className="pane-title-block">
          <div className="pane-title">Goals</div>
          <div className="pane-sub">{counts.active} active · {counts.paused} paused</div>
        </div>
        <button className="icon-btn" title="New goal" onClick={onNewGoal} aria-label="New goal">
          <Plus />
        </button>
      </header>

      <div className="pane-search">
        <label className="field">
          <Search />
          <input
            placeholder="Search in Goals…"
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
            const active = filters.status === key;
            const count = key === 'all' ? tasks.length : counts[key];
            return (
              <button
                key={key}
                className="lib-row"
                data-active={active || undefined}
                onClick={() => setFilter('status', key)}
              >
                <span className="ico"><Icon /></span>
                <span className="name">{label}</span>
                <span className="count">{count}</span>
              </button>
            );
          })}
        </div>

        {tags.length > 0 && (
          <div className="lib-section">
            <div className="lib-section-label">
              <span>Tags</span>
            </div>
            {tags.map((tag) => {
              const active = filters.tagId === tag.id;
              return (
                <button
                  key={tag.id}
                  className="lib-row"
                  data-active={active || undefined}
                  onClick={() => setFilter('tagId', active ? null : tag.id)}
                >
                  <span className="dot" style={{ background: tag.color }} />
                  <span className="name">{tag.name}</span>
                  <span className="count">{tagCounts.get(tag.id) ?? 0}</span>
                </button>
              );
            })}
          </div>
        )}

        <div className="lib-section">
          <div className="lib-section-label"><span>Priority</span></div>
          {(['high', 'medium', 'low'] as const).map((p) => {
            const active = filters.priority === p;
            const color = p === 'high' ? 'var(--danger)'
                        : p === 'medium' ? 'var(--accent-goals)'
                        : 'var(--fg-muted)';
            return (
              <button
                key={p}
                className="lib-row"
                data-active={active || undefined}
                onClick={() => setFilter('priority', active ? 'all' : p)}
              >
                <span className="ico" style={{ color }}><Flag /></span>
                <span className="name">{p[0].toUpperCase() + p.slice(1)}</span>
                <span className="count">{priorityCounts[p]}</span>
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
