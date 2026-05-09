import { useCallback, useMemo, useState } from 'react';
import { Check, ChevronRight, Flag, Layers, Loader2, Minus, Plus } from 'lucide-react';
import { MiniGoContent, MiniStepContent } from '../components/MiniCards';
import { toast } from 'sonner';
import type { Go, GoalRoutineLink, Task, TaskPriority, TaskStatus } from '../../../api/types';
import { useGoals } from '../../goals/hooks/useGoals';
import { useGos } from '../../goals/hooks/useGos';
import { useSteps } from '../../goals/hooks/useSteps';
import { gosApi, routinesApi, stepsApi } from '../../../api/client';
import { useRoutines } from '../../routines/hooks/useRoutines';
import { MobileTopBar } from '../components/MobileTopBar';
import { MobileShell } from '../components/MobileShell';
import { GoalForm, StepForm, GoForm, RoutineForm } from '../components/MobileAddForms';
import { SwipeableRow } from '../components/SwipeableRow';
import { MobileConfirmSheet } from '../components/MobileConfirmSheet';
import { MobilePickerSheet } from '../components/MobilePickerSheet';
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
  // Pickers — let the user pick existing entities first, with a "Create new"
  // CTA inside the picker that defers to the create form when needed.
  const [pickStepFor, setPickStepFor] = useState<string | null>(null); // goalId
  const [pickGoFor, setPickGoFor] = useState<{ taskId: string; sprintId: string | null } | null>(null);

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
          onAddStep={(taskId) => setPickStepFor(taskId)}
          onAddGo={(taskId, sprintId) => setPickGoFor({ taskId, sprintId: sprintId ?? null })}
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
          onEdit={(go) => setEditGo(go)}
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
          onEdit={(s) => setEditStep(s)}
          onDelete={(s) => setConfirmDeleteStep(s)}
          onToggleGoDone={(g) => {
            const next = g.is_done_today ? 0 : (g.kind === 'numeric' ? (g.target_value ?? 1) : 1);
            void gos.logToday(g.id, next);
          }}
        />
      )}

      <GoalForm open={goalFormOpen} onOpenChange={setGoalFormOpen} library={goals} gos={gos} stepsLib={steps} />
      {stepFormOpen && (
        <StepForm
          open={!!stepFormOpen}
          onOpenChange={(o) => { if (!o) setStepFormOpen(null); }}
          steps={steps}
          goals={goals.tasks.filter((t) => t.status !== 'done')}
          gos={gos}
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
        gos={gos}
        stepsLib={steps}
        editing={editGoal}
      />
      <StepForm
        open={!!editStep}
        onOpenChange={(o) => { if (!o) setEditStep(null); }}
        steps={steps}
        goals={goals.tasks}
        gos={gos}
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

      {/* Add-step picker — pick from existing steps not already in this goal,
          or "Create new step" CTA opens the StepForm. */}
      {pickStepFor !== null && (
        <MobilePickerSheet
          open={!!pickStepFor}
          onOpenChange={(o) => { if (!o) setPickStepFor(null); }}
          title="Add step"
          entity="Step"
          items={steps.allSteps.filter((s) => s.task_id !== pickStepFor)}
          onConfirm={async (selected) => {
            const goalId = pickStepFor;
            if (!goalId || selected.size === 0) return;
            try {
              await Promise.all([...selected].map((id) => stepsApi.update(id, { task_id: goalId })));
              await goals.refresh();
            } catch (e: any) { toast.error(e?.detail ?? 'Failed to attach step'); }
          }}
          onCreate={() => setStepFormOpen({ goalId: pickStepFor })}
          matches={(s, q) => s.title.toLowerCase().includes(q) || (s.goal?.title?.toLowerCase().includes(q) ?? false)}
          render={(s) => (
            <>
              <div style={{ fontWeight: 500 }}>{s.title}</div>
              <div style={{ fontSize: 11, color: 'var(--ink-4)', marginTop: 2 }}>from {s.goal.title}</div>
            </>
          )}
        />
      )}

      {/* Add-go picker — pick existing gos to attach to a goal (or to a step). */}
      {pickGoFor !== null && (
        <MobilePickerSheet
          open={!!pickGoFor}
          onOpenChange={(o) => { if (!o) setPickGoFor(null); }}
          title={pickGoFor.sprintId ? 'Add go to step' : 'Add go to goal'}
          entity="Go"
          items={gos.gos.filter((g) => {
            // Exclude gos already in this exact slot (goal-level if no sprintId,
            // step-level otherwise).
            if (pickGoFor!.sprintId) return g.sprint_id !== pickGoFor!.sprintId;
            return !(g.task_id === pickGoFor!.taskId && !g.sprint_id);
          })}
          onConfirm={async (selected) => {
            const target = pickGoFor;
            if (!target || selected.size === 0) return;
            try {
              await Promise.all([...selected].map((id) => gosApi.update(id, {
                task_id: target.taskId,
                sprint_id: target.sprintId,
              })));
              await Promise.all([gos.refresh(), goals.refresh()]);
              setPickGoFor(null);
            } catch (e: any) { toast.error(e?.detail ?? 'Failed to attach go'); }
          }}
          onCreate={() => setGoFormOpen({ taskId: pickGoFor!.taskId, sprintId: pickGoFor!.sprintId })}
          matches={(g, q) => g.title.toLowerCase().includes(q)}
          render={(g) => g.title}
        />
      )}
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
  const [priorityFilter, setPriorityFilter] = useState<Set<TaskPriority>>(new Set());
  const [tagFilter, setTagFilter] = useState<Set<string>>(new Set());

  // Collect unique tags across all goals (for the filter row).
  const allTags = useMemo(() => {
    const m = new Map<string, { id: string; name: string; color: string }>();
    for (const t of tasks) for (const tg of t.tags) m.set(tg.id, tg);
    return [...m.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [tasks]);

  const togglePriority = (p: TaskPriority) => setPriorityFilter((cur) => {
    const next = new Set(cur);
    if (next.has(p)) next.delete(p); else next.add(p);
    return next;
  });
  const toggleTag = (id: string) => setTagFilter((cur) => {
    const next = new Set(cur);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const filtered = useMemo(() => {
    return tasks.filter((t) => {
      if (statusFilter !== 'all' && t.status !== statusFilter) return false;
      if (priorityFilter.size > 0 && !priorityFilter.has(t.priority)) return false;
      if (tagFilter.size > 0 && !t.tags.some((tg) => tagFilter.has(tg.id))) return false;
      return true;
    });
  }, [tasks, statusFilter, priorityFilter, tagFilter]);

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

      {/* Priority filter — multi-select; empty = all priorities. */}
      <div className="filter-row">
        <span className="filter-row-label">Priority</span>
        <div className="filter-pills">
          {(['high', 'medium', 'low'] as TaskPriority[]).map((p) => {
            const active = priorityFilter.has(p);
            const palette = priorityFlagColor(p);
            return (
              <button
                key={p}
                type="button"
                className={`fp-pill${active ? ' fp-pill-active' : ''}`}
                onClick={() => togglePriority(p)}
                style={active ? { background: palette.bg, color: palette.fg, borderColor: palette.fg } : undefined}
              >
                <Flag size={10} />
                {p[0].toUpperCase() + p.slice(1)}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tag filter — only shown when there is at least one tag in the goals. */}
      {allTags.length > 0 && (
        <div className="filter-row">
          <span className="filter-row-label">Tags</span>
          <div className="filter-pills filter-pills-scroll">
            {allTags.map((tg) => {
              const active = tagFilter.has(tg.id);
              return (
                <button
                  key={tg.id}
                  type="button"
                  className={`fp-pill${active ? ' fp-pill-active' : ''}`}
                  onClick={() => toggleTag(tg.id)}
                  style={active
                    ? { background: `${tg.color}20`, color: tg.color, borderColor: tg.color }
                    : undefined}
                >
                  <span style={{ width: 7, height: 7, borderRadius: 2, background: tg.color }} />
                  {tg.name}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <button type="button" className="m-add-btn" onClick={onAddGoal}>
        <Plus /> Goal
      </button>

      {filtered.length === 0 ? (
        <EmptyHint>
          {priorityFilter.size > 0 || tagFilter.size > 0
            ? 'No goals match the active filters.'
            : 'No goals in this column.'}
        </EmptyHint>
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
  // Routines no longer counted — they have their own dedicated screen.
  const childCount = task.sprints.length + task.gos.filter((g) => !g.sprint_id).length;

  return (
    <article className="goal-card" style={{ ['--gc' as any]: accent }}>
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
      </header>

      {task.description && <p className="gc-desc">{task.description}</p>}

      {/* Progress as a single horizontal bar — no separate "0% complete" text. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '12px 0 4px' }}>
        <div style={{
          flex: 1, height: 6,
          background: 'var(--cream)', borderRadius: 999, overflow: 'hidden',
        }}>
          <div style={{
            height: '100%',
            width: `${pct}%`,
            background: 'var(--indigo)',
            transition: 'width 220ms ease',
          }} />
        </div>
        <span style={{
          fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 500,
          color: 'var(--ink)', flexShrink: 0,
        }}>{pct}%</span>
      </div>

      {task.tags.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
          {task.tags.map((tag) => (
            <span
              key={tag.id}
              style={{
                fontFamily: 'var(--font-ui)', fontSize: 13, fontWeight: 500,
                padding: '5px 12px', borderRadius: 999,
                color: tag.color,
                background: `${tag.color}14`,
                boxShadow: `inset 0 0 0 1px ${tag.color}40`,
                display: 'inline-flex', alignItems: 'center', gap: 6,
              }}
            >
              <span style={{ width: 8, height: 8, borderRadius: 2, background: tag.color }} />
              {tag.name}
            </span>
          ))}
        </div>
      )}

      <div className="gc-stats">
        <div className={`gc-stat ${todayClass ?? ''}`}>
          <div className="gc-stat-lab">Today</div>
          <div className="gc-stat-val">
            {todayLabel ? (
              <>
                {todayClass === 'gc-today-done' && <Check size={14} />}
                {todayLabel}
              </>
            ) : (
              <span className="gc-stat-empty">—</span>
            )}
          </div>
        </div>
        <div className={`gc-stat ${task.due_date ? '' : 'gc-stat-empty-row'}`}>
          <div className="gc-stat-lab">Deadline</div>
          <div className="gc-stat-val">
            {task.due_date ? (
              <>
                {fmtDue(task.due_date)}
                <span className="gc-stat-sub">{daysUntil(task.due_date)}d</span>
              </>
            ) : (
              <span className="gc-stat-empty">No deadline</span>
            )}
          </div>
        </div>
      </div>

      {/* Big centered "items" toggle button at the bottom of the card. */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        style={{
          marginTop: 12,
          width: '100%',
          height: 44,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          background: 'transparent',
          border: '1px dashed var(--hairline-strong)',
          borderRadius: 10,
          color: 'var(--ink-3)',
          fontFamily: 'var(--font-ui)',
          fontSize: 14,
          fontWeight: 500,
          cursor: 'pointer',
          transition: 'border-color 140ms, color 140ms, background 140ms',
        }}
      >
        <ChevronRight
          size={14}
          style={{ transition: 'transform 140ms', transform: expanded ? 'rotate(90deg)' : 'none' }}
        />
        {childCount === 0
          ? 'Add items'
          : (expanded ? `Hide ${childCount} item${childCount === 1 ? '' : 's'}` : `Show ${childCount} item${childCount === 1 ? '' : 's'}`)}
      </button>

      {expanded && <ExpandedSection task={task} cb={cb} />}
    </article>
  );
}

function ExpandedSection({ task, cb }: { task: Task; cb: KanbanCallbacks }) {
  // Steps appear first as their own mini-cards (with their own go-children
  // toggle); Gos directly attached to the goal (no step parent) appear as
  // mini go-cards on equal footing — same nesting rule as Sprint items list.
  const standaloneGos = task.gos.filter((g) => !g.sprint_id);

  return (
    <div className="m-gc-expanded">
      {task.sprints.map((step) => (
        <NestedStepInGoal
          key={step.id}
          step={step}
          onToggleGoDone={cb.onToggleGoDone}
          onAddGoToStep={() => cb.onAddGo(task.id, step.id)}
        />
      ))}

      {standaloneGos.map((g) => (
        <article key={g.id} className="m-mc m-mc-go" data-done={g.is_done_today || undefined}>
          <span className="m-mc-kind">Go</span>
          <MiniGoContent go={g} onLog={() => cb.onToggleGoDone(g)} />
        </article>
      ))}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="button" className="lane-add-btn" onClick={() => cb.onAddStep(task.id)}>
          <Plus size={11} /> Add step
        </button>
        <button type="button" className="lane-add-btn" onClick={() => cb.onAddGo(task.id, null)}>
          <Plus size={11} /> Add go
        </button>
      </div>
    </div>
  );
}

function NestedStepInGoal({
  step, onToggleGoDone, onAddGoToStep,
}: {
  step: import('../../../api/types').Step;
  onToggleGoDone: (g: Go) => void;
  onAddGoToStep: () => void;
}) {
  const [open, setOpen] = useState(false);
  const goCount = step.gos.length;
  const goDone = step.gos.filter((g) => g.is_done_today).length;
  return (
    <article className="m-mc m-mc-step" data-done={step.is_completed || undefined}>
      <span className="m-mc-kind">Step</span>
      <MiniStepContent step={step} />

      {goCount > 0 && (
        <button
          type="button"
          className="m-mc-toggle"
          data-open={open || undefined}
          onClick={() => setOpen(!open)}
        >
          <ChevronRight size={12} />
          {open
            ? `Hide ${goCount} go${goCount === 1 ? '' : 's'}`
            : `Show ${goDone}/${goCount} go${goCount === 1 ? '' : 's'}`}
        </button>
      )}

      {open && (
        <div className="m-mc-children">
          {step.gos.map((g) => (
            <article key={g.id} className="m-mc m-mc-go" data-done={g.is_done_today || undefined}>
              <span className="m-mc-kind">Go</span>
              <MiniGoContent go={g} onLog={() => onToggleGoDone(g)} />
            </article>
          ))}
          <button type="button" className="lane-add-btn" onClick={onAddGoToStep}>
            <Plus size={11} /> Add go to step
          </button>
        </div>
      )}
    </article>
  );
}

// ── Go (today's targets) ─────────────────────────────────────────────────────

function GoView({
  tasks, gos, dayFilter, onDay, onLog, onSkip, onAdd, onEdit,
}: {
  tasks: Task[];
  gos: Go[];
  dayFilter: DayFilter;
  onDay: (d: DayFilter) => void;
  onLog: (go: Go, v: number) => void;
  onSkip: (go: Go) => void | Promise<void>;
  onAdd: () => void;
  onEdit: (go: Go) => void;
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
            <SwipeableRow
              key={g.id}
              onEdit={() => onEdit(g)}
              onDelete={() => onSkip(g)}
            >
              <TgCard
                go={g}
                parent={g.task_id ? goalById.get(g.task_id) ?? null : null}
                onLog={onLog}
                onSkip={onSkip}
              />
            </SwipeableRow>
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

  // Where this Go is attached: prefer step, fall back to goal, then standalone.
  const attachLabel = go.sprint_title
    ? `Step · ${go.sprint_title}`
    : go.task_title
    ? `Goal · ${go.task_title}`
    : 'Standalone';
  const attachIsStep = !!go.sprint_title;

  // Period of execution (start – due). Show whatever is set.
  let periodLabel: string | null = null;
  if (go.start_date && go.due_date) periodLabel = `${fmtDue(go.start_date)} – ${fmtDue(go.due_date)}`;
  else if (go.due_date)             periodLabel = `due ${fmtDue(go.due_date)}`;
  else if (go.start_date)           periodLabel = `from ${fmtDue(go.start_date)}`;

  return (
    <article
      className="tg-card"
      data-kind={go.kind}
      data-done={targetMet || undefined}
      data-partial={partial || undefined}
    >
      <header className="tg-card-head">
        <div className="tg-meta-row">
          <span
            className="tg-attach-pill"
            data-step={attachIsStep || undefined}
            style={parent ? { ['--gc' as any]: accentForGoal(parent) } : undefined}
          >
            {attachIsStep ? <Layers size={10} /> : <span className="tg-attach-dot" />}
            {attachLabel}
          </span>
          {periodLabel && <span className="tg-period-pill">{periodLabel}</span>}
        </div>
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

function StepView({ tasks, steps, onAdd, onEdit, onDelete, onToggleGoDone }: {
  tasks: Task[];
  steps: ReturnType<typeof useSteps>;
  onAdd: () => void;
  onEdit: (s: import('../../../api/types').Step) => void;
  onDelete: (s: import('../../../api/types').Step) => void;
  onToggleGoDone: (g: Go) => void;
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
                <div className="lane-steps">
                  {t.sprints.map((s) => (
                    <SwipeableRow key={s.id} onEdit={() => onEdit(s)} onDelete={() => onDelete(s)}>
                      <StepCard step={s} parent={t} today={today} onToggleGoDone={onToggleGoDone} />
                    </SwipeableRow>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

function StepCard({ step, parent, today, onToggleGoDone }: {
  step: import('../../../api/types').Step;
  parent: Task;
  today: string;
  onToggleGoDone: (g: Go) => void;
}) {
  const accent = accentForGoal(parent);

  let status: 'on-track' | 'upcoming' | 'at-risk' | 'done';
  if (step.is_completed) status = 'done';
  else if (step.start_date > today) status = 'upcoming';
  else if (step.end_date < today) status = 'at-risk';
  else status = 'on-track';

  const statusLabel = status === 'on-track' ? 'On track'
    : status === 'upcoming' ? 'Upcoming'
    : status === 'at-risk' ? 'At risk'
    : 'Complete';
  const statusKey = status === 'on-track' ? 'on'
    : status === 'upcoming' ? 'up'
    : status === 'at-risk' ? 'risk'
    : 'done';

  const daysLeft = !step.is_completed && step.end_date >= today
    ? `${daysUntil(step.end_date)}d left`
    : null;

  const goCount = step.gos.length;
  const goDone  = step.gos.filter((g) => g.is_done_today).length;
  // First not-done go = "current" node; gets a halo & accent ring.
  const currentIdx = step.gos.findIndex((g) => !g.is_done_today);
  // Drop labels when too many gos to avoid crowding (~5+ gets cramped on mobile).
  const showLabels = goCount > 0 && goCount <= 4;

  return (
    <article className="goal-card goal-card-step step-constellation" data-status={status} style={{ ['--gc' as any]: accent }}>
      <header className="step-cn-head">
        <h3 className="gc-title" style={{ flex: 1, minWidth: 0 }}>{step.title}</h3>
        <span className="step-cn-period">
          {fmtDue(step.start_date)} — {fmtDue(step.end_date)}
        </span>
      </header>

      {goCount > 0 ? (
        <div className={`step-nodes${showLabels ? '' : ' step-nodes-compact'}`}>
          {step.gos.map((g, i) => {
            const isDone = g.is_done_today;
            const isCurrent = !isDone && i === currentIdx;
            return (
              <button
                key={g.id}
                type="button"
                className={`step-node${isDone ? ' step-node-done' : ''}${isCurrent ? ' step-node-current' : ''}`}
                onClick={() => onToggleGoDone(g)}
                aria-label={`${g.title} (${isDone ? 'done' : 'pending'})`}
                title={g.title}
              >
                <span className="step-node-dot">
                  {isDone ? <Check size={12} /> : (i + 1)}
                </span>
                {showLabels && (
                  <span className="step-node-label">{stepNodeLabel(g.title)}</span>
                )}
              </button>
            );
          })}
        </div>
      ) : (
        <div className="step-cn-empty">No gos yet — swipe to edit and link some.</div>
      )}

      <footer className="gc-foot step-cn-foot">
        <span className={`step-status step-status-${statusKey}`}>{statusLabel}</span>
        <span className="gc-due">
          {goDone}/{goCount} done{daysLeft ? ` · ${daysLeft}` : ''}
        </span>
      </footer>
    </article>
  );
}

function stepNodeLabel(title: string): string {
  const word = title.trim().split(/\s+/)[0] ?? '';
  return word.length > 8 ? word.slice(0, 7) + '…' : word;
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
