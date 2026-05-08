import { useCallback, useMemo, useState } from 'react';
import { Loader2, Plus } from 'lucide-react';
import type { TaskStatus } from '../../../api/types';
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

const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export default function GoalsView() {
  const goals = useGoals();
  const gos   = useGos();
  const steps = useSteps(goals);
  const view  = useGoalsView();

  // Day-bucket filter for Go mode (Past / Today / Future). Maps directly onto
  // bucketOfGo categories so it's a stateless transform on goals.tasks.
  const [dayFilter, setDayFilter] = useState<DayFilter>('today');

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

  // ── Day-filtered gos list for Go mode. Past = overdue, Today = today/upcoming-today,
  //    Future = upcoming with due-date strictly later than today. Done items always show.
  const dayFilteredGos = useMemo(() => {
    if (view.mode !== 'go') return gos.gos;
    const today = ymd(new Date());
    return gos.gos.filter((g) => {
      const due = g.due_date;
      if (dayFilter === 'past')   return !!due && due < today;
      if (dayFilter === 'future') return !!due && due > today;
      // today: items due today, items with no due date, or items already done today
      return !due || due === today || g.is_done_today;
    });
  }, [gos.gos, dayFilter, view.mode]);

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
      <main className="content">
        <div className="content-bar">
          <div className="breadcrumb">
            <b>Goals</b>
            <span className="breadcrumb-sep">›</span>
            <span>{VIEW_LABELS[view.mode]}</span>
          </div>

          {view.mode === 'go' && (
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
            <Plus /> {view.mode === 'go' ? 'Add target' : view.mode === 'step' ? 'New step' : 'New goal'}
          </button>
        </div>

        {view.mode === 'go' ? (
          // Go v6 owns the whole content area below the bar — its left/right
          // panes scroll independently, so we skip the outer .content-scroll.
          <GoView
            gos={dayFilteredGos}
            goals={goals.tasks}
            onLog={(go, v) => { void gos.logToday(go.id, v); }}
            onSkip={(go) => { void gos.logToday(go.id, 0); }}
            onSelectGoal={onSelectGoal}
          />
        ) : view.mode === 'step' ? (
          // Step v2 Gantt owns the whole area too — gantt-body and dp-scroll
          // each manage their own vertical scroll.
          <StepView
            steps={steps.allSteps}
            goals={goals.tasks}
            onSelect={onSelectGoal}
            onToggleDone={steps.toggleStepDone}
          />
        ) : (
          <div className="content-scroll" style={{ overflowX: 'auto' }}>
            <GoalsBoard
              tasks={goals.tasks}
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
