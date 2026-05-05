import { useEffect, useState } from 'react';
import { sprintsApi } from '../../api/client';
import type { Go, Task } from '../../api/types';
import { ENTITY_COLORS } from '../../lib/colors';
import { useT } from '../../store/i18n';
import CreateSheet, { FormField } from '../CreateSheet';
import { formatDate, todayIso } from './helpers';

export default function CreateSprintForm({
  open, taskId, tasks, availableGos, onCreate, onCancel,
}: {
  open: boolean;
  taskId?: string;
  tasks?: Task[];
  availableGos?: Go[];
  onCreate: () => Promise<void>;
  onCancel: () => void;
}) {
  const t = useT();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [start, setStart] = useState(todayIso);
  const [end, setEnd] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() + 14);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });
  const [color, setColor] = useState(ENTITY_COLORS[1]);
  const [toAttach, setToAttach] = useState<Set<string>>(new Set());
  const [selectedTaskId, setSelectedTaskId] = useState<string>(taskId ?? '');

  useEffect(() => {
    if (!open) { setTitle(''); setDescription(''); setColor(ENTITY_COLORS[1]); setToAttach(new Set()); setSelectedTaskId(taskId ?? ''); }
  }, [open, taskId]);

  const toggleAttach = (id: string) => {
    setToAttach((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  };

  const effectiveTaskId = tasks ? selectedTaskId : (taskId ?? '');
  const effectiveGos = tasks
    ? ((tasks.find((tk) => tk.id === selectedTaskId)?.gos ?? []).filter((g) => !g.sprint_id))
    : (availableGos ?? []);

  const handleSubmit = async () => {
    if (!effectiveTaskId) throw new Error('Please select a goal first');
    const sprint = await sprintsApi.create({ task_id: effectiveTaskId, title: title.trim(), description, start_date: start, end_date: end, color });
    for (const goId of toAttach) await sprintsApi.attachGo(sprint.id, goId);
    onCancel();
    await onCreate();
  };

  return (
    <CreateSheet
      open={open}
      onClose={onCancel}
      title="Add step"
      primaryLabel="Add step"
      canSubmit={!!title.trim() && !!start && !!end && (tasks ? !!selectedTaskId : true)}
      onSubmit={handleSubmit}
    >
      {tasks && (
        <FormField label="Goal">
          <select value={selectedTaskId} onChange={(e) => { setSelectedTaskId(e.target.value); setToAttach(new Set()); }} className="select-base">
            <option value="">{t('sprint.pickTask')}</option>
            {tasks.map((tk) => (<option key={tk.id} value={tk.id}>{tk.title}</option>))}
          </select>
        </FormField>
      )}
      <FormField label="Title">
        <input type="text" className="input w-full" value={title}
          onChange={(e) => setTitle(e.target.value)} placeholder={t('sprint.titlePh')} />
      </FormField>
      <FormField label="Description">
        <textarea className="textarea w-full" value={description}
          onChange={(e) => setDescription(e.target.value)} placeholder={t('sprint.notesPh')} rows={2} />
      </FormField>
      <div className="form-row-2col">
        <FormField label={t('tasks.start')}>
          <input type="date" className="input w-full" value={start} onChange={(e) => setStart(e.target.value)} />
        </FormField>
        <FormField label={t('sprint.end')}>
          <input type="date" className="input w-full" value={end} onChange={(e) => setEnd(e.target.value)} />
        </FormField>
      </div>
      {(effectiveGos.length > 0 || (tasks ? !!selectedTaskId : !!taskId)) && (
        <FormField label="Attach go items">
          {effectiveGos.length > 0 ? (
            <div className="max-h-40 overflow-y-auto" style={{ borderRadius: 'var(--r-control)', boxShadow: '0 0 0 0.5px var(--line)' }}>
              {effectiveGos.map((g) => (
                <label key={g.id} className="flex items-center gap-2 p-1.5 text-xs cursor-pointer hover:bg-secondary">
                  <input type="checkbox" checked={toAttach.has(g.id)} onChange={() => toggleAttach(g.id)} />
                  <span className="truncate flex-1">{g.title}</span>
                  {g.due_date && <span style={{ color: 'var(--fg-muted)' }}>{formatDate(g.due_date)}</span>}
                </label>
              ))}
            </div>
          ) : (
            <div style={{ color: 'var(--fg-muted)', fontSize: 12, padding: '6px 0' }}>No unattached Go items for this goal.</div>
          )}
        </FormField>
      )}
      <FormField label="Color">
        <div className="flex gap-2 flex-wrap" style={{ padding: '2px 0' }}>
          {ENTITY_COLORS.map((c) => (
            <button key={c} type="button" onClick={(e) => { e.preventDefault(); setColor(c); }}
              className="w-9 h-9 rounded-full transition-all active:scale-90"
              style={{ backgroundColor: c, boxShadow: color === c ? `0 0 0 2px var(--bg-card), 0 0 0 3.5px ${c}` : 'none' }} />
          ))}
        </div>
      </FormField>
    </CreateSheet>
  );
}
