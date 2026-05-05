import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Calendar, Trash2, CheckCircle2, Pause, ListTodo, Edit3 } from 'lucide-react';
import type { Task, TaskStatus } from '../../../api/types';
import { Context, ContextItem, ContextSeparator, Tag } from '../../ui';
import { PriorityStars } from './PriorityStars';

interface Props {
  task: Task;
  onClick: () => void;
  isOverlay?: boolean;
  onChangeStatus?: (s: TaskStatus) => void;
  onDelete?: () => void;
}

function formatDue(d: string | null) {
  if (!d) return null;
  const date = new Date(d);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diff = Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  const overdue = diff < 0;
  const soon = diff >= 0 && diff <= 2;
  let label: string;
  if (diff === 0) label = 'Today';
  else if (diff === 1) label = 'Tomorrow';
  else if (diff === -1) label = 'Yesterday';
  else if (overdue) label = `${Math.abs(diff)}d overdue`;
  else if (diff < 7) label = `${diff}d`;
  else label = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  return { label, overdue, soon };
}

export function GoalCard({ task, onClick, isOverlay, onChangeStatus, onDelete }: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    data: { type: 'task', task },
  });

  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition,
  };

  const due = formatDue(task.due_date);

  const card = (
    <div
      ref={setNodeRef}
      style={style}
      className={`kb-card ${isOverlay ? 'kb-card-overlay' : ''}`}
      data-dragging={isDragging || undefined}
      onClick={(e) => {
        if (e.defaultPrevented) return;
        onClick();
      }}
      {...attributes}
      {...listeners}
    >
      {task.color && <span className="kb-card-color" style={{ background: task.color }} />}
      <div className="kb-card-title">{task.title}</div>
      {task.description && <div className="kb-card-desc">{task.description}</div>}

      {(task.tags?.length || 0) > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {task.tags!.slice(0, 4).map((tg) => (
            <Tag key={tg.id} color={tg.color}>{tg.name}</Tag>
          ))}
        </div>
      )}

      {(task.progress > 0 && task.progress < 100) ? (
        <div className="kb-card-progress" aria-label={`Progress ${Math.round(task.progress)}%`}>
          <div className="kb-card-progress-fill" style={{ width: `${Math.min(100, task.progress)}%` }} />
        </div>
      ) : null}

      <div className="kb-card-meta">
        <PriorityStars priority={task.priority} readOnly />
        {due && (
          <span className="kb-card-due" data-overdue={due.overdue || undefined} data-soon={due.soon || undefined}>
            <Calendar size={11} /> {due.label}
          </span>
        )}
      </div>
    </div>
  );

  if (isOverlay || (!onChangeStatus && !onDelete)) return card;

  return (
    <Context trigger={card}>
      <ContextItem icon={<Edit3 size={12} />} onSelect={onClick}>Open details</ContextItem>
      <ContextSeparator />
      <ContextItem icon={<ListTodo size={12} />} onSelect={() => onChangeStatus?.('backlog')}>Move to Backlog</ContextItem>
      <ContextItem icon={<ListTodo size={12} />} onSelect={() => onChangeStatus?.('active')}>Move to Active</ContextItem>
      <ContextItem icon={<Pause size={12} />} onSelect={() => onChangeStatus?.('paused')}>Move to On hold</ContextItem>
      <ContextItem icon={<CheckCircle2 size={12} />} onSelect={() => onChangeStatus?.('done')}>Mark Done</ContextItem>
      <ContextSeparator />
      <ContextItem icon={<Trash2 size={12} />} tone="danger" onSelect={onDelete}>Delete goal</ContextItem>
    </Context>
  );
}
