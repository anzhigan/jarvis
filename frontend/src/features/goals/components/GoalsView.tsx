import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Plus, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import type { Go, Tag, Task, TaskPriority, TaskStatus } from '../../../api/types';
import { aiApi, routinesApi } from '../../../api/client';
import { confirmDialog } from '../../../components/ui';

// Lazy: only when user clicks "Plan day" — ~80kB of Radix Popover + drawer.
const ScheduleDrawer = lazy(() => import('../../ai/ScheduleDrawer').then((m) => ({ default: m.ScheduleDrawer })));
import { useGoals } from '../hooks/useGoals';
import { useGos } from '../hooks/useGos';
import { useGoalsView, type GoalsViewMode } from '../hooks/useGoalsView';
import { useRoutines } from '../../routines/hooks/useRoutines';
import { RoutineDetailPanel } from '../../routines/components/RoutineDetailPanel';
import type { Routine } from '../../../api/types';
import {
  AI_JOB_OPEN_EVENT,
  useAIJobsStore,
  type AIJobOpenDetail,
} from '../../../store/aiJobs';
import { GoalsBoard } from './GoalsBoard';
import { GoView } from './GoView';
import { GoalDetailPanel } from './GoalDetailPanel';
import { GoalCreateDialog } from './GoalCreateDialog';
import {
  GoCreateDialog,
  GoEditDialog,
  RoutineCreateForGoalDialog,
  StepCreateDialog,
  StepEditDialog,
} from './GoalChildDialogs';
import type { Step } from '../../../api/types';
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

const STATUS_FILTERS: { key: TaskStatus; label: string }[] = [
  { key: 'backlog', label: 'Backlog'  },
  { key: 'paused',  label: 'On hold'  },
  { key: 'active',  label: 'Active'   },
  { key: 'done',    label: 'Done'     },
];

export default function GoalsView() {
  const goals = useGoals();
  const gos   = useGos(goals);
  const view  = useGoalsView();
  // Routines library — used by both the kanban subcard's edit drawer and the
  // GoalRoutineLink unlink/skip handlers further down. Shares cache with
  // RoutinesView via its own internal hydration.
  const routinesLib = useRoutines();

  // Single-goal ↔ Cross-goal mode for Go view (persisted in localStorage).
  const [goMode, setGoMode] = useState<GoMode>(readGoMode);
  useEffect(() => { localStorage.setItem(GO_MODE_STORAGE, goMode); }, [goMode]);

  // AI "Plan day" — split state lets the user background the generation:
  // closing the drawer pushes the job to the global store and the app-shell
  // toast picks it up.
  const [scheduleJobId, setScheduleJobId] = useState<string | null>(null);
  const [scheduleDrawerOpen, setScheduleDrawerOpen] = useState(false);
  const addBgJob = useAIJobsStore((s) => s.add);

  const handlePlanDay = useCallback(async () => {
    // Re-clicking Plan day while one is already known:
    //  - if it's already done, open the drawer with the result.
    //  - if it's still running, do nothing — progress is in the AI tasks
    //    sidebar; no "Planning your day" loading sidebar.
    const inBg = useAIJobsStore.getState().findSame('schedule', undefined);
    if (inBg) {
      try {
        const live = await aiApi.getJob(inBg.jobId);
        if (live.status === 'done') {
          setScheduleJobId(inBg.jobId);
          setScheduleDrawerOpen(true);
        }
      } catch { /* ignore */ }
      return;
    }
    if (scheduleJobId && scheduleDrawerOpen) {
      return;
    }
    try {
      const job = await aiApi.createSchedule({
        date: '',
        hours: { start_h: 9, end_h: 18 },
        time_blocked: true,
      });
      addBgJob({
        jobId: job.id,
        kind: 'schedule',
        source: { section: 'goals' },
      });
      if (job.status === 'done') {
        setScheduleJobId(job.id);
        setScheduleDrawerOpen(true);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to start planning');
    }
  }, [scheduleJobId, scheduleDrawerOpen, addBgJob]);

  const handleScheduleClose = useCallback(() => {
    setScheduleDrawerOpen(false);
    if (scheduleJobId) {
      addBgJob({
        jobId: scheduleJobId,
        kind: 'schedule',
        source: { section: 'goals' },
      });
    }
  }, [scheduleJobId, addBgJob]);

  // Cross-section "Open →" from the global toast — when the toast reopens a
  // schedule that's already running, set local state to show its drawer here.
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<AIJobOpenDetail>).detail;
      if (detail.source.section !== 'goals' || detail.kind !== 'schedule') return;
      setScheduleJobId(detail.jobId);
      setScheduleDrawerOpen(true);
    };
    window.addEventListener(AI_JOB_OPEN_EVENT, handler);
    return () => window.removeEventListener(AI_JOB_OPEN_EVENT, handler);
  }, []);

  // Kanban filters — all multi-select. Empty set means "no filter on this axis".
  const [statusFilter, setStatusFilter]   = useState<Set<TaskStatus>>(new Set());
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
  /** Optional Step pre-fill carried with the Go-create dialog. */
  const [goDialogStepId,      setGoDialogStepId]      = useState<string | null>(null);
  const [routineDialogTaskId, setRoutineDialogTaskId] = useState<string | null>(null);

  // Standalone Go-create (header "+Go" button in Go mode — user picks goal/step inside).
  const [goCreateOpen, setGoCreateOpen] = useState(false);
  // Step-create dialog — taskId is the parent goal.
  const [stepDialogTaskId, setStepDialogTaskId] = useState<string | null>(null);
  // Edit dialogs — null means closed.
  const [editingStep,    setEditingStep]    = useState<Step | null>(null);
  const [editingGo,      setEditingGo]      = useState<Go | null>(null);
  const [editingRoutine, setEditingRoutine] = useState<Routine | null>(null);

  const onAddGoal = useCallback((status: TaskStatus) => {
    setCreateStatus(status);
    setCreateOpen(true);
  }, []);
  const onSelectGoal = useCallback((id: string) => setDetailGoalId(id), []);
  const onAddStep    = useCallback((taskId: string) => setStepDialogTaskId(taskId), []);
  const onEditStep    = useCallback((step: Step) => setEditingStep(step), []);
  const onEditGo      = useCallback((go: Go) => setEditingGo(go), []);
  const onEditRoutine = useCallback((r: Routine) => setEditingRoutine(r), []);

  // ── Stable callbacks for the kanban + sub-views ──────────────────────────

  const onToggleGoDone = useCallback((go: Go) => {
    const next = go.is_done_today
      ? 0
      : (go.kind === 'numeric' ? (go.target_value ?? 1) : 1);
    // Use logFor so the entry lands on the Go's due_date (mirrors GoView) —
    // keeps Kanban + Single/Cross-goal in sync for past/future Gos.
    void gos.logFor(go, next);
  }, [gos]);

  const onAddGo      = useCallback((taskId: string, stepId?: string | null) => {
    setGoDialogTaskId(taskId);
    setGoDialogStepId(stepId ?? null);
  }, []);
  const onAddRoutine = useCallback((taskId: string) => setRoutineDialogTaskId(taskId), []);

  const onToggleRoutineDone = useCallback(async (
    link: import('../../../api/types').GoalRoutineLink,
    date?: string,
  ) => {
    const target = date ?? ymdStr(new Date());
    const entry = link.routine.entries.find((x) => x.date === target);
    try {
      if ((entry?.value ?? 0) > 0) {
        await routinesApi.deleteEntry(link.routine.id, target);
      } else {
        await routinesApi.upsertEntry(link.routine.id, target, 1);
      }
      await goals.refresh();
    } catch (e: any) {
      toast.error(e?.detail ?? 'Failed to log routine');
    }
  }, [goals]);

  const onSkipRoutine = useCallback(async (
    link: import('../../../api/types').GoalRoutineLink,
    date?: string,
  ) => {
    const target = date ?? ymdStr(new Date());
    try {
      await routinesApi.upsertEntry(link.routine.id, target, 0);
      await goals.refresh();
    } catch (e: any) {
      toast.error(e?.detail ?? 'Failed to skip routine');
    }
  }, [goals]);

  const onUnlinkRoutine = useCallback(async (link: import('../../../api/types').GoalRoutineLink) => {
    const ok = await confirmDialog({
      title: 'Detach routine?',
      body: <>«{link.routine.title}» will be detached from this goal. The routine itself stays in your list.</>,
      confirmLabel: 'Detach',
    });
    if (!ok) return;
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
    const ok = await confirmDialog({
      title: 'Delete Go?',
      body: <>«{go.title}» This cannot be undone.</>,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    await gos.deleteGo(go.id);
  }, [gos]);

  const onGoalCreated = useCallback((taskId: string, followUp: 'none' | 'go' | 'routine') => {
    if (followUp === 'go')      setGoDialogTaskId(taskId);
    if (followUp === 'routine') setRoutineDialogTaskId(taskId);
  }, []);

  const closeGoDialog      = useCallback((o: boolean) => {
    if (!o) { setGoDialogTaskId(null); setGoDialogStepId(null); }
  }, []);
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
      if (statusFilter.size > 0 && !statusFilter.has(t.status)) return false;
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

  const toggleStatus = (s: TaskStatus) => setStatusFilter((p) => {
    const n = new Set(p);
    if (n.has(s)) n.delete(s); else n.add(s);
    return n;
  });

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
            <button
              className="ai-plan-trigger"
              onClick={handlePlanDay}
              title="Build a plan for today from your full open backlog"
            >
              <Sparkles size={13} /> Plan day
            </button>
            <button
              className="new-btn"
              onClick={() => {
                if (view.mode === 'go') setGoCreateOpen(true);
                else onAddGoal('active');
              }}
            >
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
            onAddStep={onAddStep}
            onAddGo={onAddGo}
            onEditStep={onEditStep}
            onEditGo={onEditGo}
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
                    data-active={statusFilter.has(s.key) || undefined}
                    onClick={() => toggleStatus(s.key)}
                    type="button"
                  >{s.label}</button>
                ))}
                {statusFilter.size > 0 && (
                  <button
                    className="ui-chip"
                    data-tone="muted"
                    onClick={() => setStatusFilter(new Set())}
                    type="button"
                  >Clear</button>
                )}
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
              visibleStatuses={statusFilter}
              onSelect={onSelectGoal}
              onAdd={onAddGoal}
              onMove={goals.moveStatus}
              onToggleGoDone={onToggleGoDone}
              onAddGo={onAddGo}
              onAddStep={onAddStep}
              onEditStep={onEditStep}
              onEditGo={onEditGo}
              onEditRoutine={onEditRoutine}
              onAddRoutine={onAddRoutine}
              onToggleRoutineDone={onToggleRoutineDone}
              onSkipRoutine={onSkipRoutine}
              onUnlinkRoutine={onUnlinkRoutine}
            />
          </div>
        )}
      </main>

      {/* Plan-day backdrop. Rendered for the whole life of the plan drawer
          (not just stacked) so the drawer can be kept permanently non-modal —
          flipping Radix's modal prop mid-flight re-runs overlay + focus-trap
          and visually "reopens" the panel when a stacked drawer closes. */}
      {scheduleJobId !== null && scheduleDrawerOpen && (
        <div
          className="ui-overlay"
          onClick={() => {
            // Close whatever is currently topmost: a stacked drawer first,
            // otherwise the plan itself.
            if (editingGo !== null || detailGoalId !== null) {
              setEditingGo(null);
              setDetailGoalId(null);
            } else {
              handleScheduleClose();
            }
          }}
        />
      )}

      {scheduleJobId !== null && scheduleDrawerOpen && (
        <Suspense fallback={null}>
          <ScheduleDrawer
            jobId={scheduleJobId}
            dateLabel={new Date().toLocaleDateString(undefined, {
              weekday: 'short', day: 'numeric', month: 'short',
            })}
            onClose={handleScheduleClose}
            onRegenerate={() => {
              setScheduleJobId(null);
              setScheduleDrawerOpen(false);
              setTimeout(handlePlanDay, 0);
            }}
            shifted={editingGo !== null || detailGoalId !== null}
            // Always non-modal — overlay above is rendered by GoalsView. This
            // means the modal prop never flips while open, so closing a
            // stacked drawer doesn't re-mount Radix internals (= no reopen).
            nonModal
            gos={gos.gos}
            goals={goals.tasks}
            onSlotClick={(kind, id) => {
              if (kind !== 'go') return;
              const found = gos.gos.find((g) => g.id === id);
              if (found) setEditingGo(found);
            }}
            onGoalClick={(id) => setDetailGoalId(id)}
          />
        </Suspense>
      )}

      <GoalDetailPanel
        goal={detailGoal}
        library={goals}
        open={detailGoalId !== null}
        onOpenChange={closeDetail}
        // When opened from a Plan-day Goal pill the plan stays visible — drop
        // its overlay so it isn't dimmed twice and clicks can hop between.
        nonModal={scheduleJobId !== null && scheduleDrawerOpen}
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
        initialStepId={goDialogStepId}
        gos={gos}
        goals={goals.tasks}
      />

      {/* Standalone Go-create from header "+Go" — user picks goal/step inside. */}
      <GoCreateDialog
        open={goCreateOpen}
        onOpenChange={setGoCreateOpen}
        taskId={null}
        gos={gos}
        goals={goals.tasks}
      />

      <StepCreateDialog
        open={stepDialogTaskId !== null}
        onOpenChange={(o) => { if (!o) setStepDialogTaskId(null); }}
        taskId={stepDialogTaskId}
        goals={goals.tasks}
        onCreated={goals.refresh}
      />

      <StepEditDialog
        step={editingStep}
        goals={goals.tasks}
        onOpenChange={(o) => { if (!o) setEditingStep(null); }}
        onSaved={goals.refresh}
      />

      <GoEditDialog
        go={editingGo}
        goals={goals.tasks}
        onOpenChange={(o) => { if (!o) setEditingGo(null); }}
        // When opened from a Plan-day slot the plan drawer stays visible to
        // the left — drop overlay/focus-trap so the user can still scroll it
        // or click another slot.
        nonModal={scheduleJobId !== null && scheduleDrawerOpen}
        // Refresh both: goals (per-goal go counts hydrated server-side) AND
        // gos (the dialog's `go` prop comes from this list — without refresh
        // the next-time-open shows stale data).
        onSaved={async () => { await Promise.all([goals.refresh(), gos.refresh()]); }}
      />

      {/* Right-side detail drawer for a Routine, opened from a kanban
          RoutineSubcard. Lets the user rename, change schedule, pause/resume
          or delete the underlying routine — same component used in
          RoutinesView. We refresh goals afterwards so the heatmap inside the
          subcard reflects any new entry/state. */}
      <RoutineDetailPanel
        routine={editingRoutine}
        library={routinesLib}
        open={editingRoutine !== null}
        onOpenChange={(o) => {
          if (!o) { setEditingRoutine(null); void goals.refresh(); }
        }}
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
