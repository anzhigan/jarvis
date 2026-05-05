import { useEffect, useState } from 'react';
import type { GoKind, GoRecurrence, Sprint, Task } from '../../api/types';
import { ENTITY_COLORS } from '../../lib/colors';
import { useT } from '../../store/i18n';
import CreateSheet, { FormField } from '../CreateSheet';

const GO_COLORS = ENTITY_COLORS;

export default function CreateGoForm({
  open, defaultTaskId, defaultSprintId, availableSprints, tasks, onCreate, onCancel,
}: {
  open: boolean;
  defaultTaskId?: string | null;
  defaultSprintId?: string | null;
  availableSprints?: Sprint[];
  tasks?: Task[];
  onCreate: (data: {
    title: string; description: string; kind: GoKind; unit: string; target_value: number | null;
    recurrence: GoRecurrence; start_date: string | null; due_date: string | null; color: string;
    task_id: string | null; sprint_id: string | null;
  }) => Promise<void>;
  onCancel: () => void;
}) {
  const t = useT();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [kind, setKind] = useState<GoKind>('boolean');
  const [unit, setUnit] = useState('');
  const [target, setTarget] = useState('');
  const [recurrence] = useState<GoRecurrence>('none');
  const [start, setStart] = useState('');
  const [due, setDue] = useState('');
  const [color, setColor] = useState(GO_COLORS[0]);
  const [sprintId, setSprintId] = useState<string>(defaultSprintId ?? '');
  const [selectedTaskId, setSelectedTaskId] = useState<string>(defaultTaskId ?? '');

  useEffect(() => {
    if (!open) {
      setTitle(''); setDescription(''); setKind('boolean');
      setUnit(''); setTarget(''); setStart(''); setDue(''); setColor(GO_COLORS[0]);
      setSprintId(defaultSprintId ?? ''); setSelectedTaskId(defaultTaskId ?? '');
    }
  }, [open, defaultSprintId, defaultTaskId]);

  const effectiveTaskId = tasks ? selectedTaskId : (defaultTaskId ?? null);
  const derivedSprints = tasks
    ? (tasks.find((tk) => tk.id === selectedTaskId)?.sprints ?? [])
    : (availableSprints ?? []);

  const handleSubmit = async () => {
    await onCreate({
      title: title.trim(), description: description.trim(), kind, unit: unit.trim(),
      target_value: target ? parseFloat(target) : null,
      recurrence, start_date: start || null, due_date: due || null, color,
      task_id: effectiveTaskId || null,
      sprint_id: sprintId || null,
    });
  };

  return (
    <CreateSheet
      open={open}
      onClose={onCancel}
      title="Add go"
      primaryLabel="Add go"
      canSubmit={!!title.trim()}
      onSubmit={handleSubmit}
    >
      {tasks && (
        <FormField label="Goal">
          <select value={selectedTaskId} onChange={(e) => { setSelectedTaskId(e.target.value); setSprintId(''); }} className="select-base">
            <option value="">{t('go.standalone')}</option>
            {tasks.map((tk) => (<option key={tk.id} value={tk.id}>{tk.title}</option>))}
          </select>
        </FormField>
      )}
      <FormField label="Title">
        <input type="text" className="input w-full" value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Go title (e.g. Solve 50 problems)" />
      </FormField>
      <FormField label="Description">
        <textarea className="textarea w-full" value={description}
          onChange={(e) => setDescription(e.target.value)} placeholder={t('tasks.descriptionPh')} rows={2} />
      </FormField>
      <FormField label="Type">
        <select value={kind} onChange={(e) => setKind(e.target.value as GoKind)} className="select-base">
          <option value="boolean">Done / Not done</option>
          <option value="numeric">Numeric</option>
        </select>
      </FormField>
      {kind === 'numeric' && (
        <div className="form-row-2col">
          <FormField label="Unit">
            <input type="text" className="input w-full" placeholder="pages" value={unit} onChange={(e) => setUnit(e.target.value)} />
          </FormField>
          <FormField label="Target">
            <input type="number" className="input w-full" placeholder="0" value={target} onChange={(e) => setTarget(e.target.value)} />
          </FormField>
        </div>
      )}
      <div className="form-row-2col">
        <FormField label="Start date">
          <input type="date" className="input w-full" value={start} onChange={(e) => setStart(e.target.value)} />
        </FormField>
        <FormField label="Due date">
          <input type="date" className="input w-full" value={due} onChange={(e) => setDue(e.target.value)} />
        </FormField>
      </div>
      {derivedSprints.length > 0 && !defaultSprintId && (
        <FormField label="Sprint">
          <select value={sprintId} onChange={(e) => setSprintId(e.target.value)} className="select-base">
            <option value="">No sprint</option>
            {derivedSprints.map((s) => (<option key={s.id} value={s.id}>↳ {s.title}</option>))}
          </select>
        </FormField>
      )}
      <FormField label="Color">
        <div className="flex gap-2 flex-wrap" style={{ padding: '2px 0' }}>
          {GO_COLORS.map((c) => (
            <button key={c} type="button" onClick={(e) => { e.preventDefault(); setColor(c); }}
              className="w-9 h-9 rounded-full transition-all active:scale-90"
              style={{ backgroundColor: c, boxShadow: color === c ? `0 0 0 2px var(--bg-card), 0 0 0 3.5px ${c}` : 'none' }} />
          ))}
        </div>
      </FormField>
    </CreateSheet>
  );
}
