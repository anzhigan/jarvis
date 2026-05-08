import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, PanelLeftOpen, Plus } from 'lucide-react';
import { Tooltip } from '../../../components/ui';
import type { TaskStatus } from '../../../api/types';
import { useGoals } from '../hooks/useGoals';
import { useGos } from '../hooks/useGos';
import { useSteps } from '../hooks/useSteps';
import { useGoalsView, type GoalsViewMode } from '../hooks/useGoalsView';
import { useGoalsFilters } from '../hooks/useGoalsFilters';
import { GoalsPane } from './GoalsPane';
import { GoalsBoard } from './GoalsBoard';
import { GoView } from './GoView';
import { StepView } from './StepView';
import { GoalDetailPanel } from './GoalDetailPanel';
import { GoalCreateDialog } from './GoalCreateDialog';
import './goals.css';

const PANE_COLLAPSED_KEY = 'jarvnote:goals:libCollapsed';

const VIEW_LABELS: Record<GoalsViewMode, string> = {
  goals: 'Kanban',
  go:    'Go',
  step:  'Step',
};

export default function GoalsView() {
  const goals = useGoals();
  const gos   = useGos();
  const steps = useSteps(goals);
  const view  = useGoalsView();
  const f     = useGoalsFilters();

  const [paneCollapsed, setPaneCollapsed] = useState(
    () => localStorage.getItem(PANE_COLLAPSED_KEY) === '1',
  );
  useEffect(() => {
    localStorage.setItem(PANE_COLLAPSED_KEY, paneCollapsed ? '1' : '0');
  }, [paneCollapsed]);

  const [detailGoalId, setDetailGoalId] = useState<string | null>(null);
  const detailGoal = useMemo(
    () => goals.tasks.find((t) => t.id === detailGoalId) ?? null,
    [goals.tasks, detailGoalId],
  );
  const [createOpen, setCreateOpen] = useState(false);
  const [createStatus, setCreateStatus] = useState<TaskStatus>('active');

  const filteredTasks = useMemo(() => f.apply(goals.tasks), [f, goals.tasks]);

  const onAddGoal = useCallback((status: TaskStatus) => {
    setCreateStatus(status);
    setCreateOpen(true);
  }, []);
  const onSelectGoal = useCallback((id: string) => setDetailGoalId(id), []);

  if (goals.loading || gos.loading) {
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
      <GoalsPane
        goals={goals}
        filters={f.filters}
        setFilter={f.set}
        mode={view.mode}
        setMode={view.setMode}
        collapsed={paneCollapsed}
        onCollapseToggle={() => setPaneCollapsed(true)}
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
          <div className="breadcrumb">
            <span>Goals</span>
            <span className="breadcrumb-sep">›</span>
            <b>{VIEW_LABELS[view.mode]}</b>
          </div>
          <div className="pill-seg" role="tablist">
            <button
              className={view.mode === 'goals' ? 'on' : ''}
              role="tab" aria-selected={view.mode === 'goals'}
              onClick={() => view.setMode('goals')}
            >Kanban</button>
            <button
              className={view.mode === 'go' ? 'on' : ''}
              role="tab" aria-selected={view.mode === 'go'}
              onClick={() => view.setMode('go')}
            >Go</button>
            <button
              className={view.mode === 'step' ? 'on' : ''}
              role="tab" aria-selected={view.mode === 'step'}
              onClick={() => view.setMode('step')}
            >Step</button>
          </div>
          <button className="new-btn" onClick={() => onAddGoal('active')}>
            <Plus /> New goal
          </button>
        </div>

        <div className="content-scroll" style={{ overflowX: 'auto' }}>
          {view.mode === 'goals' && (
            <GoalsBoard
              tasks={filteredTasks}
              onSelect={onSelectGoal}
              onAdd={onAddGoal}
              onMove={goals.moveStatus}
            />
          )}
          {view.mode === 'go' && (
            <GoView
              gos={gos.gos}
              goals={goals.tasks}
              onToggleDone={(go) => {
                const value = go.is_done_today ? 0 : (go.kind === 'numeric' ? (go.target_value ?? 1) : 1);
                void gos.logToday(go.id, value);
              }}
              onSkip={(go) => { void gos.logToday(go.id, 0); }}
              onSelect={onSelectGoal}
            />
          )}
          {view.mode === 'step' && (
            <StepView
              steps={steps.allSteps}
              goals={goals.tasks}
              onSelect={onSelectGoal}
            />
          )}
        </div>
      </main>

      <GoalDetailPanel
        goal={detailGoal}
        library={goals}
        open={detailGoalId !== null}
        onOpenChange={(o) => { if (!o) setDetailGoalId(null); }}
      />

      <GoalCreateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        library={goals}
        initialStatus={createStatus}
      />
    </>
  );
}
