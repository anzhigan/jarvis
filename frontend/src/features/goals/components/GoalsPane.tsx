import {
  Activity, CheckCircle2, Circle, LayoutGrid, ListTodo, ListChecks,
  PanelLeftClose, Pause, PlayCircle, Search,
} from 'lucide-react';
import type { GoalsLibrary } from '../hooks/useGoals';
import type { GoalsViewMode } from '../hooks/useGoalsView';
import type { GoalsFilters, StatusFilter } from '../hooks/useGoalsFilters';

interface Props {
  goals: GoalsLibrary;
  filters: GoalsFilters;
  setFilter: <K extends keyof GoalsFilters>(key: K, value: GoalsFilters[K]) => void;
  mode: GoalsViewMode;
  setMode: (m: GoalsViewMode) => void;
  collapsed: boolean;
  onCollapseToggle: () => void;
}

const VIEWS: { value: GoalsViewMode; label: string; icon: React.ElementType }[] = [
  { value: 'goals', label: 'Kanban',           icon: LayoutGrid },
  { value: 'go',    label: 'Go · today',       icon: ListTodo   },
  { value: 'step',  label: 'Step · milestones', icon: ListChecks },
];

const STATUSES: { value: StatusFilter; label: string; icon: React.ElementType }[] = [
  { value: 'backlog', label: 'Backlog', icon: Circle      },
  { value: 'active',  label: 'Active',  icon: PlayCircle  },
  { value: 'paused',  label: 'On hold', icon: Pause       },
  { value: 'done',    label: 'Done',    icon: CheckCircle2 },
];

export function GoalsPane({
  goals, filters, setFilter, mode, setMode, collapsed, onCollapseToggle,
}: Props) {
  const { tags, counts } = goals;
  const finishingThisMonth = goals.tasks.filter((t) => {
    if (!t.due_date || t.status === 'done') return false;
    const d = new Date(t.due_date);
    const today = new Date();
    return d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth();
  }).length;

  return (
    <aside className="pane" data-collapsed={collapsed || undefined}>
      <header className="pane-head">
        <div className="pane-eyebrow">Long-term work</div>
        <div className="pane-title">Goals</div>
        <div className="pane-sub">
          {counts.active + counts.paused + counts.backlog} open
          {finishingThisMonth > 0 ? ` · ${finishingThisMonth} finishing this month` : ''}
        </div>
      </header>

      <div className="pane-tools">
        <label className="field">
          <Search />
          <input
            placeholder="Search goals…"
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
          <div className="pane-section-label">Views</div>
          {VIEWS.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              className="lib-row"
              data-active={mode === value || undefined}
              onClick={() => setMode(value)}
            >
              <span className="ico"><Icon /></span>
              <span className="name">{label}</span>
            </button>
          ))}
        </div>

        {tags.length > 0 && (
          <div className="pane-section">
            <div className="pane-section-label">Tags</div>
            {tags.map((tag) => {
              const active = filters.tagId === tag.id;
              return (
                <button
                  key={tag.id}
                  className="lib-row"
                  data-active={active || undefined}
                  onClick={() => setFilter('tagId', active ? null : tag.id)}
                >
                  <span className="swatch" style={{ background: tag.color }} />
                  <span className="name">{tag.name}</span>
                </button>
              );
            })}
          </div>
        )}

        <div className="pane-section">
          <div className="pane-section-label">Status</div>
          {STATUSES.map(({ value, label, icon: Icon }) => {
            const active = filters.status === value;
            const count = value === 'all' ? goals.tasks.length : counts[value as keyof typeof counts] ?? 0;
            return (
              <button
                key={value}
                className="lib-row"
                data-active={active || undefined}
                onClick={() => setFilter('status', active ? 'all' : value)}
              >
                <span className="ico"><Icon /></span>
                <span className="name">{label}</span>
                <span className="count">{count}</span>
              </button>
            );
          })}
          {filters.status !== 'all' && (
            <button
              className="lib-row"
              onClick={() => setFilter('status', 'all')}
              style={{ color: 'var(--ink-4)' }}
            >
              <span className="ico"><Activity /></span>
              <span className="name">Show all</span>
            </button>
          )}
        </div>
      </div>
    </aside>
  );
}
