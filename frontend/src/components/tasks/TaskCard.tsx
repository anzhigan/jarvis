import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Calendar, ChevronDown, ChevronRight, Pencil, Repeat, X, Zap } from 'lucide-react';
import type { Task, TaskStatus } from '../../api/types';
import { useT } from '../../store/i18n';
import SwipeRow from '../SwipeRow';
import TagSelector from '../TagSelector';
import EditTaskSheet from './EditTaskSheet';
import GoalLinkedRoutines from './GoalLinkedRoutines';
import PriorityStars from './PriorityStars';
import TaskExpanded from './TaskExpanded';
import { formatDate } from './helpers';

const STATUSES: { key: TaskStatus; labelKey: string }[] = [
  { key: 'backlog', labelKey: 'tasks.status.backlog' },
  { key: 'active', labelKey: 'tasks.status.active' },
  { key: 'paused', labelKey: 'tasks.status.paused' },
  { key: 'done', labelKey: 'tasks.status.done' },
];

export default function TaskCard({
  task, onUpdate, onDelete, onReload, onDragStart, onDragEnd, isDragging, isMobile,
}: {
  task: Task;
  onUpdate: (data: Partial<Task>) => Promise<void>;
  onDelete: () => Promise<void>;
  onReload: () => Promise<void>;
  onDragStart: () => void;
  onDragEnd: () => void;
  isDragging: boolean;
  isMobile: boolean;
}) {
  const t = useT();
  const [expanded, setExpanded] = useState(false);
  const [showLinked, setShowLinked] = useState(false);
  const [editing, setEditing] = useState(false);

  const isOverdue = task.status !== 'done' && task.due_date &&
    new Date(task.due_date) < new Date(new Date().setHours(0, 0, 0, 0));

  const startEdit = () => setEditing(true);

  const periodLabel = task.start_date && task.due_date
    ? `${formatDate(task.start_date)} – ${formatDate(task.due_date)}`
    : formatDate(task.due_date);

  const hasContent = task.sprints.length > 0 || task.gos.length > 0;

  const cardBody = (
    <>
      <div style={{ padding: '12px 13px' }}>
            <div className="flex items-start gap-2" style={{ marginBottom: 6 }}>
              <h4 className="goal-card-title" style={{ margin: 0, flex: 1 }}>{task.title}</h4>
              {!isMobile && (
                <div className="flex items-center gap-0.5">
                  <button onClick={(e) => { e.stopPropagation(); startEdit(); }} className="icon-btn icon-btn-sm">
                    <Pencil size={12} />
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); onDelete(); }} className="icon-btn icon-btn-sm" style={{ color: 'var(--danger)' }}>
                    <X size={13} />
                  </button>
                </div>
              )}
            </div>
            {task.description && task.description.trim() && (
              <p className="goal-card-meta" style={{ marginBottom: 6, whiteSpace: 'pre-wrap', lineHeight: 1.55 }}>{task.description}</p>
            )}

            <div style={{ marginBottom: 8 }}>
              <TagSelector targetId={task.id} targetKind="task" tags={task.tags ?? []} onChange={onReload} compact={!isMobile} />
            </div>

            {hasContent && (
              <div className="goal-card-progress" style={{ marginBottom: 8 }}>
                <div className="goal-card-bar">
                  <div className="goal-card-bar-fill" style={{ width: `${task.progress}%`, background: 'var(--accent-goals)' }} />
                </div>
                <span className="goal-card-pct">{task.progress}%</span>
              </div>
            )}

            <div className="goal-card-meta" style={{ marginTop: 0, justifyContent: 'space-between' }}>
              <div className="flex items-center gap-2" style={{ color: isOverdue ? 'var(--danger)' : 'var(--fg-muted)' }}>
                {periodLabel && <span className="flex items-center gap-1"><Calendar size={11} />{periodLabel}</span>}
                <PriorityStars priority={task.priority} size={10} />
              </div>
              <select value={task.status}
                onChange={(e) => onUpdate({ status: e.target.value as TaskStatus })}
                onClick={(e) => e.stopPropagation()}
                style={{ background: 'transparent', border: 0, color: 'var(--fg-muted)', fontSize: 10, cursor: 'pointer' }}>
                {STATUSES.map((s) => <option key={s.key} value={s.key}>{t(s.labelKey)}</option>)}
              </select>
            </div>
          </div>

          <button onClick={() => setExpanded(!expanded)} className="task-toggle-row" type="button">
            {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
            <Zap size={12} />
            <span>{t('tasks.sprintsAndGos')}</span>
            <span className="badge">{task.sprints.length + task.gos.length}</span>
          </button>

          <AnimatePresence initial={false}>
            {expanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <TaskExpanded task={task} onReload={onReload} />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Linked routines — separate collapsible section */}
          <button onClick={() => setShowLinked(!showLinked)} className="task-toggle-row" type="button">
            {showLinked ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
            <Repeat size={12} />
            <span>Linked routines</span>
          </button>

          <AnimatePresence initial={false}>
            {showLinked && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <GoalLinkedRoutines task={task} onReload={onReload} />
              </motion.div>
            )}
          </AnimatePresence>
    </>
  );

  const cls = `group goal-card overflow-hidden ${
    isDragging ? 'opacity-40 scale-[0.98]' : ''
  } ${isMobile ? '' : 'cursor-grab active:cursor-grabbing'}`;

  if (isMobile) {
    return (
      <>
        {editing && (
          <EditTaskSheet
            task={task}
            onClose={() => setEditing(false)}
            onSaved={async (data) => { await onUpdate(data); setEditing(false); }}
          />
        )}
        <motion.div layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }}>
          <SwipeRow onEdit={startEdit} onDelete={onDelete}>
            <div className={cls}>{cardBody}</div>
          </SwipeRow>
        </motion.div>
      </>
    );
  }

  return (
    <>
      {editing && (
        <EditTaskSheet
          task={task}
          onClose={() => setEditing(false)}
          onSaved={async (data) => { await onUpdate(data); setEditing(false); }}
        />
      )}
      <motion.div layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }}
        draggable
        onDragStart={(e) => {
          (e as unknown as DragEvent).dataTransfer?.setData('text/plain', task.id);
          onDragStart();
        }}
        onDragEnd={onDragEnd}
        className={cls}
      >
        {cardBody}
      </motion.div>
    </>
  );
}
