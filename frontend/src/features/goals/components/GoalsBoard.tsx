import { useMemo, useState } from 'react';
import { Plus, Flag, Box } from 'lucide-react';
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

const COLUMNS: { key: TaskStatus; title: string }[] = [
  { key: 'backlog', title: 'Backlog' },
  { key: 'active',  title: 'Active' },
  { key: 'paused',  title: 'Paused' },
  { key: 'done',    title: 'Done' },
];

const PRIORITY_TONE: Record<TaskPriority, 'high' | 'med' | 'low'> = {
  high: 'high', medium: 'med', low: 'low',
};

function shortId(id: string): string {
  return `JV-${id.slice(0, 4).toUpperCase()}`;
}

function dueLabel(due: string | null): { text: string; tone?: 'overdue' | 'due-soon' } | null {
  if (!due) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const d = new Date(due); d.setHours(0, 0, 0, 0);
  const days = Math.round((d.getTime() - today.getTime()) / 86400_000);
  if (days < 0)   return { text: `${-days}d late`, tone: 'overdue' };
  if (days === 0) return { text: 'Today',          tone: 'due-soon' };
  if (days === 1) return { text: 'Tomorrow',       tone: 'due-soon' };
  if (days < 7)   return { text: `${days}d`,        tone: 'due-soon' };
  return { text: d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) };
}

/** Visual content of a goal card — pure, doesn't know about DnD. */
function GoalCardContent({ task }: { task: Task }) {
  const due = dueLabel(task.due_date);
  const tone = PRIORITY_TONE[task.priority];
  const childrenLabel = `${task.gos.filter((g) => g.is_done_today).length} / ${task.gos.length} Go`;
  const primaryTag = task.tags[0];
  return (
    <>
      <div className="kc-row1">
        <span className="kc-id">{shortId(task.id)}</span>
        <span className={`kc-pri ${tone}`}><Flag /></span>
        <span className="kc-spacer" />
        {due && <span className={`kc-due${due.tone ? ` ${due.tone}` : ''}`}>{due.text}</span>}
      </div>
      <div className={`kc-title${task.status === 'done' ? ' kc-title-done' : ''}`}>{task.title}</div>
      {(primaryTag || task.gos.length > 0) && (
        <div className="kc-meta">
          {primaryTag && (
            <span
              className="kc-tag"
              style={{ background: `${primaryTag.color}1A`, color: primaryTag.color }}
            >
              {primaryTag.name}
            </span>
          )}
          {task.gos.length > 0 && (
            <span className="kc-children"><Box />{childrenLabel}</span>
          )}
        </div>
      )}
    </>
  );
}

function DraggableGoalCard({ task, onSelect }: { task: Task; onSelect: (id: string) => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: task.id });
  return (
    <div
      ref={setNodeRef}
      className="kc"
      {...attributes}
      {...listeners}
      role="button"
      tabIndex={0}
      data-done={task.status === 'done' || undefined}
      data-dragging={isDragging || undefined}
      style={{ opacity: isDragging ? 0.4 : 1 }}
      onClick={() => onSelect(task.id)}
      onKeyDown={(e) => { if (e.key === 'Enter') onSelect(task.id); }}
    >
      <GoalCardContent task={task} />
    </div>
  );
}

function DroppableColumn({
  status, title, tasks, onAdd, onSelect,
}: {
  status: TaskStatus; title: string; tasks: Task[];
  onAdd: (status: TaskStatus) => void; onSelect: (id: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  return (
    <div className="col" data-status={status} data-over={isOver || undefined}>
      <div className="col-head">
        <span className="dot" />
        <span className="col-title">{title}</span>
        <span className="col-count">{tasks.length}</span>
        <button className="col-add" onClick={() => onAdd(status)} aria-label={`Add to ${title}`}>
          <Plus />
        </button>
      </div>
      <div ref={setNodeRef} className="col-body">
        {tasks.map((task) => (
          <DraggableGoalCard key={task.id} task={task} onSelect={onSelect} />
        ))}
        <button className="col-add-card" onClick={() => onAdd(status)}>
          <Plus /> Add goal
        </button>
      </div>
    </div>
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

  // Tiny activation distance — clicks still register as clicks; only meaningful
  // movement starts a drag. Critical because cards are also clickable to open detail.
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
      <div className="board">
        {COLUMNS.map(({ key, title }) => (
          <DroppableColumn
            key={key}
            status={key}
            title={title}
            tasks={byStatus[key]}
            onAdd={onAdd}
            onSelect={onSelect}
          />
        ))}
      </div>
      <DragOverlay dropAnimation={null}>
        {activeTask ? (
          <div className="kc" style={{ cursor: 'grabbing', boxShadow: 'var(--sh-popover)' }}>
            <GoalCardContent task={activeTask} />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
