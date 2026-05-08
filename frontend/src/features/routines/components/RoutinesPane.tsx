import {
  Calendar, ChevronsRight, Clock, LayoutGrid, PanelLeftClose, Pause, Repeat, Search,
} from 'lucide-react';
import type { RoutineScheduleType, Task } from '../../../api/types';
import type { RoutinesLibrary } from '../hooks/useRoutines';
import type { RoutinesFilters, RoutinesViewFilter } from '../hooks/useRoutinesFilters';

interface Props {
  library: RoutinesLibrary;
  filters: RoutinesFilters;
  setFilter: <K extends keyof RoutinesFilters>(key: K, value: RoutinesFilters[K]) => void;
  pendingTodayCount: number;
  streaksCount: number;
  /** Goals to show in the Linked goal section (read from useGoals on the parent). */
  linkedGoals: Task[];
  collapsed: boolean;
  onCollapseToggle: () => void;
}

const VIEWS: { key: RoutinesViewFilter; label: string; icon: React.ElementType }[] = [
  { key: 'all',       label: 'All routines',   icon: LayoutGrid },
  { key: 'due_today', label: 'Due today',      icon: Clock      },
  { key: 'streaks',   label: 'Active streaks', icon: Repeat     },
  { key: 'paused',    label: 'On hold',        icon: Pause      },
];

const SCHEDULES: { key: RoutineScheduleType; label: string; icon: React.ElementType }[] = [
  { key: 'daily',           label: 'Daily',           icon: Clock         },
  { key: 'weekly_on_days',  label: 'Weekly',          icon: Calendar      },
  { key: 'times_per_week',  label: 'Times per week',  icon: ChevronsRight },
  { key: 'every_n_days',    label: 'Every N days',    icon: Repeat        },
];

const ACCENTS = ['var(--moss)', 'var(--indigo)', 'var(--slate)', 'var(--ochre)', 'var(--rust)'] as const;
function accentFor(goalId: string): string {
  let h = 0;
  for (let i = 0; i < goalId.length; i++) h = (h * 31 + goalId.charCodeAt(i)) >>> 0;
  return ACCENTS[h % ACCENTS.length];
}

export function RoutinesPane({
  library, filters, setFilter, pendingTodayCount, streaksCount, linkedGoals,
  collapsed, onCollapseToggle,
}: Props) {
  const { counts, scheduleCounts } = library;

  // Derive a list of goals that are actually linked from any routine.
  const linkedGoalIds = new Set(library.routines.map((r) => r.goal_id).filter(Boolean) as string[]);
  const standaloneCount = library.routines.filter((r) => !r.goal_id).length;

  return (
    <aside className="pane" data-collapsed={collapsed || undefined}>
      <header className="pane-head">
        <div className="pane-eyebrow">Recurring practice</div>
        <div className="pane-title">Routines</div>
        <div className="pane-sub">{counts.all} practices · {counts.active} active</div>
      </header>

      <div className="pane-tools">
        <label className="field">
          <Search />
          <input
            placeholder="Search routines…"
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
          {VIEWS.map(({ key, label, icon: Icon }) => {
            const active = filters.view === key;
            const count = key === 'all' ? counts.all
                        : key === 'due_today' ? pendingTodayCount
                        : key === 'streaks'   ? streaksCount
                        : counts.paused;
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

        <div className="pane-section">
          <div className="pane-section-label">Schedule</div>
          {SCHEDULES.map(({ key, label, icon: Icon }) => {
            const active = filters.schedule === key;
            return (
              <button
                key={key}
                className="lib-row"
                data-active={active || undefined}
                onClick={() => setFilter('schedule', active ? null : key)}
              >
                <span className="ico"><Icon /></span>
                <span className="name">{label}</span>
                <span className="count">{scheduleCounts[key]}</span>
              </button>
            );
          })}
        </div>

        {(linkedGoalIds.size > 0 || standaloneCount > 0) && (
          <div className="pane-section">
            <div className="pane-section-label">Linked goal</div>
            {linkedGoals.filter((g) => linkedGoalIds.has(g.id)).map((g) => {
              const active = filters.goalId === g.id;
              const count = library.routines.filter((r) => r.goal_id === g.id).length;
              return (
                <button
                  key={g.id}
                  className="lib-row"
                  data-active={active || undefined}
                  onClick={() => setFilter('goalId', active ? null : g.id)}
                >
                  <span className="swatch" style={{ background: accentFor(g.id) }} />
                  <span className="name">{g.title}</span>
                  <span className="count">{count}</span>
                </button>
              );
            })}
            {standaloneCount > 0 && (
              <button className="lib-row">
                <span className="swatch" style={{ background: 'var(--ink-5)' }} />
                <span className="name">Standalone</span>
                <span className="count">{standaloneCount}</span>
              </button>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}
