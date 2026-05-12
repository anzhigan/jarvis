import { useCallback, useMemo, useState } from 'react';
import { Check, ChevronRight, Flag, Loader2, Minus, Plus } from 'lucide-react';
import { MiniGoContent } from '../components/MiniCards';
import { toast } from 'sonner';
import type { Go, GoalRoutineLink, Task, TaskPriority, TaskStatus } from '../../../api/types';
import { useGoals } from '../../goals/hooks/useGoals';
import { useGos } from '../../goals/hooks/useGos';
import { gosApi, routinesApi } from '../../../api/client';
import { useRoutines } from '../../routines/hooks/useRoutines';
import { MobileTopBar } from '../components/MobileTopBar';
import { MobileShell } from '../components/MobileShell';
import { GoalForm, GoForm, RoutineForm } from '../components/MobileAddForms';
import { SwipeableRow } from '../components/SwipeableRow';
import { MobileConfirmSheet } from '../components/MobileConfirmSheet';
import { MobilePickerSheet } from '../components/MobilePickerSheet';
import type { Tab } from '../../../app/tabs';

type ViewMode = 'kanban' | 'go';
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
  const routines = useRoutines();

  const [mode, setMode] = useState<ViewMode>('kanban');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('active');
  const [dayFilter, setDayFilter] = useState<DayFilter>('today');

  // Bottom-sheet forms.
  const [goalFormOpen, setGoalFormOpen] = useState(false);
  const [goFormOpen, setGoFormOpen] = useState<{ taskId: string | null } | null>(null);
  const [routineFormOpen, setRoutineFormOpen] = useState<{ goalId: string | null } | null>(null);
  const [editGoal, setEditGoal] = useState<Task | null>(null);
  const [editGo, setEditGo] = useState<Go | null>(null);
  // Confirm-delete sheets
  const [confirmDeleteGoal, setConfirmDeleteGoal] = useState<Task | null>(null);
  const [confirmDeleteGo, setConfirmDeleteGo] = useState<Go | null>(null);
  // Picker: pick an existing orphan Go to attach to a goal.
  const [pickGoFor, setPickGoFor] = useState<string | null>(null); // taskId

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
          onAddGo={(taskId) => setPickGoFor(taskId)}
          onAddRoutine={(taskId) => setRoutineFormOpen({ goalId: taskId })}
          onEditGoal={(t) => setEditGoal(t)}
          onDeleteGoal={(t) => setConfirmDeleteGoal(t)}
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
          onAdd={() => setGoFormOpen({ taskId: null })}
        />
      )}

      <GoalForm open={goalFormOpen} onOpenChange={setGoalFormOpen} library={goals} gos={gos} />
      {goFormOpen && (
        <GoForm
          open={!!goFormOpen}
          onOpenChange={(o) => { if (!o) setGoFormOpen(null); }}
          gos={gos}
          goals={goals.tasks}
          initialTaskId={goFormOpen.taskId}
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
        editing={editGoal}
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
        description="The goal and all its gos and routine links will be removed."
        confirmLabel="Delete"
        destructive
        onConfirm={async () => { if (confirmDeleteGoal) await goals.deleteGoal(confirmDeleteGoal.id); }}
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

      {/* Add-go picker — pick existing orphan gos to attach to a goal. */}
      {pickGoFor !== null && (
        <MobilePickerSheet
          open={!!pickGoFor}
          onOpenChange={(o) => { if (!o) setPickGoFor(null); }}
          title="Add go to goal"
          entity="Go"
          items={gos.gos.filter((g) => g.task_id !== pickGoFor)}
          onConfirm={async (selected) => {
            const target = pickGoFor;
            if (!target || selected.size === 0) return;
            try {
              await Promise.all([...selected].map((id) => gosApi.update(id, {
                task_id: target,
              })));
              await Promise.all([gos.refresh(), goals.refresh()]);
              setPickGoFor(null);
            } catch (e: any) { toast.error(e?.detail ?? 'Failed to attach go'); }
          }}
          onCreate={() => setGoFormOpen({ taskId: pickGoFor })}
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
  onAddGo: (taskId: string) => void;
  onAddRoutine: (taskId: string) => void;
  onToggleRoutineDone: (link: GoalRoutineLink) => void;
  onEditGoal: (task: Task) => void;
  onDeleteGoal: (task: Task) => void;
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
  const childCount = task.gos.length;

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
  return (
    <div className="m-gc-expanded">
      {task.gos.map((g) => (
        <article key={g.id} className="m-mc m-mc-go" data-done={g.is_done_today || undefined}>
          <span className="m-mc-kind">Go</span>
          <MiniGoContent go={g} onLog={() => cb.onToggleGoDone(g)} />
        </article>
      ))}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="button" className="lane-add-btn" onClick={() => cb.onAddGo(task.id)}>
          <Plus size={11} /> Add go
        </button>
        <button type="button" className="lane-add-btn" onClick={() => cb.onAddRoutine(task.id)}>
          <Plus size={11} /> Add routine
        </button>
      </div>
    </div>
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
  go, parent, onLog, onSkip: _onSkip,
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

  // Where this Go is attached: goal or standalone.
  const attachLabel = go.task_title
    ? `Goal · ${go.task_title}`
    : 'Standalone';

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
            style={parent ? { ['--gc' as any]: accentForGoal(parent) } : undefined}
          >
            <span className="tg-attach-dot" />
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

// ── Helpers ──────────────────────────────────────────────────────────────────

function EmptyHint({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      padding: '40px 20px', textAlign: 'center', color: 'var(--ink-4)',
      fontFamily: 'var(--font-body)', fontSize: 14, lineHeight: 1.5,
    }}>{children}</div>
  );
}
