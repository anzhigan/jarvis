import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, MoreHorizontal, Plus, PanelLeftOpen } from 'lucide-react';
import { Tooltip } from '../../../components/ui';
import { useSprints } from '../hooks/useSprints';
import { useSprintsView } from '../hooks/useSprintsView';
import { useSprintsFilters } from '../hooks/useSprintsFilters';
import { SprintsPane } from './SprintsPane';
import { TimelineView } from './TimelineView';
import { CardsView } from './CardsView';
import { TableView } from './TableView';
import { SprintDetailPanel } from './SprintDetailPanel';
import { SprintCreateDialog } from './SprintCreateDialog';
import './sprints.css';

const PANE_COLLAPSED_KEY = 'jarvnote:sprints:libCollapsed';

export default function SprintsView() {
  const library = useSprints();
  const view    = useSprintsView();
  const f       = useSprintsFilters();

  const [paneCollapsed, setPaneCollapsed] = useState(
    () => localStorage.getItem(PANE_COLLAPSED_KEY) === '1',
  );
  useEffect(() => {
    localStorage.setItem(PANE_COLLAPSED_KEY, paneCollapsed ? '1' : '0');
  }, [paneCollapsed]);

  const filtered = useMemo(() => f.apply(library.decorated), [f, library.decorated]);

  const [detailSprintId, setDetailSprintId] = useState<string | null>(null);
  const detailSprint = useMemo(
    () => library.decorated.find((d) => d.sprint.id === detailSprintId) ?? null,
    [library.decorated, detailSprintId],
  );

  const [createOpen, setCreateOpen] = useState(false);
  const onNewSprint = useCallback(() => setCreateOpen(true), []);

  const onSelectSprint = useCallback((id: string) => setDetailSprintId(id), []);

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
      <SprintsPane
        library={library}
        filters={f.filters}
        setFilter={f.set}
        collapsed={paneCollapsed}
        onCollapseToggle={() => setPaneCollapsed(true)}
        onNewSprint={onNewSprint}
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
            <span>Sprints</span>
            <span className="content-title-meta">· {filtered.length} of {library.sprints.length}</span>
          </div>
          <div className="seg" role="tablist">
            <button
              className={view.mode === 'timeline' ? 'on' : ''}
              onClick={() => view.setMode('timeline')}
              role="tab" aria-selected={view.mode === 'timeline'}
            >Timeline</button>
            <button
              className={view.mode === 'cards' ? 'on' : ''}
              onClick={() => view.setMode('cards')}
              role="tab" aria-selected={view.mode === 'cards'}
            >Cards</button>
            <button
              className={view.mode === 'table' ? 'on' : ''}
              onClick={() => view.setMode('table')}
              role="tab" aria-selected={view.mode === 'table'}
            >Table</button>
          </div>
          <button className="new-btn" onClick={onNewSprint}>
            <Plus /> New sprint
          </button>
          <button className="icon-btn" title="More" aria-label="More"><MoreHorizontal /></button>
        </div>

        <div className="content-scroll">
          {view.mode === 'timeline' && <TimelineView rows={filtered} onSelect={onSelectSprint} />}
          {view.mode === 'cards'    && <CardsView    rows={filtered} onSelect={onSelectSprint} />}
          {view.mode === 'table'    && <TableView    rows={filtered} onSelect={onSelectSprint} />}
        </div>
      </main>

      <SprintDetailPanel
        decorated={detailSprint}
        library={library}
        open={detailSprintId !== null}
        onOpenChange={(o) => { if (!o) setDetailSprintId(null); }}
      />

      <SprintCreateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        library={library}
      />
    </>
  );
}
