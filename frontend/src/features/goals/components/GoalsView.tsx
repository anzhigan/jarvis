import { useCallback, useMemo, useState } from 'react';
import { Loader2, Plus } from 'lucide-react';
import type { Tag, Task, TaskStatus } from '../../../api/types';
import { useGoals } from '../hooks/useGoals';
import { useGos } from '../hooks/useGos';
import { useSteps } from '../hooks/useSteps';
import { useGoalsView, type GoalsViewMode } from '../hooks/useGoalsView';
import { GoalsBoard } from './GoalsBoard';
import { GoView } from './GoView';
import { StepView } from './StepView';
import { GoalDetailPanel } from './GoalDetailPanel';
import { GoalCreateDialog } from './GoalCreateDialog';
import './goals.css';

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
  const gos   = useGos();
  const steps = useSteps(goals);
  const view  = useGoalsView();

  // Day-bucket filter for Go mode (Past / Today / Future).
  const [dayFilter, setDayFilter] = useState<DayFilter>('today');

  // Kanban filters — status (single-select) + tags (multi-select).
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [tagFilter, setTagFilter] = useState<Set<string>>(new Set());

  const [detailGoalId, setDetailGoalId] = useState<string | null>(null);
  const detailGoal = useMemo(
    () => goals.tasks.find((t) => t.id === detailGoalId) ?? null,
    [goals.tasks, detailGoalId],
  );
  const [createOpen, setCreateOpen] = useState(false);
  const [createStatus, setCreateStatus] = useState<TaskStatus>('active');

  const onAddGoal = useCallback((status: TaskStatus) => {
    setCreateStatus(status);
    setCreateOpen(true);
  }, []);
  const onSelectGoal = useCallback((id: string) => setDetailGoalId(id), []);

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
      return true;
    });
  }, [goals.tasks, statusFilter, tagFilter]);

  const toggleTag = (id: string) => setTagFilter((p) => {
    const n = new Set(p);
    if (n.has(id)) n.delete(id); else n.add(id);
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
            onLog={(go, v) => { void gos.logToday(go.id, v); }}
            onSkip={(go) => { void gos.logToday(go.id, 0); }}
            onSelectGoal={onSelectGoal}
          />
        ) : view.mode === 'step' ? (
          <StepView
            steps={steps.allSteps}
            goals={goals.tasks}
            onSelect={onSelectGoal}
            onToggleDone={steps.toggleStepDone}
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
            />
          </div>
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
