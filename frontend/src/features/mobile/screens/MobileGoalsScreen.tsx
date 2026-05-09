import { useCallback, useMemo, useState } from 'react';
import { Check, ChevronRight, Flag, Loader2, Minus, MoreHorizontal, Plus, Repeat, X } from 'lucide-react';
import { toast } from 'sonner';
import type { Go, GoalRoutineLink, Task, TaskPriority, TaskStatus } from '../../../api/types';
import { useGoals } from '../../goals/hooks/useGoals';
import { useGos } from '../../goals/hooks/useGos';
import { useSteps } from '../../goals/hooks/useSteps';
import { routinesApi } from '../../../api/client';
import { useRoutines } from '../../routines/hooks/useRoutines';
import { MobileTopBar } from '../components/MobileTopBar';
import { MobileShell } from '../components/MobileShell';
import { GoalForm, StepForm, GoForm, RoutineForm } from '../components/MobileAddForms';
import { SwipeableRow } from '../components/SwipeableRow';
import { MobileConfirmSheet } from '../components/MobileConfirmSheet';
import type { Tab } from '../../../app/tabs';

type ViewMode = 'kanban' | 'go' | 'step';
type DayFilter = 'past' | 'today' | 'future';
type StatusFilter = 'all' | TaskStatus;

interface Props {
  tab: Tab;
  onTabChange: (tab: Tab) => void;
  onAvatarClick: () => void;
}

const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const ACCENTS = ['var(--moss)', 'var(--indigo)', 'var(--slate)', 'var(--ochre)', 'var(--rust)'] as const;
function accentForGoal(t: Task): string {
  if (t.color) return t.color;
  let h = 0;
  for (let i = 0; i < t.id.length; i++) h = (h * 31 + t.id.charCodeAt(i)) >>> 0;
  return ACCENTS[h % ACCENTS.length];
}

function fmtDue(due: string): string {
  const d = new Date(due);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
function daysUntil(due: string): number {
  const t0 = new Date(); t0.setHours(0, 0, 0, 0);
  const d = new Date(due);
  return Math.round((d.getTime() - t0.getTime()) / 86_400_000);
}

export default function MobileGoalsScreen({ tab, onTabChange, onAvatarClick }: Props) {
  const goals = useGoals();
  const gos   = useGos(goals);
  const steps = useSteps(goals);
  const routines = useRoutines();

  const [mode, setMode] = useState<ViewMode>('kanban');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('active');
  const [dayFilter, setDayFilter] = useState<DayFilter>('today');

  // Bottom-sheet forms.
  const [goalFormOpen, setGoalFormOpen] = useState(false);
  const [stepFormOpen, setStepFormOpen] = useState<{ goalId: string | null } | null>(null);
  const [goFormOpen, setGoFormOpen] = useState<{ taskId: string | null; sprintId: string | null } | null>(null);
  const [routineFormOpen, setRoutineFormOpen] = useState<{ goalId: string | null } | null>(null);
  const [editGoal, setEditGoal] = useState<Task | null>(null);
  const [editStep, setEditStep] = useState<import('../../../api/types').Step | null>(null);
  const [editGo, setEditGo] = useState<Go | null>(null);
  // Confirm-delete sheets
  const [confirmDeleteGoal, setConfirmDeleteGoal] = useState<Task | null>(null);
  const [confirmDeleteStep, setConfirmDeleteStep] = useState<import('../../../api/types').Step | null>(null);
  const [confirmDeleteGo, setConfirmDeleteGo] = useState<Go | null>(null);

  const counts = useMemo(() => {
    const c: Record<TaskStatus, number> = { active: 0, backlog: 0, paused: 0, done: 0 };
    for (const t of goals.tasks) c[t.status] += 1;
    return c;
  }, [goals.tasks]);

  const subtitle = `${counts.active} active · ${counts.backlog} in backlog`;

  const handleAddTopBar = useCallback(() => setGoalFormOpen(true), []);

  const topBar = (
    <MobileTopBar
      title="Goals"
      subtitle={subtitle}
      onAvatarClick={onAvatarClick}
    />
  );

  if (goals.loading || gos.loading) {
    return (
      <MobileShell topBar={topBar} tab={tab} onTabChange={onTabChange}>
        <div style={{ display: 'grid', placeItems: 'center', height: '60dvh', color: 'var(--ink-4)' }}>
          <Loader2 size={22} className="animate-spin" />
        </div>
      </MobileShell>
    );
  }

  return (
    <MobileShell topBar={topBar} tab={tab} onTabChange={onTabChange}>
      <div className="goals-segmented">
        <button className="seg-btn" data-active={mode === 'kanban' || undefined} onClick={() => setMode('kanban')}>Kanban</button>
        <button className="seg-btn" data-active={mode === 'go'     || undefined} onClick={() => setMode('go')}>Go</button>
        <button className="seg-btn" data-active={mode === 'step'   || undefined} onClick={() => setMode('step')}>Step</button>
      </div>

      {mode === 'kanban' && (
        <KanbanView
          tasks={goals.tasks}
          counts={counts}
          statusFilter={statusFilter}
          onStatus={setStatusFilter}
          onAddGoal={handleAddTopBar}
          onToggleGoDone={(g) => {
            const next = g.is_done_today
              ? 0
              : (g.kind === 'numeric' ? (g.target_value ?? 1) : 1);
            void gos.logToday(g.id, next);
          }}
          onToggleStepDone={(id, cur) => steps.toggleStepDone(id, cur)}
          onAddStep={(taskId) => setStepFormOpen({ goalId: taskId })}
          onAddGo={(taskId, sprintId) => setGoFormOpen({ taskId, sprintId: sprintId ?? null })}
          onAddRoutine={(taskId) => setRoutineFormOpen({ goalId: taskId })}
          onEditGoal={(t) => setEditGoal(t)}
          onDeleteGoal={(t) => setConfirmDeleteGoal(t)}
          onEditStep={(s) => setEditStep(s)}
          onDeleteStep={(s) => setConfirmDeleteStep(s)}
          onEditGo={(g) => setEditGo(g)}
          onDeleteGo={(g) => setConfirmDeleteGo(g)}
          onToggleRoutineDone={async (link) => {
            const today = ymd(new Date());
            const entry = link.routine.entries.find((x) => x.date === today);
            try {
              if ((entry?.value ?? 0) > 0) await routinesApi.deleteEntry(link.routine.id, today);
              else                        await routinesApi.upsertEntry(link.routine.id, today, 1);
              await goals.refresh();
            } catch (e: any) { toast.error(e?.detail ?? 'Failed'); }
          }}
        />
      )}
      {mode === 'go' && (
        <GoView
          tasks={goals.tasks}
          gos={gos.gos}
          dayFilter={dayFilter}
          onDay={setDayFilter}
          onLog={(go, v) => { void gos.logToday(go.id, v); }}
          onSkip={(go) => setConfirmDeleteGo(go)}
          onAdd={() => setGoFormOpen({ taskId: null, sprintId: null })}
        />
      )}
      {mode === 'step' && (
        <StepView
          tasks={goals.tasks}
          steps={steps}
          onAdd={() => {
            const activeTasks = goals.tasks.filter((t) => t.status !== 'done');
            if (activeTasks.length === 0) { toast.error('Create a goal first'); return; }
            setStepFormOpen({ goalId: null });
          }}
        />
      )}

      <GoalForm open={goalFormOpen} onOpenChange={setGoalFormOpen} library={goals} />
      {stepFormOpen && (
        <StepForm
          open={!!stepFormOpen}
          onOpenChange={(o) => { if (!o) setStepFormOpen(null); }}
          steps={steps}
          goals={goals.tasks.filter((t) => t.status !== 'done')}
          initialGoalId={stepFormOpen.goalId}
        />
      )}
      {goFormOpen && (
        <GoForm
          open={!!goFormOpen}
          onOpenChange={(o) => { if (!o) setGoFormOpen(null); }}
          gos={gos}
          goals={goals.tasks}
          initialTaskId={goFormOpen.taskId}
          initialSprintId={goFormOpen.sprintId}
        />
      )}
      {routineFormOpen && (
        <RoutineForm
          open={!!routineFormOpen}
          onOpenChange={(o) => { if (!o) setRoutineFormOpen(null); }}
          library={routines}
          goalId={routineFormOpen.goalId}
          goalsLibrary={goals}
        />
      )}

      {/* Edit forms */}
      <GoalForm
        open={!!editGoal}
        onOpenChange={(o) => { if (!o) setEditGoal(null); }}
        library={goals}
        editing={editGoal}
      />
      <StepForm
        open={!!editStep}
        onOpenChange={(o) => { if (!o) setEditStep(null); }}
        steps={steps}
        goals={goals.tasks}
        editing={editStep}
      />
      <GoForm
        open={!!editGo}
        onOpenChange={(o) => { if (!o) setEditGo(null); }}
        gos={gos}
        goals={goals.tasks}
        editing={editGo}
      />

      {/* Confirm-delete sheets */}
      <MobileConfirmSheet
        open={!!confirmDeleteGoal}
        onOpenChange={(o) => { if (!o) setConfirmDeleteGoal(null); }}
        title={`Delete "${confirmDeleteGoal?.title ?? ''}"?`}
        description="The goal and all its steps, gos, and routine links will be removed."
        confirmLabel="Delete"
        destructive
        onConfirm={async () => { if (confirmDeleteGoal) await goals.deleteGoal(confirmDeleteGoal.id); }}
      />
      <MobileConfirmSheet
        open={!!confirmDeleteStep}
        onOpenChange={(o) => { if (!o) setConfirmDeleteStep(null); }}
        title={`Delete step "${confirmDeleteStep?.title ?? ''}"?`}
        description="Linked gos will be detached but not deleted."
        confirmLabel="Delete"
        destructive
        onConfirm={async () => { if (confirmDeleteStep) await steps.deleteStep(confirmDeleteStep.id); }}
      />
      <MobileConfirmSheet
        open={!!confirmDeleteGo}
        onOpenChange={(o) => { if (!o) setConfirmDeleteGo(null); }}
        title={`Delete "${confirmDeleteGo?.title ?? ''}"?`}
        description="The go and all its tracked entries will be removed."
        confirmLabel="Delete"
        destructive
        onConfirm={async () => { if (confirmDeleteGo) await gos.deleteGo(confirmDeleteGo.id); }}
      />
    </MobileShell>
  );
}

// ── Kanban ───────────────────────────────────────────────────────────────────

interface KanbanCallbacks {
  onToggleGoDone: (go: Go) => void;
  onToggleStepDone: (id: string, current: boolean) => void;
  onAddStep: (taskId: string) => void;
  onAddGo: (taskId: string, sprintId?: string | null) => void;
  onAddRoutine: (taskId: string) => void;
  onToggleRoutineDone: (link: GoalRoutineLink) => void;
  onEditGoal: (task: Task) => void;
  onDeleteGoal: (task: Task) => void;
  onEditStep: (step: import('../../../api/types').Step) => void;
  onDeleteStep: (step: import('../../../api/types').Step) => void;
  onEditGo: (go: Go) => void;
  onDeleteGo: (go: Go) => void;
}

function KanbanView({
  tasks, counts, statusFilter, onStatus, onAddGoal, ...cb
}: {
  tasks: Task[];
  counts: Record<TaskStatus, number>;
  statusFilter: StatusFilter;
  onStatus: (s: StatusFilter) => void;
  onAddGoal: () => void;
} & KanbanCallbacks) {
  const filtered = useMemo(() => {
    return statusFilter === 'all' ? tasks : tasks.filter((t) => t.status === statusFilter);
  }, [tasks, statusFilter]);

  return (
    <>
      <div className="status-pills">
        {([
          { k: 'active' as const,  label: `Active · ${counts.active}` },
          { k: 'backlog' as const, label: `Backlog · ${counts.backlog}` },
          { k: 'paused' as const,  label: `Paused · ${counts.paused}` },
          { k: 'done' as const,    label: `Done · ${counts.done}` },
        ]).map((p) => (
          <button
            key={p.k}
            className={`sp-pill${statusFilter === p.k ? ' sp-pill-active' : ''}`}
            onClick={() => onStatus(p.k)}
          >{p.label}</button>
        ))}
      </div>

      <button type="button" className="m-add-btn" onClick={onAddGoal}>
        <Plus /> Goal
      </button>

      {filtered.length === 0 ? (
        <EmptyHint>No goals in this column.</EmptyHint>
      ) : (
        <div className="goal-cards">
          {filtered.map((t) => (
            <SwipeableRow
              key={t.id}
              onEdit={() => cb.onEditGoal(t)}
              onDelete={() => cb.onDeleteGoal(t)}
            >
              <GoalCard task={t} cb={cb} />
            </SwipeableRow>
          ))}
        </div>
      )}
    </>
  );
}

function priorityFlagColor(p: TaskPriority): { bg: string; fg: string } {
  if (p === 'high')   return { bg: 'var(--rust-soft)',  fg: 'var(--rust)'  };
  if (p === 'medium') return { bg: 'var(--ochre-soft)', fg: 'var(--ochre)' };
  return                     { bg: 'var(--cream)',      fg: 'var(--ink-5)' };
}

function GoalCard({ task, cb }: { task: Task; cb: KanbanCallbacks }) {
  const accent = accentForGoal(task);
  const pct = Math.round(task.progress ?? 0);
  const [expanded, setExpanded] = useState(false);

  const todayItems = task.gos.filter((g) => !g.due_date || g.due_date === ymd(new Date()) || g.is_done_today);
  const todayDone  = todayItems.filter((g) => g.is_done_today).length;
  const todayClass = todayItems.length === 0 ? null
    : todayDone === todayItems.length ? 'gc-today-done'
    : todayDone === 0 ? 'gc-today-pending'
    : 'gc-today-mid';
  const todayLabel = todayItems.length === 0 ? null
    : todayDone === todayItems.length ? `${todayDone}/${todayItems.length} today`
    : todayDone === 0 ? `0/${todayItems.length} pending`
    : `${todayDone}/${todayItems.length} today`;

  const flagColors = priorityFlagColor(task.priority);
  const childCount = task.sprints.length + task.gos.filter((g) => !g.sprint_id).length + task.routines.length;

  return (
    <article className="goal-card" style={{ ['--gc' as any]: accent }}>
      <div className="gc-bar"><div className="gc-bar-fill" style={{ width: `${pct}%` }} /></div>

      <header className="gc-head" style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
        <h3 className="gc-title" style={{ flex: 1, margin: 0 }}>{task.title}</h3>
        <span
          title={`Priority: ${task.priority}`}
          aria-label={`Priority ${task.priority}`}
          style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 22, height: 22, borderRadius: 999,
            background: flagColors.bg, color: flagColors.fg, flexShrink: 0,
          }}
        >
          <Flag size={11} />
        </span>
        <button className="gc-edit" aria-label="More"><MoreHorizontal /></button>
      </header>

      {task.description && <p className="gc-desc">{task.description}</p>}

      <div className="gc-progress-row">
        <span className="gc-pct">{pct}<em>%</em></span>
        <span className="gc-progress-label">complete</span>
      </div>

      {task.tags.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 8 }}>
          {task.tags.map((tag) => (
            <span
              key={tag.id}
              style={{
                fontFamily: 'var(--font-ui)', fontSize: 10.5, fontWeight: 500,
                padding: '2px 7px', borderRadius: 999,
                color: tag.color,
                boxShadow: `inset 0 0 0 1px ${tag.color}33`,
                display: 'inline-flex', alignItems: 'center', gap: 4,
              }}
            >
              <span style={{ width: 6, height: 6, borderRadius: 2, background: tag.color }} />
              {tag.name}
            </span>
          ))}
        </div>
      )}

      <footer className="gc-foot">
        {todayLabel && (
          <span className={`gc-today ${todayClass ?? ''}`}>
            {todayClass === 'gc-today-done' && <Check size={9} />}
            {todayLabel}
          </span>
        )}
        {task.due_date ? (
          <span className="gc-due">due {fmtDue(task.due_date)} · {daysUntil(task.due_date)}d</span>
        ) : (
          <span className="gc-due gc-due-none">no deadline</span>
        )}
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          style={{
            marginLeft: 'auto',
            display: 'inline-flex', alignItems: 'center', gap: 4,
            background: 'transparent', border: 0, cursor: 'pointer',
            color: 'var(--ink-4)', fontSize: 'var(--text-2xs)',
            padding: '4px 8px', borderRadius: 6,
          }}
        >
          <ChevronRight
            size={12}
            style={{ transition: 'transform 140ms', transform: expanded ? 'rotate(90deg)' : 'none' }}
          />
          {childCount === 0 ? 'Add items' : `${childCount} ${childCount === 1 ? 'item' : 'items'}`}
        </button>
      </footer>

      {expanded && <ExpandedSection task={task} cb={cb} />}
    </article>
  );
}

function ExpandedSection({ task, cb }: { task: Task; cb: KanbanCallbacks }) {
  const standaloneGos = task.gos.filter((g) => !g.sprint_id);

  return (
    <div style={{
      marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--hairline)',
      display: 'flex', flexDirection: 'column', gap: 12,
    }}>
      {/* Steps */}
      <div>
        <div className="kc-section-label" style={{ marginBottom: 4 }}>Steps</div>
        {task.sprints.length === 0 ? (
          <div style={{ fontSize: 'var(--text-2xs)', color: 'var(--ink-5)', padding: '4px 0' }}>None yet</div>
        ) : (
          task.sprints.map((s) => {
            const stepGos = s.gos;
            return (
              <div key={s.id} style={{
                padding: 8, borderRadius: 6, background: 'var(--cream)',
                marginBottom: 6, fontSize: 'var(--text-xs)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <button
                    type="button"
                    onClick={() => cb.onToggleStepDone(s.id, s.is_completed)}
                    style={{
                      width: 14, height: 14, borderRadius: 999,
                      border: `1.5px solid ${s.is_completed ? 'var(--moss)' : 'var(--hairline-strong)'}`,
                      background: s.is_completed ? 'var(--moss)' : 'transparent',
                      color: 'var(--paper)', display: 'inline-flex',
                      alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 0,
                    }}
                  >
                    {s.is_completed && <Check size={9} />}
                  </button>
                  <span style={{ flex: 1, fontWeight: 500 }}>{s.title}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink-4)' }}>{Math.round(s.progress ?? 0)}%</span>
                </div>
                {stepGos.length > 0 && (
                  <div style={{ marginTop: 6, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {stepGos.map((g) => (
                      <GoSubrow key={g.id} go={g} onToggle={cb.onToggleGoDone} />
                    ))}
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => cb.onAddGo(task.id, s.id)}
                  style={{
                    marginTop: 6, fontSize: 'var(--text-2xs)', color: 'var(--ink-4)',
                    background: 'transparent', border: 0, cursor: 'pointer', padding: '2px 0',
                  }}
                >+ Go to step</button>
              </div>
            );
          })
        )}
        <button type="button" className="lane-add-btn" onClick={() => cb.onAddStep(task.id)}>
          <Plus size={11} /> Add step
        </button>
      </div>

      {/* Standalone Gos */}
      {(standaloneGos.length > 0 || true) && (
        <div>
          <div className="kc-section-label" style={{ marginBottom: 4 }}>Gos</div>
          {standaloneGos.length === 0 ? (
            <div style={{ fontSize: 'var(--text-2xs)', color: 'var(--ink-5)', padding: '4px 0' }}>None yet</div>
          ) : (
            standaloneGos.map((g) => (
              <div key={g.id} style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px',
                borderRadius: 6, background: 'var(--cream)', marginBottom: 4,
                fontSize: 'var(--text-xs)',
              }}>
                <GoSubrow go={g} onToggle={cb.onToggleGoDone} />
              </div>
            ))
          )}
          <button type="button" className="lane-add-btn" onClick={() => cb.onAddGo(task.id, null)}>
            <Plus size={11} /> Add go
          </button>
        </div>
      )}

      {/* Routines */}
      <div>
        <div className="kc-section-label" style={{ marginBottom: 4 }}>Routines</div>
        {task.routines.length === 0 ? (
          <div style={{ fontSize: 'var(--text-2xs)', color: 'var(--ink-5)', padding: '4px 0' }}>None linked</div>
        ) : (
          task.routines.map((link) => {
            const today = ymd(new Date());
            const e = link.routine.entries.find((x) => x.date === today);
            const done = (e?.value ?? 0) > 0;
            return (
              <div key={link.id} style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px',
                borderRadius: 6, background: 'var(--cream)', marginBottom: 4,
                fontSize: 'var(--text-xs)',
              }}>
                <button
                  type="button"
                  onClick={() => cb.onToggleRoutineDone(link)}
                  style={{
                    width: 14, height: 14, borderRadius: 999,
                    border: `1.5px solid ${done ? 'var(--moss)' : 'var(--hairline-strong)'}`,
                    background: done ? 'var(--moss)' : 'transparent',
                    color: 'var(--paper)', display: 'inline-flex',
                    alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 0,
                  }}
                >{done && <Check size={9} />}</button>
                <Repeat size={11} style={{ color: 'var(--ochre)' }} />
                <span style={{ flex: 1 }}>{link.routine.title}</span>
              </div>
            );
          })
        )}
        <button type="button" className="lane-add-btn" onClick={() => cb.onAddRoutine(task.id)}>
          <Plus size={11} /> Add routine
        </button>
      </div>
    </div>
  );
}

function GoSubrow({ go, onToggle }: { go: Go; onToggle: (g: Go) => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--text-xs)' }}>
      <button
        type="button"
        onClick={() => onToggle(go)}
        style={{
          width: 12, height: 12, borderRadius: 999,
          border: `1.5px solid ${go.is_done_today ? 'var(--moss)' : 'var(--hairline-strong)'}`,
          background: go.is_done_today ? 'var(--moss)' : 'transparent',
          color: 'var(--paper)', display: 'inline-flex',
          alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 0,
        }}
      >
        {go.is_done_today && <Check size={8} />}
      </button>
      <span style={{
        flex: 1, color: go.is_done_today ? 'var(--ink-5)' : 'var(--ink-2)',
        textDecoration: go.is_done_today ? 'line-through' : 'none',
      }}>{go.title}</span>
      {go.kind === 'numeric' && go.target_value !== null && (
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-4)' }}>
          {go.target_value}{go.unit ? ` ${go.unit}` : ''}
        </span>
      )}
    </div>
  );
}

// ── Go (today's targets) ─────────────────────────────────────────────────────

function GoView({
  tasks, gos, dayFilter, onDay, onLog, onSkip, onAdd,
}: {
  tasks: Task[];
  gos: Go[];
  dayFilter: DayFilter;
  onDay: (d: DayFilter) => void;
  onLog: (go: Go, v: number) => void;
  onSkip: (go: Go) => void | Promise<void>;
  onAdd: () => void;
}) {
  const today = ymd(new Date());
  const goalById = useMemo(() => {
    const m = new Map<string, Task>();
    for (const t of tasks) m.set(t.id, t);
    return m;
  }, [tasks]);

  const filtered = useMemo(() => {
    return gos.filter((g) => {
      const due = g.due_date;
      if (dayFilter === 'past')   return !!due && due < today;
      if (dayFilter === 'future') return !!due && due > today;
      return !due || due === today || g.is_done_today;
    });
  }, [gos, dayFilter, today]);

  const done    = filtered.filter((g) => g.is_done_today).length;
  const pending = filtered.length - done;
  const goalsAdvancing = new Set(filtered.filter((g) => g.is_done_today && g.task_id).map((g) => g.task_id!)).size;
  const totalGoals = new Set(filtered.filter((g) => g.task_id).map((g) => g.task_id!)).size;

  return (
    <>
      <div className="time-pills">
        {(['past', 'today', 'future'] as DayFilter[]).map((p) => (
          <button
            key={p}
            className={`tp-pill${dayFilter === p ? ' tp-pill-active' : ''}`}
            onClick={() => onDay(p)}
          >{p[0].toUpperCase() + p.slice(1)}</button>
        ))}
      </div>

      <button type="button" className="m-add-btn" onClick={onAdd}>
        <Plus /> Go
      </button>

      <div className="go-summary">
        <div className="gs-block">
          <div className="gs-num">{done}</div>
          <div className="gs-lab">Done</div>
        </div>
        <div className="gs-block">
          <div className="gs-num">{pending}</div>
          <div className="gs-label gs-lab">Pending</div>
        </div>
        <div className="gs-block">
          <div className="gs-num">{goalsAdvancing}<em>/{totalGoals}</em></div>
          <div className="gs-lab">Goals</div>
        </div>
      </div>

      <div className="section-bar">
        <span className="sec-title">{dayFilter === 'today' ? "Today's targets" : dayFilter === 'past' ? 'Past targets' : 'Future targets'}</span>
        <span className="sec-rule" />
        <span className="sec-meta">{filtered.length}</span>
      </div>

      {filtered.length === 0 ? (
        <EmptyHint>Nothing to log here.</EmptyHint>
      ) : (
        <div className="tg-list">
          {filtered.map((g) => (
            <TgCard
              key={g.id}
              go={g}
              parent={g.task_id ? goalById.get(g.task_id) ?? null : null}
              onLog={onLog}
              onSkip={onSkip}
            />
          ))}
        </div>
      )}
    </>
  );
}

function TgCard({
  go, parent, onLog, onSkip,
}: {
  go: Go;
  parent: Task | null;
  onLog: (go: Go, v: number) => void;
  onSkip: (go: Go) => void | Promise<void>;
}) {
  const today = ymd(new Date());
  const todayEntry = go.entries.find((e) => e.date === today);
  const value = todayEntry?.value ?? 0;
  const target = go.target_value ?? 1;
  const targetMet = go.kind === 'numeric'
    ? (go.target_value !== null && value >= go.target_value)
    : value > 0;
  const partial = !targetMet && value > 0;
  const pct = go.kind === 'numeric' && go.target_value
    ? Math.min(100, Math.round((value / go.target_value) * 100))
    : (value > 0 ? 100 : 0);
  const step = go.target_value !== null && Number.isInteger(go.target_value) ? 1 : 0.1;
  const round = (n: number) => Math.round(n * 10) / 10;

  return (
    <article
      className="tg-card"
      data-kind={go.kind}
      data-done={targetMet || undefined}
      data-partial={partial || undefined}
    >
      <header className="tg-card-head">
        <div className="tg-meta-row">
          <span className="tg-kind-pill">{go.kind}</span>
          {parent && (
            <span className="tg-goal-pill" style={{ ['--gc' as any]: accentForGoal(parent) }}>
              <span className="tg-goal-dot" />{parent.title}
            </span>
          )}
        </div>
        <button className="tg-edit" aria-label="Delete" onClick={() => void onSkip(go)}>
          <X size={13} />
        </button>
      </header>
      <h3 className="tg-title">{go.title}</h3>

      {go.kind === 'numeric' ? (
        <>
          <div className="tg-numeric-block">
            <div className="tg-num-display">
              <span className="tg-num-logged">{round(value)}</span>
              <span className="tg-num-divider">/</span>
              <span className="tg-num-target">{round(target)}</span>
              {go.unit && <span className="tg-num-unit">{go.unit}</span>}
            </div>
            <div className="tg-stepper">
              <button className="tg-step" onClick={() => onLog(go, Math.max(0, round(value - step)))} aria-label="Decrease">
                <Minus size={14} />
              </button>
              <button className="tg-step" onClick={() => onLog(go, round(value + step))} aria-label="Increase">
                <Plus size={14} />
              </button>
            </div>
          </div>
          <div className="tg-progress-row">
            <div className="tg-progress-bar"><div className="tg-progress-fill" style={{ width: `${pct}%` }} /></div>
            <span className="tg-progress-pct">{pct}%</span>
          </div>
          <footer className="tg-foot">
            <span className={`tg-status tg-status-${targetMet ? 'done' : partial ? 'partial' : 'pending'}`}>
              {targetMet ? 'Logged' : partial ? `${pct}% of target` : 'Tap to log'}
            </span>
          </footer>
        </>
      ) : (
        <div className="tg-bool-block">
          <button className={`tg-bool-btn${targetMet ? ' tg-bool-btn-done' : ''}`} onClick={() => onLog(go, targetMet ? 0 : 1)}>
            <Check size={16} />
            <span>{targetMet ? 'Done' : 'Mark as done'}</span>
          </button>
        </div>
      )}
    </article>
  );
}

// ── Step (lanes by goal) ─────────────────────────────────────────────────────

function StepView({ tasks, steps, onAdd }: {
  tasks: Task[];
  steps: ReturnType<typeof useSteps>;
  onAdd: () => void;
}) {
  const today = ymd(new Date());

  const tasksWithSteps = tasks.filter((t) => t.sprints.length > 0 && t.status !== 'done');

  // Build summary across visible goals.
  let done = 0, active = 0, atRisk = 0, upcoming = 0;
  for (const t of tasksWithSteps) {
    for (const s of t.sprints) {
      if (s.is_completed) { done++; continue; }
      if (s.start_date > today) { upcoming++; continue; }
      if (s.end_date < today) { atRisk++; continue; }
      active++;
    }
  }

  return (
    <>
      <div className="step-summary">
        <div className="ss-cell"><div className="ss-num">{done}</div>    <div className="ss-lab">Done</div></div>
        <div className="ss-cell"><div className="ss-num">{active}</div>  <div className="ss-lab">Active</div></div>
        <div className="ss-cell"><div className="ss-num">{atRisk}</div>  <div className="ss-lab">At risk</div></div>
        <div className="ss-cell"><div className="ss-num">{upcoming}</div><div className="ss-lab">Upcoming</div></div>
      </div>

      <button type="button" className="m-add-btn" onClick={onAdd}>
        <Plus /> Step
      </button>

      {tasksWithSteps.length === 0 ? (
        <EmptyHint>No steps yet. Open a goal on desktop to add steps.</EmptyHint>
      ) : (
        <div className="step-lanes">
          {tasksWithSteps.map((t) => {
            const accent = accentForGoal(t);
            return (
              <div key={t.id} className="lane" style={{ ['--gc' as any]: accent }}>
                <div className="lane-head">
                  <span className="lane-dot" />
                  <span className="lane-name">{t.title}</span>
                  <span className="lane-count">{t.sprints.length} step{t.sprints.length === 1 ? '' : 's'}</span>
                </div>
                <div className="lane-steps">
                  {t.sprints.map((s) => {
                    const pct = Math.round(s.progress ?? 0);
                    let status: 'on-track' | 'upcoming' | 'at-risk' | 'done';
                    if (s.is_completed) status = 'done';
                    else if (s.start_date > today) status = 'upcoming';
                    else if (s.end_date < today) status = 'at-risk';
                    else status = 'on-track';
                    const daysLeft = !s.is_completed && s.end_date >= today
                      ? `${daysUntil(s.end_date)}d left`
                      : null;
                    const goCount = s.gos.length;
                    const goDone  = s.gos.filter((g) => g.is_done_today).length;
                    return (
                      <article key={s.id} className="step-card" data-status={status}>
                        <header className="step-card-head">
                          <h4 className="step-card-title">{s.title}</h4>
                          <button className="step-card-edit" aria-label="More"><MoreHorizontal /></button>
                        </header>
                        <div className="step-card-meta">
                          <span className="step-period">{fmtDue(s.start_date)} – {fmtDue(s.end_date)}</span>
                          {daysLeft && <span className="step-days">{daysLeft}</span>}
                        </div>
                        <div className="step-card-prog">
                          <div className="step-card-bar"><div className="step-card-bar-fill" style={{ width: `${pct}%` }} /></div>
                          <span className="step-card-pct">{pct}%</span>
                        </div>
                        <footer className="step-card-foot">
                          <span className={`step-status step-status-${status === 'on-track' ? 'on' : status === 'upcoming' ? 'up' : status === 'at-risk' ? 'risk' : 'done'}`}>
                            {status === 'on-track' ? 'On track' : status === 'upcoming' ? 'Upcoming' : status === 'at-risk' ? 'At risk' : 'Complete'}
                          </span>
                          {goCount > 0 && <span className="step-gos">{goDone}/{goCount} Gos</span>}
                        </footer>
                      </article>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function EmptyHint({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      padding: '40px 20px', textAlign: 'center', color: 'var(--ink-4)',
      fontFamily: 'var(--font-body)', fontSize: 14, lineHeight: 1.5,
    }}>{children}</div>
  );
}
