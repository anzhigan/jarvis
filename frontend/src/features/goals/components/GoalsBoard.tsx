import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronRight, Flag, Pencil, Plus, Repeat, Unlink2, X } from 'lucide-react';
import {
  DndContext, DragEndEvent, DragOverlay, DragStartEvent, PointerSensor,
  useDraggable, useDroppable, useSensor, useSensors,
} from '@dnd-kit/core';
import type { Task, TaskPriority, TaskStatus } from '../../../api/types';

interface Props {
  tasks: Task[];
  /** When non-empty, only render these status columns (and stretch them across
   *  the row). Empty = render all four. */
  visibleStatuses?: Set<TaskStatus>;
  onSelect: (id: string) => void;
  onAdd: (status: TaskStatus) => void;
  onMove: (id: string, status: TaskStatus) => void | Promise<void>;
  /** Toggle today's value for a Go (1 / target_value when checking, 0 otherwise). */
  onToggleGoDone: (go: import('../../../api/types').Go) => void | Promise<void>;
  /** Quick-create a go under the goal — optionally inside a Step. */
  onAddGo: (taskId: string, stepId?: string | null) => void | Promise<void>;
  /** Open the create-step dialog for this goal. */
  onAddStep: (taskId: string) => void | Promise<void>;
  /** Open the edit-step dialog. */
  onEditStep: (step: import('../../../api/types').Step) => void | Promise<void>;
  /** Quick-create a routine and attach to the goal — title prompted. */
  onAddRoutine: (taskId: string) => void | Promise<void>;
  /** Toggle a routine entry on the given date (defaults to today when omitted). */
  onToggleRoutineDone: (link: import('../../../api/types').GoalRoutineLink, date?: string) => void | Promise<void>;
  /** Mark the given date as skipped (entry value = 0). Defaults to today. */
  onSkipRoutine: (link: import('../../../api/types').GoalRoutineLink, date?: string) => void | Promise<void>;
  /** Detach the Routine from this Goal (deletes the GoalRoutineLink, keeps the Routine). */
  onUnlinkRoutine: (link: import('../../../api/types').GoalRoutineLink) => void | Promise<void>;
}

interface Column {
  key: TaskStatus;
  /** Maps to .kanban-col[data-c=…] coloured headline. */
  c?: 'moss' | 'ochre' | 'slate';
}

const COLUMNS: Column[] = [
  { key: 'backlog' },
  { key: 'paused'  },             // On hold — neutral ink
  { key: 'active',  c: 'ochre' }, // Active — golden, deliberately the eye-catch
  { key: 'done',    c: 'slate' },
];

/** Deterministic accent per goal id — keeps kanban progress bar, expand
 *  sub-cards and the v6 Go-list card stripe in sync for the same goal. */
const ACCENTS = ['var(--moss)', 'var(--indigo)', 'var(--slate)', 'var(--ochre)', 'var(--rust)'] as const;
function accentFor(goalId: string): string {
  let h = 0;
  for (let i = 0; i < goalId.length; i++) h = (h * 31 + goalId.charCodeAt(i)) >>> 0;
  return ACCENTS[h % ACCENTS.length];
}

const STATUS_LABEL: Record<TaskStatus, string> = {
  backlog: 'Backlog',
  active:  'Active',
  paused:  'On hold',
  done:    'Done',
};

function fmtDue(due: string): string {
  const d = new Date(due);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

interface CardCallbacks {
  onToggleGoDone?: Props['onToggleGoDone'];
  onAddGo?: Props['onAddGo'];
  onAddStep?: Props['onAddStep'];
  onEditStep?: Props['onEditStep'];
  onAddRoutine?: Props['onAddRoutine'];
  onToggleRoutineDone?: Props['onToggleRoutineDone'];
  onSkipRoutine?: Props['onSkipRoutine'];
  onUnlinkRoutine?: Props['onUnlinkRoutine'];
}

function GoalCardContent({
  task, expanded, onToggleExpand, callbacks,
}: {
  task: Task;
  expanded?: boolean;
  onToggleExpand?: (e: React.MouseEvent | React.KeyboardEvent) => void;
  callbacks?: CardCallbacks;
}) {
  // Collapsible description (mirrors tg-card behavior).
  const [descExpanded, setDescExpanded] = useState(false);
  const [descTruncated, setDescTruncated] = useState(false);
  const descRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (descExpanded) return;
    const el = descRef.current;
    if (!el) return;
    setDescTruncated(el.scrollHeight > el.clientHeight + 1);
  }, [task.description, descExpanded]);

  const pct = Math.round(task.progress ?? 0);
  // Always show progress so the goal card carries an at-a-glance % across all
  // statuses (backlog, active, paused, done).
  const showProgress = true;
  const gosCount = task.gos.length;
  const routinesCount = task.routines.length;
  const tags = task.tags;
  const childTotal = gosCount + routinesCount;

  const foot: React.ReactNode[] = [];
  if (routinesCount > 0) {
    foot.push(
      <span key="rt"><Repeat size={11} style={{ verticalAlign: -2 }} /> {routinesCount} routine{routinesCount === 1 ? '' : 's'}</span>,
    );
  }
  if (task.due_date) {
    foot.push(<span key="due">due <time>{fmtDue(task.due_date)}</time></span>);
  } else if (task.status === 'done') {
    foot.push(<span key="closed">closed</span>);
  }

  return (
    <>
      <span className="kc-pri" data-pri={task.priority as TaskPriority} />
      <div className="kc-title-row">
        <h3 className="kc-title">{task.title}</h3>
        <span className="kc-pri-flag" data-pri={task.priority} title={`Priority: ${task.priority}`}>
          <Flag size={11} />
        </span>
      </div>
      {task.description?.trim() && (
        <div className={`kc-desc-block${descExpanded ? ' kc-desc-block--expanded' : ''}`}>
          <p ref={descRef} className="kc-desc">{task.description}</p>
          {!descExpanded && descTruncated && (
            <button
              type="button"
              className="kc-desc__more"
              aria-label="Show full description"
              onClick={(e) => { e.stopPropagation(); setDescExpanded(true); }}
            >…</button>
          )}
          {descExpanded && descTruncated && (
            <button
              type="button"
              className="kc-desc__less"
              onClick={(e) => { e.stopPropagation(); setDescExpanded(false); }}
            >Show less</button>
          )}
        </div>
      )}

      {showProgress && (
        <div className="kc-progress">
          <div className="kc-progress-bar"><div className="kc-progress-fill" style={{ width: `${pct}%` }} /></div>
          <span className="kc-progress-num">
            {pct}<span style={{ color: 'var(--ink-4)', fontWeight: 400 }}>%</span>
          </span>
        </div>
      )}

      {tags.length > 0 && (
        <div className="kc-tags">
          {tags.map((tag) => (
            <span
              key={tag.id}
              className="kc-tag"
              style={{ color: tag.color, boxShadow: `inset 0 0 0 1px ${tag.color}33` }}
            >
              <span
                style={{
                  width: 6, height: 6, borderRadius: 2,
                  background: tag.color, display: 'inline-block', marginRight: 5,
                }}
              />
              {tag.name}
            </span>
          ))}
        </div>
      )}

      <div className="kc-foot">
        {foot.map((node, i) => (
          <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            {i > 0 && <span style={{ color: 'var(--ink-5)' }}>·</span>}
            {node}
          </span>
        ))}
        {onToggleExpand && (
          <button
            type="button"
            className="kc-expand-btn"
            data-open={expanded || undefined}
            onClick={(e) => { e.stopPropagation(); onToggleExpand(e); }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.stopPropagation();
                e.preventDefault();
                onToggleExpand(e);
              }
            }}
            aria-label={expanded ? 'Hide gos and routines' : 'Show gos and routines'}
          >
            <ChevronRight />
            {childTotal === 0 ? 'Gos & routines' : `${childTotal} ${childTotal === 1 ? 'item' : 'items'}`}
          </button>
        )}
      </div>

      {expanded && (
        <div className="kc-children" onClick={(e) => e.stopPropagation()}>
          <GoalChildren task={task} callbacks={callbacks} />
        </div>
      )}
    </>
  );
}

/* ── Sub-card list inside an expanded goal — Gos then Routines + "+ Add". ── */

function GoalChildren({
  task, callbacks,
}: {
  task: Task;
  callbacks?: CardCallbacks;
}) {
  const sortedSteps = useMemo(
    () => [...(task.steps ?? [])].sort((a, b) => a.position - b.position),
    [task.steps],
  );

  // Split task.gos: those attached to a step go inside the matching StepSubcard,
  // orphans (no step_id) render under the standalone "Gos" section below.
  const { gosByStep, orphanGos } = useMemo(() => {
    const map = new Map<string, import('../../../api/types').Go[]>();
    const orphans: import('../../../api/types').Go[] = [];
    for (const g of task.gos) {
      if (g.step_id) {
        const arr = map.get(g.step_id) ?? [];
        arr.push(g);
        map.set(g.step_id, arr);
      } else {
        orphans.push(g);
      }
    }
    return { gosByStep: map, orphanGos: orphans };
  }, [task.gos]);

  return (
    <>
      {(sortedSteps.length > 0 || callbacks?.onAddStep) && (
        <div className="kc-section">
          <div className="kc-section-label">Steps</div>
          {sortedSteps.map((s) => (
            <StepSubcard
              key={s.id}
              step={s}
              gos={gosByStep.get(s.id) ?? []}
              goalTitle={task.title}
              onEdit={callbacks?.onEditStep}
              onAddGoInStep={callbacks?.onAddGo ? () => callbacks.onAddGo?.(task.id, s.id) : undefined}
              onToggleGo={callbacks?.onToggleGoDone}
            />
          ))}
          {callbacks?.onAddStep && (
            <button
              type="button"
              className="kc-add-btn"
              onClick={(e) => {
                e.stopPropagation();
                callbacks.onAddStep?.(task.id);
              }}
            ><Plus size={11} /> Step</button>
          )}
        </div>
      )}

      {(orphanGos.length > 0 || callbacks?.onAddGo) && (
        <div className="kc-section">
          <div className="kc-section-label">
            {sortedSteps.length > 0 ? 'Gos · no step' : 'Gos'}
          </div>
          {orphanGos.map((g) => (
            <GoSubcard
              key={g.id}
              go={g}
              goalTitle={task.title}
              onToggle={callbacks?.onToggleGoDone}
            />
          ))}
          {callbacks?.onAddGo && (
            <button
              type="button"
              className="kc-add-btn"
              onClick={(e) => {
                e.stopPropagation();
                callbacks.onAddGo?.(task.id);
              }}
            ><Plus size={11} /> Go</button>
          )}
        </div>
      )}

      {(task.routines.length > 0 || callbacks?.onAddRoutine) && (
        <div className="kc-section">
          <div className="kc-section-label">Routines</div>
          {task.routines.map((link) => (
            <RoutineSubcard
              key={link.id}
              link={link}
              onToggle={callbacks?.onToggleRoutineDone}
              onSkip={callbacks?.onSkipRoutine}
              onUnlink={callbacks?.onUnlinkRoutine}
            />
          ))}
          {callbacks?.onAddRoutine && (
            <button
              type="button"
              className="kc-add-btn"
              onClick={(e) => {
                e.stopPropagation();
                callbacks.onAddRoutine?.(task.id);
              }}
            ><Plus size={11} /> Routine</button>
          )}
        </div>
      )}
    </>
  );
}

type RoutineCellState = 'done' | 'partial' | 'skipped' | 'empty';

const ymdDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Step shown inline inside a Kanban goal card — title, status, gos counter,
 *  expandable to reveal its attached Gos. Row click toggles expand; pencil
 *  icon opens edit; "+ Go" creates a Go pre-attached to this step. */
const StepSubcard = memo(function StepSubcard({
  step, gos, goalTitle, onEdit, onAddGoInStep, onToggleGo,
}: {
  step: import('../../../api/types').Step;
  gos: import('../../../api/types').Go[];
  goalTitle?: string | null;
  onEdit?: (step: import('../../../api/types').Step) => void | Promise<void>;
  onAddGoInStep?: () => void;
  onToggleGo?: (go: import('../../../api/types').Go) => void | Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  const state = step.status === 'done'
    ? 'done'
    : step.status === 'in_progress' ? 'active' : 'upcoming';
  return (
    <div
      className="kc-child"
      data-kind="step"
      data-state={state}
      data-expanded={expanded || undefined}
    >
      <div
        className="kc-child-row"
        onClick={(e) => { e.stopPropagation(); setExpanded((v) => !v); }}
        role="button"
        tabIndex={0}
      >
        <ChevronRight size={12} className="kc-child-chevron" />
        <span className="kc-child-num">{String(step.position + 1).padStart(2, '0')}</span>
        <span className="kc-child-name">{step.title}</span>
        <span className="kc-child-meta-inline">
          {step.gos_done} / {step.gos_count}
        </span>
        {onEdit && (
          <button
            type="button"
            className="kc-child-icon"
            title="Edit step"
            aria-label="Edit step"
            onClick={(e) => { e.stopPropagation(); onEdit(step); }}
          ><Pencil size={10} /></button>
        )}
        {onAddGoInStep && (
          <button
            type="button"
            className="kc-child-add"
            title="Add go inside this step"
            aria-label="Add go inside this step"
            onClick={(e) => { e.stopPropagation(); onAddGoInStep(); }}
          ><Plus size={11} /></button>
        )}
      </div>
      {expanded && (
        <div className="kc-step-children">
          {gos.length === 0 ? (
            <div className="kc-step-empty">No gos in this step yet.</div>
          ) : (
            gos.map((g) => (
              <GoSubcard
                key={g.id}
                go={g}
                goalTitle={goalTitle}
                stepTitle={step.title}
                onToggle={onToggleGo}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
});

/** Routine attached to a Goal via GoalRoutineLink — same visual language as the
 *  big Routines view: a 7-day cell heatmap (done / partial / skipped / empty)
 *  plus two action circles (Done / Skip) for today.
 */
const RoutineSubcard = memo(function RoutineSubcard({
  link, onToggle, onSkip, onUnlink,
}: {
  link: import('../../../api/types').GoalRoutineLink;
  onToggle?: (link: import('../../../api/types').GoalRoutineLink, date?: string) => void | Promise<void>;
  onSkip?:   (link: import('../../../api/types').GoalRoutineLink, date?: string) => void | Promise<void>;
  onUnlink?: (link: import('../../../api/types').GoalRoutineLink) => void | Promise<void>;
}) {
  const r = link.routine;
  // Local selection — which past day is currently highlighted. Defaults to
  // today, so the check / skip buttons act on today out of the box.
  const [selectedDate, setSelectedDate] = useState<string>(() => ymdDate(new Date()));
  const { todayKey, days, scheduleLabel, cellStateByDate } = useMemo(() => {
    const todayKey = ymdDate(new Date());
    const entryByDate = new Map<string, number>();
    for (const e of r.entries) entryByDate.set(e.date, e.value);
    const cellState = (v: number | undefined): RoutineCellState => {
      if (v === undefined) return 'empty';
      if (v === 0) return 'skipped';
      if (r.kind === 'numeric' && r.target_value && v < r.target_value) return 'partial';
      return 'done';
    };
    const days: { date: Date; key: string; state: RoutineCellState }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i); d.setHours(0, 0, 0, 0);
      const key = ymdDate(d);
      days.push({ date: d, key, state: cellState(entryByDate.get(key)) });
    }
    const scheduleLabel = r.schedule_type === 'daily'
      ? 'Daily'
      : r.schedule_type === 'weekly_on_days'
        ? 'Weekly'
        : r.schedule_type === 'every_n_days'
          ? `Every ${r.schedule_n_days}d`
          : `${r.schedule_count_per_period}× / ${r.schedule_period}`;
    const cellStateByDate = new Map<string, RoutineCellState>();
    for (const d of days) cellStateByDate.set(d.key, d.state);
    return { todayKey, days, scheduleLabel, cellStateByDate };
  }, [r.entries, r.kind, r.target_value, r.schedule_type, r.schedule_days,
      r.schedule_n_days, r.schedule_count_per_period, r.schedule_period]);

  const activeState = cellStateByDate.get(selectedDate) ?? 'empty';
  const todayState = cellStateByDate.get(todayKey) ?? 'empty';
  const isToday = selectedDate === todayKey;

  return (
    <div className="kc-child" data-kind="routine" data-done={todayState === 'done' || undefined}>
      <div className="kc-child-row">
        <span className="kc-child-pill">
          <Repeat size={10} style={{ verticalAlign: -1, marginRight: 3 }} />
          Routine
        </span>
        <span className="kc-child-name">{r.title}</span>
        {onUnlink && (
          <button
            type="button"
            className="kc-child-unlink"
            onClick={(e) => { e.stopPropagation(); onUnlink(link); }}
            title="Detach routine from this goal"
            aria-label="Detach routine from this goal"
          >
            <Unlink2 size={11} />
          </button>
        )}
      </div>

      <div className="kc-routine-grid">
        {days.map((d) => (
          <button
            key={d.key}
            type="button"
            className={`hg-cell hg-cell-${d.state}`}
            data-today={d.key === todayKey || undefined}
            data-active={d.key === selectedDate || undefined}
            title={`${d.date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} · ${d.state} · click to edit`}
            onClick={(e) => { e.stopPropagation(); setSelectedDate(d.key); }}
          />
        ))}
      </div>

      <div className="kc-routine-foot">
        <div className="kc-child-meta" style={{ flex: 1, marginTop: 0 }}>
          <span>{scheduleLabel}</span>
          {r.kind === 'numeric' && r.target_value != null && (
            <>
              <span className="sep">·</span>
              <span>target {r.target_value}{r.unit ? ` ${r.unit}` : ''}</span>
            </>
          )}
          {r.is_paused && (
            <>
              <span className="sep">·</span>
              <span style={{ color: 'var(--ochre)' }}>paused</span>
            </>
          )}
        </div>
        <div className="rt-actions">
          <div className="rt-action-date" title="Editing this date">
            {isToday ? 'Today' : selectedDate.slice(5)}
          </div>
          <button
            type="button"
            className="rt-action rt-action-check"
            data-active={activeState === 'done' || undefined}
            onClick={(e) => { e.stopPropagation(); onToggle?.(link, selectedDate); }}
            title="Mark done"
            aria-label="Mark done"
          >
            <Check />
          </button>
          <button
            type="button"
            className="rt-action rt-action-skip"
            data-active={activeState === 'skipped' || undefined}
            onClick={(e) => { e.stopPropagation(); onSkip?.(link, selectedDate); }}
            title="Skip"
            aria-label="Skip"
          >
            <X />
          </button>
        </div>
      </div>
    </div>
  );
});

/** Go sub-card — rendered inside an expanded goal. */
const GoSubcard = memo(function GoSubcard({
  go, goalTitle, stepTitle, onToggle,
}: {
  go: import('../../../api/types').Go;
  /** Parent goal title — shown as a tag on the row. */
  goalTitle?: string | null;
  /** Step title, when the Go is attached to a Step. */
  stepTitle?: string | null;
  onToggle?: (go: import('../../../api/types').Go) => void | Promise<void>;
}) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const due = go.due_date ? new Date(go.due_date) : null;
  const overdue = due && !go.is_done_today && due < today;
  const valueLabel = go.kind === 'numeric' && go.target_value
    ? `${go.target_value}${go.unit ? ' ' + go.unit : ''}`
    : null;
  return (
    <div
      className="kc-child kc-child--roomy"
      data-kind="go"
      data-done={go.is_done_today || undefined}
    >
      {(goalTitle || stepTitle) && (
        <div className="kc-child-tags">
          {goalTitle && (
            <span className="kc-tag" data-tag="goal" title={`Goal · ${goalTitle}`}>{goalTitle}</span>
          )}
          {stepTitle && (
            <span className="kc-tag" data-tag="step" title={`Step · ${stepTitle}`}>{stepTitle}</span>
          )}
        </div>
      )}
      <div className="kc-child-row">
        <button
          type="button"
          className="kc-child-check kc-child-check-btn"
          onClick={(e) => { e.stopPropagation(); onToggle?.(go); }}
          title={go.is_done_today ? 'Mark not done' : 'Mark done'}
          aria-label={go.is_done_today ? 'Mark not done' : 'Mark done'}
        >
          {go.is_done_today && <Check />}
        </button>
        <span className="kc-child-name">{go.title}</span>
      </div>
      {(valueLabel || due) && (
        <div className="kc-child-meta">
          {valueLabel && <span>target {valueLabel}</span>}
          {valueLabel && due && <span className="sep">·</span>}
          {due && (
            <time className={overdue ? 'overdue' : undefined}>
              due {fmtDue(go.due_date!)}{overdue ? ' · overdue' : ''}
            </time>
          )}
        </div>
      )}
    </div>
  );
});

function DraggableCard({
  task, onSelect, expanded, onToggleExpand, callbacks,
}: {
  task: Task;
  onSelect: (id: string) => void;
  expanded: boolean;
  onToggleExpand: (id: string) => void;
  callbacks: CardCallbacks;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: task.id });
  const accent = task.color || accentFor(task.id);
  return (
    <article
      ref={setNodeRef}
      className="kc"
      {...attributes}
      {...listeners}
      role="button"
      tabIndex={0}
      data-dragging={isDragging || undefined}
      data-expanded={expanded || undefined}
      style={{
        opacity: isDragging ? 0.4 : 1,
        cursor: isDragging ? 'grabbing' : 'pointer',
        ['--gc' as any]: accent,
      }}
      onClick={() => onSelect(task.id)}
      onKeyDown={(e) => { if (e.key === 'Enter') onSelect(task.id); }}
    >
      <GoalCardContent
        task={task}
        expanded={expanded}
        onToggleExpand={() => onToggleExpand(task.id)}
        callbacks={callbacks}
      />
    </article>
  );
}

function DroppableColumn({
  col, tasks, cardsPerRow, onSelect, onAdd, expandedIds, onToggleExpand, callbacks,
}: {
  col: Column;
  tasks: Task[];
  /** How many cards to lay out per row inside this column's body. */
  cardsPerRow: number;
  onSelect: (id: string) => void;
  onAdd: (status: TaskStatus) => void;
  expandedIds: Set<string>;
  onToggleExpand: (id: string) => void;
  callbacks: CardCallbacks;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: col.key });
  const bodyStyle = cardsPerRow > 1
    ? {
        display: 'grid',
        gridTemplateColumns: `repeat(${cardsPerRow}, minmax(0, 1fr))`,
        gap: 10,
        // Without `align-items: start` CSS Grid defaults to `stretch`, so
        // every card in a row inflates to match the tallest one — clicking
        // "Show gos & routines" on a single card used to balloon its
        // neighbours. Self-sizing keeps each card to its own content height.
        alignItems: 'start',
      } as React.CSSProperties
    : undefined;
  // When the body is a grid, the Add button needs to span all card columns
  // so it sits as a full-width affordance under the row.
  const addStyle = cardsPerRow > 1
    ? { gridColumn: `1 / -1` } as React.CSSProperties
    : undefined;
  return (
    <section className="kanban-col" data-c={col.c} data-over={isOver || undefined}>
      <header className="kanban-col-head">
        <div className="kanban-col-label">{STATUS_LABEL[col.key]}</div>
        <div className="kanban-col-count">{tasks.length}</div>
      </header>
      <div ref={setNodeRef} className="kanban-col-body" style={bodyStyle}>
        {tasks.map((t) => (
          <DraggableCard
            key={t.id}
            task={t}
            onSelect={onSelect}
            expanded={expandedIds.has(t.id)}
            onToggleExpand={onToggleExpand}
            callbacks={callbacks}
          />
        ))}
        <button className="kanban-add" onClick={() => onAdd(col.key)} style={addStyle}>
          <Plus size={12} /> Add a goal
        </button>
      </div>
    </section>
  );
}

export function GoalsBoard({
  tasks, visibleStatuses, onSelect, onAdd, onMove,
  onToggleGoDone, onAddGo, onAddStep, onEditStep,
  onAddRoutine, onToggleRoutineDone, onSkipRoutine, onUnlinkRoutine,
}: Props) {
  // When the user picks specific statuses in the filter bar, render only
  // those columns and stretch them across the row (1-up, 2-up, 3-up, …).
  const visibleColumns = useMemo(
    () => (visibleStatuses && visibleStatuses.size > 0
      ? COLUMNS.filter((c) => visibleStatuses.has(c.key))
      : COLUMNS),
    [visibleStatuses],
  );
  // The board is allotted 4 horizontal "card slots". Spread them across the
  // visible columns: 1 col → 4-wide grid of cards, 2 cols → 2 each, etc.
  const cardsPerRow = Math.max(1, Math.floor(4 / visibleColumns.length));
  const byStatus = useMemo(() => {
    const out: Record<TaskStatus, Task[]> = { backlog: [], active: [], paused: [], done: [] };
    for (const t of tasks) out[t.status].push(t);
    return out;
  }, [tasks]);

  const [activeId, setActiveId] = useState<string | null>(null);
  const activeTask = activeId ? tasks.find((t) => t.id === activeId) ?? null : null;

  // Per-card expanded state. Persists in localStorage so toggling a goal's
  // children survives a page reload.
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem('jarvnote:goals:kanbanExpanded');
      return raw ? new Set(raw.split(',').filter(Boolean)) : new Set();
    } catch { return new Set(); }
  });
  const onToggleExpand = (id: string) => setExpandedIds((p) => {
    const n = new Set(p);
    if (n.has(id)) n.delete(id); else n.add(id);
    try { localStorage.setItem('jarvnote:goals:kanbanExpanded', Array.from(n).join(',')); } catch {}
    return n;
  });

  // 6px activation distance keeps clicks click-y; only meaningful movement
  // starts a drag. Cards are also clickable to open detail.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const onDragStart = (e: DragStartEvent) => setActiveId(String(e.active.id));
  const onDragEnd = (e: DragEndEvent) => {
    setActiveId(null);
    if (!e.over) return;
    const taskId = String(e.active.id);
    const newStatus = String(e.over.id) as TaskStatus;
    const task = tasks.find((t) => t.id === taskId);
    if (!task || task.status === newStatus) return;
    void onMove(taskId, newStatus);
  };

  const callbacks: CardCallbacks = useMemo(() => ({
    onToggleGoDone,
    onAddGo,
    onAddStep,
    onEditStep,
    onAddRoutine,
    onToggleRoutineDone,
    onSkipRoutine,
    onUnlinkRoutine,
  }), [onToggleGoDone, onAddGo, onAddStep, onEditStep, onAddRoutine, onToggleRoutineDone, onSkipRoutine, onUnlinkRoutine]);

  return (
    <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
      <div
        className="kanban"
        style={{ gridTemplateColumns: `repeat(${visibleColumns.length}, minmax(0, 1fr))` }}
      >
        {visibleColumns.map((col) => (
          <DroppableColumn
            key={col.key}
            col={col}
            tasks={byStatus[col.key]}
            cardsPerRow={cardsPerRow}
            onSelect={onSelect}
            onAdd={onAdd}
            expandedIds={expandedIds}
            onToggleExpand={onToggleExpand}
            callbacks={callbacks}
          />
        ))}
      </div>
      <DragOverlay dropAnimation={null}>
        {activeTask ? (
          <article
            className="kc"
            style={{
              cursor: 'grabbing',
              boxShadow: 'var(--sh-popover)',
              ['--gc' as any]: activeTask.color || accentFor(activeTask.id),
            }}
          >
            <GoalCardContent task={activeTask} />
          </article>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
