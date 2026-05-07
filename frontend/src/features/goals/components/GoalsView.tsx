import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, MoreHorizontal, Plus, X, CheckCircle2, Flag, Calendar, ArrowDownAZ } from 'lucide-react';
import { Tooltip } from '../../../components/ui';
import type { TaskStatus } from '../../../api/types';
import { useGoals } from '../hooks/useGoals';
import { useGos } from '../hooks/useGos';
import { useSteps } from '../hooks/useSteps';
import { useGoalsView } from '../hooks/useGoalsView';
import { useGoalsFilters, type SortMode } from '../hooks/useGoalsFilters';
import { GoalsPane } from './GoalsPane';
import { GoalsBoard } from './GoalsBoard';
import { GoView } from './GoView';
import { StepView } from './StepView';
import { GoalDetailPanel } from './GoalDetailPanel';
import { GoalCreateDialog } from './GoalCreateDialog';
import './goals.css';

const PANE_COLLAPSED_KEY = 'jarvnote:goals:libCollapsed';

const STATUS_CYCLE: Array<{ value: 'all' | TaskStatus; label: string }> = [
  { value: 'all',     label: 'All'     },
  { value: 'active',  label: 'Active'  },
  { value: 'backlog', label: 'Backlog' },
  { value: 'paused',  label: 'Paused'  },
  { value: 'done',    label: 'Done'    },
];

const PRIORITY_CYCLE = [
  { value: 'all' as const,    label: 'Any'    },
  { value: 'high' as const,   label: 'High'   },
  { value: 'medium' as const, label: 'Medium' },
  { value: 'low' as const,    label: 'Low'    },
];

const SORT_CYCLE: { value: SortMode; label: string }[] = [
  { value: 'manual',   label: 'Manual'   },
  { value: 'priority', label: 'Priority' },
  { value: 'due',      label: 'Due date' },
  { value: 'recent',   label: 'Recent'   },
];

function nextOf<T extends { value: string }>(list: readonly T[], current: string): T {
  const i = list.findIndex((x) => x.value === current);
  return list[(i + 1) % list.length];
}

export default function GoalsView() {
  const goals  = useGoals();
  const gos    = useGos();
  const steps  = useSteps(goals);
  const view   = useGoalsView();
  const f      = useGoalsFilters();

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

  const onSelectGoal = useCallback((id: string) => {
    setDetailGoalId(id);
  }, []);

  const onAddGo = useCallback(() => {
    const title = window.prompt('Go title')?.trim();
    if (!title) return;
    void gos.createGo({ title });
  }, [gos]);

  const onAddStep = useCallback(async () => {
    if (goals.tasks.length === 0) return;
    const title = window.prompt('Step title')?.trim();
    if (!title) return;
    const today = new Date();
    const next = new Date(today); next.setDate(next.getDate() + 14);
    await steps.createStep({
      task_id: goals.tasks[0].id,
      title,
      start_date: today.toISOString().slice(0, 10),
      end_date: next.toISOString().slice(0, 10),
    });
  }, [goals.tasks, steps]);

  // ── Toolbar handlers
  const onToggleGoDone = useCallback((go: typeof gos.gos[number]) => {
    const value = go.is_done_today ? 0 : (go.kind === 'numeric' ? (go.target_value ?? 1) : 1);
    void gos.logToday(go.id, value);
  }, [gos]);

  const onToggleStepDone = useCallback((step: typeof steps.allSteps[number]) => {
    void steps.toggleStepDone(step.id, step.is_completed);
  }, [steps]);

  if (goals.loading || gos.loading) {
    return (
      <main className="content">
        <div className="content-empty">
          <Loader2 size={20} className="animate-spin" />
        </div>
      </main>
    );
  }

  const titleByMode = view.mode === 'goals' ? 'Goals' : view.mode === 'go' ? 'Go items' : 'Steps';
  const totalByMode = view.mode === 'goals' ? filteredTasks.length
                    : view.mode === 'go'    ? gos.gos.length
                    : steps.allSteps.length;

  const activeTag = goals.tags.find((t) => t.id === f.filters.tagId);
  const statusLabel   = STATUS_CYCLE.find((x) => x.value === f.filters.status)?.label   ?? 'All';
  const priorityLabel = PRIORITY_CYCLE.find((x) => x.value === f.filters.priority)?.label ?? 'Any';
  const sortLabel     = SORT_CYCLE.find((x) => x.value === f.filters.sort)?.label       ?? 'Manual';

  return (
    <>
      <GoalsPane
        goals={goals}
        filters={f.filters}
        setFilter={f.set}
        collapsed={paneCollapsed}
        onCollapseToggle={() => setPaneCollapsed(true)}
        onNewGoal={() => onAddGoal('active')}
      />

      {paneCollapsed && (
        <Tooltip content="Show library" side="right">
          <button
            className="pane-expand-floating"
            onClick={() => setPaneCollapsed(false)}
            aria-label="Show library"
          >
            <Plus />
          </button>
        </Tooltip>
      )}

      <main className="content">
        <div className="content-bar">
          <div className="content-title">
            <span>{titleByMode}</span>
            <span className="content-title-meta">· {totalByMode} total</span>
          </div>
          <div className="seg" role="tablist">
            <button
              className={view.mode === 'goals' ? 'on' : ''}
              onClick={() => view.setMode('goals')}
              role="tab" aria-selected={view.mode === 'goals'}
            >Goals</button>
            <button
              className={view.mode === 'go' ? 'on' : ''}
              onClick={() => view.setMode('go')}
              role="tab" aria-selected={view.mode === 'go'}
            >Go</button>
            <button
              className={view.mode === 'step' ? 'on' : ''}
              onClick={() => view.setMode('step')}
              role="tab" aria-selected={view.mode === 'step'}
            >Step</button>
          </div>
          <button className="icon-btn" title="More actions" aria-label="More"><MoreHorizontal /></button>
        </div>

        <div className="content-sub">
          <button
            className="filter-chip"
            onClick={() => f.set('status', nextOf(STATUS_CYCLE, f.filters.status).value)}
            title="Click to cycle status"
          >
            <CheckCircle2 /> Status: {statusLabel}
          </button>
          {activeTag ? (
            <button
              className="filter-chip is-active"
              onClick={() => f.set('tagId', null)}
              title="Remove tag filter"
            >
              <span className="dot" style={{ background: activeTag.color }} />
              Tag: {activeTag.name}
              <X className="x" size={11} />
            </button>
          ) : (
            <span className="filter-chip" style={{ opacity: 0.6, cursor: 'default' }}>
              <span className="dot" style={{ background: 'var(--fg-faint)' }} />
              Tag: Any
            </span>
          )}
          <button
            className="filter-chip"
            onClick={() => f.set('priority', nextOf(PRIORITY_CYCLE, f.filters.priority).value)}
            title="Click to cycle priority"
          >
            <Flag /> Priority: {priorityLabel}
          </button>
          <button className="filter-chip" disabled style={{ opacity: 0.6 }}>
            <Calendar /> Due
          </button>
          <span style={{ flex: 1 }} />
          <button
            className="filter-chip"
            onClick={() => f.set('sort', nextOf(SORT_CYCLE, f.filters.sort).value)}
            title="Click to cycle sort"
          >
            <ArrowDownAZ /> Sort: {sortLabel}
          </button>
        </div>

        {view.mode === 'goals' && (
          <GoalsBoard
            tasks={filteredTasks}
            onSelect={onSelectGoal}
            onAdd={onAddGoal}
            onMove={goals.moveStatus}
          />
        )}
        {view.mode === 'go' && (
          <GoView grouped={gos.grouped} onToggleDone={onToggleGoDone} onSelect={onSelectGoal} onAdd={onAddGo} />
        )}
        {view.mode === 'step' && (
          <StepView grouped={steps.grouped} onToggleDone={onToggleStepDone} onSelect={onSelectGoal} onAdd={onAddStep} />
        )}
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
