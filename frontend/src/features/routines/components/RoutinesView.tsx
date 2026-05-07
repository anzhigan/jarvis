import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, MoreHorizontal, Plus, PanelLeftOpen } from 'lucide-react';
import { Tooltip } from '../../../components/ui';
import type { Routine } from '../../../api/types';
import { useRoutines } from '../hooks/useRoutines';
import { useRoutinesToday } from '../hooks/useRoutinesToday';
import { useRoutinesFilters } from '../hooks/useRoutinesFilters';
import { currentStreak } from '../lib/heatmap';
import { RoutinesPane } from './RoutinesPane';
import { TodayBand } from './TodayBand';
import { RoutinesTable } from './RoutinesTable';
import { RoutineDetailPanel } from './RoutineDetailPanel';
import { RoutineCreateDialog } from './RoutineCreateDialog';
import './routines.css';

const PANE_COLLAPSED_KEY = 'jarvnote:routines:libCollapsed';
const TABLE_FILTER_KEY   = 'jarvnote:routines:tableFilter';

type TableFilter = 'all' | 'active' | 'paused';

export default function RoutinesView() {
  const library = useRoutines();
  const today   = useRoutinesToday(library);
  const f       = useRoutinesFilters();

  const [paneCollapsed, setPaneCollapsed] = useState(
    () => localStorage.getItem(PANE_COLLAPSED_KEY) === '1',
  );
  useEffect(() => {
    localStorage.setItem(PANE_COLLAPSED_KEY, paneCollapsed ? '1' : '0');
  }, [paneCollapsed]);

  const [tableFilter, setTableFilter] = useState<TableFilter>(
    () => (localStorage.getItem(TABLE_FILTER_KEY) as TableFilter) || 'all',
  );
  useEffect(() => { localStorage.setItem(TABLE_FILTER_KEY, tableFilter); }, [tableFilter]);

  const [detailRoutineId, setDetailRoutineId] = useState<string | null>(null);
  const detailRoutine = useMemo(
    () => library.routines.find((r) => r.id === detailRoutineId) ?? null,
    [library.routines, detailRoutineId],
  );

  const filtered = useMemo(() => {
    const base = f.apply(library.routines);
    if (tableFilter === 'active') return base.filter((r) => !r.is_paused);
    if (tableFilter === 'paused') return base.filter((r) =>  r.is_paused);
    return base;
  }, [library.routines, f, tableFilter]);

  const streaksCount = useMemo(
    () => library.routines.filter((r) => !r.is_paused && currentStreak(r) >= 3).length,
    [library.routines],
  );

  const onLog = useCallback((r: Routine) => { void library.toggleDoneToday(r); }, [library]);
  const onSkip = useCallback((r: Routine) => { void library.skipToday(r.id); }, [library]);

  const [createOpen, setCreateOpen] = useState(false);
  const onNewRoutine = useCallback(() => setCreateOpen(true), []);

  if (library.loading) {
    return (
      <main className="content">
        <div className="content-empty">
          <Loader2 size={20} className="animate-spin" />
        </div>
      </main>
    );
  }

  return (
    <>
      <RoutinesPane
        library={library}
        filters={f.filters}
        setFilter={f.set}
        pendingTodayCount={today.pendingCount + today.doneCount}
        streaksCount={streaksCount}
        collapsed={paneCollapsed}
        onCollapseToggle={() => setPaneCollapsed(true)}
        onNewRoutine={onNewRoutine}
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
          <div className="content-title">
            <span>Routines</span>
            <span className="content-title-meta">
              · {library.counts.all} total · {library.counts.active} active
            </span>
          </div>
          <button className="new-btn" onClick={onNewRoutine}>
            <Plus /> New routine
          </button>
          <button className="icon-btn" title="More" aria-label="More"><MoreHorizontal /></button>
        </div>

        <div className="content-scroll">
          <TodayBand today={today} onLog={onLog} onSkip={onSkip} />

          <div className="all-band-head">
            <span className="all-band-title">All routines</span>
            <span className="all-band-sub">· streaks, history, configuration</span>
            <span style={{ flex: 1 }} />
            <div className="seg" role="tablist">
              <button
                className={tableFilter === 'all' ? 'on' : ''}
                onClick={() => setTableFilter('all')}
                role="tab" aria-selected={tableFilter === 'all'}
              >All</button>
              <button
                className={tableFilter === 'active' ? 'on' : ''}
                onClick={() => setTableFilter('active')}
                role="tab" aria-selected={tableFilter === 'active'}
              >Active</button>
              <button
                className={tableFilter === 'paused' ? 'on' : ''}
                onClick={() => setTableFilter('paused')}
                role="tab" aria-selected={tableFilter === 'paused'}
              >Paused</button>
            </div>
          </div>

          <RoutinesTable
            routines={filtered}
            onSelect={(id) => setDetailRoutineId(id)}
          />
        </div>
      </main>

      <RoutineDetailPanel
        routine={detailRoutine}
        library={library}
        open={detailRoutineId !== null}
        onOpenChange={(o) => { if (!o) setDetailRoutineId(null); }}
      />

      <RoutineCreateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        library={library}
      />
    </>
  );
}
