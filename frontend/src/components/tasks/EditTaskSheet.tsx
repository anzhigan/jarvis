import { useState } from 'react';
import type { Task, TaskPriority } from '../../api/types';
import { ENTITY_COLORS } from '../../lib/colors';
import { useT } from '../../store/i18n';
import CreateSheet, { FormField } from '../CreateSheet';

export default function EditTaskSheet({ task, onClose, onSaved }: {
  task: Task;
  onClose: () => void;
  onSaved: (data: Partial<Task>) => Promise<void>;
}) {
  const t = useT();
  const [editTitle, setEditTitle] = useState(task.title);
  const [editPriority, setEditPriority] = useState<TaskPriority>(task.priority);
  const [editStart, setEditStart] = useState(task.start_date ?? '');
  const [editDue, setEditDue] = useState(task.due_date ?? '');
  const [editDescription, setEditDescription] = useState(task.description ?? '');
  const [editColor, setEditColor] = useState(task.color ?? ENTITY_COLORS[0]);

  const canSave = editTitle.trim().length > 0;

  const handleSave = async () => {
    await onSaved({
      title: editTitle.trim(),
      priority: editPriority,
      start_date: editStart || null,
      due_date: editDue || null,
      description: editDescription,
      color: editColor,
    });
  };

  return (
    <CreateSheet
      open
      onClose={onClose}
      title={t('tasks.editGoal')}
      primaryLabel={t('common.save') || 'Save'}
      canSubmit={canSave}
      onSubmit={handleSave}
    >
      <FormField label="Title">
        <input type="text" className="input w-full" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
      </FormField>
      <FormField label="Priority">
        <select value={editPriority} onChange={(e) => setEditPriority(e.target.value as TaskPriority)} className="select-base w-full">
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
        </select>
      </FormField>
      <FormField label="Color">
        <div className="flex gap-2 flex-wrap" style={{ padding: '2px 0' }}>
          {ENTITY_COLORS.map((c) => (
            <button key={c} type="button" onClick={(e) => { e.preventDefault(); setEditColor(c); }}
              className="w-9 h-9 rounded-full transition-all active:scale-90"
              style={{ backgroundColor: c, boxShadow: editColor === c ? `0 0 0 2px var(--bg-card), 0 0 0 3.5px ${c}` : 'none' }} />
          ))}
        </div>
      </FormField>
      <div style={{ display: 'flex', gap: 10 }}>
        <FormField label={t('tasks.start') || 'Start'}>
          <input type="date" className="input w-full" value={editStart} onChange={(e) => setEditStart(e.target.value)} />
        </FormField>
        <FormField label={t('tasks.due') || 'Due'}>
          <input type="date" className="input w-full" value={editDue} onChange={(e) => setEditDue(e.target.value)} />
        </FormField>
      </div>
      <FormField label="Description">
        <textarea className="textarea w-full" value={editDescription} onChange={(e) => setEditDescription(e.target.value)} placeholder="Notes, context, details…" rows={3} />
      </FormField>
    </CreateSheet>
  );
}
