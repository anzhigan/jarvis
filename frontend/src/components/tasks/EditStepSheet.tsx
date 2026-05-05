import { useState } from 'react';
import { stepsApi } from '../../api/client';
import type { Step, Task } from '../../api/types';
import { ENTITY_COLORS } from '../../lib/colors';
import { useT } from '../../store/i18n';
import CreateSheet, { FormField } from '../CreateSheet';

export default function EditStepSheet({ step, tasks, onClose, onSaved }: { step: Step; tasks?: Task[]; onClose: () => void; onSaved: () => Promise<void> }) {
  const t = useT();
  const [title, setTitle] = useState(step.title);
  const [startDate, setStartDate] = useState(step.start_date);
  const [endDate, setEndDate] = useState(step.end_date);
  const [description, setDescription] = useState(step.description ?? '');
  const [color, setColor] = useState(step.color);
  const [selectedTaskId, setSelectedTaskId] = useState(step.task_id ?? '');
  const [goAttachIds, setGoAttachIds] = useState<Set<string>>(
    new Set(step.gos.map((g) => g.id))
  );

  const canSave = title.trim().length > 0;

  const taskForGos = tasks?.find((tk) => tk.id === (selectedTaskId || (step.task_id ?? '')));
  const allTaskGos = taskForGos?.gos ?? step.gos;

  const toggleGoAttach = (goId: string) => {
    setGoAttachIds((prev) => {
      const next = new Set(prev);
      if (next.has(goId)) next.delete(goId); else next.add(goId);
      return next;
    });
  };

  const handleSave = async () => {
    const payload: Parameters<typeof stepsApi.update>[1] = {
      title: title.trim(),
      start_date: startDate,
      end_date: endDate,
      description,
      color,
    };
    if (selectedTaskId !== (step.task_id ?? '')) {
      payload.task_id = selectedTaskId || null;
    }
    await stepsApi.update(step.id, payload);
    const originalIds = new Set(step.gos.map((g) => g.id));
    await Promise.all([
      ...[...originalIds].filter((id) => !goAttachIds.has(id)).map((id) => stepsApi.detachGo(step.id, id)),
      ...[...goAttachIds].filter((id) => !originalIds.has(id)).map((id) => stepsApi.attachGo(step.id, id)),
    ]);
    await onSaved();
  };

  return (
    <CreateSheet
      open
      onClose={onClose}
      title={t('tasks.editStep')}
      primaryLabel={t('common.save') || 'Save'}
      canSubmit={canSave}
      onSubmit={handleSave}
    >
      <FormField label="Goal">
        {tasks && tasks.length > 0 ? (
          <select value={selectedTaskId} onChange={(e) => setSelectedTaskId(e.target.value)} className="select-base w-full">
            <option value="">— Standalone —</option>
            {tasks.map((tk) => <option key={tk.id} value={tk.id}>{tk.title}</option>)}
          </select>
        ) : (
          <div className="input" style={{ color: 'var(--fg-muted)' }}>{step.task_title ?? '—'}</div>
        )}
      </FormField>
      <FormField label="Title">
        <input
          type="text"
          className="input w-full"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Step title"
        />
      </FormField>
      <div className="form-row-2col">
        <FormField label="Start date">
          <input type="date" className="input w-full" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </FormField>
        <FormField label="End date">
          <input type="date" className="input w-full" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </FormField>
      </div>
      <FormField label="Color">
        <div className="flex gap-2 flex-wrap" style={{ padding: '2px 0' }}>
          {ENTITY_COLORS.map((c) => (
            <button key={c} type="button" onClick={() => setColor(c)}
              className="w-9 h-9 rounded-full transition-all active:scale-90"
              style={{ backgroundColor: c, boxShadow: color === c ? `0 0 0 2px var(--bg-card), 0 0 0 3.5px ${c}` : 'none' }} />
          ))}
        </div>
      </FormField>
      <FormField label="Description">
        <textarea
          className="textarea w-full"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={t('tasks.descriptionPh')}
          rows={3}
        />
      </FormField>
      {allTaskGos.length > 0 && (
        <FormField label="Go items">
          <div style={{ borderRadius: 'var(--r-control)', boxShadow: '0 0 0 0.5px var(--line)' }}>
            {allTaskGos.map((g) => {
              const checked = goAttachIds.has(g.id);
              return (
                <label key={g.id} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '10px 12px', cursor: 'pointer',
                  boxShadow: 'inset 0 0.5px 0 var(--line-faint)',
                  background: checked ? 'color-mix(in srgb, var(--success) 6%, transparent)' : 'transparent',
                }}>
                  <input type="checkbox" checked={checked} onChange={() => toggleGoAttach(g.id)}
                    style={{ width: 16, height: 16, accentColor: 'var(--success)', flexShrink: 0 }} />
                  <span style={{ fontSize: 13, flex: 1, color: checked ? 'var(--fg-primary)' : 'var(--fg-secondary)', textDecoration: checked ? 'none' : undefined }}>
                    {g.title}
                  </span>
                  {g.sprint_id && g.sprint_id !== step.id && (
                    <span style={{ fontSize: 10, color: 'var(--fg-muted)' }}>other step</span>
                  )}
                </label>
              );
            })}
          </div>
        </FormField>
      )}
    </CreateSheet>
  );
}
