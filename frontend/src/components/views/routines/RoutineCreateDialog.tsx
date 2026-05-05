import { useState } from 'react';
import { Dialog, Button, Input, Textarea, Segmented } from '../../ui';
import { ENTITY_COLORS } from '../../../lib/colors';
import type { Routine } from '../../../api/types';

interface Props {
  open: boolean;
  onClose: () => void;
  onCreate: (data: {
    title: string;
    description: string;
    kind: 'boolean' | 'numeric';
    unit: string;
    target_value: number | null;
    color: string;
    schedule_type: Routine['schedule_type'];
    schedule_days: string;
    schedule_n_days: number;
    schedule_count_per_period: number;
    schedule_period: 'week' | 'month';
  }) => Promise<void>;
}

const DAYS = [
  { v: '1', label: 'M' }, { v: '2', label: 'T' }, { v: '3', label: 'W' },
  { v: '4', label: 'T' }, { v: '5', label: 'F' }, { v: '6', label: 'S' }, { v: '0', label: 'S' },
];

export function RoutineCreateDialog({ open, onClose, onCreate }: Props) {
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [kind, setKind] = useState<'boolean' | 'numeric'>('boolean');
  const [unit, setUnit] = useState('');
  const [target, setTarget] = useState('');
  const [color, setColor] = useState(ENTITY_COLORS[1]);
  const [scheduleType, setScheduleType] = useState<Routine['schedule_type']>('daily');
  const [days, setDays] = useState<Set<string>>(new Set(['1','2','3','4','5']));
  const [nDays, setNDays] = useState(2);
  const [count, setCount] = useState(3);
  const [period, setPeriod] = useState<'week' | 'month'>('week');
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setTitle(''); setDesc(''); setKind('boolean'); setUnit(''); setTarget('');
    setColor(ENTITY_COLORS[1]); setScheduleType('daily');
    setDays(new Set(['1','2','3','4','5'])); setNDays(2); setCount(3); setPeriod('week');
  };

  const submit = async () => {
    if (!title.trim()) return;
    setBusy(true);
    try {
      await onCreate({
        title: title.trim(), description: desc, kind,
        unit: kind === 'numeric' ? unit : '',
        target_value: kind === 'numeric' && target ? Number(target) : null,
        color,
        schedule_type: scheduleType,
        schedule_days: scheduleType === 'weekly_on_days' ? [...days].join(',') : '',
        schedule_n_days: scheduleType === 'every_n_days' ? nDays : 1,
        schedule_count_per_period: scheduleType === 'times_per_week' ? count : 1,
        schedule_period: period,
      });
      reset();
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => { if (!o) onClose(); }}
      title="New routine"
      description="A repeating action you want to track."
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={submit} disabled={!title.trim() || busy}>
            {busy ? 'Creating…' : 'Create routine'}
          </Button>
        </>
      }
    >
      <div className="dt-field">
        <label className="dt-field-label">Title</label>
        <Input autoFocus placeholder="e.g. Morning run" value={title} onChange={(e) => setTitle(e.target.value)} inputSize="lg" />
      </div>

      <div className="dt-field">
        <label className="dt-field-label">Description</label>
        <Textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={2} placeholder="Optional details" />
      </div>

      <div className="dt-field">
        <label className="dt-field-label">Kind</label>
        <Segmented<'boolean' | 'numeric'>
          value={kind}
          onChange={setKind}
          options={[
            { value: 'boolean', label: 'Done / not' },
            { value: 'numeric', label: 'Log a number' },
          ]}
        />
      </div>

      {kind === 'numeric' && (
        <div className="grid grid-cols-2 gap-4">
          <div className="dt-field">
            <label className="dt-field-label">Unit</label>
            <Input placeholder="km, pages, mins…" value={unit} onChange={(e) => setUnit(e.target.value)} />
          </div>
          <div className="dt-field">
            <label className="dt-field-label">Target / day</label>
            <Input type="number" placeholder="optional" value={target} onChange={(e) => setTarget(e.target.value)} />
          </div>
        </div>
      )}

      <div className="dt-field">
        <label className="dt-field-label">Schedule</label>
        <Segmented<Routine['schedule_type']>
          value={scheduleType}
          onChange={setScheduleType}
          options={[
            { value: 'daily', label: 'Daily' },
            { value: 'weekly_on_days', label: 'Weekly' },
            { value: 'every_n_days', label: 'Every N' },
            { value: 'times_per_week', label: 'X / week' },
          ]}
        />
      </div>

      {scheduleType === 'weekly_on_days' && (
        <div className="dt-field">
          <label className="dt-field-label">Days</label>
          <div className="dt-field-row">
            {DAYS.map((d) => (
              <button
                key={d.v}
                type="button"
                onClick={() => setDays((s) => {
                  const n = new Set(s);
                  n.has(d.v) ? n.delete(d.v) : n.add(d.v);
                  return n;
                })}
                className="ui-chip"
                data-active={days.has(d.v) || undefined}
                style={{ width: 30, padding: 0, justifyContent: 'center' }}
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {scheduleType === 'every_n_days' && (
        <div className="dt-field">
          <label className="dt-field-label">Every N days</label>
          <Input type="number" min={1} value={nDays} onChange={(e) => setNDays(Math.max(1, Number(e.target.value) || 1))} />
        </div>
      )}

      {scheduleType === 'times_per_week' && (
        <div className="grid grid-cols-2 gap-4">
          <div className="dt-field">
            <label className="dt-field-label">Times</label>
            <Input type="number" min={1} value={count} onChange={(e) => setCount(Math.max(1, Number(e.target.value) || 1))} />
          </div>
          <div className="dt-field">
            <label className="dt-field-label">Per</label>
            <Segmented<'week' | 'month'>
              value={period}
              onChange={setPeriod}
              options={[{ value: 'week', label: 'Week' }, { value: 'month', label: 'Month' }]}
            />
          </div>
        </div>
      )}

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
            />
          ))}
        </div>
      </div>
    </Dialog>
  );
}
