import {
  Plus, Search, Filter, ArrowDownAZ, LayoutGrid, Clock, Activity, Pause,
  Calendar, ChevronsRight, Repeat, PanelLeftClose,
} from 'lucide-react';
import type { RoutineScheduleType } from '../../../api/types';
import type { RoutinesLibrary } from '../hooks/useRoutines';
import type { RoutinesFilters, RoutinesViewFilter } from '../hooks/useRoutinesFilters';

interface Props {
  library: RoutinesLibrary;
  filters: RoutinesFilters;
  setFilter: <K extends keyof RoutinesFilters>(key: K, value: RoutinesFilters[K]) => void;
  pendingTodayCount: number;
  streaksCount: number;
  collapsed: boolean;
  onCollapseToggle: () => void;
  onNewRoutine: () => void;
}

const VIEWS: { key: RoutinesViewFilter; label: string; icon: React.ElementType }[] = [
  { key: 'all',       label: 'All routines',   icon: LayoutGrid },
  { key: 'due_today', label: 'Due today',      icon: Clock      },
  { key: 'streaks',   label: 'Active streaks', icon: Activity   },
  { key: 'paused',    label: 'Paused',         icon: Pause      },
];

const SCHEDULES: { key: RoutineScheduleType; label: string; icon: React.ElementType }[] = [
  { key: 'daily',           label: 'Daily',           icon: Clock         },
  { key: 'weekly_on_days',  label: 'Weekly on days',  icon: Calendar      },
  { key: 'times_per_week',  label: 'Times per week',  icon: ChevronsRight },
  { key: 'every_n_days',    label: 'Every N days',    icon: Repeat        },
];

export function RoutinesPane({
  library, filters, setFilter, pendingTodayCount, streaksCount,
  collapsed, onCollapseToggle, onNewRoutine,
}: Props) {
  const { counts, scheduleCounts } = library;

  return (
    <aside className="pane" data-collapsed={collapsed || undefined}>
      <header className="pane-head">
        <div className="pane-title-block">
          <div className="pane-title">Routines</div>
          <div className="pane-sub">{counts.all} total · {counts.active} active</div>
        </div>
        <button className="icon-btn" title="New routine" onClick={onNewRoutine} aria-label="New routine">
          <Plus />
        </button>
      </header>

      <div className="pane-search">
        <label className="field">
          <Search />
          <input
            placeholder="Search routines…"
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

        <div className="lib-section">
          <div className="lib-section-label"><span>Schedule</span></div>
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
      </div>

      <div className="pane-foot">
        <span style={{ flex: 1 }} />
        <button className="icon-btn" title="Filter" aria-label="Filter"><Filter /></button>
        <button className="icon-btn" title="Sort" aria-label="Sort"><ArrowDownAZ /></button>
      </div>
    </aside>
  );
}
