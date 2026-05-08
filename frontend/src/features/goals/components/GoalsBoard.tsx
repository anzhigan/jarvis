import { useMemo, useState } from 'react';
import { Check, ChevronRight, Plus, Repeat } from 'lucide-react';
import {
  DndContext, DragEndEvent, DragOverlay, DragStartEvent, PointerSensor,
  useDraggable, useDroppable, useSensor, useSensors,
} from '@dnd-kit/core';
import type { Task, TaskPriority, TaskStatus } from '../../../api/types';

interface Props {
  tasks: Task[];
  onSelect: (id: string) => void;
  onAdd: (status: TaskStatus) => void;
  onMove: (id: string, status: TaskStatus) => void | Promise<void>;
}

interface Column {
  key: TaskStatus;
  /** Maps to .kanban-col[data-c=…] coloured headline. */
  c?: 'moss' | 'ochre' | 'slate';
}

const COLUMNS: Column[] = [
  { key: 'backlog' },
  { key: 'active',  c: 'moss'  },
  { key: 'paused',  c: 'ochre' },
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

function GoalCardContent({
  task, expanded, onToggleExpand,
}: {
  task: Task;
  expanded?: boolean;
  onToggleExpand?: (e: React.MouseEvent | React.KeyboardEvent) => void;
}) {
  const pct = Math.round(task.progress ?? 0);
  const showProgress = task.status === 'active' || task.status === 'paused';
  const routinesCount = task.gos.length;
  const primaryTag = task.tags[0];
  const stepsTotal = task.sprints.length;
  const childTotal = stepsTotal + routinesCount;

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
      <h3 className="kc-title">{task.title}</h3>
      {task.description && <p className="kc-desc">{task.description}</p>}

      {showProgress && (
        <div className="kc-progress">
          <div className="kc-progress-bar"><div className="kc-progress-fill" style={{ width: `${pct}%` }} /></div>
          <span className="kc-progress-num">
            {pct}<span style={{ color: 'var(--ink-4)', fontWeight: 400 }}>%</span>
          </span>
        </div>
      )}

      {primaryTag && (
        <div className="kc-tags">
          <span className="kc-tag" style={{ color: primaryTag.color }}>{primaryTag.name}</span>
        </div>
      )}

      {(foot.length > 0 || childTotal > 0) && (
        <div className="kc-foot">
          {foot.map((node, i) => (
            <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              {i > 0 && <span style={{ color: 'var(--ink-5)' }}>·</span>}
              {node}
            </span>
          ))}
          {childTotal > 0 && onToggleExpand && (
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
              aria-label={expanded ? 'Hide steps and gos' : 'Show steps and gos'}
            >
              <ChevronRight />
              {childTotal} {childTotal === 1 ? 'item' : 'items'}
            </button>
          )}
        </div>
      )}

      {expanded && childTotal > 0 && (
        <div className="kc-children" onClick={(e) => e.stopPropagation()}>
          {task.sprints.map((s) => {
            const pct = Math.round(s.progress ?? 0);
            const today = new Date(); today.setHours(0, 0, 0, 0);
            const end = s.end_date ? new Date(s.end_date) : null;
            const start = s.start_date ? new Date(s.start_date) : null;
            const overdue = !s.is_completed && end && end < today;
            return (
              <div
                key={s.id}
                className="kc-child"
                data-kind="step"
                data-done={s.is_completed || undefined}
              >
                <div className="kc-child-row">
                  <span className="kc-child-pill">Step</span>
                  <span className="kc-child-name">{s.title}</span>
                  <span className="kc-child-pct" data-strong={s.is_completed || undefined}>{pct}%</span>
                </div>
                <div className="kc-child-bar">
                  <div className="kc-child-bar-fill" style={{ width: `${pct}%` }} />
                </div>
                {(start || end) && (
                  <div className="kc-child-meta">
                    {start && <time>{fmtDue(s.start_date)}</time>}
                    {start && end && <span className="sep">→</span>}
                    {end && (
                      <time className={overdue ? 'overdue' : undefined}>
                        {fmtDue(s.end_date)}
                        {overdue ? ' · overdue' : ''}
                      </time>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {task.gos.map((g) => {
            const today = new Date(); today.setHours(0, 0, 0, 0);
            const due = g.due_date ? new Date(g.due_date) : null;
            const overdue = due && !g.is_done_today && due < today;
            const valueLabel = g.kind === 'numeric' && g.target_value
              ? `${g.target_value}${g.unit ? ' ' + g.unit : ''}`
              : null;
            const meta: React.ReactNode[] = [];
            if (valueLabel) meta.push(<span key="v">target {valueLabel}</span>);
            if (due) {
              meta.push(
                <time key="due" className={overdue ? 'overdue' : undefined}>
                  due {fmtDue(g.due_date!)}
                  {overdue ? ' · overdue' : ''}
                </time>,
              );
            }
            return (
              <div
                key={g.id}
                className="kc-child"
                data-kind="go"
                data-done={g.is_done_today || undefined}
              >
                <div className="kc-child-row">
                  <span className="kc-child-pill">{g.kind === 'numeric' ? 'Numeric' : 'Go'}</span>
                  <span className="kc-child-name">{g.title}</span>
                  <span className="kc-child-check" aria-hidden>
                    {g.is_done_today && <Check />}
                  </span>
                </div>
                {meta.length > 0 && (
                  <div className="kc-child-meta">
                    {meta.map((node, i) => (
                      <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        {i > 0 && <span className="sep">·</span>}
                        {node}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

function DraggableCard({
  task, onSelect, expanded, onToggleExpand,
}: {
  task: Task;
  onSelect: (id: string) => void;
  expanded: boolean;
  onToggleExpand: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: task.id });
  const accent = accentFor(task.id);
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
      />
    </article>
  );
}

function DroppableColumn({
  col, tasks, onSelect, onAdd, expandedIds, onToggleExpand,
}: {
  col: Column;
  tasks: Task[];
  onSelect: (id: string) => void;
  onAdd: (status: TaskStatus) => void;
  expandedIds: Set<string>;
  onToggleExpand: (id: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: col.key });
  return (
    <section className="kanban-col" data-c={col.c} data-over={isOver || undefined}>
      <header className="kanban-col-head">
        <div className="kanban-col-label">{STATUS_LABEL[col.key]}</div>
        <div className="kanban-col-count">{tasks.length}</div>
      </header>
      <div ref={setNodeRef} className="kanban-col-body">
        {tasks.map((t) => (
          <DraggableCard
            key={t.id}
            task={t}
            onSelect={onSelect}
            expanded={expandedIds.has(t.id)}
            onToggleExpand={onToggleExpand}
          />
        ))}
        <button className="kanban-add" onClick={() => onAdd(col.key)}>
          <Plus size={12} /> Add a goal
        </button>
      </div>
    </section>
  );
}

export function GoalsBoard({ tasks, onSelect, onAdd, onMove }: Props) {
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

  return (
    <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
      <div className="kanban">
        {COLUMNS.map((col) => (
          <DroppableColumn
            key={col.key}
            col={col}
            tasks={byStatus[col.key]}
            onSelect={onSelect}
            onAdd={onAdd}
            expandedIds={expandedIds}
            onToggleExpand={onToggleExpand}
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
              ['--gc' as any]: accentFor(activeTask.id),
            }}
          >
            <GoalCardContent task={activeTask} />
          </article>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
