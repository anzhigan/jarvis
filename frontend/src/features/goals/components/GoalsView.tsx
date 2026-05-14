import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Plus } from 'lucide-react';
import { toast } from 'sonner';
import type { Go, Tag, Task, TaskPriority, TaskStatus } from '../../../api/types';
import { routinesApi } from '../../../api/client';
import { useGoals } from '../hooks/useGoals';
import { useGos } from '../hooks/useGos';
import { useGoalsView, type GoalsViewMode } from '../hooks/useGoalsView';
import { GoalsBoard } from './GoalsBoard';
import { GoView } from './GoView';
import { GoalDetailPanel } from './GoalDetailPanel';
import { GoalCreateDialog } from './GoalCreateDialog';
import {
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
};

export type GoMode = 'single-goal' | 'cross-goal';
const GO_MODE_STORAGE = 'jarvnote:goals:goMode';
const readGoMode = (): GoMode => {
  const v = localStorage.getItem(GO_MODE_STORAGE);
  return v === 'cross-goal' ? 'cross-goal' : 'single-goal';
};

type StatusFilter = 'all' | TaskStatus;
const STATUS_FILTERS: { key: StatusFilter; label: string }[] = [
  { key: 'all',     label: 'All'      },
  { key: 'backlog', label: 'Backlog'  },
  { key: 'active',  label: 'Active'   },
  { key: 'paused',  label: 'On hold'  },
  { key: 'done',    label: 'Done'     },
];

export default function GoalsView() {
  const goals = useGoals();
  const gos   = useGos(goals);
  const view  = useGoalsView();

  // Single-goal ↔ Cross-goal mode for Go view (persisted in localStorage).
  const [goMode, setGoMode] = useState<GoMode>(readGoMode);
  useEffect(() => { localStorage.setItem(GO_MODE_STORAGE, goMode); }, [goMode]);

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

  // Dialogs for creating go/routine inside an expanded goal card.
  const [goDialogTaskId,      setGoDialogTaskId]      = useState<string | null>(null);
  const [routineDialogTaskId, setRoutineDialogTaskId] = useState<string | null>(null);

  const onAddGoal = useCallback((status: TaskStatus) => {
    setCreateStatus(status);
    setCreateOpen(true);
  }, []);
  const onSelectGoal = useCallback((id: string) => setDetailGoalId(id), []);

  // ── Stable callbacks for the kanban + sub-views ──────────────────────────

  const onToggleGoDone = useCallback((go: Go) => {
    const next = go.is_done_today
      ? 0
      : (go.kind === 'numeric' ? (go.target_value ?? 1) : 1);
    void gos.logToday(go.id, next);
  }, [gos]);

  const onAddGo      = useCallback((taskId: string) => setGoDialogTaskId(taskId), []);
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
    (go: Go, v: number) => { void gos.logFor(go, v); },
    [gos],
  );

  const onDeleteGo = useCallback(async (go: Go) => {
    if (!window.confirm(`Delete "${go.title}"? This cannot be undone.`)) return;
    await gos.deleteGo(go.id);
  }, [gos]);

  const onGoalCreated = useCallback((taskId: string, followUp: 'none' | 'go' | 'routine') => {
    if (followUp === 'go')      setGoDialogTaskId(taskId);
    if (followUp === 'routine') setRoutineDialogTaskId(taskId);
  }, []);

  const closeGoDialog      = useCallback((o: boolean) => { if (!o) setGoDialogTaskId(null); }, []);
  const closeRoutineDialog = useCallback((o: boolean) => { if (!o) setRoutineDialogTaskId(null); }, []);
  const closeDetail        = useCallback((o: boolean) => { if (!o) setDetailGoalId(null); }, []);

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
            </div>
          </div>

          <div className="content-bar-end">
            {showSecondarySeg && (
              <div className="pill-seg pill-seg-secondary" role="tablist" aria-label="Goal scope">
                <button
                  className={goMode === 'single-goal' ? 'on' : ''}
                  role="tab"
                  aria-selected={goMode === 'single-goal'}
                  onClick={() => setGoMode('single-goal')}
                >Single goal</button>
                <button
                  className={goMode === 'cross-goal' ? 'on' : ''}
                  role="tab"
                  aria-selected={goMode === 'cross-goal'}
                  onClick={() => setGoMode('cross-goal')}
                >Cross-goal</button>
              </div>
            )}
            <button className="new-btn" onClick={() => onAddGoal('active')}>
              <Plus /> {view.mode === 'go' ? 'Go' : 'New goal'}
            </button>
          </div>
        </div>

        {view.mode === 'go' ? (
          <GoView
            gos={gos.gos}
            goals={goals.tasks}
            mode={goMode}
            onLog={onLogGo}
            onSkip={onDeleteGo}
            onSelectGoal={onSelectGoal}
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

      <GoCreateDialog
        open={goDialogTaskId !== null}
        onOpenChange={closeGoDialog}
        taskId={goDialogTaskId}
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
