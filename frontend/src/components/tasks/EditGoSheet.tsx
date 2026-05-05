import { useState } from 'react';
import { gosApi } from '../../api/client';
import type { Go, Sprint } from '../../api/types';
import { ENTITY_COLORS } from '../../lib/colors';
import { useT } from '../../store/i18n';
import CreateSheet, { FormField } from '../CreateSheet';

export default function EditGoSheet({ go, availableSprints, onClose, onSaved }: {
  go: Go;
  availableSprints?: Sprint[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const t = useT();
  const [editTitle, setEditTitle] = useState(go.title);
  const [editDescription, setEditDescription] = useState(go.description ?? '');
  const [editSprintId, setEditSprintId] = useState<string>(go.sprint_id ?? '');
  const [editStart, setEditStart] = useState(go.start_date ?? '');
  const [editDue, setEditDue] = useState(go.due_date ?? '');
  const [editColor, setEditColor] = useState(go.color);

  const canSave = editTitle.trim().length > 0;

  const handleSave = async () => {
    await gosApi.update(go.id, {
      title: editTitle.trim() || go.title,
      description: editDescription,
      sprint_id: editSprintId || null,
      start_date: editStart || null,
      due_date: editDue || null,
      color: editColor,
    });
    await onSaved();
  };

  return (
    <CreateSheet
      open
      onClose={onClose}
      title={t('tasks.editGo')}
      primaryLabel={t('common.save') || 'Save'}
      canSubmit={canSave}
      onSubmit={handleSave}
    >
      <FormField label="Title">
        <input type="text" className="input w-full" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
      </FormField>
      <FormField label="Description">
        <textarea className="textarea w-full" value={editDescription} onChange={(e) => setEditDescription(e.target.value)} placeholder={t('tasks.descriptionPh')} rows={3} />
      </FormField>
      {availableSprints && availableSprints.length > 0 && (
        <FormField label="Attach to step">
          <select value={editSprintId} onChange={(e) => setEditSprintId(e.target.value)} className="select-base w-full">
            <option value="">— No step —</option>
            {availableSprints.map((s) => <option key={s.id} value={s.id}>↳ {s.title}</option>)}
          </select>
        </FormField>
      )}
      {go.recurrence === 'none' && (
        <div className="form-row-2col">
          <FormField label="Start date">
            <input type="date" className="input w-full" value={editStart} onChange={(e) => setEditStart(e.target.value)} />
          </FormField>
          <FormField label="Due date">
            <input type="date" className="input w-full" value={editDue} onChange={(e) => setEditDue(e.target.value)} />
          </FormField>
        </div>
      )}
      <FormField label="Color">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: '4px 0' }}>
          {ENTITY_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={(e) => { e.preventDefault(); setEditColor(c); }}
              className="w-9 h-9 rounded-full transition-all active:scale-90"
              style={{ backgroundColor: c, boxShadow: editColor === c ? `0 0 0 2px var(--bg-card), 0 0 0 3.5px ${c}` : 'none' }}
            />
          ))}
        </div>
      </FormField>
    </CreateSheet>
  );
}
