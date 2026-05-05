import { useEffect, useState } from 'react';
import { X, Trash2, Save } from 'lucide-react';
import { Button, IconButton, Input, Textarea, Tag } from '../../ui';
import { ENTITY_COLORS } from '../../../lib/colors';
import type { Task, TaskPriority, TaskStatus } from '../../../api/types';
import { PriorityStars } from './PriorityStars';

interface Props {
  task: Task;
  onClose: () => void;
  onSave: (id: string, data: Partial<Task>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

const STATUSES: { key: TaskStatus; label: string }[] = [
  { key: 'backlog', label: 'Backlog' },
  { key: 'active',  label: 'Active' },
  { key: 'paused',  label: 'Paused' },
  { key: 'done',    label: 'Done' },
];

export function GoalDetailPanel({ task, onClose, onSave, onDelete }: Props) {
  const [title, setTitle] = useState(task.title);
  const [desc, setDesc] = useState(task.description ?? '');
  const [priority, setPriority] = useState<TaskPriority>(task.priority);
  const [status, setStatus] = useState<TaskStatus>(task.status);
  const [due, setDue] = useState(task.due_date ?? '');
  const [start, setStart] = useState(task.start_date ?? '');
  const [color, setColor] = useState(task.color || ENTITY_COLORS[0]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setTitle(task.title);
    setDesc(task.description ?? '');
    setPriority(task.priority);
    setStatus(task.status);
    setDue(task.due_date ?? '');
    setStart(task.start_date ?? '');
    setColor(task.color || ENTITY_COLORS[0]);
  }, [task.id]);

  const dirty =
    title !== task.title ||
    desc !== (task.description ?? '') ||
    priority !== task.priority ||
    status !== task.status ||
    (due || null) !== task.due_date ||
    (start || null) !== task.start_date ||
    color !== task.color;

  const save = async () => {
    if (!dirty || !title.trim()) return;
    setBusy(true);
    try {
      await onSave(task.id, {
        title: title.trim(),
        description: desc,
        priority,
        status,
        due_date: due || null,
        start_date: start || null,
        color,
      });
    } finally { setBusy(false); }
  };

  const remove = async () => {
    if (!confirm(`Delete "${task.title}"?`)) return;
    setBusy(true);
    try {
      await onDelete(task.id);
      onClose();
    } finally { setBusy(false); }
  };

  return (
    <aside className="dt-side" aria-label="Goal details">
      <header className="dt-side-head">
        <div className="dt-side-title">{task.title}</div>
        <IconButton onClick={onClose} aria-label="Close">
          <X size={14} />
        </IconButton>
      </header>

      <div className="dt-side-body">
        <div className="dt-field">
          <label className="dt-field-label">Title</label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} inputSize="lg" />
        </div>

        <div className="dt-field">
          <label className="dt-field-label">Status</label>
          <div className="dt-field-row">
            {STATUSES.map((s) => (
              <button
                key={s.key}
                type="button"
                className="ui-chip"
                data-active={status === s.key || undefined}
                onClick={() => setStatus(s.key)}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <div className="dt-field">
          <label className="dt-field-label">Priority</label>
          <div className="dt-field-row">
            <PriorityStars priority={priority} onChange={setPriority} size={18} />
            <span className="text-[var(--fg-tertiary)] text-sm capitalize">{priority}</span>
          </div>
        </div>

        <div className="dt-field">
          <label className="dt-field-label">Description</label>
          <Textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={4} />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="dt-field">
            <label className="dt-field-label">Start</label>
            <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
          </div>
          <div className="dt-field">
            <label className="dt-field-label">Due</label>
            <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
          </div>
        </div>

        <div className="dt-field">
          <label className="dt-field-label">Color</label>
          <div className="dt-field-row">
            {ENTITY_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                className="dt-color-dot"
                style={{ background: c }}
                data-active={color === c || undefined}
                onClick={() => setColor(c)}
                aria-label={`Color ${c}`}
              />
            ))}
          </div>
        </div>

        {(task.tags?.length || 0) > 0 && (
          <div className="dt-field">
            <label className="dt-field-label">Tags</label>
            <div className="dt-field-row">
              {task.tags!.map((tg) => (
                <Tag key={tg.id} color={tg.color}>{tg.name}</Tag>
              ))}
            </div>
          </div>
        )}

        {task.progress > 0 && (
          <div className="dt-field">
            <label className="dt-field-label">Progress · {Math.round(task.progress)}%</label>
            <div className="kb-card-progress">
              <div className="kb-card-progress-fill" style={{ width: `${Math.min(100, task.progress)}%` }} />
            </div>
          </div>
        )}
      </div>

      <footer className="dt-side-foot">
        <Button variant="ghost" onClick={remove} disabled={busy}>
          <Trash2 size={14} className="mr-1" /> Delete
        </Button>
        <span className="flex-1" />
        <Button variant="primary" onClick={save} disabled={!dirty || !title.trim() || busy}>
          <Save size={14} className="mr-1" /> {busy ? 'Saving…' : 'Save'}
        </Button>
      </footer>
    </aside>
  );
}
