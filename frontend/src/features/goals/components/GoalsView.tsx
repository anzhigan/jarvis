import { useCallback, useMemo, useState } from 'react';
import { Loader2, Plus } from 'lucide-react';
import { toast } from 'sonner';
import type { Go, Tag, Task, TaskPriority, TaskStatus } from '../../../api/types';
import { routinesApi } from '../../../api/client';
import { useGoals } from '../hooks/useGoals';
import { useGos } from '../hooks/useGos';
import { useSteps } from '../hooks/useSteps';
import { useGoalsView, type GoalsViewMode } from '../hooks/useGoalsView';
import { GoalsBoard } from './GoalsBoard';
import { GoView } from './GoView';
import { StepView } from './StepView';
import { GoalDetailPanel } from './GoalDetailPanel';
import { GoalCreateDialog } from './GoalCreateDialog';
import {
  StepCreateDialog,
  GoCreateDialog,
  RoutineCreateForGoalDialog,
} from './GoalChildDialogs';
import './goals.css';
// Reuse the heatmap + action-circle styles from the Routines view so the
// routine subcard inside a Goal looks identical (same cells, same buttons).
import '../../routines/components/routines.css';

const ymdStr = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const VIEW_LABELS: Record<GoalsViewMode, string> = {
  goals: 'Kanban',
  go:    'Go',
  step:  'Step',
};

type DayFilter = 'past' | 'today' | 'future';
const DAY_LABELS: Record<DayFilter, string> = {
  past:   'Past',
  today:  'Today',
  future: 'Future',
};

type StatusFilter = 'all' | TaskStatus;
const STATUS_FILTERS: { key: StatusFilter; label: string }[] = [
  { key: 'all',     label: 'All'      },
  { key: 'backlog', label: 'Backlog'  },
  { key: 'active',  label: 'Active'   },
  { key: 'paused',  label: 'On hold'  },
  { key: 'done',    label: 'Done'     },
];

const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export default function GoalsView() {
  const goals = useGoals();
  const gos   = useGos(goals);
  const steps = useSteps(goals);
  const view  = useGoalsView();

  // Day-bucket filter for Go mode (Past / Today / Future).
  const [dayFilter, setDayFilter] = useState<DayFilter>('today');

  // Kanban filters — status (single-select) + tags (multi-select) + priority (multi-select).
  const [statusFilter, setStatusFilter]   = useState<StatusFilter>('all');
  const [tagFilter, setTagFilter]         = useState<Set<string>>(new Set());
  const [priorityFilter, setPriorityFilter] = useState<Set<TaskPriority>>(new Set());

  const [detailGoalId, setDetailGoalId] = useState<string | null>(null);
  const detailGoal = useMemo(
    () => goals.tasks.find((t) => t.id === detailGoalId) ?? null,
    [goals.tasks, detailGoalId],
  );
  const [createOpen, setCreateOpen] = useState(false);
  const [createStatus, setCreateStatus] = useState<TaskStatus>('active');

  // Dialogs for creating step/go/routine inside an expanded goal card.
  const [stepDialogTaskId,    setStepDialogTaskId]    = useState<string | null>(null);
  const [goDialogTask,        setGoDialogTask]        = useState<{ taskId: string; sprintId: string | null } | null>(null);
  const [routineDialogTaskId, setRoutineDialogTaskId] = useState<string | null>(null);

  const onAddGoal = useCallback((status: TaskStatus) => {
    setCreateStatus(status);
    setCreateOpen(true);
  }, []);
  const onSelectGoal = useCallback((id: string) => setDetailGoalId(id), []);

  // ── Stable callbacks for the kanban + sub-views ──────────────────────────
  // Each is wrapped in useCallback so memoized children (GoalsBoard cards,
  // GoView rows, etc.) skip re-render when unrelated state changes.

  const onToggleStepDone = useCallback(
    (id: string, current: boolean) => steps.toggleStepDone(id, current),
    [steps],
  );

  const onToggleGoDone = useCallback((go: Go) => {
    const next = go.is_done_today
      ? 0
      : (go.kind === 'numeric' ? (go.target_value ?? 1) : 1);
    void gos.logToday(go.id, next);
  }, [gos]);

  const onAddStep    = useCallback((taskId: string) => setStepDialogTaskId(taskId), []);
  const onAddGo      = useCallback(
    (taskId: string, sprintId?: string | null) =>
      setGoDialogTask({ taskId, sprintId: sprintId ?? null }),
    [],
  );
  const onAddRoutine = useCallback((taskId: string) => setRoutineDialogTaskId(taskId), []);

  const onToggleRoutineDone = useCallback(async (link: import('../../../api/types').GoalRoutineLink) => {
    const today = ymdStr(new Date());
    const entry = link.routine.entries.find((x) => x.date === today);
    try {
      if ((entry?.value ?? 0) > 0) {
        await routinesApi.deleteEntry(link.routine.id, today);
      } else {
        await routinesApi.upsertEntry(link.routine.id, today, 1);
      }
      await goals.refresh();
    } catch (e: any) {
      toast.error(e?.detail ?? 'Failed to log routine');
    }
  }, [goals]);

  const onSkipRoutine = useCallback(async (link: import('../../../api/types').GoalRoutineLink) => {
    const today = ymdStr(new Date());
    try {
      await routinesApi.upsertEntry(link.routine.id, today, 0);
      await goals.refresh();
    } catch (e: any) {
      toast.error(e?.detail ?? 'Failed to skip routine');
    }
  }, [goals]);

  const onUnlinkRoutine = useCallback(async (link: import('../../../api/types').GoalRoutineLink) => {
    if (!window.confirm(`Detach "${link.routine.title}" from this goal? The routine itself stays in your list.`)) return;
    try {
      await routinesApi.deleteLink(link.id);
      await goals.refresh();
    } catch (e: any) {
      toast.error(e?.detail ?? 'Failed to detach routine');
    }
  }, [goals]);

  const onLogGo = useCallback(
    (go: Go, v: number) => { void gos.logToday(go.id, v); },
    [gos],
  );

  const onDeleteGo = useCallback(async (go: Go) => {
    if (!window.confirm(`Delete "${go.title}"? This cannot be undone.`)) return;
    await gos.deleteGo(go.id);
  }, [gos]);

  const onGoalCreated = useCallback((taskId: string, followUp: 'none' | 'step' | 'go' | 'routine') => {
    if (followUp === 'step')    setStepDialogTaskId(taskId);
    if (followUp === 'go')      setGoDialogTask({ taskId, sprintId: null });
    if (followUp === 'routine') setRoutineDialogTaskId(taskId);
  }, []);

  const closeStepDialog    = useCallback((o: boolean) => { if (!o) setStepDialogTaskId(null); }, []);
  const closeGoDialog      = useCallback((o: boolean) => { if (!o) setGoDialogTask(null); }, []);
  const closeRoutineDialog = useCallback((o: boolean) => { if (!o) setRoutineDialogTaskId(null); }, []);
  const closeDetail        = useCallback((o: boolean) => { if (!o) setDetailGoalId(null); }, []);

  const dayFilteredGos = useMemo(() => {
    if (view.mode !== 'go') return gos.gos;
    const today = ymd(new Date());
    return gos.gos.filter((g) => {
      const due = g.due_date;
      if (dayFilter === 'past')   return !!due && due < today;
      if (dayFilter === 'future') return !!due && due > today;
      return !due || due === today || g.is_done_today;
    });
  }, [gos.gos, dayFilter, view.mode]);

  // Tag pool — all tags actually present on goals (not the global tag list).
  const tagPool = useMemo<Tag[]>(() => {
    const seen = new Map<string, Tag>();
    for (const t of goals.tasks) for (const tag of t.tags) seen.set(tag.id, tag);
    return Array.from(seen.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [goals.tasks]);

  const filteredKanbanTasks = useMemo<Task[]>(() => {
    return goals.tasks.filter((t) => {
      if (statusFilter !== 'all' && t.status !== statusFilter) return false;
      if (tagFilter.size > 0) {
        const taskTagIds = new Set(t.tags.map((tag) => tag.id));
        let any = false;
        for (const id of tagFilter) if (taskTagIds.has(id)) { any = true; break; }
        if (!any) return false;
      }
      if (priorityFilter.size > 0 && !priorityFilter.has(t.priority)) return false;
      return true;
    });
  }, [goals.tasks, statusFilter, tagFilter, priorityFilter]);

  const toggleTag = (id: string) => setTagFilter((p) => {
    const n = new Set(p);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });

  const togglePriority = (p: TaskPriority) => setPriorityFilter((s) => {
    const n = new Set(s);
    if (n.has(p)) n.delete(p); else n.add(p);
    return n;
  });

  if (goals.loading || gos.loading) {
    return (
      <main className="content">
        <div className="content-empty">
          <Loader2 size={20} className="animate-spin" />
        </div>
      </main>
    );
  }

  const showSecondarySeg = view.mode === 'go';

  return (
    <>
      <main className="content">
        <div className="content-bar content-bar-centered">
          <div className="breadcrumb">
            <b>Goals</b>
            <span className="breadcrumb-sep">›</span>
            <span>{VIEW_LABELS[view.mode]}</span>
          </div>

          <div className="content-bar-mid">
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
          </div>

          <div className="content-bar-end">
            {showSecondarySeg && (
              <div className="pill-seg pill-seg-secondary" role="tablist">
                {(['past', 'today', 'future'] as DayFilter[]).map((k) => (
                  <button
                    key={k}
                    className={dayFilter === k ? 'on' : ''}
                    role="tab"
                    aria-selected={dayFilter === k}
                    onClick={() => setDayFilter(k)}
                  >{DAY_LABELS[k]}</button>
                ))}
              </div>
            )}
            <button className="new-btn" onClick={() => onAddGoal('active')}>
              <Plus /> {view.mode === 'go' ? 'Add go' : view.mode === 'step' ? 'New step' : 'New goal'}
            </button>
          </div>
        </div>

        {view.mode === 'go' ? (
          <GoView
            gos={dayFilteredGos}
            goals={goals.tasks}
            onLog={onLogGo}
            onSkip={onDeleteGo}
            onSelectGoal={onSelectGoal}
          />
        ) : view.mode === 'step' ? (
          <StepView
            steps={steps.allSteps}
            goals={goals.tasks}
            onSelect={onSelectGoal}
            onToggleDone={onToggleStepDone}
          />
        ) : (
          <div className="content-scroll" style={{ overflowX: 'auto' }}>
            {/* Filter row above kanban — single-select status + multi-select tags. */}
            <div className="kanban-filters">
              <div className="kanban-filters-group">
                <span className="kanban-filters-label">Status</span>
                {STATUS_FILTERS.map((s) => (
                  <button
                    key={s.key}
                    className="ui-chip"
                    data-active={statusFilter === s.key || undefined}
                    onClick={() => setStatusFilter(s.key)}
                    type="button"
                  >{s.label}</button>
                ))}
              </div>
              <div className="kanban-filters-group">
                <span className="kanban-filters-label">Priority</span>
                {(['high', 'medium', 'low'] as TaskPriority[]).map((p) => {
                  const on = priorityFilter.has(p);
                  return (
                    <button
                      key={p}
                      className="ui-chip"
                      data-active={on || undefined}
                      onClick={() => togglePriority(p)}
                      type="button"
                    >
                      <span
                        style={{
                          width: 8, height: 8, borderRadius: 50,
                          display: 'inline-block',
                          background: p === 'high'
                            ? 'var(--rust)'
                            : p === 'medium'
                              ? 'var(--ochre)'
                              : 'var(--ink-5)',
                        }}
                      />
                      {p[0].toUpperCase() + p.slice(1)}
                    </button>
                  );
                })}
                {priorityFilter.size > 0 && (
                  <button
                    className="ui-chip"
                    data-tone="muted"
                    onClick={() => setPriorityFilter(new Set())}
                    type="button"
                  >Clear</button>
                )}
              </div>
              {tagPool.length > 0 && (
                <div className="kanban-filters-group">
                  <span className="kanban-filters-label">Tags</span>
                  {tagPool.map((tag) => {
                    const on = tagFilter.has(tag.id);
                    return (
                      <button
                        key={tag.id}
                        className="ui-chip"
                        data-active={on || undefined}
                        onClick={() => toggleTag(tag.id)}
                        type="button"
                      >
                        <span style={{
                          width: 8, height: 8, borderRadius: 2,
                          background: tag.color, display: 'inline-block',
                        }} />
                        {tag.name}
                      </button>
                    );
                  })}
                  {tagFilter.size > 0 && (
                    <button
                      className="ui-chip"
                      data-tone="muted"
                      onClick={() => setTagFilter(new Set())}
                      type="button"
                    >Clear</button>
                  )}
                </div>
              )}
            </div>

            <GoalsBoard
              tasks={filteredKanbanTasks}
              onSelect={onSelectGoal}
              onAdd={onAddGoal}
              onMove={goals.moveStatus}
              onToggleGoDone={onToggleGoDone}
              onAddStep={onAddStep}
              onAddGo={onAddGo}
              onAddRoutine={onAddRoutine}
              onToggleRoutineDone={onToggleRoutineDone}
              onSkipRoutine={onSkipRoutine}
              onUnlinkRoutine={onUnlinkRoutine}
            />
          </div>
        )}
      </main>

      <GoalDetailPanel
        goal={detailGoal}
        library={goals}
        open={detailGoalId !== null}
        onOpenChange={closeDetail}
      />

      <GoalCreateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        library={goals}
        gos={gos}
        initialStatus={createStatus}
        onCreated={onGoalCreated}
      />

      <StepCreateDialog
        open={stepDialogTaskId !== null}
        onOpenChange={closeStepDialog}
        taskId={stepDialogTaskId}
        steps={steps}
      />

      <GoCreateDialog
        open={goDialogTask !== null}
        onOpenChange={closeGoDialog}
        taskId={goDialogTask?.taskId ?? null}
        sprintId={goDialogTask?.sprintId ?? null}
        gos={gos}
      />

      <RoutineCreateForGoalDialog
        open={routineDialogTaskId !== null}
        onOpenChange={closeRoutineDialog}
        taskId={routineDialogTaskId}
        goals={goals}
      />
    </>
  );
}
