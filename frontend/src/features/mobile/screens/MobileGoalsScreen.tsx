import { useCallback, useMemo, useState } from 'react';
import { Check, Loader2, Minus, MoreHorizontal, Plus, X } from 'lucide-react';
import { toast } from 'sonner';
import type { Go, Task, TaskStatus } from '../../../api/types';
import { useGoals } from '../../goals/hooks/useGoals';
import { useGos } from '../../goals/hooks/useGos';
import { useSteps } from '../../goals/hooks/useSteps';
import { MobileTopBar } from '../components/MobileTopBar';
import { MobileFab } from '../components/MobileFab';
import { MobileShell } from '../components/MobileShell';
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

  const [mode, setMode] = useState<ViewMode>('kanban');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('active');
  const [dayFilter, setDayFilter] = useState<DayFilter>('today');

  const counts = useMemo(() => {
    const c: Record<TaskStatus, number> = { active: 0, backlog: 0, paused: 0, done: 0 };
    for (const t of goals.tasks) c[t.status] += 1;
    return c;
  }, [goals.tasks]);

  const subtitle = `${counts.active} active · ${counts.backlog} in backlog`;

  const handleAddTopBar = useCallback(async () => {
    const title = window.prompt('Goal title')?.trim();
    if (!title) return;
    const created = await goals.createGoal({ title, status: 'active' });
    if (created) toast.success('Goal created');
  }, [goals]);

  const topBar = <MobileTopBar title="Goals" subtitle={subtitle} onAvatarClick={onAvatarClick} />;

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
    <MobileShell
      topBar={topBar}
      fab={<MobileFab onClick={handleAddTopBar} ariaLabel="New goal" />}
      tab={tab}
      onTabChange={onTabChange}
    >
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
        />
      )}
      {mode === 'go' && (
        <GoView
          tasks={goals.tasks}
          gos={gos.gos}
          dayFilter={dayFilter}
          onDay={setDayFilter}
          onLog={(go, v) => { void gos.logToday(go.id, v); }}
          onSkip={async (go) => {
            if (!window.confirm(`Delete "${go.title}"?`)) return;
            await gos.deleteGo(go.id);
          }}
        />
      )}
      {mode === 'step' && (
        <StepView tasks={goals.tasks} steps={steps} />
      )}
    </MobileShell>
  );
}

// ── Kanban ───────────────────────────────────────────────────────────────────

function KanbanView({
  tasks, counts, statusFilter, onStatus,
}: {
  tasks: Task[];
  counts: Record<TaskStatus, number>;
  statusFilter: StatusFilter;
  onStatus: (s: StatusFilter) => void;
}) {
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

      {filtered.length === 0 ? (
        <EmptyHint>No goals in this column.</EmptyHint>
      ) : (
        <div className="goal-cards">
          {filtered.map((t) => <GoalCard key={t.id} task={t} />)}
        </div>
      )}
    </>
  );
}

function GoalCard({ task }: { task: Task }) {
  const accent = accentForGoal(task);
  const pct = Math.round(task.progress ?? 0);
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

  return (
    <article className="goal-card" style={{ ['--gc' as any]: accent }}>
      <div className="gc-bar"><div className="gc-bar-fill" style={{ width: `${pct}%` }} /></div>
      <header className="gc-head">
        <h3 className="gc-title">{task.title}</h3>
        <button className="gc-edit" aria-label="More"><MoreHorizontal /></button>
      </header>
      {task.description && <p className="gc-desc">{task.description}</p>}
      <div className="gc-progress-row">
        <span className="gc-pct">{pct}<em>%</em></span>
        <span className="gc-progress-label">complete</span>
      </div>
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
      </footer>
    </article>
  );
}

// ── Go (today's targets) ─────────────────────────────────────────────────────

function GoView({
  tasks, gos, dayFilter, onDay, onLog, onSkip,
}: {
  tasks: Task[];
  gos: Go[];
  dayFilter: DayFilter;
  onDay: (d: DayFilter) => void;
  onLog: (go: Go, v: number) => void;
  onSkip: (go: Go) => void | Promise<void>;
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

function StepView({ tasks, steps }: {
  tasks: Task[];
  steps: ReturnType<typeof useSteps>;
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
